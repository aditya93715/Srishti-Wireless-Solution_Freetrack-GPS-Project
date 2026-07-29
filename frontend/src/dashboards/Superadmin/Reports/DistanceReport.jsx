// src/dashboards/Admin/Reports/DistanceReport.jsx
import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { useTheme } from "../../../context/ThemeContext";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const THEME_GREEN = "#10b981";
const THEME_DEF   = "#3d1a6e";

const safeNum = (v, fb = 0) => { const n = Number(v); return isNaN(n) ? fb : n; };

// ─────────────────────────────────────────────────────────────────────────────
// GEOCODE CACHE
// ─────────────────────────────────────────────────────────────────────────────
const _geocodeCache = {};
const _coarseCache  = {};
const _mediumCache  = {};
const _inflight     = new Map();

function fineKey(lat, lng)   { return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`; }
function mediumKey(lat, lng) { return `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`; }
function coarseKey(lat, lng) { return `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`; }

function getCachedAddress(lat, lng) {
  if (!lat || !lng) return null;
  return _geocodeCache[fineKey(lat, lng)]
      || _mediumCache[mediumKey(lat, lng)]
      || _coarseCache[coarseKey(lat, lng)]
      || null;
}

function setCachedAddress(lat, lng, addr) {
  _geocodeCache[fineKey(lat, lng)]  = addr;
  _mediumCache[mediumKey(lat, lng)] = addr;
  _coarseCache[coarseKey(lat, lng)] = addr;
}

const _geoSem = {
  running: 0, MAX: 10, queue: [],
  async acquire() {
    if (this.running < this.MAX) { this.running++; return; }
    await new Promise(r => this.queue.push(r));
    this.running++;
  },
  release() {
    this.running = Math.max(0, this.running - 1);
    if (this.queue.length) this.queue.shift()();
  },
};

async function reverseGeocode(lat, lng, apiBase, getTokenFn) {
  if (!lat || !lng) return null;
  const cached = getCachedAddress(lat, lng);
  if (cached) return cached;
  const ck = coarseKey(lat, lng);
  if (_inflight.has(ck)) return _inflight.get(ck);
  const p = (async () => {
    await _geoSem.acquire();
    try {
      try {
        const token = getTokenFn?.();
        const res = await fetch(
          `${apiBase}/analytics/reverse-geocode?lat=${lat}&lng=${lng}`,
          { headers: { Authorization: token ? `Bearer ${token}` : '' }, signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
          const d = await res.json();
          if (d.success && d.address && d.address.length > 8) { setCachedAddress(lat, lng, d.address); return d.address; }
        }
      } catch {}
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=0`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'FleetAnalytics/1.0' }, signal: AbortSignal.timeout(5000) }
        );
        if (res.ok) {
          const d = await res.json();
          if (d?.display_name && d.display_name.length > 8) { setCachedAddress(lat, lng, d.display_name); return d.display_name; }
        }
      } catch {}
      return null;
    } finally { _geoSem.release(); _inflight.delete(ck); }
  })();
  _inflight.set(ck, p);
  return p;
}

async function batchPreloadGeocode(rows, apiBase, getTokenFn) {
  const cellMap = new Map();
  rows.forEach(r => {
    if (!r.lat || !r.lon) return;
    if (getCachedAddress(r.lat, r.lon)) return;
    const ck = coarseKey(r.lat, r.lon);
    if (!cellMap.has(ck)) cellMap.set(ck, { lat: r.lat, lng: r.lon });
  });
  const cells = [...cellMap.values()];
  if (!cells.length) return;
  await Promise.all(cells.map(({ lat, lng }) => reverseGeocode(lat, lng, apiBase, getTokenFn)));
}

// ─────────────────────────────────────────────────────────────────────────────
// API FETCH FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
async function fetchGraphData(apiBase, vehicleId, startISO, endISO, getTokenFn, signal) {
  const url = new URL(`${apiBase}/analytics/graph-data`);
  url.searchParams.set('vehicleId', vehicleId);
  url.searchParams.set('startDate', startISO);
  url.searchParams.set('endDate',   endISO);
  const res = await fetch(url.toString(), {
    headers: { Authorization: getTokenFn() ? `Bearer ${getTokenFn()}` : '', 'Content-Type': 'application/json' },
    signal,
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.message || `HTTP ${res.status}`); }
  return res.json();
}

async function fetchPacketPage(apiBase, vehicleId, startISO, endISO, page, getTokenFn, signal) {
  const sMs = new Date(startISO).getTime();
  const eMs = new Date(endISO).getTime();
  const finalStart = sMs <= eMs ? startISO : endISO;
  const finalEnd   = sMs <= eMs ? endISO   : startISO;
  const url = new URL(`${apiBase}/analytics/packet-log`);
  url.searchParams.set('vehicleId', vehicleId);
  url.searchParams.set('startDate', finalStart);
  url.searchParams.set('endDate',   finalEnd);
  url.searchParams.set('page',      page);
  url.searchParams.set('limit',     10000);
  const res = await fetch(url.toString(), {
    headers: { Authorization: getTokenFn() ? `Bearer ${getTokenFn()}` : '', 'Content-Type': 'application/json' },
    signal,
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.message || `HTTP ${res.status}`); }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('token') || localStorage.getItem('fleet_token') || ''; }
function getUserInfo() {
  try {
    for (const k of ['user', 'fleet_user', 'authUser']) {
      const r = localStorage.getItem(k);
      if (r) { const u = JSON.parse(r); if (u && (u.username || u.name || u.email)) return u; }
    }
  } catch {}
  return null;
}
function getRole(u) { return ((u?.role) || '').toLowerCase().replace(/[_\s]/g, ''); }

// ✅ CORRECT
function buildApiBase() {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  if (/\/api\/?$/.test(raw)) return raw.replace(/\/$/, '');
  return raw.replace(/\/$/, '') + '/api';
}
const API_BASE = buildApiBase();

function defaultDateRange() {
  const end = new Date(), start = new Date();
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

// Haversine distance in km
function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Filter helper
function applyPacketFilter(rows, filterSpd) {
  if (filterSpd === 'moving')  return rows.filter(r => safeNum(r.s, 0) > 1.5);
  if (filterSpd === 'stopped') return rows.filter(r => safeNum(r.s, 0) <= 1.5);
  if (filterSpd === 'over')    return rows.filter(r => safeNum(r.s, 0) > 60);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON STORE  — matches AnalyticsDashboard pattern exactly
// ─────────────────────────────────────────────────────────────────────────────
const _store = {
  // Selector state
  selAdmin: '', selDealer: '', selUser: '', selVeh: '',
  // Dropdown lists
  admins: [], dealers: [], users: [], vehicles: [],
  // ── FIX: store ALL result state so page-nav restores properly ──
  speedPts:      null,
  packetRows:    [],
  kpiStats:      null,       // ← was missing — caused KPI boxes to show 0/— on return
  packetsFetched: false,     // ← was missing — caused containers to stay empty on return
  searched:      false,
  dateRange:     null,
  lastFetchKey:  '',         // vehicle+date fingerprint

  save(patch) { Object.assign(this, patch); },

  // ── FIX: same cache-validity helper as AnalyticsDashboard ──
  getFetchKey(vehicleId, dateRange) {
    return `${vehicleId}_${dateRange?.start?.getTime()}_${dateRange?.end?.getTime()}`;
  },
  hasValidCache(vehicleId, dateRange) {
    return (
      this.searched &&
      this.lastFetchKey === this.getFetchKey(vehicleId, dateRange) &&
      this.packetRows.length > 0
    );
  },

  clear() {
    this.selAdmin=''; this.selDealer=''; this.selUser=''; this.selVeh='';
    this.admins=[]; this.dealers=[]; this.users=[]; this.vehicles=[];
    this.speedPts=null; this.packetRows=[]; this.kpiStats=null;
    this.packetsFetched=false; this.searched=false; this.dateRange=null;
    this.lastFetchKey='';
  },
};
window.addEventListener('beforeunload', () => _store.clear());

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
const getCSS = (theme) => `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#f1f5f9;--surface:#fff;--surface-2:#f8fafc;--border:#e2e8f0;--border-soft:#eef0f5;
  --text-primary:#0f172a;--text-secondary:#475569;--text-muted:#94a3b8;
  --theme:${theme};--shadow-xs:0 1px 2px rgba(0,0,0,0.05);
  --shadow-sm:0 1px 4px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:0 4px 12px rgba(0,0,0,0.08),0 2px 4px rgba(0,0,0,0.04);--r:6px;
}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text-primary);}
.dr-page{display:flex;flex-direction:column;min-height:100vh;}
.topbar{
  background:var(--surface);border-bottom:1px solid var(--border);
  padding:10px 20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  position:sticky;top:0;z-index:100;box-shadow:var(--shadow-xs);overflow:visible;
}
.tb-selectors{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1;overflow:visible;}
.tb-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-left:auto;}
.sel-group{display:flex;flex-direction:column;gap:2px;overflow:visible;position:relative;}
.sel-label{font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;padding-left:2px;}
.search-btn{
  height:36px;padding:0 20px;background:${theme};color:#fff;border:none;border-radius:var(--r);
  font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;
  display:flex;align-items:center;gap:6px;transition:filter 0.15s,box-shadow 0.15s;
  white-space:nowrap;flex-shrink:0;box-shadow:0 2px 8px ${theme}40;
}
.search-btn:hover:not(:disabled){filter:brightness(1.1);box-shadow:0 4px 14px ${theme}50;}
.search-btn:disabled{opacity:0.45;cursor:not-allowed;box-shadow:none;}
.dr-body{padding:16px 20px;flex:1;display:flex;flex-direction:column;gap:12px;}

/* ── KPI Row ─────────────────────────────────────────────────────────────── */
.kpi-row{
  display:flex;align-items:center;gap:6px;flex-wrap:wrap;
}

/* ── KPI Stat Boxes ────────────────────────────────────────────────────────── */
.kpi-box{
  display:inline-flex;align-items:center;gap:7px;
  padding:0 14px;height:36px;
  border-radius:6px;border:1.5px solid;
  font-family:'DM Sans',sans-serif;
  cursor:default;user-select:none;
  transition:box-shadow 0.15s,transform 0.15s;
  flex-shrink:0;background:#fff;
  min-width:100px;
}
.kpi-box:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,0.1);}
.kpi-box-distance{ border-color:#10b981;color:#0d9268; }
.kpi-box-packets { border-color:#3b82f6;color:#1d4ed8; }
.kpi-box-days    { border-color:#8b5cf6;color:#6d28d9; }
.kpi-box-speed   { border-color:#f59e0b;color:#b45309; }
.kpi-box-speed.danger{ border-color:#ef4444;color:#dc2626; }
.kpi-box-value{
  font-size:13px;font-weight:800;
  font-family:'DM Mono',monospace;letter-spacing:-0.02em;line-height:1;
  white-space:nowrap;
}
.kpi-box-unit{
  font-size:10px;font-weight:700;opacity:0.7;margin-left:1px;
}
.kpi-box-sep{
  width:1px;height:16px;background:currentColor;opacity:0.18;flex-shrink:0;
}
.kpi-box-label{
  font-size:10px;font-weight:800;text-transform:uppercase;
  letter-spacing:0.06em;opacity:0.65;white-space:nowrap;
}
.kpi-box-skeleton{
  height:10px;width:55px;border-radius:3px;
  background:currentColor;opacity:0.15;
  animation:kpi-pulse 1.4s ease-in-out infinite;
}
@keyframes kpi-pulse{0%,100%{opacity:0.1}50%{opacity:0.25}}

/* ── Filter KPI Chips (inside packet log header) ────────────────────────── */
.filter-kpi{
  display:inline-flex;align-items:center;gap:7px;
  padding:0 12px;height:30px;
  border-radius:6px;border:1.5px solid;
  font-family:'DM Sans',sans-serif;
  cursor:pointer;user-select:none;
  transition:all 0.18s cubic-bezier(0.34,1.56,0.64,1);
  flex-shrink:0;
  position:relative;
  outline:none;
}
.filter-kpi:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,0.12);}
.filter-kpi.fk-inactive{background:#fff;border-color:#e2e8f0;color:#64748b;}
.filter-kpi.fk-inactive:hover{border-color:#cbd5e1;background:#f8fafc;}
.filter-kpi.fk-all    { background:${theme};border-color:${theme};color:#fff;box-shadow:0 3px 10px ${theme}45; }
.filter-kpi.fk-moving { background:#16a34a;border-color:#16a34a;color:#fff;box-shadow:0 3px 10px #16a34a45; }
.filter-kpi.fk-stopped{ background:#dc2626;border-color:#dc2626;color:#fff;box-shadow:0 3px 10px #dc262645; }
.filter-kpi.fk-over   { background:#ea580c;border-color:#ea580c;color:#fff;box-shadow:0 3px 10px #ea580c45; }
.fk-count{
  font-size:10px;font-weight:800;padding:1px 6px;border-radius:3px;
  background:rgba(255,255,255,0.22);
  font-family:'DM Mono',monospace;letter-spacing:-0.02em;
  white-space:nowrap;
}
.fk-inactive .fk-count{background:rgba(0,0,0,0.07);color:inherit;}
.fk-value-sep{width:1px;height:14px;background:currentColor;opacity:0.22;flex-shrink:0;}
.fk-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;opacity:0.75;white-space:nowrap;}
.fk-inactive .fk-label{opacity:0.6;}

/* ── Date/time picker ────────────────────────────────────────────────────────── */
.global-dt-wrap{display:flex;align-items:center;gap:6px;padding:0 10px;height:36px;border:1.5px solid var(--border);border-radius:var(--r);background:var(--surface-2);}
.global-dt-label{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;white-space:nowrap;}
.global-dt-input{border:none;background:transparent;font-size:11px;font-weight:700;color:var(--text-primary);font-family:'DM Sans',sans-serif;outline:none;cursor:pointer;}
.global-dt-input::-webkit-calendar-picker-indicator{opacity:0.45;cursor:pointer;width:10px;height:10px;}

/* ── Graph Toggle Tabs ──────────────────────────────────────────────────────── */
.graph-toggle{display:flex;align-items:center;gap:2px;background:#f1f5f9;border-radius:6px;padding:3px;}
.graph-toggle-btn{
  height:26px;padding:0 12px;border:none;border-radius:4px;font-family:'DM Sans',sans-serif;
  font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;
  transition:all 0.15s;white-space:nowrap;background:transparent;color:#64748b;
}
.graph-toggle-btn.active{background:#fff;color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);}
.graph-toggle-btn:hover:not(.active){color:#374151;background:rgba(255,255,255,0.6);}

/* ── Packet Log Table ──────────────────────────────────────────────────────── */
.pkt-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}
.pkt-table thead th{
  text-align:left;padding:9px 14px;background:var(--surface-2);
  font-size:10px;font-weight:800;color:var(--text-muted);text-transform:uppercase;
  letter-spacing:0.4px;border-bottom:2px solid var(--border-soft);white-space:nowrap;
  position:sticky;top:0;z-index:2;
}
.pkt-row{border-bottom:1px solid #f1f5f9;height:38px;transition:background 0.1s;}
.pkt-row:hover{background:#f0f9ff!important;}
.pkt-row.row-over{background:#fff8f3;}
.pkt-row.row-stopped{background:#fff5f5;}
.pkt-row.row-normal{background:#fff;}
.pkt-row.row-normal:nth-child(even){background:#fafcff;}
.pkt-cell{padding:0 14px;overflow:hidden;white-space:nowrap;vertical-align:middle;}
.pkt-cell.cell-addr{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:18px;}

/* ── Speed badge ───────────────────────────────────────────────────────── */
.spd-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:5px;font-weight:800;font-family:'DM Mono',monospace;font-size:11.5px;}
.spd-over{background:#fef3c7;color:#b45309;border:1px solid #fde68a;}
.spd-moving{background:#dcfce7;color:#15803d;border:1px solid #86efac;}
.spd-stopped{background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;}

/* ── IGN indicator ─────────────────────────────────────────────────────── */
.ign-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:800;}
.ign-on{background:#dcfce7;color:#15803d;border:1px solid #86efac;}
.ign-off{background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;}
.ign-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.ign-dot-on{background:#22c55e;}
.ign-dot-off{background:#cbd5e1;}

/* ── Address cell ──────────────────────────────────────────────────────── */
.addr-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#374151;}
.addr-coord{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:#94a3b8;font-family:'DM Mono',monospace;font-style:italic;}

/* ── Day chips ─────────────────────────────────────────────────────────── */
.day-chip{
  display:flex;flex-direction:column;align-items:center;padding:5px 10px;
  border-radius:6px;min-width:62px;cursor:pointer;
  border:1.5px solid #e2e8f0;background:#f8fafc;
  transition:all 0.18s cubic-bezier(0.34,1.56,0.64,1);
  user-select:none;
}
.day-chip:hover{border-color:#cbd5e1;background:#f1f5f9;transform:translateY(-1px);}
.day-chip.active{
  background:var(--chip-accent,#10b981);border-color:var(--chip-accent,#10b981);
  box-shadow:0 4px 12px var(--chip-accent,#10b981)44;transform:translateY(-2px) scale(1.04);
}
.day-chip.active .chip-date{color:rgba(255,255,255,0.85);}
.day-chip.active .chip-val{color:#fff;}
.day-chip.active .chip-unit{color:rgba(255,255,255,0.75);}
.chip-date{font-size:9px;color:#94a3b8;font-weight:700;}
.chip-val{font-size:13px;font-weight:800;color:var(--chip-accent,#10b981);font-family:'DM Mono',monospace;}
.chip-unit{font-size:8.5px;color:#94a3b8;font-weight:600;}

/* ── Active filter banner ─────────────────────────────────────────────── */
.filter-banner{
  display:flex;align-items:center;gap:6px;padding:6px 12px;
  border-radius:5px;font-size:11px;font-weight:700;
  background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.07);
  color:#475569;
}

@keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes barGrow{from{transform:scaleY(0);opacity:0;}to{transform:scaleY(1);opacity:1;}}
input[type=date]::-webkit-calendar-picker-indicator{opacity:0.5;cursor:pointer;}
input[type=time]::-webkit-calendar-picker-indicator{opacity:0.5;cursor:pointer;}
@media(max-width:768px){.tb-right{width:100%;}.search-btn{width:100%;justify-content:center;}}
`;

// ─────────────────────────────────────────────────────────────────────────────
// INLINE SVG ICONS
// ─────────────────────────────────────────────────────────────────────────────
const IconRoute = ({ color = "#fff", size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>
  </svg>
);
const IconPackets = ({ color = "#fff", size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);
const IconCalendar = ({ color = "#fff", size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconSpeed = ({ color = "#fff", size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12l4.243-4.243"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const IconBarChart = ({ color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const IconWaveform = ({ color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// KPIBox — compact inline stat box (non-clickable)
// ─────────────────────────────────────────────────────────────────────────────
const KPIBox = memo(({ label, value, unit, colorClass, loading, highlight }) => (
  <div className={`kpi-box ${colorClass}${highlight ? ' danger' : ''}`}>
    <span className="kpi-box-dot" />
    {loading ? (
      <span className="kpi-box-skeleton" />
    ) : (
      <span className="kpi-box-value">
        {value}
        {unit && <span className="kpi-box-unit">{unit}</span>}
      </span>
    )}
    <span className="kpi-box-sep" />
    <span className="kpi-box-label">{label}</span>
  </div>
));

// ─────────────────────────────────────────────────────────────────────────────
// FilterKPIChip — clickable filter button (lives inside PacketLogCard)
// ─────────────────────────────────────────────────────────────────────────────
const FilterKPIChip = memo(({ filterKey, label, count, activeFilter, onFilter, dotColor, activeClass }) => {
  const isActive = activeFilter === filterKey;
  return (
    <button
      className={`filter-kpi ${isActive ? activeClass : 'fk-inactive'}`}
      onClick={() => onFilter(filterKey)}
      title={`Filter by: ${label}`}
    >
      <span className="fk-dot" style={!isActive ? { background: dotColor, opacity: 0.55 } : {}} />
      <span className="fk-count">{typeof count === 'number' ? count.toLocaleString() : count}</span>
      <span className="fk-value-sep" />
      <span className="fk-label">{label}</span>
    </button>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// CustomSelect
// ─────────────────────────────────────────────────────────────────────────────
const CustomSelect = ({ value, onChange, disabled, options, placeholder, THEME }) => {
  const [open, setOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 130 });
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const updateDropdownPosition = useCallback(() => {
    if (ref.current && open) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [open]);

  useEffect(() => {
    updateDropdownPosition();
    if (open) {
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
      return () => {
        window.removeEventListener('scroll', updateDropdownPosition, true);
        window.removeEventListener('resize', updateDropdownPosition);
      };
    }
  }, [open, updateDropdownPosition]);

  const handleOpen = () => { if (!disabled) { setOpen(true); setTimeout(updateDropdownPosition, 0); } };
  const selected = options.find(o => String(o.value) === String(value));

  return (
    <div ref={ref} style={{ position: 'relative', height: 36, minWidth: 130 }}>
      <div onClick={handleOpen} style={{ height: 36, padding: '0 28px 0 10px', border: `1.5px solid ${open ? THEME : '#e2e8f0'}`, borderRadius: 6, background: disabled ? '#f8fafc' : '#fff', fontSize: 13, fontWeight: 600, color: disabled ? '#9999aa' : '#111118', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', userSelect: 'none', boxShadow: open ? `0 0 0 3px ${THEME}20` : 'none', transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'relative' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selected ? selected.label : <span style={{ color: '#9999aa' }}>{placeholder}</span>}
        </span>
        <svg style={{ position: 'absolute', right: 8, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, transition: 'transform 0.18s', flexShrink: 0, pointerEvents: 'none' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={disabled ? '#d1d5db' : '#94a3b8'} strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      {open && !disabled && (
        <div style={{ position: 'fixed', top: dropdownPosition.top, left: dropdownPosition.left, minWidth: dropdownPosition.width, background: '#fff', border: `1.5px solid ${THEME}40`, borderRadius: 6, boxShadow: `0 8px 24px rgba(0,0,0,0.13), 0 0 0 1px ${THEME}18`, zIndex: 999999, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
          {options.map((opt, idx) => {
            const isSel = String(opt.value) === String(value);
            return (
              <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }} style={{ padding: '9px 12px', fontSize: 13, fontWeight: isSel ? 700 : 500, color: isSel ? '#fff' : '#111118', background: isSel ? THEME : '#fff', borderBottom: idx < options.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'background 0.1s', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = `${THEME}12`; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = '#fff'; }}>
                {isSel && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// GlobalDateTimePicker
// ─────────────────────────────────────────────────────────────────────────────
const GlobalDateTimePicker = memo(({ dateRange, onChange }) => {
  const toDateVal = d => { if (!d) return ''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const toTimeVal = d => { if (!d) return ''; return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
  const handleFromDate = e => { const base = dateRange.start ? new Date(dateRange.start) : new Date(); const parts = e.target.value.split('-'); if (parts.length !== 3) return; base.setFullYear(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2])); onChange({ start: new Date(base), end: dateRange.end }); };
  const handleFromTime = e => { const base = dateRange.start ? new Date(dateRange.start) : new Date(); const [h, m] = e.target.value.split(':'); base.setHours(parseInt(h)||0, parseInt(m)||0, 0, 0); onChange({ start: new Date(base), end: dateRange.end }); };
  const handleToDate = e => { const base = dateRange.end ? new Date(dateRange.end) : new Date(); const parts = e.target.value.split('-'); if (parts.length !== 3) return; base.setFullYear(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2])); base.setHours(23,59,59,999); onChange({ start: dateRange.start, end: new Date(base) }); };
  const handleToTime = e => { const base = dateRange.end ? new Date(dateRange.end) : new Date(); const [h, m] = e.target.value.split(':'); base.setHours(parseInt(h)||0, parseInt(m)||0, 59, 999); onChange({ start: dateRange.start, end: new Date(base) }); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div className="global-dt-wrap">
        <span className="global-dt-label">From</span>
        <input type="date" value={toDateVal(dateRange.start)} onChange={handleFromDate} className="global-dt-input" style={{ width: 100 }} />
        <input type="time" value={toTimeVal(dateRange.start)} onChange={handleFromTime} className="global-dt-input" style={{ width: 54 }} />
      </div>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      <div className="global-dt-wrap">
        <span className="global-dt-label">To</span>
        <input type="date" value={toDateVal(dateRange.end)} min={toDateVal(dateRange.start)} onChange={handleToDate} className="global-dt-input" style={{ width: 100 }} />
        <input type="time" value={toTimeVal(dateRange.end)} onChange={handleToTime} className="global-dt-input" style={{ width: 54 }} />
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ContainerPlaceholder & CardLoader
// ─────────────────────────────────────────────────────────────────────────────
const ContainerPlaceholder = memo(({ icon, title, subtitle, themeColor }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 14, padding: '32px 24px', textAlign: 'center', minHeight: 160 }}>
    <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${themeColor}0e`, border: `2px dashed ${themeColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', lineHeight: 1.7, maxWidth: 280 }}>{subtitle}</div>
    </div>
  </div>
));

const CardLoader = memo(({ themeColor, message = 'Fetching data…' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 220, gap: 14 }}>
    <div style={{ width: 40, height: 40, border: `3.5px solid ${themeColor}20`, borderTop: `3.5px solid ${themeColor}`, borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
    <span style={{ fontSize: 12, fontWeight: 600, color: themeColor }}>{message}</span>
  </div>
));

// ─────────────────────────────────────────────────────────────────────────────
// DistanceGraphCard
// ─────────────────────────────────────────────────────────────────────────────
const CHART_H_DIST = 420;

const DistanceGraphCard = memo(({ rows, themeColor, dateRange, loading, fetched }) => {
  const canvasRef    = useRef(null);
  const hoverXRef    = useRef(null);
  const rafRef       = useRef(null);
  const animRef      = useRef(null);
  const barProgressRef = useRef({});

  const [activeIdx, setActiveIdx] = useState(null);

  const dayData = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const map = new Map();
    rows.forEach(r => {
      if (!r.t) return;
      const d = new Date(r.t);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!map.has(key)) map.set(key, { key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), dist: 0, maxSpeed: 0, packets: 0 });
      const entry = map.get(key);
      entry.dist = Math.max(entry.dist, safeNum(r.cum, 0));
      entry.maxSpeed = Math.max(entry.maxSpeed, safeNum(r.s, 0));
      entry.packets++;
    });
    const sorted = [...map.values()].sort((a, b) => a.date - b.date);
    let prevCum = 0;
    sorted.forEach(d => {
      const dayDist = Math.max(0, d.dist - prevCum);
      d.dayDist = parseFloat(dayDist.toFixed(3));
      prevCum = d.dist;
    });
    return sorted;
  }, [rows]);

  useEffect(() => {
    const prog = {};
    dayData.forEach((_, i) => { prog[i] = 1; });
    barProgressRef.current = prog;
    setActiveIdx(null);
  }, [dayData]);

  const handleChipClick = useCallback((idx) => {
    setActiveIdx(prev => {
      const next = prev === idx ? null : idx;
      const prog = {};
      dayData.forEach((_, i) => { prog[i] = 1; });
      if (next !== null) {
        prog[next] = 0;
        barProgressRef.current = prog;
        const start = performance.now();
        const DURATION = 700;
        const animate = (now) => {
          const t = Math.min(1, (now - start) / DURATION);
          const ease = 1 - Math.pow(1 - t, 3);
          barProgressRef.current = { ...barProgressRef.current, [next]: ease };
          scheduleDraw();
          if (t < 1) animRef.current = requestAnimationFrame(animate);
        };
        if (animRef.current) cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(animate);
      } else {
        barProgressRef.current = prog;
        scheduleDraw();
      }
      return next;
    });
  }, [dayData]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dayData.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const PAD_L = 58, PAD_R = 24, PAD_T = 24, PAD_B = 56;
    const cW = W - PAD_L - PAD_R, cH = H - PAD_T - PAD_B;

    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

    const maxDist = Math.max(...dayData.map(d => d.dayDist), 1);
    const yMax = Math.ceil(maxDist / 5) * 5 || 10;
    const prog = barProgressRef.current;

    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const val = (yMax / ySteps) * i;
      const y = PAD_T + cH - (val / yMax) * cH;
      ctx.strokeStyle = i === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.05)';
      ctx.lineWidth = i === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + cW, y); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 9px DM Mono,monospace'; ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(0), PAD_L - 7, y + 3.5);
    }
    ctx.save(); ctx.translate(14, PAD_T + cH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('km / day', 0, 0); ctx.restore();

    const n = dayData.length;
    const barW = Math.max(4, Math.min(36, (cW / n) * 0.65));
    const gap  = cW / n;

    dayData.forEach((d, i) => {
      const x = PAD_L + gap * i + gap / 2;
      const fullBarH = Math.max(0, (d.dayDist / yMax) * cH);
      const ratio = prog[i] !== undefined ? prog[i] : 1;
      const barH = fullBarH * ratio;
      const y = PAD_T + cH - barH;
      const isActive = activeIdx === i;

      const grad = ctx.createLinearGradient(0, y, 0, PAD_T + cH);
      if (isActive) {
        grad.addColorStop(0, themeColor);
        grad.addColorStop(0.5, themeColor + 'cc');
        grad.addColorStop(1, themeColor + '55');
      } else {
        grad.addColorStop(0, themeColor + (activeIdx !== null ? '55' : 'cc'));
        grad.addColorStop(1, themeColor + '22');
      }
      ctx.fillStyle = grad;

      const rx = Math.min(4, barW / 2);
      if (barH > rx * 2) {
        ctx.beginPath();
        ctx.moveTo(x - barW/2 + rx, y);
        ctx.lineTo(x + barW/2 - rx, y);
        ctx.quadraticCurveTo(x + barW/2, y, x + barW/2, y + rx);
        ctx.lineTo(x + barW/2, PAD_T + cH);
        ctx.lineTo(x - barW/2, PAD_T + cH);
        ctx.lineTo(x - barW/2, y + rx);
        ctx.quadraticCurveTo(x - barW/2, y, x - barW/2 + rx, y);
        ctx.closePath();
        ctx.fill();
        if (isActive) {
          ctx.shadowColor = themeColor;
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else if (barH > 0) {
        ctx.fillRect(x - barW/2, y, barW, barH);
      }

      if (barH > 18 && barW > 20) {
        ctx.fillStyle = '#fff';
        ctx.font = `${isActive ? 'bold ' : ''}9px DM Mono,monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(d.dayDist.toFixed(1), x, y + 12);
      }

      const dateObj = d.date;
      const lbl = n > 20
        ? `${dateObj.getDate()}`
        : `${dateObj.getDate()} ${dateObj.toLocaleString('en-IN', { month: 'short' })}`;
      ctx.fillStyle = isActive ? themeColor : '#64748b';
      ctx.font = n > 25 ? '8px DM Mono,monospace' : (isActive ? 'bold 9px DM Mono,monospace' : '9px DM Mono,monospace');
      ctx.textAlign = 'center';
      ctx.save();
      if (n > 20) {
        ctx.translate(x, PAD_T + cH + 18);
        ctx.fillText(lbl, 0, 0);
      } else {
        ctx.translate(x, PAD_T + cH + 14);
        ctx.rotate(-Math.PI / 7);
        ctx.fillText(lbl, 0, 0);
      }
      ctx.restore();
    });

    const hx = hoverXRef.current;
    if (hx !== null) {
      let closest = null, minDist = Infinity;
      dayData.forEach((d, i) => {
        const x = PAD_L + (cW / n) * i + (cW / n) / 2;
        const dist = Math.abs(x - hx);
        if (dist < minDist && dist < (cW / n)) { minDist = dist; closest = { d, x, i }; }
      });
      if (closest) {
        const { d, x } = closest;
        const ratio = prog[closest.i] !== undefined ? prog[closest.i] : 1;
        const barH = Math.max(0, (d.dayDist / yMax) * cH) * ratio;
        const barTop = PAD_T + cH - barH;
        ctx.strokeStyle = themeColor + '60'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + cH); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(x, barTop, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, barTop, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = themeColor; ctx.fill();
        const dateStr = d.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const lines = [dateStr, `${d.dayDist.toFixed(3)} km`, `Max: ${d.maxSpeed.toFixed(0)} km/h`, `${d.packets.toLocaleString()} pkts`];
        const bw = 130, bh = 72;
        let bx = x + 10, by = Math.max(PAD_T, barTop - bh / 2);
        if (bx + bw > W - PAD_R) bx = x - bw - 10;
        if (by + bh > PAD_T + cH) by = PAD_T + cH - bh;
        ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(bx+2, by+2, bw, bh);
        ctx.fillStyle = 'rgba(15,23,42,0.93)'; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = themeColor; ctx.fillRect(bx, by + 4, 3, bh - 8);
        ctx.textAlign = 'left';
        const fColors = ['#cbd5e1', '#f8fafc', '#94a3b8', '#64748b'];
        const fSizes  = ['9px', 'bold 12px', '9px', '9px'];
        lines.forEach((l, li) => {
          ctx.fillStyle = fColors[li];
          ctx.font = `${fSizes[li]} DM Mono,monospace`;
          ctx.fillText(l, bx + 10, by + 16 + li * 15);
        });
      }
    }
  }, [dayData, themeColor, activeIdx]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => { scheduleDraw(); }, [scheduleDraw]);

  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleDraw());
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    hoverXRef.current = e.clientX - rect.left;
    scheduleDraw();
  }, [scheduleDraw]);

  const handleMouseLeave = useCallback(() => {
    hoverXRef.current = null;
    scheduleDraw();
  }, [scheduleDraw]);

  if (loading) return <CardLoader themeColor={themeColor} message="Computing distance graph…" />;
  if (!fetched) return (
    <ContainerPlaceholder themeColor={themeColor}
      icon={<IconBarChart color={themeColor} size={22} />}
      title="Day-wise Distance Graph"
      subtitle="Load packets to see daily distance breakdown"
    />
  );
  if (!dayData.length) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:CHART_H_DIST,flexDirection:'column',gap:8,color:'#94a3b8' }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/></svg>
      <span style={{fontSize:13,fontWeight:600}}>No distance data for this period</span>
    </div>
  );

  return (
    <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ position: 'relative', width: '100%', height: CHART_H_DIST, borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.04)' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          role="img"
          aria-label="Day-wise distance bar chart"
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
        {dayData.slice(0, 31).map((d, i) => {
          const isActive = activeIdx === i;
          return (
            <div
              key={d.key}
              className={`day-chip${isActive ? ' active' : ''}`}
              style={{ '--chip-accent': themeColor }}
              onClick={() => handleChipClick(i)}
              title={`Click to highlight ${d.date.getDate()} ${d.date.toLocaleString('en-IN',{month:'short'})}`}
            >
              <span className="chip-date">
                {d.date.getDate()} {d.date.toLocaleString('en-IN',{month:'short'})}
              </span>
              <span className="chip-val">{d.dayDist.toFixed(1)}</span>
              <span className="chip-unit">km</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SpeedTimelineCard
// ─────────────────────────────────────────────────────────────────────────────
const SpeedTimelineCard = memo(({ vehicleId, themeColor, apiBase, getTokenFn, dateRange, triggerFetch, cachedPts, onPtsCached, packetRows, packetsFetched, packetsLoading }) => {
  const canvasRef  = useRef(null);
  const sliderRef  = useRef(null);
  const zoomRef    = useRef([0, 1]);
  const hoverXRef  = useRef(null);
  const dragState  = useRef(null);
  const rafRef     = useRef(null);
  const abortRef   = useRef(null);

  const [activeGraph, setActiveGraph] = useState('speed');
  const [zoomWindow, setZoomWindow] = useState([0, 1]);
  const [pts,        setPts]        = useState(() => cachedPts || []);
  const [loading,    setLoading]    = useState(false);
  // ── FIX: init fetched from cachedPts so graph shows on page return ──
  const [fetched,    setFetched]    = useState(() => !!(cachedPts && cachedPts.length > 0));
  const [fetchErr,   setFetchErr]   = useState('');

  const OVERSPEED = 60, ZERO_SPEED = 2, Y_STEP = 10, CHART_H = 420;
  const MAX_SPEED = pts.length > 0 ? Math.ceil(pts.reduce((max, p) => p.y > max ? p.y : max, 120) / 20) * 20 : 120;

  useEffect(() => {
    if (triggerFetch <= 0 || !vehicleId || !dateRange?.start || !dateRange?.end) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true); setFetched(false); setFetchErr(''); setPts([]); setZoomWindow([0, 1]); zoomRef.current = [0, 1];
    const startISO = dateRange.start.toISOString();
    const endISO   = dateRange.end.toISOString();
    fetchGraphData(apiBase, vehicleId, startISO, endISO, getTokenFn, ctrl.signal)
      .then(json => {
        if (ctrl.signal.aborted) return;
        if (json.success && Array.isArray(json.data)) {
          const parsed = json.data.filter(p => Array.isArray(p) && p[0] != null).map(([t, s]) => ({ x: Number(t), y: Math.min(Math.max(0, Number(s) || 0), MAX_SPEED) })).sort((a, b) => a.x - b.x);
          setPts(parsed);
          if (onPtsCached) onPtsCached(parsed);
        } else { setPts([]); }
        setFetched(true);
      })
      .catch(err => { if (err.name === 'AbortError') return; setFetchErr(err.message || 'Graph fetch failed'); setFetched(true); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [triggerFetch, vehicleId, dateRange?.start?.getTime(), dateRange?.end?.getTime(), apiBase, getTokenFn]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const minT = pts.length ? pts[0].x : 0;
  const maxT = pts.length ? pts[pts.length - 1].x : 1;

  useEffect(() => { zoomRef.current = zoomWindow; }, [zoomWindow]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const PAD_L = 52, PAD_R = 20, PAD_T = 20, PAD_B = 48, cW = W - PAD_L - PAD_R, cH = H - PAD_T - PAD_B;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (!fetched || !pts.length) return;
    const [z0, z1] = zoomRef.current;
    const vMin = minT + (maxT - minT) * z0;
    const vMax = minT + (maxT - minT) * z1;
    const tRange = vMax - vMin || 1;
    const BUFFER = tRange * 0.005;
    const visPts = pts.filter(p => p.x >= vMin - BUFFER && p.x <= vMax + BUFFER);
    if (!visPts.length) return;
    const toX = t => PAD_L + ((t - vMin) / tRange) * cW;
    const toY = spd => PAD_T + cH - Math.max(0, Math.min(1, spd / MAX_SPEED)) * cH;
    ctx.fillStyle = 'rgba(16,185,129,0.025)'; ctx.fillRect(PAD_L, toY(OVERSPEED), cW, toY(0) - toY(OVERSPEED));
    ctx.fillStyle = 'rgba(234,88,12,0.035)';  ctx.fillRect(PAD_L, PAD_T, cW, toY(OVERSPEED) - PAD_T);
    for (let s = 0; s <= MAX_SPEED; s += Y_STEP) {
      const y = toY(s), isMajor = s % 20 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.03)'; ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + cW, y); ctx.stroke();
      if (isMajor || s % 10 === 0) { ctx.fillStyle = s === 0 ? '#64748b' : '#94a3b8'; ctx.font = `${isMajor ? 'bold ' : ''}9px DM Mono, monospace`; ctx.textAlign = 'right'; ctx.fillText(s, PAD_L - 6, y + 3.5); }
    }
    ctx.save(); ctx.translate(13, PAD_T + cH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px DM Sans, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('km / h', 0, 0); ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD_L, PAD_T); ctx.lineTo(PAD_L, PAD_T + cH + 4); ctx.stroke();
    const ovY = toY(OVERSPEED);
    ctx.strokeStyle = 'rgba(234,88,12,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(PAD_L, ovY); ctx.lineTo(PAD_L + cW, ovY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(234,88,12,0.65)'; ctx.font = '8.5px DM Sans, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('60 km/h  overspeed', PAD_L + 5, ovY - 4);
    const ONE_SEC=1000,ONE_MIN=60000,ONE_HR=3600000,ONE_DAY=86400000;
    const maxTicks = Math.max(4, Math.floor(cW / 70));
    const intervals = [ONE_SEC,2*ONE_SEC,5*ONE_SEC,10*ONE_SEC,15*ONE_SEC,30*ONE_SEC,ONE_MIN,2*ONE_MIN,5*ONE_MIN,10*ONE_MIN,15*ONE_MIN,30*ONE_MIN,ONE_HR,2*ONE_HR,3*ONE_HR,6*ONE_HR,12*ONE_HR,ONE_DAY];
    const tickInterval = intervals.find(iv => Math.floor(tRange / iv) <= maxTicks) || ONE_DAY;
    const firstTick = Math.ceil(vMin / tickInterval) * tickInterval;
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
    for (let t = firstTick; t <= vMax + tickInterval; t += tickInterval) {
      const x = toX(t); if (x < PAD_L - 1 || x > PAD_L + cW + 1) continue;
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + cH + 4); ctx.stroke();
      const d = new Date(t); let lbl;
      if (tickInterval < ONE_MIN) lbl = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
      else if (tickInterval < ONE_DAY) lbl = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      else lbl = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' });
      ctx.fillStyle = '#94a3b8'; ctx.font = '9px DM Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(lbl, x, PAD_T + cH + 15);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD_L, PAD_T + cH); ctx.lineTo(PAD_L + cW, PAD_T + cH); ctx.stroke();
    const decimatePts = (points) => {
      if (points.length <= 2) return points;
      const buckets = new Map();
      points.forEach(p => { const col = Math.round(toX(p.x)); if (!buckets.has(col)) buckets.set(col, []); buckets.get(col).push(p); });
      const result = [];
      [...buckets.keys()].sort((a, b) => a - b).forEach(col => {
        const bpts = buckets.get(col);
        if (bpts.length === 1) { result.push(bpts[0]); return; }
        result.push(bpts[0]);
        const minPt = bpts.reduce((a, b) => a.y < b.y ? a : b);
        const maxPt = bpts.reduce((a, b) => a.y > b.y ? a : b);
        if (minPt !== bpts[0] && minPt !== bpts[bpts.length-1]) result.push(minPt);
        if (maxPt !== bpts[0] && maxPt !== bpts[bpts.length-1] && maxPt !== minPt) result.push(maxPt);
        if (bpts[bpts.length-1] !== bpts[0]) result.push(bpts[bpts.length-1]);
      });
      return result.sort((a, b) => a.x - b.x);
    };
    const displayPts = decimatePts(visPts);
    const getType = spd => { if (spd <= ZERO_SPEED) return 'stopped'; if (spd > OVERSPEED) return 'over'; return 'normal'; };
    const SEG_COLORS = { normal: { line: themeColor, fill: `${themeColor}22` }, over: { line: '#f59e0b', fill: 'rgba(245,158,11,0.15)' }, stopped: { line: '#ef4444', fill: 'rgba(239,68,68,0.12)' } };
    const segments = [];
    if (displayPts.length > 0) {
      let cur = { type: getType(displayPts[0].y), pts: [displayPts[0]] };
      for (let i = 1; i < displayPts.length; i++) {
        const t = getType(displayPts[i].y);
        if (t === cur.type) { cur.pts.push(displayPts[i]); }
        else { cur.pts.push(displayPts[i]); segments.push(cur); cur = { type: t, pts: [displayPts[i-1], displayPts[i]] }; }
      }
      segments.push(cur);
    }
    segments.forEach(seg => {
      if (!seg.pts.length) return;
      const col = SEG_COLORS[seg.type];
      ctx.beginPath();
      if (seg.pts.length === 1) { const x = toX(seg.pts[0].x), y = toY(seg.pts[0].y); ctx.rect(x - 1, y, 2, PAD_T + cH - y); }
      else { seg.pts.forEach((p, i) => { const x = toX(p.x), y = toY(p.y); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.lineTo(toX(seg.pts[seg.pts.length-1].x), PAD_T + cH); ctx.lineTo(toX(seg.pts[0].x), PAD_T + cH); ctx.closePath(); }
      ctx.fillStyle = col.fill; ctx.fill();
    });
    segments.forEach(seg => {
      const col = SEG_COLORS[seg.type], lineW = seg.type === 'normal' ? 2 : 2.2;
      if (seg.pts.length === 1) { const x = toX(seg.pts[0].x), y = toY(seg.pts[0].y); ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, lineW), 0, Math.PI * 2); ctx.fillStyle = col.line; ctx.fill(); return; }
      ctx.beginPath(); seg.pts.forEach((p, i) => { const x = toX(p.x), y = toY(p.y); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.strokeStyle = col.line; ctx.lineWidth = lineW; ctx.stroke();
    });
    const hx = hoverXRef.current;
    if (hx !== null && hx >= PAD_L && hx <= PAD_L + cW) {
      let nearest = null, minDist = Infinity;
      displayPts.forEach(p => { const d = Math.abs(toX(p.x) - hx); if (d < minDist) { minDist = d; nearest = p; } });
      if (nearest && minDist < 80) {
        const nx = toX(nearest.x), ny = toY(nearest.y), typ = getType(nearest.y), dotColor = SEG_COLORS[typ].line;
        ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(nx, PAD_T); ctx.lineTo(nx, PAD_T + cH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(PAD_L, ny); ctx.lineTo(PAD_L + cW, ny); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(nx, ny, 6, 0, Math.PI * 2); ctx.fillStyle = dotColor + '30'; ctx.fill();
        ctx.beginPath(); ctx.arc(nx, ny, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fillStyle = dotColor; ctx.fill();
        const d = new Date(nearest.x);
        const timeStr = d.toLocaleTimeString('en-IN', { timeZone:'Asia/Kolkata', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
        const dateStr = d.toLocaleDateString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric' });
        const spdTxt = nearest.y <= ZERO_SPEED ? 'Stopped (0 km/h)' : `${nearest.y.toFixed(1)} km/h`;
        const stLabel = typ === 'stopped' ? ' Stopped' : typ === 'over' ? ' Overspeed' : ' Normal';
        ctx.font = '10px DM Mono, monospace';
        const tw = Math.max(ctx.measureText(`${dateStr}  ${timeStr}`).width, ctx.measureText(spdTxt).width, ctx.measureText(stLabel).width);
        const bw = tw + 20, bh = 62;
        let bx = nx + 12, by = Math.max(PAD_T + 4, ny - bh / 2);
        if (bx + bw > PAD_L + cW) bx = nx - bw - 12;
        if (by + bh > PAD_T + cH) by = PAD_T + cH - bh;
        ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(bx+2, by+2, bw, bh);
        ctx.fillStyle = 'rgba(15,23,42,0.94)'; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = dotColor; ctx.fillRect(bx, by + 4, 3, bh - 8);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8'; ctx.font = '9px DM Mono, monospace'; ctx.fillText(dateStr, bx+10, by+14);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText(timeStr, bx+10, by+25);
        ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 11px DM Mono, monospace'; ctx.fillText(spdTxt, bx+10, by+40);
        ctx.fillStyle = dotColor; ctx.font = '9px DM Sans, sans-serif'; ctx.fillText(stLabel, bx+10, by+54);
      }
    }
  }, [pts, fetched, themeColor, zoomWindow, minT, maxT]);

  const scheduleDraw = useCallback(() => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw); }, [draw]);
  useEffect(() => { if (activeGraph === 'speed') scheduleDraw(); }, [scheduleDraw, activeGraph]);
  useEffect(() => { const ro = new ResizeObserver(() => { if (activeGraph === 'speed') scheduleDraw(); }); if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement); return () => ro.disconnect(); }, [scheduleDraw, activeGraph]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(), PAD_L = 52, PAD_R = 20, cW = rect.width - PAD_L - PAD_R;
    const mxRel = e.clientX - rect.left - PAD_L, pivot = Math.max(0, Math.min(1, mxRel / cW));
    const delta = e.deltaY > 0 ? 1.18 : 0.84;
    setZoomWindow(([z0, z1]) => { const w = z1 - z0, newW = Math.max(0.000001, Math.min(1, w * delta)); const anchor = z0 + w * pivot, newZ0 = Math.max(0, anchor - newW * pivot), newZ1 = Math.min(1, newZ0 + newW); return [newZ0, newZ1 > newZ0 + 0.000001 ? newZ1 : newZ0 + 0.000001]; });
  }, []);

  useEffect(() => { const el = canvasRef.current; if (!el) return; el.addEventListener('wheel', handleWheel, { passive: false }); return () => el.removeEventListener('wheel', handleWheel); }, [handleWheel]);

  const handleChartMouseDown = useCallback((e) => { if (e.button !== 0) return; e.preventDefault(); const canvas = canvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect(); dragState.current = { type:'chartPan', startX:e.clientX, startZoom:[...zoomRef.current], width:rect.width-52-20 }; }, []);
  const handleChartMouseMove = useCallback((e) => { const canvas = canvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect(); hoverXRef.current = e.clientX - rect.left; if (dragState.current?.type === 'chartPan') { const dx = (e.clientX - dragState.current.startX) / dragState.current.width; const [z0, z1] = dragState.current.startZoom, w = z1 - z0; const newZ0 = Math.max(0, Math.min(1 - w, z0 - dx)), next = [newZ0, newZ0 + w]; setZoomWindow(next); zoomRef.current = next; } else { scheduleDraw(); } }, [scheduleDraw]);
  const handleChartMouseUp    = useCallback(() => { dragState.current = null; }, []);
  const handleChartMouseLeave = useCallback(() => { hoverXRef.current = null; dragState.current = null; scheduleDraw(); }, [scheduleDraw]);

  const getSliderRatio = e => { const rect = sliderRef.current?.getBoundingClientRect(); if (!rect) return 0; const cx = e.touches ? e.touches[0].clientX : e.clientX; return Math.max(0, Math.min(1, (cx - rect.left) / rect.width)); };
  const onSliderDown = (e, part) => { e.preventDefault(); e.stopPropagation(); dragState.current = { type:part, startX:getSliderRatio(e), startZoom:[...zoomRef.current] }; };

  useEffect(() => {
    const onMove = e => { const ds = dragState.current; if (!ds || ds.type === 'chartPan') return; const x = getSliderRatio(e), dx = x - ds.startX; let [s, en] = ds.startZoom; const MIN_W = 0.000001; if (ds.type === 'left') s = Math.max(0, Math.min(en - MIN_W, s + dx)); if (ds.type === 'right') en = Math.min(1, Math.max(s + MIN_W, en + dx)); if (ds.type === 'pan') { const w = en - s; s = Math.max(0, Math.min(1 - w, s + dx)); en = s + w; } const next = [s, en]; setZoomWindow(next); zoomRef.current = next; };
    const onUp = () => { if (dragState.current?.type !== 'chartPan') dragState.current = null; };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false }); window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, []);

  const [z0, z1] = zoomWindow;
  const zoomPct = Math.max(0.001, (z1 - z0) * 100);
  const zoomLabel = zoomPct < 0.1 ? zoomPct.toFixed(3) + '%' : zoomPct < 1 ? zoomPct.toFixed(2) + '%' : Math.round(zoomPct) + '%';
  const fmtTs = ms => { const d = new Date(ms), range = (maxT - minT) * (z1 - z0); if (range < 60000) return d.toLocaleString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }); return d.toLocaleString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }); };

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 'var(--r)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%' }}>
      <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="graph-toggle">
            <button className={`graph-toggle-btn ${activeGraph === 'speed' ? 'active' : ''}`} onClick={() => setActiveGraph('speed')}>
              <IconWaveform color={activeGraph === 'speed' ? themeColor : '#64748b'} size={12} />
              Speed vs Time
            </button>
            <button className={`graph-toggle-btn ${activeGraph === 'distance' ? 'active' : ''}`} onClick={() => setActiveGraph('distance')}>
              <IconBarChart color={activeGraph === 'distance' ? themeColor : '#64748b'} size={12} />
              Distance Graph
            </button>
          </div>
          {activeGraph === 'speed' && loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, border: `2px solid ${themeColor}30`, borderTopColor: themeColor, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: themeColor }}>Loading graph…</span>
            </div>
          )}
        </div>
        {activeGraph === 'speed' && fetched && pts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
            {[{label:'Normal',color:themeColor},{label:'Overspeed',color:'#f59e0b'},{label:'Stopped',color:'#ef4444'}].map(({color,label})=>(
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#94a3b8' }}>
                <span style={{ width: 8, height: 3, background: color, borderRadius: 1, display: 'inline-block' }} />{label}
              </span>
            ))}
            <div style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />
            <button onClick={()=>setZoomWindow(([z0,z1])=>{const c=(z0+z1)/2,w=(z1-z0)*0.5;return[Math.max(0,c-w),Math.min(1,c+w)];})} style={{ width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', minWidth: 46, textAlign: 'center' }}>{zoomLabel}</span>
            <button onClick={()=>setZoomWindow(([z0,z1])=>{const c=(z0+z1)/2,w=Math.min(0.5,(z1-z0)*2);return[Math.max(0,c-w),Math.min(1,c+w)];})} style={{ width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
            {zoomPct < 99 && <button onClick={()=>{setZoomWindow([0,1]);zoomRef.current=[0,1];}} style={{ height: 26, padding: '0 8px', border: `1px solid ${themeColor}40`, borderRadius: 4, background: `${themeColor}10`, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: themeColor, fontFamily: 'DM Sans,sans-serif' }}>Reset</button>}
          </div>
        )}
      </div>

      <div style={{ padding: activeGraph === 'distance' ? 0 : '12px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {activeGraph === 'speed' && (
          <>
            {loading && (<div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:CHART_H }}><CardLoader themeColor={themeColor} message="Fetching speed data…" /></div>)}
            {!loading && !fetched && (<div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:CHART_H }}><ContainerPlaceholder themeColor={themeColor} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} title="Speed vs Time Graph" subtitle={vehicleId ? <>Set your date range and click <strong style={{color:themeColor}}>Load Packets</strong> to render the graph</> : <>Choose <strong style={{color:'#374151'}}>Dealer → User → Vehicle</strong> from the selectors above</>} /></div>)}
            {fetched && !loading && fetchErr && (<div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:CHART_H,flexDirection:'column',gap:10,color:'#dc2626',fontSize:12,fontWeight:600 }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>{fetchErr}</div>)}
            {fetched && !loading && !fetchErr && pts.length === 0 && (
              <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:CHART_H,flexDirection:'column',gap:8,color:'#94a3b8' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/></svg>
                <span style={{fontSize:13,fontWeight:600}}>No speed data for this period</span>
              </div>
            )}
            {fetched && !loading && pts.length > 0 && (
              <>
                <div style={{ position:'relative',width:'100%',height:CHART_H,cursor:dragState.current?.type==='chartPan'?'grabbing':'crosshair',borderRadius:4,overflow:'hidden',border:'1px solid rgba(0,0,0,0.04)' }}>
                  <canvas ref={canvasRef} style={{ width:'100%',height:'100%',display:'block' }} onMouseDown={handleChartMouseDown} onMouseMove={handleChartMouseMove} onMouseUp={handleChartMouseUp} onMouseLeave={handleChartMouseLeave} role="img" aria-label="Speed timeline chart" />
                </div>
                <div>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3 }}>
                    <span style={{ fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em' }}>Overview · {zoomLabel} visible · {pts.length.toLocaleString()} pts</span>
                  </div>
                  <div ref={sliderRef} style={{ position:'relative',height:34,background:'#f8fafc',borderRadius:5,border:'1px solid #e2e8f0',userSelect:'none',overflow:'hidden' }}>
                    <svg style={{ position:'absolute',inset:0,width:'100%',height:'100%' }} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(pts.length,1)} 120`}>
                      {pts.map((p,i)=>{ const c=p.y<=2?'#ef444488':p.y>60?'#f59e0b88':`${themeColor}88`; return <rect key={i} x={i} y={120-Math.max(p.y,1)} width={1.5} height={Math.max(p.y,1)} fill={c} />; })}
                    </svg>
                    <div style={{ position:'absolute',left:0,top:0,bottom:0,width:`${z0*100}%`,background:'rgba(248,250,252,0.75)',pointerEvents:'none' }} />
                    <div style={{ position:'absolute',right:0,top:0,bottom:0,width:`${(1-z1)*100}%`,background:'rgba(248,250,252,0.75)',pointerEvents:'none' }} />
                    <div style={{ position:'absolute',left:`${z0*100}%`,width:`${Math.max(0.5,(z1-z0)*100)}%`,top:0,bottom:0,background:`${themeColor}10`,border:`1.5px solid ${themeColor}60`,borderRadius:3,cursor:'grab',boxSizing:'border-box' }} onMouseDown={e=>onSliderDown(e,'pan')} onTouchStart={e=>onSliderDown(e,'pan')} />
                    <div style={{ position:'absolute',left:`calc(${z0*100}% - 5px)`,top:0,bottom:0,width:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'ew-resize',zIndex:4 }} onMouseDown={e=>onSliderDown(e,'left')} onTouchStart={e=>onSliderDown(e,'left')}><div style={{ width:3,height:22,background:themeColor,borderRadius:2,opacity:0.85 }} /></div>
                    <div style={{ position:'absolute',left:`calc(${z1*100}% - 5px)`,top:0,bottom:0,width:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'ew-resize',zIndex:4 }} onMouseDown={e=>onSliderDown(e,'right')} onTouchStart={e=>onSliderDown(e,'right')}><div style={{ width:3,height:22,background:themeColor,borderRadius:2,opacity:0.85 }} /></div>
                  </div>
                  <div style={{ display:'flex',justifyContent:'space-between',marginTop:3 }}>
                    <span style={{ fontSize:9,color:'#64748b',fontFamily:'DM Mono,monospace' }}>{pts.length?fmtTs(minT+(maxT-minT)*z0):'--'}</span>
                    <span style={{ fontSize:9,color:'#64748b',fontFamily:'DM Mono,monospace' }}>{pts.length?fmtTs(minT+(maxT-minT)*z1):'--'}</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {activeGraph === 'distance' && (
          <DistanceGraphCard
            rows={packetRows}
            themeColor={themeColor}
            dateRange={dateRange}
            loading={packetsLoading}
            fetched={packetsFetched}
          />
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// VirtualPacketTable
// ─────────────────────────────────────────────────────────────────────────────
const ROW_H      = 38;
const VIEWPORT_H = 420;

const VirtualPacketTable = memo(({ rows, themeColor, apiBase, getTokenFn, onNearBottom, loadingMore }) => {
  const containerRef = useRef(null);
  const [scrollTop,  setScrollTop]  = useState(0);
  const [addresses,  setAddresses]  = useState({});
  const resolving    = useRef(new Set());
  const nearBottomFired = useRef(false);

  const OVERSCAN   = 12;
  const visStart   = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visEnd     = Math.min(rows.length, Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN);

  useEffect(() => {
    const visibleRows = rows.slice(visStart, visEnd);
    visibleRows.forEach(async r => {
      if (!r.lat || !r.lon) return;
      const fk = fineKey(r.lat, r.lon);
      if (addresses[fk]) return;
      const cached = getCachedAddress(r.lat, r.lon);
      if (cached) { setAddresses(prev => ({ ...prev, [fk]: cached })); return; }
      if (resolving.current.has(fk)) return;
      resolving.current.add(fk);
      const addr = await reverseGeocode(r.lat, r.lon, apiBase, getTokenFn);
      resolving.current.delete(fk);
      if (addr) setAddresses(prev => ({ ...prev, [fk]: addr }));
    });
  }, [visStart, visEnd, rows]);

  const getAddress = r => {
    if (!r.lat || !r.lon) return null;
    const fk = fineKey(r.lat, r.lon);
    if (addresses[fk]) return { text: addresses[fk], isCoord: false };
    const cached = getCachedAddress(r.lat, r.lon);
    if (cached) return { text: cached, isCoord: false };
    return { text: `${Number(r.lat).toFixed(5)}, ${Number(r.lon).toFixed(5)}`, isCoord: true };
  };

  const fmtTsIST = useCallback(ms => {
    if (!ms) return '--';
    return new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }, []);

  const handleScroll = useCallback(e => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 400 && !nearBottomFired.current && !loadingMore) {
      nearBottomFired.current = true;
      if (onNearBottom) onNearBottom();
    }
    if (distFromBottom > 800) nearBottomFired.current = false;
  }, [onNearBottom, loadingMore]);

  useEffect(() => { if (!loadingMore) nearBottomFired.current = false; }, [loadingMore]);

  return (
    <div ref={containerRef} onScroll={handleScroll} style={{ overflowY: 'auto', overflowX: 'hidden', height: VIEWPORT_H, position: 'relative' }}>
      <table className="pkt-table" style={{ width: '100%' }}>
        <colgroup>
          <col style={{ width: '4%' }}  />
          <col style={{ width: '18%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '7%'  }} />
          <col style={{ width: '9%'  }} />
          <col style={{ width: '9%'  }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            {['#', 'Time (IST)', 'Speed', 'IGN', 'Δ Dist', 'Σ Dist', 'Location / Address'].map(h => (
              <th key={h} style={{ textAlign: h === '#' ? 'center' : 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visStart > 0 && <tr><td colSpan={7} style={{ height: visStart * ROW_H, padding: 0, border: 'none' }} /></tr>}
          {rows.slice(visStart, visEnd).map((row, rel) => {
            const absIdx  = visStart + rel;
            const speed   = Number(row.s || 0);
            const isOver  = speed > 60;
            const isMov   = speed > 1.5;
            const addr    = getAddress(row);

            let rowClass = 'pkt-row ';
            if (isOver)       rowClass += 'row-over';
            else if (!isMov)  rowClass += 'row-stopped';
            else              rowClass += 'row-normal';

            let spdBadgeClass = 'spd-badge ';
            if (isOver)      spdBadgeClass += 'spd-over';
            else if (isMov)  spdBadgeClass += 'spd-moving';
            else             spdBadgeClass += 'spd-stopped';

            return (
              <tr key={absIdx} className={rowClass}>
                <td className="pkt-cell" style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 10, fontWeight: 600, fontFamily: 'DM Mono,monospace' }}>
                  {(absIdx + 1).toLocaleString()}
                </td>
                <td className="pkt-cell" style={{ fontFamily: 'DM Mono,monospace', fontSize: 11, color: '#334155', letterSpacing: '-0.01em' }}>
                  {row.t ? fmtTsIST(row.t) : '--'}
                </td>
                <td className="pkt-cell">
                  <span className={spdBadgeClass}>
                    {speed.toFixed(1)}
                    <span style={{ fontSize: 9.5, fontWeight: 600, opacity: 0.7 }}>km/h</span>
                    {isOver && <span style={{ fontSize: 10 }}>⚠</span>}
                  </span>
                </td>
                <td className="pkt-cell">
                  <span className={`ign-pill ${row.ign ? 'ign-on' : 'ign-off'}`}>
                    <span className={`ign-dot ${row.ign ? 'ign-dot-on' : 'ign-dot-off'}`} />
                    {row.ign ? 'ON' : 'OFF'}
                  </span>
                </td>
                <td className="pkt-cell" style={{ fontFamily: 'DM Mono,monospace', fontSize: 11, color: '#475569' }}>
                  <span style={{ color: '#94a3b8' }}>+</span>
                  {Number(row.d || 0).toFixed(3)}
                  <span style={{ fontSize: 9, marginLeft: 2, color: '#94a3b8', fontWeight: 600 }}>km</span>
                </td>
                <td className="pkt-cell" style={{ fontFamily: 'DM Mono,monospace', fontSize: 11, fontWeight: 700 }}>
                  <span style={{ color: THEME_GREEN }}>{Number(row.cum || 0).toFixed(3)}</span>
                  <span style={{ fontSize: 9, marginLeft: 2, color: '#6ee7b7', fontWeight: 600 }}>km</span>
                </td>
                <td className="pkt-cell cell-addr">
                  {addr ? (
                    addr.isCoord
                      ? <span className="addr-coord">{addr.text}</span>
                      : <span className="addr-text" title={addr.text}>{addr.text}</span>
                  ) : (
                    <span style={{ color: '#e2e8f0', fontSize: 10 }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {visEnd < rows.length && <tr><td colSpan={7} style={{ height: (rows.length - visEnd) * ROW_H, padding: 0, border: 'none' }} /></tr>}
        </tbody>
      </table>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PacketLogCard
// ─────────────────────────────────────────────────────────────────────────────
const PacketLogCard = memo(({
  vehicleId, themeColor, apiBase, getTokenFn,
  dateRange, triggerFetch,
  cachedRows, onRowsCached,
  onStatsUpdate, onRowsChange,
  searched,
}) => {
  // ── FIX: hydrate rows + fetched flag from cache on mount ──
  const [rows,        setRows]        = useState(() => cachedRows || []);
  const [curPage,     setCurPage]     = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [error,       setError]       = useState('');
  // ── FIX: if cachedRows has data, mark as fetched so table renders on return ──
  const [fetched,     setFetched]     = useState(() => !!(cachedRows && cachedRows.length > 0));

  const [localFilter, setLocalFilter] = useState('all');
  const [filterCounts, setFilterCounts] = useState(() => {
    // ── FIX: pre-compute filter counts from cached rows on mount ──
    const r = cachedRows || [];
    return {
      all:     r.length,
      moving:  r.filter(x => safeNum(x.s, 0) > 1.5).length,
      stopped: r.filter(x => safeNum(x.s, 0) <= 1.5).length,
      over:    r.filter(x => safeNum(x.s, 0) > 60).length,
    };
  });

  const loadingRef    = useRef(false);
  const abortRef      = useRef(null);
  const latestTrigger = useRef(0);
  const capturedDate  = useRef({ start: null, end: null });
  const totalRawRef   = useRef(0);
  const allRowsRef    = useRef(cachedRows || []); // ── FIX: init from cache ──

  // ─────────────────────────────────────────────────────────────────
  // FIX: smarter recalcCumulative — trust API values if already set
  // This was the root cause of 0.000 km showing in the table.
  // If API already returns non-zero cum on the first row, skip Haversine.
  // ─────────────────────────────────────────────────────────────────
  const recalcCumulative = useCallback((rawRows) => {
    if (!rawRows || rawRows.length === 0) return [];
    const sorted = [...rawRows].sort((a, b) => (a.t || 0) - (b.t || 0));

    // ── FIX: Check if API already computed valid cumulative distances ──
    // If any row has a non-zero cum value from API, trust the API values
    // and only recalc the delta (d) field from consecutive rows.
    const apiHasCum = sorted.some(r => safeNum(r.cum, 0) > 0);

    if (apiHasCum) {
      // API already provides cum — just ensure d (delta) is present
      return sorted.map((r, i) => {
        const prevCum = i > 0 ? safeNum(sorted[i - 1].cum, 0) : 0;
        const thisCum = safeNum(r.cum, 0);
        const delta   = Math.max(0, thisCum - prevCum);
        return { ...r, d: parseFloat(delta.toFixed(4)) };
      });
    }

    // API did NOT provide cum — compute from lat/lon via Haversine
    let cumDist = 0;
    let prevLat = null, prevLon = null, prevTs = null;
    return sorted.map(r => {
      let delta = 0;
      if (prevLat !== null && prevLon !== null && r.lat && r.lon && prevTs && r.t) {
        const gapMs = r.t - prevTs;
        if (gapMs >= 0 && gapMs < 7_200_000) {
          const d = haversineKm(prevLat, prevLon, r.lat, r.lon);
          const maxPossibleDist = (gapMs / 1000) * (300 / 3600);
          if (d < Math.max(0.5, maxPossibleDist) && d < 50) {
            delta = d;
            cumDist += d;
          }
        }
      }
      prevLat = r.lat; prevLon = r.lon; prevTs = r.t;
      return { ...r, d: parseFloat(delta.toFixed(4)), cum: parseFloat(cumDist.toFixed(4)) };
    });
  }, []);

  const emitStats = useCallback((allRows, raw, complete) => {
    if (!onStatsUpdate) return;
    const totalPackets  = raw || allRows.length;
    const totalDistance = allRows.length > 0 ? safeNum(allRows[allRows.length - 1].cum, 0) : 0;
    const maxSpeed      = allRows.reduce((m, r) => Math.max(m, safeNum(r.s, 0)), 0);
    onStatsUpdate({ totalPackets, totalDistance: parseFloat(totalDistance.toFixed(3)), maxSpeed: parseFloat(maxSpeed.toFixed(1)), isComplete: complete });
  }, [onStatsUpdate]);

  const recalcCounts = useCallback((allRows) => {
    setFilterCounts({
      all:     allRows.length,
      moving:  allRows.filter(r => safeNum(r.s, 0) > 1.5).length,
      stopped: allRows.filter(r => safeNum(r.s, 0) <= 1.5).length,
      over:    allRows.filter(r => safeNum(r.s, 0) > 60).length,
    });
  }, []);

  // ── FIX: emit stats for cached rows on mount so KPI boxes show correct values ──
  useEffect(() => {
    if (cachedRows && cachedRows.length > 0 && onStatsUpdate) {
      emitStats(cachedRows, cachedRows.length, true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPage = useCallback(async (pageNum, isReset, triggerKey) => {
    if (loadingRef.current) return;
    if (!vehicleId) return;
    const startISO = capturedDate.current?.start?.toISOString();
    const endISO   = capturedDate.current?.end?.toISOString();
    if (!startISO || !endISO) return;
    loadingRef.current = true;
    if (isReset) setLoading(true); else setLoadingMore(true);
    try {
      const json = await fetchPacketPage(apiBase, vehicleId, startISO, endISO, pageNum, getTokenFn, abortRef.current?.signal);
      if (latestTrigger.current !== triggerKey) return;
      if (!json.success) throw new Error(json.message || 'Fetch failed');
      const newRows = Array.isArray(json.data) ? json.data : [];
      const more = !!json.hasMore;
      if (isReset) {
        totalRawRef.current = json.totalRaw || newRows.length;
        const recalced = recalcCumulative(newRows);
        allRowsRef.current = recalced;
        setRows(recalced); setFetched(true);
        recalcCounts(recalced);
        if (onRowsCached) onRowsCached(recalced);
        if (onRowsChange) onRowsChange(recalced);
        emitStats(recalced, totalRawRef.current, !more);
        setTimeout(() => batchPreloadGeocode(recalced, apiBase, getTokenFn), 100);
      } else {
        const merged = [...allRowsRef.current, ...newRows];
        const recalced = recalcCumulative(merged);
        allRowsRef.current = recalced;
        setRows(recalced);
        recalcCounts(recalced);
        if (onRowsCached) onRowsCached(recalced);
        if (onRowsChange) onRowsChange(recalced);
        emitStats(recalced, totalRawRef.current, !more);
        setTimeout(() => batchPreloadGeocode(newRows, apiBase, getTokenFn), 100);
      }
      setCurPage(pageNum); setHasMore(more); setError('');
      loadingRef.current = false;
      if (isReset) setLoading(false); else setLoadingMore(false);
      if (more && latestTrigger.current === triggerKey) {
        setTimeout(() => {
          if (latestTrigger.current === triggerKey && !abortRef.current?.signal?.aborted)
            fetchPage(pageNum + 1, false, triggerKey);
        }, 200);
      }
    } catch (err) {
      loadingRef.current = false;
      if (isReset) setLoading(false); else setLoadingMore(false);
      if (err.name === 'AbortError') return;
      if (latestTrigger.current !== triggerKey) return;
      setError(err.message || 'Fetch failed'); setFetched(true);
    }
  }, [vehicleId, apiBase, getTokenFn, emitStats, recalcCounts, recalcCumulative]);

  useEffect(() => {
    if (triggerFetch <= 0) return;
    capturedDate.current = { start: dateRange?.start ? new Date(dateRange.start.getTime()) : null, end: dateRange?.end ? new Date(dateRange.end.getTime()) : null };
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    latestTrigger.current = triggerFetch;
    loadingRef.current = false; totalRawRef.current = 0; allRowsRef.current = [];
    setRows([]); setCurPage(0); setHasMore(false); setError(''); setFetched(false);
    setLocalFilter('all');
    setFilterCounts({ all: 0, moving: 0, stopped: 0, over: 0 });
    fetchPage(1, true, triggerFetch);
  }, [triggerFetch]);

  const handleNearBottom = useCallback(() => {
    if (!loadingRef.current && hasMore) fetchPage(curPage + 1, false, latestTrigger.current);
  }, [curPage, hasMore, fetchPage]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const handleFilterChange = useCallback((filter) => {
    setLocalFilter(prev => prev === filter ? 'all' : filter);
  }, []);

  const displayRows = useMemo(() => applyPacketFilter(rows, localFilter), [rows, localFilter]);

  const filterLabel = localFilter === 'moving' ? 'Moving' : localFilter === 'stopped' ? 'Stopped' : localFilter === 'over' ? 'Overspeed' : 'All';

  const SkeletonTable = () => (
    <div style={{ overflow: 'hidden', position: 'relative', minHeight: VIEWPORT_H + 50 }}>
      <table className="pkt-table" style={{ width: '100%' }}>
        <thead>
          <tr>{['#', 'Time (IST)', 'Speed', 'IGN', 'Δ Dist', 'Σ Dist', 'Location / Address'].map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {Array(10).fill(0).map((_, i) => (
            <tr key={i} style={{ height: ROW_H, background: i % 2 === 0 ? '#fafafa' : '#fff' }}>
              {['4%','18%','10%','7%','9%','9%','auto'].map((w, j) => (
                <td key={j} className="pkt-cell">
                  <div style={{ width: '70%', height: 9, borderRadius: 3, background: '#e2e8f0', animation: 'kpi-pulse 1.4s ease-in-out infinite' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,0.85)',backdropFilter:'blur(2px)',zIndex:3 }}>
        <ContainerPlaceholder themeColor={themeColor}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>}
          title="Packet Log"
          subtitle={vehicleId ? <>Set your date range and click <strong style={{color:themeColor}}>Load Packets</strong> to fetch logs</> : <>Choose <strong style={{color:'#374151'}}>Dealer → User → Vehicle</strong> from the selectors above</>}
        />
      </div>
    </div>
  );

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 'var(--r)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '8px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Packet Log</span>
        </div>

        {fetched && rows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <FilterKPIChip filterKey="all"     label="All"       count={filterCounts.all}     activeFilter={localFilter} onFilter={handleFilterChange} dotColor={themeColor}  activeClass="fk-all" />
            <FilterKPIChip filterKey="moving"  label="Running"   count={filterCounts.moving}  activeFilter={localFilter} onFilter={handleFilterChange} dotColor="#16a34a"     activeClass="fk-moving" />
            <FilterKPIChip filterKey="stopped" label="Stopped"   count={filterCounts.stopped} activeFilter={localFilter} onFilter={handleFilterChange} dotColor="#dc2626"     activeClass="fk-stopped" />
            <FilterKPIChip filterKey="over"    label="Overspeed" count={filterCounts.over}    activeFilter={localFilter} onFilter={handleFilterChange} dotColor="#ea580c"     activeClass="fk-over" />
          </div>
        )}

        {(loading || loadingMore) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
            <div style={{ width: 10, height: 10, border: `2px solid ${themeColor}30`, borderTopColor: themeColor, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: themeColor }}>
              {loading ? 'Loading…' : `${rows.length.toLocaleString()} loaded`}
            </span>
          </div>
        )}
        {fetched && hasMore && !loading && !loadingMore && (
          <span style={{ fontSize: 10, fontWeight: 700, color: themeColor, marginLeft: 'auto' }}>Loading more…</span>
        )}
      </div>

      {/* Body */}
      {!fetched && !loading && !error && <SkeletonTable />}
      {!fetched && loading && <CardLoader themeColor={themeColor} message="Fetching packets…" />}
      {error && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, color: '#dc2626', flexDirection: 'column', gap: 12 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="#dc2626"/></svg>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{error}</span>
          <button onClick={() => fetchPage(1, true, latestTrigger.current)} style={{ padding: '6px 14px', borderRadius: 6, border: '1.5px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Retry</button>
        </div>
      )}
      {fetched && rows.length === 0 && !error && !hasMore && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, flexDirection: 'column', gap: 10 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>No packets found for this period</span>
        </div>
      )}
      {fetched && displayRows.length === 0 && rows.length > 0 && !error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, flexDirection: 'column', gap: 10 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>No {filterLabel.toLowerCase()} packets in this period</span>
        </div>
      )}
      {fetched && displayRows.length > 0 && (
        <VirtualPacketTable rows={displayRows} themeColor={themeColor} apiBase={apiBase} getTokenFn={getTokenFn} onNearBottom={handleNearBottom} loadingMore={loadingMore} />
      )}

      {/* Footer */}
      {fetched && rows.length > 0 && (
        <div style={{ padding: '7px 16px', background: 'var(--surface-2)', borderTop: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>
            Showing <strong style={{ color: '#475569' }}>{displayRows.length.toLocaleString()}</strong> of <strong style={{ color: '#475569' }}>{rows.length.toLocaleString()}</strong> packets
            {localFilter !== 'all' && <span style={{ marginLeft: 4, color: themeColor }}>· {filterLabel}</span>}
          </span>
          {!hasMore && rows.length > 0 && (
            <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600, fontFamily: 'DM Mono,monospace' }}>
              Total: <span style={{ color: THEME_GREEN }}>{rows.length > 0 ? safeNum(rows[rows.length-1].cum, 0).toFixed(3) : '0.000'}</span> km
            </span>
          )}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DistanceReport Component
// ─────────────────────────────────────────────────────────────────────────────
export default function DistanceReport() {
  const themeCtx = useTheme();
  const THEME    = themeCtx?.activeColor || THEME_DEF;

  const userInfo = useState(() => getUserInfo())[0];
  const role     = getRole(userInfo);
  const isSA     = role === 'superadmin';
  const isAdmin  = role === 'admin';
  const isDealer = role === 'dealer';
  const isUser   = role === 'user';

  const [admins,   setAdmins]   = useState(() => _store.admins);
  const [dealers,  setDealers]  = useState(() => _store.dealers);
  const [users,    setUsers]    = useState(() => _store.users);
  const [vehicles, setVehicles] = useState(() => _store.vehicles);

  const [selAdmin,  setSelAdmin]  = useState(() => _store.selAdmin);
  const [selDealer, setSelDealer] = useState(() => _store.selDealer);
  const [selUser,   setSelUser]   = useState(() => _store.selUser);
  const [selVeh,    setSelVeh]    = useState(() => _store.selVeh);

  const [lAdmins,  setLAdmins]  = useState(false);
  const [lDealers, setLDealers] = useState(false);
  const [lUsers,   setLUsers]   = useState(false);
  const [lVeh,     setLVeh]     = useState(false);

  const [globalDateRange, setGlobalDateRange] = useState(() => _store.dateRange || defaultDateRange());
  const [triggerFetch,    setTriggerFetch]    = useState(0);
  const [error,           setError]           = useState('');

  // ── FIX: hydrate ALL result state from store on mount ──
  const [kpiStats,       setKpiStats]       = useState(() => _store.kpiStats || null);
  const [packetRows,     setPacketRows]     = useState(() => _store.packetRows || []);
  const [packetsFetched, setPacketsFetched] = useState(() => !!(_store.packetRows && _store.packetRows.length > 0));
  const [packetsLoading, setPacketsLoading] = useState(false);

  const abortRef = useRef({});

  // ── FIX: sync ALL result state back to store ──
  useEffect(() => { _store.save({ selAdmin, selDealer, selUser, selVeh }); }, [selAdmin, selDealer, selUser, selVeh]);
  useEffect(() => { _store.save({ admins }); },   [admins]);
  useEffect(() => { _store.save({ dealers }); },  [dealers]);
  useEffect(() => { _store.save({ users }); },    [users]);
  useEffect(() => { _store.save({ vehicles }); }, [vehicles]);
  useEffect(() => { _store.save({ dateRange: globalDateRange }); }, [globalDateRange]);
  // ── FIX: these three were missing — KPI boxes showed 0 on page return ──
  useEffect(() => { _store.save({ kpiStats }); }, [kpiStats]);
  useEffect(() => { _store.save({ packetRows, packetsFetched }); }, [packetRows, packetsFetched]);

  const apiCall = useCallback(async (key, ep, params = {}) => {
    if (abortRef.current[key]) abortRef.current[key].abort();
    const ctrl = new AbortController();
    abortRef.current[key] = ctrl;
    const url = new URL(`${API_BASE}/analytics${ep}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v); });
    const res = await fetch(url.toString(), {
      headers: { Authorization: getToken() ? `Bearer ${getToken()}` : '', 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    });
    delete abortRef.current[key];
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.message || `HTTP ${res.status}`); }
    return res.json();
  }, []);

  useEffect(() => {
    if (!isSA) return;
    if (_store.admins.length > 0) { setAdmins(_store.admins); return; }
    let alive = true; setLAdmins(true);
    apiCall('adm', '/admins').then(r => { if (alive && r.success) setAdmins(r.data || []); }).finally(() => { if (alive) setLAdmins(false); });
    return () => { alive = false; };
  }, [apiCall, isSA]);

  useEffect(() => {
    if (isDealer || isUser) return;
    const shouldFetch = isSA ? !!selAdmin : isAdmin ? true : false;
    if (!shouldFetch) return;
    if (_store.dealers.length > 0 && _store.selAdmin === selAdmin && dealers.length === 0) { setDealers(_store.dealers); return; }
    let alive = true; setLDealers(true);
    if (_store.selAdmin !== selAdmin) { setDealers([]); setSelDealer(''); setSelUser(''); setSelVeh(''); }
    const p = {}; if (isSA && selAdmin) p.adminId = selAdmin;
    apiCall('dlr', '/dealers', p).then(r => { if (alive && r.success) setDealers(r.data || []); }).finally(() => { if (alive) setLDealers(false); });
    return () => { alive = false; };
  }, [selAdmin, apiCall, isSA, isAdmin, isDealer, isUser]);

  useEffect(() => {
    if (isUser) return;
    const shouldFetch = isSA ? (!!selAdmin && !!selDealer) : isAdmin ? !!selDealer : isDealer ? true : false;
    if (!shouldFetch) return;
    if (_store.users.length > 0 && _store.selDealer === selDealer && users.length === 0) { setUsers(_store.users); return; }
    let alive = true; setLUsers(true);
    if (_store.selDealer !== selDealer) { setUsers([]); setSelUser(''); setSelVeh(''); }
    const p = {}; if (selDealer) p.dealerId = selDealer;
    apiCall('usr', '/users', p).then(r => { if (alive && r.success) setUsers(r.data || []); }).finally(() => { if (alive) setLUsers(false); });
    return () => { alive = false; };
  }, [selAdmin, selDealer, apiCall, isSA, isAdmin, isDealer, isUser]);

  useEffect(() => {
    const canLoad = isUser ? true : !!selUser;
    if (!canLoad) { setVehicles([]); return; }
    if (_store.vehicles.length > 0 && _store.selUser === selUser && vehicles.length === 0) { setVehicles(_store.vehicles); return; }
    let alive = true; setLVeh(true);
    if (_store.selUser !== selUser) { setVehicles([]); setSelVeh(''); }
    const p = {};
    if (isUser && userInfo) { const uid = userInfo.user_id ?? userInfo.uid ?? userInfo.id ?? null; if (uid) p.userId = uid; }
    else if (selUser) { p.userId = selUser; }
    apiCall('veh', '/vehicles', p).then(r => { if (alive && r.success) setVehicles(r.data || []); }).finally(() => { if (alive) setLVeh(false); });
    return () => { alive = false; };
  }, [selAdmin, selDealer, selUser, apiCall, isSA, isAdmin, isDealer, isUser, userInfo]);

  const canSearch = () => {
    if (isUser)   return !!selVeh;
    if (isDealer) return !!selUser && !!selVeh;
    if (isAdmin)  return !!selDealer && !!selUser && !!selVeh;
    if (isSA)     return !!selAdmin && !!selDealer && !!selUser && !!selVeh;
    return false;
  };

  // ── FIX: cache-hit check before triggering a full re-fetch ──
  const handleSearch = () => {
    if (!canSearch()) return;

    const newKey = _store.getFetchKey(selVeh, globalDateRange);

    // Same vehicle + same date range + rows already in store → restore from cache
    if (_store.hasValidCache(selVeh, globalDateRange)) {
      setPacketRows(_store.packetRows);
      setKpiStats(_store.kpiStats);
      setPacketsFetched(true);
      setPacketsLoading(false);
      setError('');
      // Do NOT increment triggerFetch — children will NOT re-fetch
      return;
    }

    // New search — clear everything and fetch fresh
    setError('');
    setKpiStats(null);
    setPacketRows([]);
    setPacketsFetched(false);
    setPacketsLoading(true);
    _store.save({ packetRows: [], speedPts: null, kpiStats: null, packetsFetched: false, lastFetchKey: newKey });
    setTriggerFetch(n => n + 1);
  };

  const handleStatsUpdate = useCallback(stats => {
    setKpiStats(stats);
    // ── FIX: save kpiStats to store immediately when updated ──
    _store.save({ kpiStats: stats });
    if (stats?.isComplete) {
      setPacketsLoading(false);
      setPacketsFetched(true);
      _store.save({ packetsFetched: true, searched: true });
    }
  }, []);

  const handleRowsChange = useCallback(rows => {
    setPacketRows(rows);
    // ── FIX: save rows + mark searched in store immediately ──
    _store.save({ packetRows: rows, searched: true });
    if (rows.length > 0) setPacketsFetched(true);
  }, []);

  const searched = triggerFetch > 0 || _store.searched;

  // ── KPI computed values ──
  const kpiComputed = useMemo(() => {
    const totalDist     = packetRows.length > 0 ? safeNum(packetRows[packetRows.length - 1].cum, 0).toFixed(2) : '—';
    const totalPackets  = packetRows.length > 0 ? packetRows.length.toLocaleString() : '—';
    const maxSpdRaw     = packetRows.length > 0 ? packetRows.reduce((m, r) => Math.max(m, safeNum(r.s, 0)), 0) : null;
    const maxSpd        = maxSpdRaw !== null ? maxSpdRaw.toFixed(1) : '—';
    const isOverspeed   = maxSpdRaw !== null && maxSpdRaw > 60;
    let daysCovered = 0;
    if (globalDateRange?.start && globalDateRange?.end) {
      const sDay = new Date(Math.min(globalDateRange.start, globalDateRange.end));
      const eDay = new Date(Math.max(globalDateRange.start, globalDateRange.end));
      sDay.setHours(0,0,0,0); eDay.setHours(0,0,0,0);
      daysCovered = Math.max(1, Math.round((eDay - sDay) / 86400000) + 1);
    }
    const dataLoading = packetsLoading && packetRows.length === 0;
    return { totalDist, totalPackets, maxSpd, isOverspeed, daysCovered, dataLoading };
  }, [packetRows, packetsLoading, globalDateRange?.start?.getTime(), globalDateRange?.end?.getTime()]);

  return (
    <div className="dr-page">
      <style>{getCSS(THEME)}</style>

      {/* ── Top Bar ── */}
      <div className="topbar">
        <div className="tb-selectors">
          {isSA && (
            <div className="sel-group">
              <span className="sel-label">Admin</span>
              <CustomSelect value={selAdmin} onChange={v => { setSelAdmin(v); setSelDealer(''); setSelUser(''); setSelVeh(''); }} disabled={lAdmins} placeholder={lAdmins ? 'Loading...' : 'Select Admin'} THEME={THEME} options={admins.map(a => ({ value: a.rawValue, label: a.name }))} />
            </div>
          )}
          {(isSA || isAdmin) && (
            <div className="sel-group">
              <span className="sel-label">Dealer</span>
              <CustomSelect value={selDealer} onChange={v => { setSelDealer(v); setSelUser(''); setSelVeh(''); }} disabled={lDealers || (isSA && !selAdmin)} placeholder={lDealers ? 'Loading...' : 'Select Dealer'} THEME={THEME} options={dealers.map(d => ({ value: d.rawValue, label: d.name }))} />
            </div>
          )}
          {!isUser && (
            <div className="sel-group">
              <span className="sel-label">User</span>
              <CustomSelect value={selUser} onChange={v => { setSelUser(v); setSelVeh(''); }} disabled={lUsers || (isSA && (!selAdmin || !selDealer)) || (isAdmin && !selDealer)} placeholder={lUsers ? 'Loading...' : 'Select User'} THEME={THEME} options={users.map(u => ({ value: u.rawValue, label: u.name }))} />
            </div>
          )}
          <div className="sel-group">
            <span className="sel-label">Vehicle</span>
            <CustomSelect value={selVeh} onChange={v => setSelVeh(v)} disabled={lVeh || (!isUser && !selUser) || vehicles.length === 0} placeholder={lVeh ? 'Loading...' : 'Select Vehicle'} THEME={THEME} options={vehicles.map(v => ({ value: String(v._id), label: v.vehicleNumber }))} />
          </div>
        </div>
        <div className="tb-right">
          <GlobalDateTimePicker dateRange={globalDateRange} onChange={setGlobalDateRange} />
          <button className="search-btn" onClick={handleSearch} disabled={!canSearch()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Load Packets
          </button>
        </div>
      </div>

      {/* ── Page Body ── */}
      <div className="dr-body">
        {error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 'var(--r)', padding: '12px 18px', color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
            {error}
            <button onClick={handleSearch} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 6, border: '1.5px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Retry</button>
          </div>
        )}

        {/* ── KPI Row — always shown once searched, hydrated from store on return ── */}
        {(searched || packetRows.length > 0) && (
          <div style={{ padding: '10px 14px', background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 'var(--r)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div className="kpi-row">
              <KPIBox
                label="Total Distance"
                value={kpiComputed.totalDist}
                unit={kpiComputed.totalDist !== '—' ? ' km' : ''}
                colorClass="kpi-box-distance"
                loading={kpiComputed.dataLoading}
              />
              <KPIBox
                label="Total Data"
                value={kpiComputed.totalPackets}
                unit={kpiComputed.totalPackets !== '—' ? ' pkts' : ''}
                colorClass="kpi-box-packets"
                loading={kpiComputed.dataLoading}
              />
              <KPIBox
                label={kpiComputed.daysCovered === 1 ? 'Days' : `${kpiComputed.daysCovered} Days`}
                value={String(kpiComputed.daysCovered)}
                colorClass="kpi-box-days"
                loading={false}
              />
              <KPIBox
                label={kpiComputed.isOverspeed && packetsFetched ? '⚠ Maximum Speed' : 'Max Speed'}
                value={kpiComputed.maxSpd}
                unit={kpiComputed.maxSpd !== '—' ? ' km/h' : ''}
                colorClass="kpi-box-speed"
                loading={kpiComputed.dataLoading}
                highlight={kpiComputed.isOverspeed && packetsFetched}
              />
            </div>

            {packetsLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                <div style={{ width: 10, height: 10, border: `2px solid ${THEME}30`, borderTopColor: THEME, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: THEME }}>
                  {packetRows.length > 0 ? `${packetRows.length.toLocaleString()} loaded…` : 'Loading…'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Graph Card */}
        <SpeedTimelineCard
          vehicleId={selVeh}
          themeColor={THEME}
          apiBase={API_BASE}
          getTokenFn={getToken}
          dateRange={globalDateRange}
          triggerFetch={triggerFetch}
          cachedPts={_store.speedPts || null}
          onPtsCached={pts => _store.save({ speedPts: pts })}
          packetRows={packetRows}
          packetsFetched={packetsFetched}
          packetsLoading={packetsLoading}
        />

        {/* Packet Log */}
        <PacketLogCard
          vehicleId={selVeh}
          themeColor={THEME}
          apiBase={API_BASE}
          getTokenFn={getToken}
          dateRange={globalDateRange}
          triggerFetch={triggerFetch}
          cachedRows={_store.packetRows || []}
          onRowsCached={rows => _store.save({ packetRows: rows })}
          onStatsUpdate={handleStatsUpdate}
          onRowsChange={handleRowsChange}
          searched={searched}
        />
      </div>
    </div>
  );
}