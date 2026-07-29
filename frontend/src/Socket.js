import { io } from "socket.io-client";

let socket = null;

export const getSocket = () => {
  if (!socket) {
    const token = localStorage.getItem("token");
    socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5001", {
      auth: { token: token },
      transports: ["websocket", "polling"],  // ← polling fallback added
      reconnection: true,
      reconnectionAttempts: Infinity,         // ← never give up
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      withCredentials: true,
    });
  }
  return socket;
};

export const resetSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};