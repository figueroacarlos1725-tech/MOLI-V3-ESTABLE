import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.backendUrl || 
  process.env.EXPO_PUBLIC_BACKEND_URL || 
  'https://taxify-clone.preview.emergentagent.com';

class SocketService {
  private socket: WebSocket | null = null;
  private userId: string | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  connect(userId: string) {
    // Always reset reconnect counter on explicit connect call
    this.reconnectAttempts = 0;

    // Don't connect if already connected or connecting
    if (this.isConnecting) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.userId === userId) return;
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) return;

    // Close existing stale socket
    if (this.socket) {
      try { this.socket.close(); } catch(e) {}
      this.socket = null;
    }

    this.userId = userId;
    this.isConnecting = true;

    try {
      const wsUrl = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
      this.socket = new WebSocket(`${wsUrl}/api/ws/${userId}`);

      this.socket.onopen = () => {
        console.log('WebSocket conectado');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.startKeepAlive();
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const type = data.type;
          
          if (type && this.listeners.has(type)) {
            this.listeners.get(type)?.forEach(callback => {
              try { callback(data); } catch (e) { /* ignore callback errors */ }
            });
          }

          if (this.listeners.has('all')) {
            this.listeners.get('all')?.forEach(callback => {
              try { callback(data); } catch (e) { /* ignore */ }
            });
          }
        } catch (error) {
          // Silently ignore parse errors
        }
      };

      this.socket.onclose = () => {
        this.isConnecting = false;
        this.socket = null;
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        // Silently handle - onclose will fire after this
        this.isConnecting = false;
      };
    } catch (error) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.userId) {
      return;
    }

    this.reconnectAttempts++;
    // Quick reconnect: 2s, 4s, 6s... capped at 10s
    const delay = Math.min(2000 * this.reconnectAttempts, 10000);
    
    this.reconnectTimer = setTimeout(() => {
      if (this.userId) {
        this.isConnecting = false; // Allow reconnect
        this.connect(this.userId);
      }
    }, delay);
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    // Send ping every 20 seconds to keep connection alive through proxy
    this.keepAliveTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try { this.socket.send(JSON.stringify({ type: 'ping' })); } catch (e) {}
      } else if (this.userId) {
        // Socket died, reconnect
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.connect(this.userId);
      }
    }, 20000);
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  // Force reconnect - call this when driver should be online but socket is dead
  forceReconnect() {
    if (!this.userId) return;
    const uid = this.userId;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    if (this.socket) {
      try { this.socket.close(); } catch(e) {}
      this.socket = null;
    }
    this.connect(uid);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopKeepAlive();
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent reconnect
    if (this.socket) {
      try { this.socket.close(); } catch (e) { /* ignore */ }
      this.socket = null;
    }
    this.userId = null;
    this.isConnecting = false;
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  off(event: string, callback: (data: any) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  send(data: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(data));
      } catch (e) {
        // Silently ignore send errors
      }
    }
  }

  sendLocation(latitude: number, longitude: number) {
    this.send({ type: 'location_update', latitude, longitude });
  }

  sendChatMessage(receiverId: string, message: string) {
    this.send({ type: 'chat_message', receiver_id: receiverId, message });
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

export const socketService = new SocketService();
