// ─────────────────────────────────────────────────────────────────────────────
// addressCache.js
// Reverse-geocoding with in-memory + localStorage caching and the useAddress hook
// Place at: frontend/src/dashboards/Admin/Home/shared/addressCache.js
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { API_BASE, getAuthToken } from './apiHelpers.js';

const ADDR_CACHE_TTL = 86_400_000; // 24 h in ms

const MEM_CACHE  = new Map();
const PEND_CACHE = new Map();

function cacheKey(lat, lng) {
  return `geo_${Number(lat).toFixed(6)}_${Number(lng).toFixed(6)}`;
}

function lsRead(k) {
  try {
    const r = JSON.parse(localStorage.getItem(k));
    if (r && Date.now() - r.ts < ADDR_CACHE_TTL) return r.v;
  } catch {}
  return null;
}

function lsWrite(k, v) {
  try { localStorage.setItem(k, JSON.stringify({ v, ts: Date.now() })); } catch {}
}

export function isRealAddress(addr) {
  if (!addr || addr === '--') return false;
  if (/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(String(addr).trim())) return false;
  if (String(addr).trim().length < 10) return false;
  if (String(addr).toLowerCase().includes('geocoding failed')) return false;
  if (String(addr).toLowerCase().includes('unable to resolve')) return false;
  return true;
}

export function getAddrCached(lat, lng) {
  if (!lat || !lng) return null;
  const k = cacheKey(lat, lng);
  const m = MEM_CACHE.get(k);
  if (m) return m;
  const s = lsRead(k);
  if (s) { MEM_CACHE.set(k, s); return s; }
  return null;
}

export function setAddrCached(lat, lng, addr) {
  const k = cacheKey(lat, lng);
  MEM_CACHE.set(k, addr);
  lsWrite(k, addr);
}

// Pre-warm cache from a vehicles array that already has address strings
export function warmClientCache(vehicles) {
  if (!Array.isArray(vehicles)) return;
  vehicles.forEach(v => {
    if (isRealAddress(v.address) && v.lat != null && v.lng != null)
      setAddrCached(v.lat, v.lng, v.address);
  });
}

// Resolve a lat/lng to a human-readable address.
// 1. Try the backend proxy endpoint
// 2. Fall back to Nominatim
// 3. Fall back to "lat, lng" string
export async function geocodeLatLng(lat, lng) {
  const la = Number(lat), lo = Number(lng);
  if (isNaN(la) || isNaN(lo)) return null;

  const cached = getAddrCached(la, lo);
  if (cached && isRealAddress(cached)) return cached;

  const k = cacheKey(la, lo);
  if (PEND_CACHE.has(k)) return PEND_CACHE.get(k);

  const promise = (async () => {
    try {
      const token = getAuthToken();
      if (token) {
        try {
          const res = await fetch(`${API_BASE}/dashboard/address/${la}/${lo}`, {
            headers:     { Authorization: `Bearer ${token}` },
            credentials: 'include',
          });
          if (res.ok) {
            const d = await res.json();
            if (d.success && isRealAddress(d.address)) {
              setAddrCached(la, lo, d.address);
              PEND_CACHE.delete(k);
              return d.address;
            }
          }
        } catch {}
      }

      // Nominatim fallback
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 8_000);
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${la}&lon=${lo}&format=json&zoom=18&addressdetails=1&accept-language=en`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'FleetDashboard/1.0' }, signal: ctrl.signal }
      );
      clearTimeout(t);
      if (r.ok) {
        const d = await r.json();
        if (d?.display_name && d.display_name.length > 10) {
          let addr = d.display_name;
          if (addr.length > 200) addr = addr.substring(0, 197) + '...';
          setAddrCached(la, lo, addr);
          PEND_CACHE.delete(k);
          return addr;
        }
      }
    } catch {}
    PEND_CACHE.delete(k);
    return `${la.toFixed(6)}, ${lo.toFixed(6)}`;
  })();

  PEND_CACHE.set(k, promise);
  return promise;
}

// ── React hook ────────────────────────────────────────────────────────────────
// Returns { display, isCoord, loading }
export function useAddress(address, lat, lng) {
  const mounted = useRef(true);
  const [st, setSt] = useState({ text: null, loading: false });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (isRealAddress(address)) {
      setSt({ text: address, loading: false });
      if (lat && lng) setAddrCached(lat, lng, address);
      return;
    }
    if (!lat || !lng) { setSt({ text: null, loading: false }); return; }
    const cached = getAddrCached(lat, lng);
    if (cached && isRealAddress(cached)) { setSt({ text: cached, loading: false }); return; }
    setSt({ text: null, loading: true });
    geocodeLatLng(lat, lng)
      .then(addr => {
        if (!mounted.current) return;
        if (addr && isRealAddress(addr)) setSt({ text: addr, loading: false });
        else setSt({ text: `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`, loading: false });
      })
      .catch(() => {
        if (mounted.current)
          setSt({ text: `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`, loading: false });
      });
  }, [address, lat, lng]);

  const coordFallback = lat && lng ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : '--';
  const display = st.text || coordFallback;
  return { display, isCoord: !isRealAddress(display), loading: st.loading };
}