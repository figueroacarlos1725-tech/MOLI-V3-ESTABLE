"""
WebSocket connection manager
"""
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from typing import Dict, List


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_rooms: Dict[str, List[str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str, websocket: WebSocket = None):
        if user_id in self.active_connections and (websocket is None or self.active_connections[user_id] is websocket):
            del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            websocket = self.active_connections[user_id]
            try:
                await websocket.send_json(jsonable_encoder(message))
            except Exception:
                # A disconnected receiver must not turn a persisted message into a 500.
                self.disconnect(user_id, websocket)

    async def broadcast_to_drivers(self, message: dict, driver_ids: List[str]):
        for driver_id in driver_ids:
            if driver_id in self.active_connections:
                await self.send_personal_message(message, driver_id)


manager = ConnectionManager()
