import { useState, useEffect } from 'react';
import { io }                  from 'socket.io-client';

import { API_BASE, SOCKET_URL, POLL_MS, apiFetch, getAuthToken } from './apiHelpers.js';
import { warmClientCache, isRealAddress }                         from './addressCache.js';
import { pushRoutePoint }                                         from './routeCache.js';

// ── Store singleton ───────────────────────────────────────────────────────────
export const _vehicleStore = {
  vehicles:         [],
  map:              new Map(),
  stats:            { all: 0, running: 0, stopped: 0, overspeed: 0, idle: 0, unreachable: 0, new: 0, inactive: 0 },
  listeners:        new Set(),
  hasData:          false,
  initialFetchDone: false,

  allowedVehicleKeys: null,

  setAllowedKeys(keys) {
    this.allowedVehicleKeys = keys == null ? null : new Set(keys);
  },

  isAllowed(vehicleNo) {
    if (this.allowedVehicleKeys === null) return true;
    return this.allowedVehicleKeys.has(vehicleNo);
  },

  replaceAll(incoming) {
    if (!Array.isArray(incoming)) return;
    warmClientCache(incoming);
    this.map.clear();
    incoming.forEach(v => {
      if (this.isAllowed(v.vehicle)) this.map.set(v.vehicle, v);
    });
    this.vehicles = Array.from(this.map.values());
    this.hasData  = true;
    this.notify();
  },

  updateFromSocket(incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    warmClientCache(incoming);
    let changed = false;
    incoming.forEach(v => {
      if (!this.isAllowed(v.vehicle)) return;
      const existing = this.map.get(v.vehicle);
      if (!existing) return;
      let addr = v.address;
      if (!isRealAddress(addr) && isRealAddress(existing.address)) addr = existing.address;
      this.map.set(v.vehicle, {
        ...existing,
        state:         v.state         ?? existing.state,
        lat:           v.lat           ?? existing.lat,
        lng:           v.lng           ?? existing.lng,
        spd:           v.spd           ?? existing.spd,
        heading:       v.heading       ?? existing.heading,
        address:       addr,
        lu:            v.lu            ?? existing.lu,
        luRaw:         v.luRaw         ?? existing.luRaw,
        ignition:      v.ignition      ?? existing.ignition,
        btr:           v.btr           ?? existing.btr,
        gsm:           v.gsm           ?? existing.gsm,
        gsmRaw:        v.gsmRaw        ?? existing.gsmRaw,
        gps:           v.gps           ?? existing.gps,
        gpsSatellites: v.gpsSatellites ?? existing.gpsSatellites,
        fixType:       v.fixType       ?? existing.fixType,
        satellites:    v.satellites    ?? existing.satellites,
        since:         v.since         ?? existing.since,
        overspeed:     v.overspeed     ?? existing.overspeed,
        panic:         v.panic         ?? existing.panic,
        extPower:      v.extPower      ?? existing.extPower,
        temperature:   v.temperature   ?? existing.temperature,
        humidity:      v.humidity      ?? existing.humidity,
        ac:            v.ac            ?? existing.ac,
        soc:           v.soc           ?? existing.soc,
      });
      changed = true;
    });
    if (changed) {
      this.vehicles = Array.from(this.map.values());
      this.notify();
    }
  },

  setStats(s) {
    this.stats = { ...s };
    this.notify();
  },

  recalcStats() {
    const v   = this.vehicles;
    const now = Date.now();

    const getRealtimeState = (x) => {
      const lastHB = x.luRaw || null;
      if (!lastHB) return x.state || 'new';
      const diffMin = (now - new Date(lastHB).getTime()) / 60_000;
      if (diffMin > 60) return 'unreachable';
      return x.state || 'stopped';
    };

    const states = v.map(getRealtimeState);
    this.stats = {
      all:         v.length,
      running:     states.filter(s => s === 'running').length,
      stopped:     states.filter(s => s === 'stopped').length,
      overspeed:   states.filter(s => s === 'overspeed').length,
      idle:        states.filter(s => s === 'idle').length,
      unreachable: states.filter(s => s === 'unreachable').length,
      new:         states.filter(s => s === 'new').length,
      inactive:    states.filter(s => s === 'inactive').length,
    };
    this.notify(); // ✅ React ko batao stats update hui
  },

  notify()      { this.listeners.forEach(fn => fn()); },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};

// ── React hook ────────────────────────────────────────────────────────────────
export function useVehicleStore() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const unsub = _vehicleStore.subscribe(() => setTick(t => t + 1));
    return unsub;
  }, []);
  return {
    vehicles: _vehicleStore.vehicles,
    stats:    _vehicleStore.stats,
    hasData:  _vehicleStore.hasData,
  };
}

// ── Socket singleton ──────────────────────────────────────────────────────────
let _socketInstance = null;
let _socketMounted  = false;

export function initSocket({ onLive, onConnect, onDisconnect } = {}) {

  const _registerCallbacks = (socketInst) => {
    socketInst.off('connect');
    socketInst.off('disconnect');
    socketInst.off('connect_error');
    socketInst.off('reconnect');
    ['live:positions', 'vehicle:update', 'gps:update', 'positions', 'vehicles']
      .forEach(evt => socketInst.off(evt));

    socketInst.on('connect',       ()     => { onConnect?.(); });
    socketInst.on('disconnect',    reason => { onDisconnect?.(reason); });
    socketInst.on('connect_error', ()     => { onDisconnect?.('connect_error'); });
    socketInst.on('reconnect',     ()     => { onConnect?.(); });

    const handlePositions = data => {
      if (!Array.isArray(data) || data.length === 0) return;
      warmClientCache(data);
      const now = Date.now();
      data.forEach(v => {
        if (v.lat && v.lng)
          pushRoutePoint(v.vehicle, Number(v.lat), Number(v.lng), now, v.state || 'running');
      });
      _vehicleStore.updateFromSocket(data);
      _vehicleStore.recalcStats(); // ✅ notify() andar call hoga
      onLive?.(data);
    };

    ['live:positions', 'vehicle:update', 'gps:update', 'positions', 'vehicles']
      .forEach(evt => socketInst.on(evt, handlePositions));
  };

  if (_socketMounted && _socketInstance) {
    _registerCallbacks(_socketInstance);
    if (_socketInstance.connected) onConnect?.();
    return () => {};
  }

  _socketMounted = true;
  const token = getAuthToken();

  if (_socketInstance?.connected) {
    _registerCallbacks(_socketInstance);
    onConnect?.();
    return () => {};
  }

  if (_socketInstance) {
    _socketInstance.removeAllListeners();
    _socketInstance.disconnect();
    _socketInstance = null;
  }

  const socket = io(SOCKET_URL, {
    transports:            ['websocket', 'polling'],
    withCredentials:       true,
    reconnectionAttempts:  Infinity,
    reconnectionDelay:     3_000,
    reconnectionDelayMax:  30_000,
    randomizationFactor:   0.5,
    timeout:               20_000,
    auth:  token ? { token } : {},
    query: token ? { token } : {},
  });
  _socketInstance = socket;
  _registerCallbacks(socket);

  const handleUnload = () => {
    if (_socketInstance) {
      _socketInstance.disconnect();
      _socketInstance  = null;
      _socketMounted   = false;
    }
  };
  window.addEventListener('beforeunload', handleUnload);

  return () => {
    window.removeEventListener('beforeunload', handleUnload);
  };
}

// ── Shared polling helper ─────────────────────────────────────────────────────
export function startPolling(isSocketLiveRef, fetchFn) {
  const id = setInterval(() => {
    if (!isSocketLiveRef.current) fetchFn();
  }, POLL_MS);
  return () => clearInterval(id);
}

// ── Fetch + store all vehicles ────────────────────────────────────────────────
export async function fetchAndStoreVehicles(qs = '') {
  const url = `${API_BASE}/dashboard/vehicles${qs ? `?${qs}` : ''}`;
  const { ok, data, unauthorized, timedOut } = await apiFetch(url);
  if (unauthorized) return { unauthorized: true };
  if (timedOut || !ok) return { failed: true };
  if (ok && data?.success) {
    const vehicles = data.data || [];
    _vehicleStore.replaceAll(vehicles);
    if (data.stats) _vehicleStore.setStats(data.stats);
    else            _vehicleStore.recalcStats();
    return { ok: true, vehicles };
  }
  return { failed: true };
}