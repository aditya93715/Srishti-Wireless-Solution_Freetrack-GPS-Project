import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { loginApi, getMeApi, getMyCoinsApi } from '../api/auth';

const AuthContext = createContext(null);

// ── Helper: coin fields ensure karo ──────────────────────────────────────────
const ensureCoinFields = (userData) => {
  if (!userData) return userData;
  const allocated = userData.allocatedCoins || 0;
  const used      = userData.usedCoins      || 0;
  const available = userData.availableCoins ?? Math.max(0, allocated - used);
  return {
    ...userData,
    allocatedCoins:  allocated,
    usedCoins:       used,
    availableCoins:  available,
  };
};

// ── localStorage helpers ──────────────────────────────────────────────────────
const saveUserToStorage = (userData) => {
  try { localStorage.setItem('fleet_user', JSON.stringify(userData)); } catch (_) {}
};

const loadUserFromStorage = () => {
  try {
    const raw = localStorage.getItem('fleet_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed ? ensureCoinFields(parsed) : null;
  } catch (_) { return null; }
};

// ── Socket URL ──────────────────────────────────────────────────────────────
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(() => loadUserFromStorage());
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  // ── Socket connect / disconnect helper ───────────────────────────────────
  const connectSocket = useCallback((token) => {
    if (socketRef.current?.connected) return;

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io(SOCKET_URL, {
      auth:       { token },
      transports: ['websocket', 'polling'],
      reconnection:        true,
      reconnectionAttempts: 10,
      reconnectionDelay:   1000,
    });

    socket.on('coin:update', ({ available, used, allocated }) => {
      console.log(`[socket coin:update] available=${available} allocated=${allocated} used=${used}`);
      setUser(prev => {
        if (!prev) return prev;
        if (
          prev.availableCoins === available &&
          prev.usedCoins      === used      &&
          prev.allocatedCoins === allocated
        ) return prev;
        const updated = {
          ...prev,
          allocatedCoins:  allocated,
          usedCoins:       used,
          availableCoins:  available,
        };
        saveUserToStorage(updated);
        return updated;
      });
    });

    socket.on('connect', () => {
      console.log(`[socket] Connected: ${socket.id}`);
      socket.emit('coin:refresh');
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket] Disconnected: ${reason}`);
    });

    socket.on('connect_error', (err) => {
      console.warn('[socket] Connect error:', err.message);
    });

    socketRef.current = socket;
  }, []);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  // ── On mount ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('fleet_token');

    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    connectSocket(token);

    getMeApi()
      .then(async (res) => {
        const raw = res.data?.user;
        if (!raw) return;

        let userData = ensureCoinFields(raw);

        if (!userData.allocatedCoins && !userData.usedCoins) {
          try {
            const coinRes = await getMyCoinsApi();
            if (coinRes.data?.success && coinRes.data?.coins) {
              const c = coinRes.data.coins;
              userData = {
                ...userData,
                allocatedCoins: c.allocated,
                usedCoins:      c.used,
                availableCoins: c.available,
              };
            }
          } catch (_) {}
        }

        setUser(userData);
        saveUserToStorage(userData);

        if (socketRef.current?.connected) {
          socketRef.current.emit('coin:refresh');
        }
      })
      .catch(() => {
        localStorage.removeItem('fleet_token');
        localStorage.removeItem('fleet_user');
        setUser(null);
        disconnectSocket();
      })
      .finally(() => setLoading(false));

    return () => {};
  }, []);

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (username, password) => {
    const res = await loginApi({ username, password });
    const { token, user: rawUser, dashboardPath } = res.data;

    let userData = ensureCoinFields(rawUser);

    localStorage.setItem('fleet_token', token);
    saveUserToStorage(userData);
    setUser(userData);

    connectSocket(token);

    return dashboardPath;
  }, [connectSocket]);

  // ── LOGOUT ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('fleet_token');
    localStorage.removeItem('fleet_user');
    setUser(null);
    disconnectSocket();
  }, [disconnectSocket]);

  // ── UPDATE PROFILE IMAGE ───────────────────────────────────────────────────
  const updateProfileImage = useCallback((imageUrl) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, profile_image: imageUrl };
      saveUserToStorage(updated);
      return updated;
    });
  }, []);

  // ── UPDATE COINS ───────────────────────────────────────────────────────────
  const updateCoins = useCallback((allocated, used, available) => {
    setUser(prev => {
      if (!prev) return prev;
      const newAllocated = allocated !== undefined ? allocated : (prev.allocatedCoins || 0);
      const newUsed      = used      !== undefined ? used      : (prev.usedCoins      || 0);
      const newAvailable = available !== undefined ? available : Math.max(0, newAllocated - newUsed);
      const updated = {
        ...prev,
        allocatedCoins:  newAllocated,
        usedCoins:       newUsed,
        availableCoins:  newAvailable,
      };
      saveUserToStorage(updated);
      window.dispatchEvent(new Event('coin-updated'));
      return updated;
    });
  }, []);

  // ── REFRESH COINS ─────────────────────────────────────────────────────────
  const refreshCoins = useCallback(async () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('coin:refresh');
      return;
    }
    try {
      const coinRes = await getMyCoinsApi();
      if (coinRes.data?.success && coinRes.data?.coins) {
        const c = coinRes.data.coins;
        updateCoins(c.allocated, c.used, c.available);
      }
    } catch (_) {}
  }, [updateCoins]);

  // ── HAS FEATURE ───────────────────────────────────────────────────────────
  const hasFeature = useCallback((feature) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return user.allowedFeatures?.includes(feature) ?? false;
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      updateProfileImage,
      updateCoins,
      refreshCoins,
      hasFeature,
      socket: socketRef,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};