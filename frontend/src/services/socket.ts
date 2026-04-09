import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';

const WS_URL = Constants.expoConfig?.extra?.backendUrl || 
  process.env.EXPO_PUBLIC_BACKEND_URL || 
  'https://taxify-clone.preview.emergentagent.com';

class SocketService {
  private socket: WebSocket | null = null;
  private userId: string | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(userId: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.userId = userId;
    const wsUrl = WS_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    this.socket = new WebSocket(`${wsUrl}/ws/${userId}`);

    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type;
        
        if (this.listeners.has(type)) {
          this.listeners.get(type)?.forEach(callback => callback(data));
        }

        // Also emit to 'all' listeners
        if (this.listeners.has('all')) {
          this.listeners.get('all')?.forEach(callback => callback(data));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => {
          if (this.userId) {
            this.connect(this.userId);
          }
        }, 3000 * this.reconnectAttempts);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.userId = null;
    this.listeners.clear();
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  off(event: string, callback: (data: any) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  send(data: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  sendLocation(latitude: number, longitude: number) {
    this.send({
      type: 'location_update',
      latitude,
      longitude
    });
  }

  sendChatMessage(receiverId: string, message: string) {
    this.send({
      type: 'chat_message',
      receiver_id: receiverId,
      message
    });
  }
}

export const socketService = new SocketService();
