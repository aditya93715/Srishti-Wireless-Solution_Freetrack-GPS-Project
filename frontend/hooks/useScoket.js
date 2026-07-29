import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ||  'http://localhost:3000';

export const useSocket = () => {
  const { token, isAuthenticated } = useAuth();
  const socketRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      reconnectAttempts.current = 0;
    }
  }, []);

  useEffect(() => {
    // Disconnect if not authenticated
    if (!isAuthenticated || !token) {
      disconnectSocket();
      return;
    }

    // Create socket connection with auth
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      reconnectAttempts.current = 0;
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connect error:', err.message);
      
      if (err.message === 'Authentication error' || err.message === 'No token') {
        // Token invalid or expired - stop reconnecting
        disconnectSocket();
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('⚠️ Socket disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // Server forced disconnect - reconnect manually
        socket.connect();
      }
    });

    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });

    // Cleanup
    return () => {
      disconnectSocket();
    };
  }, [token, isAuthenticated, disconnectSocket]);

  // Emit function wrapper
  const emit = useCallback((event, data, callback) => {
    if (!socketRef.current?.connected) {
      console.warn('Socket not connected');
      return;
    }
    socketRef.current.emit(event, data, callback);
  }, []);

  // Subscribe to event
  const on = useCallback((event, callback) => {
    if (!socketRef.current) return;
    socketRef.current.on(event, callback);
  }, []);

  // Unsubscribe from event
  const off = useCallback((event, callback) => {
    if (!socketRef.current) return;
    socketRef.current.off(event, callback);
  }, []);

  return {
    socket: socketRef.current,
    isConnected: socketRef.current?.connected || false,
    emit,
    on,
    off,
    disconnect: disconnectSocket
  };
};