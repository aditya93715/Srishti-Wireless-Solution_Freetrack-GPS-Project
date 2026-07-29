// ─────────────────────────────────────────────────────────────────────────────
// AdvanceDashboard.jsx  (Card list + full Map)
// Place at: frontend/src/dashboards/Admin/Home/AdvanceDashboard.jsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useTheme } from "../../../context/ThemeContext";

// ── Shared modules ────────────────────────────────────────────────────────────
import { API_BASE, POLL_MS, apiFetch, safeNum, formatLU }            from "./shared/apiHelpers.js";
import { warmClientCache, isRealAddress, useAddress }                 from "./shared/addressCache.js";
import { _vehicleStore, useVehicleStore, initSocket }                 from "./shared/vehicleStore.js";
import { pushRoutePoint, getRoute, routeCache, calcBearing, shortestAngle } from "./shared/routeCache.js";
import { STATE_COLOR, STATE_BG, getStateBg, getVehicleImage, getVehicleImageTopView } from "./shared/vehicleAssets.js";
import DashboardTopbar                                                from "./shared/DashboardTopbar.jsx";
import MapView                                                        from "./shared/MapView.jsx";
import {
  VehicleTypeIcon, BatteryIcon, GsmSignalIcon, GpsSatIcon,
  SpeedDisplay, TempIcon, HumidityIcon, SoCBar, AcFanIcon, Toggle,
} from "./shared/vehicleWidgets.jsx";

// ── Small icon helpers (only used in VehicleCard) ─────────────────────────────
const IconClock    = ({ size = 12, color = '#7c3aed' }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const IconLock     = ({ size = 12, locked = true })     => { const c = locked ? '#7c3aed' : '#16a34a'; return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" />{locked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1" />}</svg>; };
const IconLocation = ({ size = 12, color = '#dc2626' }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IconPower    = ({ size = 11, color = '#16a34a' }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;

// ── Route-map modal ───────────────────────────────────────────────────────────
const RouteMap = memo(({ vehicle, onClose, themeColor }) => {
  const mapRef = useRef(null), mapInstanceRef = useRef(null);
  const [ready, setReady] = useState(false), [err, setErr] = useState(null);
  const route = vehicle ? getRoute(vehicle.vehicle) : null;

  function makeVehicleMarkerHTML(state, selected, heading, type, themeColor) {
    const imgSrc = getVehicleImageTopView(type);
    const color  = STATE_COLOR[state] || themeColor;
    const sz     = selected ? 64 : 48;
    const normH  = ((heading % 360) + 360) % 360;
    return `<div style="position:relative;width:${sz}px;height:${sz}px;display:flex;align-items:center;justify-content:center;">
      <img src="${imgSrc}" width="${sz}" height="${sz}" class="fleet-marker-img"
        style="object-fit:contain;display:block;transform:rotate(${normH}deg);filter:drop-shadow(0 2px 5px rgba(0,0,0,0.38));"
        alt="${type}" onerror="this.style.display='none'"/>
    </div>`;
  }

  useEffect(() => {
    if (!vehicle || !route?.positions?.length) return;
    // Lazy-load Leaflet
    const loadLeaflet = () => {
      if (window.L) { setReady(true); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
      s.onload = () => setReady(true);
      s.onerror = () => setErr('Failed to load Leaflet');
      document.head.appendChild(s);
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(l);
    };
    loadLeaflet();
  }, [vehicle, route]);

  useEffect(() => {
    if (!ready || !mapRef.current || !route?.positions?.length) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    const L = window.L;
    const pathPts = (route.roadPath && route.roadPath.length > 1) ? route.roadPath : route.positions;
    const map = L.map(mapRef.current, { center: [pathPts[0].lat, pathPts[0].lng], zoom: 13 });
    mapInstanceRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    const latlngs = pathPts.map(p => [p.lat, p.lng]);
    L.polyline(latlngs, { color: themeColor, weight: 14, opacity: 0.12 }).addTo(map);
    L.polyline(latlngs, { color: themeColor, weight: 4.5, opacity: 0.90 }).addTo(map);
    L.polyline(latlngs, { color: '#fff', weight: 1.5, opacity: 0.5, dashArray: '8, 12' }).addTo(map);
    L.marker(latlngs[0], { icon: L.divIcon({ html: `<div style="width:30px;height:30px;background:#22c55e;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.25);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M3 12l9-9 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`, className: '', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map).bindPopup('<b>Trip Start</b>');
    const vType = vehicle.vehicleType || vehicle.type || 'car';
    L.marker(latlngs[latlngs.length - 1], { icon: L.divIcon({ html: makeVehicleMarkerHTML(vehicle.state, true, route.heading || 0, vType, themeColor), className: '', iconSize: [64, 64], iconAnchor: [32, 32] }), zIndexOffset: 1000 }).addTo(map).bindPopup(`<b>${vehicle.vehicle}</b>`);
    map.fitBounds(L.latLngBounds(latlngs), { padding: [44, 44] });
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [ready, route, vehicle, themeColor]);

  useEffect(() => () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } }, []);

  if (!vehicle || !route?.positions?.length) return null;
  const durationMin = Math.round((route.lastUpdate - route.startTime) / 60000);
  const vType = vehicle.vehicleType || vehicle.type || 'car';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ width: '88vw', maxWidth: 1100, height: '88vh', background: '#fff', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: themeColor, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <VehicleTypeIcon type={vType} state={vehicle.state} size={40} />
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Route — {vehicle.vehicle}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{vehicle.state?.toUpperCase()} · {vehicle.branch || '—'}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginLeft: 10, flexWrap: 'wrap' }}>
              {[['Distance', `${route.totalDistance.toFixed(2)} km`], ['Points', route.positions.length], ...(durationMin > 0 ? [['Duration', `${durationMin} min`]] : [])].map(([l, val]) => (
                <div key={l} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, opacity: 0.8, textTransform: 'uppercase' }}>{l}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.2 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 18, cursor: 'pointer', padding: '7px 14px', borderRadius: 8, fontWeight: 700 }}>✕</button>
        </div>
        {err ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}><div style={{ color: '#dc2626', fontWeight: 600 }}>Map Error: {err}</div></div> : <div ref={mapRef} style={{ flex: 1, minHeight: 0 }} />}
      </div>
    </div>
  );
});

// ── VehicleCard ───────────────────────────────────────────────────────────────
const VehicleCard = memo(({ v, selected, onClick, themeColor }) => {
  const col     = STATE_COLOR[v.state] || themeColor || '#6b7280';
  const stateBg = getStateBg(v.state);
  const spd     = safeNum(v.spd, 0), btr = safeNum(v.btr, 0);
  const ignOn   = v.state === 'running' || v.state === 'overspeed' || v.ignition;
  const vType   = v.vehicleType || v.type || 'car';
  const isMoving = v.state === 'running' || v.state === 'overspeed';
  const ac       = v.ac === true || v.ac === 1 || v.ac === '1' || v.ac === 'true' || v.ac === 'on';
  const hasAc    = v.ac !== undefined && v.ac !== null;
  const hasTemp  = v.temperature != null;
  const hasHumid = v.humidity != null;
  const ep       = safeNum(v.extPower, 0);
  const { display: addrDisplay, isCoord, loading: addrLoading } = useAddress(v.address, v.lat, v.lng);

  const Cell = ({ children, bg }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: bg || '#f8fafc', borderRadius: 4, padding: '5px 4px', flex: '1 1 0', minWidth: 0, gap: 2, border: '1px solid rgba(0,0,0,0.04)', boxSizing: 'border-box' }}>
      {children}
    </div>
  );

  return (
    <div onClick={onClick} style={{ background: selected ? `${themeColor}08` : '#fff', borderLeft: `4px solid ${selected ? themeColor : col}`, borderBottom: '1px solid #f0f2f5', borderRadius: 4, margin: '4px 6px', padding: '10px 10px 9px', cursor: 'pointer', transition: 'background 0.15s ease', position: 'relative', boxShadow: selected ? `0 2px 12px ${themeColor}18` : '0 1px 3px rgba(0,0,0,0.04)' }}>
      {selected && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${themeColor},${themeColor}20)`, borderRadius: '4px 4px 0 0' }} />}

      {/* Row 1 — icon + vehicle + state badges + ignition chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 46, height: 46, borderRadius: 4, background: stateBg, border: `1.5px solid ${col}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <VehicleTypeIcon type={vType} state={v.state} size={38} />
          </div>
          {isMoving && <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: col, border: '2px solid #fff', animation: 'liveRing 1.5s ease-in-out infinite' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130, marginBottom: 5 }}>{v.vehicle}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'capitalize', color: '#fff', background: '#334155', padding: '2px 7px', borderRadius: 3, letterSpacing: '0.03em', flexShrink: 0 }}>{vType}</span>
            <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: '#fff', background: col, padding: '2px 7px', borderRadius: 3, letterSpacing: '0.03em', flexShrink: 0 }}>{v.state}</span>
            {v.branch && <span style={{ fontSize: 8, fontWeight: 600, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 7px', borderRadius: 3, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{v.branch}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px', borderRadius: 3, background: ignOn ? '#dcfce7' : '#fee2e2', border: `1px solid ${ignOn ? '#86efac' : '#fca5a5'}`, flexShrink: 0 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: ignOn ? '#16a34a' : '#dc2626', boxShadow: ignOn ? '0 0 4px #16a34a80' : 'none' }} />
          <span style={{ fontSize: 8, fontWeight: 800, color: ignOn ? '#15803d' : '#991b1b' }}>{ignOn ? 'IGN ON' : 'IGN OFF'}</span>
        </div>
      </div>

      {/* Row 2 — sensor cells */}
      <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
          <Cell bg="rgba(22,163,74,0.07)"><SpeedDisplay speed={spd} /></Cell>
          <Cell bg="rgba(8,145,178,0.07)"><GsmSignalIcon raw={safeNum(v.gsmRaw || v.gsm, 0)} /></Cell>
          <Cell bg="rgba(245,158,11,0.07)"><BatteryIcon pct={btr} /></Cell>
          <Cell bg={ignOn ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ignOn ? '#16a34a' : '#dc2626'} strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="4" /><path d="M12 8h8M17 6v4M20 6v4" /></svg>
            <span style={{ fontSize: 7.5, fontWeight: 800, color: ignOn ? '#16a34a' : '#dc2626', fontFamily: 'monospace' }}>{ignOn ? 'ON' : 'OFF'}</span>
          </Cell>
          <Cell bg="rgba(124,58,237,0.07)"><GpsSatIcon satellites={safeNum(v.gpsSatellites ?? v.satellites, 0)} fixType={v.fixType || 'No Fix'} /></Cell>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <Cell bg={hasAc ? (ac ? 'rgba(8,145,178,0.07)' : 'rgba(148,163,184,0.07)') : '#f8fafc'}>
            <AcFanIcon on={hasAc ? ac : false} />
            <span style={{ fontSize: 7.5, fontWeight: 800, color: hasAc ? (ac ? '#0891b2' : '#94a3b8') : '#d1d5db', fontFamily: 'monospace' }}>{hasAc ? (ac ? 'ON' : 'OFF') : '--'}</span>
          </Cell>
          <Cell bg={hasTemp ? (Number(v.temperature) > 35 ? 'rgba(220,38,38,0.07)' : 'rgba(8,145,178,0.07)') : '#f8fafc'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={hasTemp ? (Number(v.temperature) > 35 ? '#dc2626' : '#0891b2') : '#d1d5db'} strokeWidth="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
            <span style={{ fontSize: 7.5, fontWeight: 800, fontFamily: 'monospace', color: hasTemp ? (Number(v.temperature) > 35 ? '#dc2626' : '#0891b2') : '#d1d5db' }}>{hasTemp ? `${v.temperature}°C` : '--'}</span>
          </Cell>
          <Cell bg={hasHumid ? 'rgba(8,145,178,0.07)' : '#f8fafc'}>
            <svg width="11" height="14" viewBox="0 0 18 22" fill="none"><path d="M9 1.5 Q15 8 15 14 A6 6 0 0 1 3 14 Q3 8 9 1.5Z" fill={hasHumid ? '#0891b2' : '#d1d5db'} opacity="0.85" /></svg>
            <span style={{ fontSize: 7.5, fontWeight: 800, color: hasHumid ? '#0891b2' : '#d1d5db', fontFamily: 'monospace' }}>{hasHumid ? `${v.humidity}%` : '--'}</span>
          </Cell>
          <Cell bg={v.locked ? 'rgba(124,58,237,0.07)' : 'rgba(22,163,74,0.07)'}>
            <IconLock size={13} locked={v.locked} />
            <span style={{ fontSize: 7.5, fontWeight: 800, color: v.locked ? '#7c3aed' : '#16a34a' }}>{v.locked ? 'Locked' : 'Open'}</span>
          </Cell>
          <Cell bg={ep > 0 ? (ep > 12 ? 'rgba(22,163,74,0.07)' : 'rgba(202,138,4,0.07)') : '#f8fafc'}>
            <IconPower size={13} color={ep > 0 ? (ep > 12 ? '#16a34a' : '#ca8a04') : '#d1d5db'} />
            <span style={{ fontSize: 7.5, fontWeight: 800, fontFamily: 'monospace', color: ep > 0 ? (ep > 12 ? '#16a34a' : '#ca8a04') : '#d1d5db' }}>{ep > 0 ? `${ep.toFixed(1)}V` : '--'}</span>
          </Cell>
        </div>
      </div>

      {/* Row 3 — last update */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
        <IconClock size={10} color="#7c3aed" />
        <span style={{ fontSize: 9, color: '#374151', fontWeight: 600, fontFamily: 'monospace' }}>{formatLU(v.lu)}</span>
      </div>

      {/* Row 4 — driver + POI */}
      {((v.driver && v.driver !== '--') || v.poi) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
          {v.driver && v.driver !== '--' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: themeColor + '20', border: `1.5px solid ${themeColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 8, fontWeight: 800, color: themeColor }}>{v.driver.charAt(0).toUpperCase()}</span>
              </div>
              <span style={{ fontSize: 10, color: '#374151', fontWeight: 600, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.driver}</span>
            </div>
          )}
        </div>
      )}

      {/* Row 5 — address */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <IconLocation size={11} color="#dc2626" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 7.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Address</div>
          {addrLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, border: '2px solid #e2e8f0', borderTopColor: themeColor, borderRadius: '50%', animation: 'spin .8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Resolving…</span>
            </div>
          ) : (
            <div style={{ fontSize: 10, lineHeight: 1.45, color: isCoord ? '#94a3b8' : '#374151', fontStyle: isCoord ? 'italic' : 'normal' }}>
              {addrDisplay.length > 140 ? addrDisplay.substring(0, 140) + '…' : addrDisplay}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.selected === next.selected && prev.v.state === next.v.state && prev.v.spd === next.v.spd &&
  prev.v.lu === next.v.lu && prev.v.lat === next.v.lat && prev.v.lng === next.v.lng &&
  prev.v.address === next.v.address && prev.v.driver === next.v.driver && prev.v.btr === next.v.btr &&
  prev.v.gsmRaw === next.v.gsmRaw && prev.v.ac === next.v.ac && prev.v.locked === next.v.locked &&
  prev.v.ignition === next.v.ignition && prev.v.temperature === next.v.temperature &&
  prev.v.humidity === next.v.humidity && prev.v.extPower === next.v.extPower && prev.themeColor === next.themeColor
);

// ── Main AdvanceDashboard ─────────────────────────────────────────────────────
export default function AdvanceDashboard() {
  const theme       = useTheme();
  const activeColor = theme?.activeColor || '#4c1d95';

  const { vehicles: allVehicles, stats, hasData } = useVehicleStore();

  const [search,          setSearch]          = useState('');
  const [stateFilter,     setStateFilter]     = useState('all');
  const [selected,        setSelected]        = useState(null);
  const [initialLoading,  setInitialLoading]  = useState(!_vehicleStore.hasData);
  const [criticalError,   setCriticalError]   = useState(null);
  const [showRouteFor,    setShowRoute]        = useState(null);
  const [sidebarOpen,     setSidebarOpen]     = useState(true);
  const [syncVersion,     setSyncVersion]     = useState(0);
  const [popupVehicle,    setPopupVehicle]    = useState(null);

  const socketLiveRef   = useRef(false);
  const failCountRef    = useRef(0);
  const vehiclesRef     = useRef([]);
  const filteredKeysRef = useRef(new Set());
  const popupTimerRef   = useRef(null);
  const SIDEBAR_W       = 390;

  // ── Theme CSS var ────────────────────────────────────────────────────────────
  useEffect(() => { document.documentElement.style.setProperty('--theme-color', activeColor); }, [activeColor]);
  useEffect(() => { if (hasData && initialLoading) setInitialLoading(false); }, [hasData, initialLoading]);

  // ── Popup helpers ────────────────────────────────────────────────────────────
  const showMapPopup = useCallback(v => {
    setPopupVehicle(v);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => setPopupVehicle(null), 5000);
  }, []);
  const closeMapPopup = useCallback(() => {
    setPopupVehicle(null);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
  }, []);
  // Keep popup data fresh
  useEffect(() => {
    if (!popupVehicle) return;
    const u = allVehicles.find(v => v.vehicle === popupVehicle.vehicle);
    if (u && u !== popupVehicle) setPopupVehicle(u);
  }, [allVehicles]); // eslint-disable-line
  useEffect(() => () => { if (popupTimerRef.current) clearTimeout(popupTimerRef.current); }, []);

  // ── Filtered vehicles for card list ─────────────────────────────────────────
  const filteredVehicles = useMemo(() => {
    let list = allVehicles;
    if (stateFilter !== 'all') list = list.filter(v => v.state === stateFilter);
    if (search.trim()) { const q = search.trim().toLowerCase(); list = list.filter(v => v.vehicle?.toLowerCase().includes(q) || v.driver?.toLowerCase().includes(q) || v.branch?.toLowerCase().includes(q) || v.imei?.toLowerCase().includes(q)); }
    return list;
  }, [allVehicles, stateFilter, search]);

  // Keep map refs in sync
  useEffect(() => {
    const mapVehicles = allVehicles.filter(v => v.lat && v.lng);
    vehiclesRef.current = mapVehicles;
    const keys = new Set();
    mapVehicles.forEach(v => {
      let ok = true;
      if (stateFilter !== 'all' && v.state !== stateFilter) ok = false;
      if (ok && search.trim()) { const q = search.trim().toLowerCase(); if (!v.vehicle?.toLowerCase().includes(q) && !v.driver?.toLowerCase()?.includes(q)) ok = false; }
      if (ok) keys.add(v.vehicle);
    });
    filteredKeysRef.current = keys;
    setSyncVersion(n => n + 1);
  }, [allVehicles, stateFilter, search]);

  // ── Fetch all vehicles ───────────────────────────────────────────────────────
  const fetchAll = useCallback(async (isFirst = false) => {
    // Guard: agar pehle se data hai aur socket live hai toh skip karo
    if (!isFirst && _vehicleStore.initialFetchDone && socketLiveRef.current) return;

    const { ok, data, timedOut, unauthorized } = await apiFetch(`${API_BASE}/dashboard/vehicles`);
    if (unauthorized) { setCriticalError('Session expired. Please login again.'); setInitialLoading(false); return; }
    if (timedOut || (!ok && !data)) { failCountRef.current++; if (failCountRef.current >= 99) setCriticalError('Server unreachable.'); if (isFirst) setInitialLoading(false); return; }
    if (ok && data?.success) {
      failCountRef.current = 0; setCriticalError(null);
      _vehicleStore.initialFetchDone = true;        // ✅ hai?
      _vehicleStore.replaceAll(data.data || []);
      if (data.stats) {
        _vehicleStore.setStats(data.stats);         // ✅ backend stats trusted
      } else {
        _vehicleStore.recalcStats();
      }
    }
    if (isFirst) setInitialLoading(false);
  }, []);

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (_vehicleStore.hasData) {
      // Data already hai — seedha dikhao, fetch mat karo
      setInitialLoading(false);
      const seed = _vehicleStore.vehicles.filter(v => v.lat && v.lng);
      vehiclesRef.current     = seed;
      filteredKeysRef.current = new Set(seed.map(v => v.vehicle));
      setSyncVersion(n => n + 1);
      return; // ✅ early return — no fetch
    }
    // Sirf pehli baar fetch
    const t = setTimeout(() => fetchAll(true), 800);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  // ── Polling fallback ─────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => { if (!socketLiveRef.current) fetchAll(false); }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  // ── Socket ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = initSocket({
      onConnect:    ()     => { socketLiveRef.current = true;  failCountRef.current = 0; setCriticalError(null); },
      onDisconnect: reason => { socketLiveRef.current = false; if (reason !== 'io client disconnect') setTimeout(() => fetchAll(false), 500); },
      onLive: data => {
        failCountRef.current = 0; setCriticalError(null);
        // Keep selected card data fresh
        setSelected(prev => {
          if (!prev) return prev;
          const live = data.find(v => v.vehicle === prev.vehicle); if (!live) return prev;
          const addr = isRealAddress(live.address) ? live.address : (isRealAddress(prev.address) ? prev.address : live.address);
          return { ...prev, ...live, address: addr };
        });
        setPopupVehicle(prev => {
          if (!prev) return prev;
          const live = data.find(v => v.vehicle === prev.vehicle); if (!live) return prev;
          const addr = isRealAddress(live.address) ? live.address : (isRealAddress(prev.address) ? prev.address : live.address);
          return { ...prev, ...live, address: addr };
        });
      },
    });
    return cleanup;
  }, [fetchAll]); // eslint-disable-line

  // ── Card / marker click ──────────────────────────────────────────────────────
  const handleCardClick = useCallback(v => {
    setSelected(prev => prev?.vehicle === v.vehicle ? null : v);
    showMapPopup(v);
  }, [showMapPopup]);

  const handleMarkerClick = useCallback(v => {
    setSelected(prev => prev?.vehicle === v.vehicle ? null : v);
    showMapPopup(v);
  }, [showMapPopup]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Segoe UI',system-ui,sans-serif", background: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        :root { --theme-color: ${activeColor}; }
        @keyframes spin        { to { transform: rotate(360deg); } }
        @keyframes pulse       { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes liveRing    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.5)} }
        @keyframes acSpin      { to { transform: rotate(360deg); } }
        @keyframes markerPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.55;transform:scale(1.12)} }
        @keyframes dotPulse    { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.4);opacity:1} }
        @keyframes skeletonPulse { 0%,100%{background:#f1f5f9} 50%{background:#e2e8f0} }
        .fleet-marker       { background:transparent!important;border:none!important; }
        .fleet-cluster-icon { background:transparent!important;border:none!important; }
        .fleet-popup .leaflet-popup-content-wrapper { padding:0!important;border-radius:4px!important;overflow:hidden!important; }
        .fleet-popup .leaflet-popup-content         { margin:0!important;width:auto!important; }
        .fleet-popup .leaflet-popup-tip-container   { display:none!important; }
        .leaflet-container  { font-family:'Segoe UI',sans-serif;background:#f1f5f9!important; }
        .leaflet-control-zoom { border:1px solid #e2e8f0!important;border-radius:6px!important;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08)!important; }
        .leaflet-control-zoom a { background:#fff!important;color:#374151!important;line-height:30px!important; }
        .leaflet-control-zoom a:hover { background:#f8fafc!important;color:var(--theme-color)!important; }
        .leaflet-control-attribution { background:rgba(255,255,255,0.88)!important;color:#94a3b8!important;font-size:9px!important; }
        .stat-btn:hover { transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.10)!important; }
        .stat-btn { transition:all 0.15s ease; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#d1d5db;border-radius:4px; }
      `}</style>

      {/* ── Top bar (shared component) — sidebar toggle enabled ──────────────── */}
      <DashboardTopbar
        search={search}         onSearchChange={setSearch}
        stats={stats}           activeFilter={stateFilter}   onFilterChange={setStateFilter}
        activeColor={activeColor}
        showSidebarToggle={true} sidebarOpen={sidebarOpen}  onSidebarToggle={() => setSidebarOpen(o => !o)}
      />

      {criticalError && (
        <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#991b1b', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <span style={{ flex: 1 }}>{criticalError}</span>
          <button onClick={() => { setCriticalError(null); failCountRef.current = 0; fetchAll(true); }} style={{ padding: '3px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Retry</button>
          <button onClick={() => setCriticalError(null)} style={{ padding: '3px 8px', background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {/* Full-screen loading overlay */}
        {initialLoading && !_vehicleStore.hasData && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(241,245,249,0.96)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18, zIndex: 50, backdropFilter: 'blur(4px)' }}>
            <div style={{ width: 52, height: 52, border: '4px solid #e5e7eb', borderTop: `4px solid ${activeColor}`, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
            <div style={{ color: '#374151', fontSize: 16, fontWeight: 700 }}>Loading Fleet Dashboard…</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>Connecting to server</div>
          </div>
        )}

        {/* ── Sidebar — card list ───────────────────────────────────────────────── */}
        <div style={{ width: sidebarOpen ? SIDEBAR_W : 0, minWidth: sidebarOpen ? SIDEBAR_W : 0, flexShrink: 0, overflow: 'hidden', display: 'flex', position: 'relative', transition: 'width 0.28s cubic-bezier(0.4,0,0.2,1), min-width 0.28s cubic-bezier(0.4,0,0.2,1)', zIndex: 10 }}>
          <div style={{ width: SIDEBAR_W, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', background: '#f5f6fa', borderRight: '1px solid #e5e7eb', overflowX: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              {(initialLoading || (!hasData && filteredVehicles.length === 0)) ? (
                <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <div style={{ position: 'relative', width: 64, height: 64 }}>
                    <div style={{ position: 'absolute', inset: 0, border: `3px solid ${activeColor}20`, borderTop: `3px solid ${activeColor}`, borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
                    <div style={{ position: 'absolute', inset: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 5v3h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Fetching vehicles...</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Please wait while data loads...</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {[0, 1, 2, 3, 4].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === 2 ? activeColor : `${activeColor}50`, animation: `dotPulse 1.2s ease-in-out ${i * 0.15}s infinite` }} />)}
                  </div>
                  {/* Skeleton cards */}
                  <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[1, 2, 3].map(i => (
                      <div key={i} style={{ background: '#fff', borderRadius: 4, padding: '12px 10px', borderLeft: `4px solid ${activeColor}20`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', opacity: i === 1 ? 1 : i === 2 ? 0.6 : 0.3 }}>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                          <div style={{ width: 46, height: 46, borderRadius: 4, background: '#f1f5f9', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, justifyContent: 'center' }}>
                            <div style={{ height: 12, width: '60%', borderRadius: 3, background: '#f1f5f9', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
                            <div style={{ height: 9,  width: '40%', borderRadius: 3, background: '#f1f5f9', animation: 'skeletonPulse 1.5s ease-in-out 0.2s infinite' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[1, 2, 3, 4, 5].map(j => <div key={j} style={{ flex: 1, height: 36, borderRadius: 4, background: '#f8fafc', border: '1px solid #f1f5f9', animation: `skeletonPulse 1.5s ease-in-out ${j * 0.1}s infinite` }} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : filteredVehicles.length === 0 ? (
                <div style={{ padding: 50, textAlign: 'center', color: '#9ca3af', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <div style={{ fontWeight: 600 }}>No vehicles match</div>
                  <div style={{ fontSize: 11 }}>Try adjusting your search or filter</div>
                </div>
              ) : filteredVehicles.map(v => (
                <VehicleCard key={v.vehicle} v={v} selected={selected?.vehicle === v.vehicle} onClick={() => handleCardClick(v)} themeColor={activeColor} />
              ))}
            </div>
          </div>
        </div>

        {/* Expand tab when sidebar collapsed */}
        {!sidebarOpen && (
          <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 20 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: '#fff', border: `1.5px solid ${activeColor}40`, borderLeft: 'none', borderRadius: '0 8px 8px 0', padding: '14px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxShadow: '3px 0 14px rgba(0,0,0,0.10)', color: activeColor }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#374151', letterSpacing: '0.06em', writingMode: 'vertical-rl', textOrientation: 'mixed' }}>VEHICLES</span>
              {filteredVehicles.length > 0 && <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', background: activeColor, borderRadius: 10, padding: '2px 6px', minWidth: 20, textAlign: 'center' }}>{filteredVehicles.length}</span>}
            </button>
          </div>
        )}

        {/* ── Map (shared MapView) ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
          <MapView
            vehiclesRef={vehiclesRef}
            filteredKeysRef={filteredKeysRef}
            selectedVehicle={selected}
            onMarkerClick={handleMarkerClick}
            themeColor={activeColor}
            syncVersion={syncVersion}
            popupVehicle={popupVehicle}
            onPopupClose={closeMapPopup}
          />
        </div>
      </div>

      {/* Route map modal */}
      {showRouteFor && <RouteMap vehicle={showRouteFor} onClose={() => setShowRoute(null)} themeColor={activeColor} />}
    </div>
  );
}