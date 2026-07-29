// ─────────────────────────────────────────────────────────────────────────────
// MapView.jsx
// Shared Leaflet map component used by both Dashboard.jsx and AdvanceDashboard.jsx
// Place at: frontend/src/dashboards/Admin/Home/shared/MapView.jsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { MAP_TILES, STATE_COLOR, getVehicleImage, getStateFilter, getVehicleImageTopView } from './vehicleAssets.js';
import { getAddrCached, geocodeLatLng, isRealAddress, useAddress }                         from './addressCache.js';
import { routeCache, pushRoutePoint, getRoute, calcBearing, shortestAngle, TRAIL_MAX, NON_MOVING_STATES } from './routeCache.js';
import { safeNum, formatLU }                                                                from './apiHelpers.js';
import { VehicleTypeIcon, BatteryIcon, GsmSignalIcon, GpsSatIcon, SpeedDisplay }           from './vehicleWidgets.jsx';

// ── Map marker HTML (top-view) ────────────────────────────────────────────────
function makeVehicleMarkerHTML(state, selected = false, heading = 0, type = 'car', themeColor = '#4c1d95') {
  const imgSrc = getVehicleImageTopView(type);
  const color  = STATE_COLOR[state] || themeColor;
  const sz     = selected ? 64 : 48;
  const normH  = ((heading % 360) + 360) % 360;
  const selIndicator = selected
    ? `<div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 10px ${color};animation:markerPulse 1.4s ease-in-out infinite;z-index:1;"></div>`
    : '';
  return `<div style="position:relative;width:${sz}px;height:${sz}px;display:flex;align-items:center;justify-content:center;">
    ${selIndicator}
    <img src="${imgSrc}" width="${sz}" height="${sz}"
      class="fleet-marker-img"
      style="object-fit:contain;display:block;transform:rotate(${normH}deg);transition:transform 0.4s ease;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.38));"
      alt="${type}" onerror="this.style.display='none'"/>
  </div>`;
}

// ── Leaflet lazy-loader ───────────────────────────────────────────────────────
let _leafletPromise = null;
function loadLeaflet() {
  if (_leafletPromise) return _leafletPromise;
  _leafletPromise = new Promise((resolve, reject) => {
    if (window.L && window.L.MarkerClusterGroup) { resolve(window.L); return; }
    const addPreconnect = origin => {
      if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
        const lk = document.createElement('link'); lk.rel = 'preconnect'; lk.href = origin; lk.crossOrigin = ''; document.head.appendChild(lk);
      }
    };
    addPreconnect('https://cdn.jsdelivr.net');
    addPreconnect('https://tile.openstreetmap.org');
    const addCSS = (id, href) => { if (!document.getElementById(id)) { const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); } };
    addCSS('leaflet-css',    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css');
    addCSS('mc-css',         'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css');
    addCSS('mc-default-css', 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css');
    const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error(`Failed: ${src}`)); document.head.appendChild(s); });
    (async () => {
      try {
        if (!window.L) await loadScript('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js');
        if (window.L) { delete window.L.Icon.Default.prototype._getIconUrl; window.L.Icon.Default.mergeOptions({ iconRetinaUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png', iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png' }); }
        if (!window.L.MarkerClusterGroup) await loadScript('https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js');
        if (window.L && window.L.MarkerClusterGroup) resolve(window.L);
        else { _leafletPromise = null; reject(new Error('Leaflet load failed')); }
      } catch (e) { _leafletPromise = null; reject(e); }
    })();
  });
  return _leafletPromise;
}

// ── Leaflet popup HTML builder ────────────────────────────────────────────────
function buildPopupHTML(v, resolvedAddress, themeColor = '#4a2c8f') {
  const ignOn    = v.state === 'running' || v.state === 'overspeed' || v.ignition;
  const ignColor = ignOn ? '#16a34a' : '#dc2626';
  const spd      = Number(v.spd) || 0;
  const col      = STATE_COLOR[v.state] || '#64748b';
  const route    = getRoute(v.vehicle);
  const tripDist = route?.totalDistance?.toFixed(1) || 0;
  const address  = resolvedAddress || (isRealAddress(v.address) ? v.address : null) || (v.lat && v.lng ? `${Number(v.lat).toFixed(6)}, ${Number(v.lng).toFixed(6)}` : '--');
  const mapsUrl  = v.lat && v.lng ? `https://www.google.com/maps?q=${v.lat},${v.lng}` : '#';
  const sats     = Number(v.gpsSatellites ?? v.satellites ?? 0);
  const vType    = v.vehicleType || v.type || 'car';
  const imgSrc   = getVehicleImage(vType);
  const sf       = getStateFilter(v.state);
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;width:300px;background:#fff;border-radius:4px;overflow:hidden;color:#1e293b;box-shadow:0 4px 24px rgba(0,0,0,0.12);">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:${themeColor};color:#fff;">
      <div style="display:flex;align-items:center;gap:8px;">
        <img src="${imgSrc}" width="22" height="22" style="object-fit:contain;filter:${sf};flex-shrink:0;" alt="${vType}"/>
        <div>
          <div style="font-weight:700;font-size:14px;">${v.vehicle || '--'}</div>
          ${v.branch ? `<div style="font-size:10px;opacity:0.8;">${v.branch}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:5px;">
        <span style="padding:2px 8px;background:${col};border-radius:3px;font-size:10px;font-weight:700;text-transform:capitalize;">${v.state || '--'}</span>
        <a href="${mapsUrl}" target="_blank" style="color:#fff;font-size:10px;border:1.5px solid rgba(255,255,255,0.6);padding:2px 7px;border-radius:3px;text-decoration:none;font-weight:600;">Maps</a>
      </div>
    </div>
    <div style="padding:12px 14px;">
      <div style="padding:8px;background:#f8fafc;border-radius:3px;margin-bottom:8px;font-size:11px;color:#475569;line-height:1.5;">${String(address).substring(0, 120)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#f8fafc;padding:8px;border-radius:3px;"><div style="font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Speed</div><div style="font-size:18px;font-weight:800;color:${spd > 80 ? '#dc2626' : '#1e293b'};">${spd.toFixed(1)}<span style="font-size:10px;color:#94a3b8;"> km/h</span></div></div>
        <div style="background:#f8fafc;padding:8px;border-radius:3px;"><div style="font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Ignition</div><div style="display:flex;align-items:center;gap:5px;margin-top:4px;"><div style="width:9px;height:9px;border-radius:50%;background:${ignColor};"></div><span style="font-size:12px;font-weight:700;color:${ignColor};">${ignOn ? 'ON' : 'OFF'}</span></div></div>
        <div><div style="font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Battery</div><div style="font-size:12px;font-weight:700;">${v.btr ?? 0}%</div></div>
        <div><div style="font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase;">GPS Sats</div><div style="font-size:12px;font-weight:700;">${sats} (${v.fixType || '--'})</div></div>
      </div>
      ${tripDist > 0 ? `<div style="margin-top:8px;padding:6px 8px;background:#f0fdf4;border-radius:3px;border:1px solid #bbf7d0;font-size:11px;color:#15803d;">Trip: <b>${tripDist} km</b></div>` : ''}
    </div>
  </div>`;
}

// ── Layer switcher button ─────────────────────────────────────────────────────
const MapLayerSwitcher = ({ mapStyle, onSwitch, themeColor }) => {
  const [open, setOpen] = useState(false);
  const layers = [
    { key: 'street', label: 'Street',    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg> },
    { key: 'dark',   label: 'Dark',      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg> },
    { key: 'sat',    label: 'Satellite', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49" /><path d="M7.76 16.24a6 6 0 0 1 0-8.49" /><path d="M20.49 3.51a12 12 0 0 1 0 16.97" /><path d="M3.51 20.49a12 12 0 0 1 0-16.97" /></svg> },
  ];
  return (
    <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: 36, height: 36, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, color: open ? (themeColor || 'var(--theme-color)') : '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 42, right: 0, background: '#fff', border: '1px solid #e8eaed', borderRadius: 4, overflow: 'hidden', boxShadow: '0 6px 24px rgba(0,0,0,0.14)', minWidth: 140 }}>
          {layers.map((layer, idx) => (
            <button key={layer.key} onClick={() => { onSwitch(layer.key); setOpen(false); }}
              style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, border: 'none', borderBottom: idx < layers.length - 1 ? '1px solid #f0f2f5' : 'none', background: mapStyle === layer.key ? (themeColor || 'var(--theme-color)') : '#fff', color: mapStyle === layer.key ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12, fontWeight: mapStyle === layer.key ? 700 : 500, textAlign: 'left' }}>
              <span style={{ color: mapStyle === layer.key ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{layer.icon}</span>
              {layer.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── MapPopupCard — floating React card above vehicle ──────────────────────────
export const MapPopupCard = memo(({ v, themeColor, onClose }) => {
  const col = STATE_COLOR[v.state] || themeColor || '#6b7280';
  const [visible, setVisible] = useState(false);
  const spd   = safeNum(v.spd, 0), btr = safeNum(v.btr, 0);
  const ignOn = v.state === 'running' || v.state === 'overspeed' || v.ignition;
  const vType = v.vehicleType || v.type || 'car';
  const sats  = Number(v.gpsSatellites ?? v.satellites ?? 0);
  const route    = getRoute(v.vehicle);
  const tripDist = route?.totalDistance?.toFixed(2) || '0.00';
  const { display: addrDisplay, isCoord, loading: addrLoading } = useAddress(v.address, v.lat, v.lng);

  useEffect(() => { const t = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(t); }, []);

  return (
    <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.96)', transition: 'opacity 0.22s ease, transform 0.22s ease', width: 320, background: '#fff', borderRadius: 10, boxShadow: '0 20px 56px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.10)', overflow: 'hidden', border: `1.5px solid ${col}30`, position: 'relative' }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${col}, ${col}40)` }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 4px', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
          {(v.state === 'running' || v.state === 'overspeed') && <div style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0, boxShadow: `0 0 6px ${col}`, animation: 'liveRing 1.5s ease-in-out infinite' }} />}
          <VehicleTypeIcon type={vType} state={v.state} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{v.vehicle}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <span style={{ fontSize: 7.5, fontWeight: 800, textTransform: 'capitalize', color: '#fff', background: '#334155', padding: '1px 5px', borderRadius: 3 }}>{vType}</span>
              <span style={{ fontSize: 7.5, fontWeight: 800, textTransform: 'uppercase', color: '#fff', background: col, padding: '1px 5px', borderRadius: 3 }}>{v.state}</span>
              {parseFloat(tripDist) > 0 && <span style={{ fontSize: 7.5, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '1px 5px', borderRadius: 3, border: '1px solid #c4b5fd' }}>Trip: {tripDist} km</span>}
            </div>
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ width: 22, height: 22, borderRadius: '50%', background: '#f1f5f9', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#64748b', fontSize: 11, fontWeight: 700 }}>✕</button>
      </div>
      {/* Sensor row */}
      <div style={{ display: 'flex', gap: 3, padding: '8px 10px 6px', borderBottom: '1px solid #f1f5f9' }}>
        {[
          { bg: 'rgba(22,163,74,0.06)',    child: <SpeedDisplay speed={spd} /> },
          { bg: 'rgba(8,145,178,0.06)',    child: <GsmSignalIcon raw={safeNum(v.gsmRaw ?? v.gsm, 0)} /> },
          { bg: 'rgba(245,158,11,0.06)',   child: <BatteryIcon pct={btr} /> },
          { bg: 'rgba(124,58,237,0.06)',   child: <GpsSatIcon satellites={sats} fixType={v.fixType || 'No Fix'} /> },
          { bg: ignOn ? 'rgba(22,163,74,0.06)' : 'rgba(220,38,38,0.06)', child: (<><div style={{ width: 8, height: 8, borderRadius: '50%', background: ignOn ? '#16a34a' : '#dc2626', boxShadow: ignOn ? '0 0 5px #16a34a80' : 'none', marginBottom: 3 }} /><span style={{ fontSize: 7.5, fontWeight: 800, color: ignOn ? '#16a34a' : '#dc2626', fontFamily: 'monospace' }}>{ignOn ? 'ON' : 'OFF'}</span></>) },
        ].map((cell, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: cell.bg, borderRadius: 5, padding: '5px 3px', border: '1px solid rgba(0,0,0,0.03)' }}>{cell.child}</div>
        ))}
      </div>
      {/* Time + address */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px 4px' }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        <span style={{ fontSize: 9, color: '#374151', fontWeight: 600, fontFamily: 'monospace' }}>{formatLU(v.lu)}</span>
        {v.branch && <><span style={{ color: '#e2e8f0', fontSize: 9 }}>·</span><span style={{ fontSize: 9, color: '#64748b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{v.branch}</span></>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '0 10px 10px' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 7.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Address</div>
          {addrLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, border: '2px solid #e2e8f0', borderTopColor: themeColor, borderRadius: '50%', animation: 'spin .8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Resolving…</span>
            </div>
          ) : (
            <div style={{ fontSize: 10, lineHeight: 1.4, color: isCoord ? '#94a3b8' : '#374151', fontStyle: isCoord ? 'italic' : 'normal' }}>
              {addrDisplay.length > 130 ? addrDisplay.substring(0, 130) + '…' : addrDisplay}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Main MapView component ────────────────────────────────────────────────────
/**
 * Props
 * ─────
 * vehiclesRef       React ref   ref to vehicles array (avoids re-renders)
 * filteredKeysRef   React ref   ref to Set of visible vehicle numbers
 * selectedVehicle   object|null currently selected vehicle
 * onMarkerClick     fn(v)       called when a marker is clicked
 * themeColor        string      hex accent colour
 * syncVersion       number      increment to trigger marker sync
 * popupVehicle      object|null vehicle to show in floating popup
 * onPopupClose      fn()        called when popup close button clicked
 */
const MapView = ({
  vehiclesRef,
  filteredKeysRef,
  selectedVehicle,
  onMarkerClick,
  themeColor,
  syncVersion,
  popupVehicle,
  onPopupClose,
}) => {
  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const markersRef      = useRef({});
  const clusterGroupRef = useRef(null);
  const rafLoopRef      = useRef(null);
  const selectedRef     = useRef(selectedVehicle);
  const tileLayerRef    = useRef(null);
  const smoothRef       = useRef({});
  const syncRouteRef    = useRef(null);
  const themeColorRef   = useRef(themeColor);
  const popupVehicleRef = useRef(popupVehicle);

  const [popupScreenPos, setPopupScreenPos] = useState(null);
  const [mapReady,  setMapReady]  = useState(false);
  const [mapError,  setMapError]  = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const [mapStyle,  setMapStyle]  = useState('street');

  const isMapReady = useCallback(() => !!(mapRef.current && clusterGroupRef.current && window.L && mapReady), [mapReady]);

  useEffect(() => { selectedRef.current     = selectedVehicle;  }, [selectedVehicle]);
  useEffect(() => { themeColorRef.current   = themeColor;       }, [themeColor]);
  useEffect(() => {
    popupVehicleRef.current = popupVehicle;
    if (!popupVehicle) setPopupScreenPos(null);
  }, [popupVehicle]);

  useEffect(() => { loadLeaflet().then(() => setMapReady(true)).catch(() => setMapError(true)); }, []);

  // Tile layer switch
  useEffect(() => {
    if (!mapRef.current || !window.L || !mapReady) return;
    const cfg = MAP_TILES[mapStyle] || MAP_TILES.street;
    if (tileLayerRef.current) { mapRef.current.removeLayer(tileLayerRef.current); tileLayerRef.current = null; }
    const opts = { attribution: cfg.attribution, maxZoom: cfg.maxZoom || 20, crossOrigin: false, detectRetina: false, keepBuffer: 8, updateWhenIdle: false, updateWhenZooming: false, tileSize: 256, zoomOffset: 0 };
    if (cfg.subdomains) opts.subdomains = cfg.subdomains;
    tileLayerRef.current = window.L.tileLayer(cfg.url, opts).addTo(mapRef.current);
  }, [mapStyle, mapReady]);

  // Map init
  useEffect(() => {
    if (!mapReady || !containerRef.current || mapRef.current) return;
    try {
      const L = window.L;
      const map = L.map(containerRef.current, { center: [20.5937, 78.9629], zoom: 5, zoomControl: true, attributionControl: true, tap: false });
      const cfg = MAP_TILES.street;
      tileLayerRef.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: 20, crossOrigin: false, detectRetina: false, keepBuffer: 8, updateWhenIdle: false, updateWhenZooming: false, tileSize: 256, zoomOffset: 0 }).addTo(map);
      if (!L.MarkerClusterGroup) { setMapError(true); return; }
      const CLUSTER_GRADIENTS = { running: 'linear-gradient(135deg,#bbf7d0,#86efac)', stopped: 'linear-gradient(135deg,#fecaca,#fca5a5)', overspeed: 'linear-gradient(135deg,#fed7aa,#fdba74)', idle: 'linear-gradient(135deg,#fef08a,#fde047)', unreachable: 'linear-gradient(135deg,#e9d5ff,#d8b4fe)', new: 'linear-gradient(135deg,#bae6fd,#7dd3fc)', inactive: 'linear-gradient(135deg,#e2e8f0,#cbd5e1)' };
      const CLUSTER_TEXT   = { running: '#14532d', stopped: '#7f1d1d', overspeed: '#7c2d12', idle: '#713f12', unreachable: '#4c1d95', new: '#0c4a6e', inactive: '#334155' };
      const CLUSTER_BORDER = { running: '#4ade80', stopped: '#f87171', overspeed: '#fb923c', idle: '#facc15', unreachable: '#c084fc', new: '#38bdf8', inactive: '#94a3b8' };
      const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 60, spiderfyOnMaxZoom: true, showCoverageOnHover: false, zoomToBoundsOnClick: true, disableClusteringAtZoom: 16, animate: true, animateAddingMarkers: false,
        iconCreateFunction: cluster => {
          const count = cluster.getChildCount(), sc = {};
          cluster.getAllChildMarkers().forEach(m => { const st = m.options._vehicleState || 'stopped'; sc[st] = (sc[st] || 0) + 1; });
          const ds = Object.entries(sc).sort((a, b) => b[1] - a[1])[0]?.[0] || 'stopped';
          let sz = 38, fs = 12;
          if (count >= 100) { sz = 56; fs = 14; } else if (count >= 50) { sz = 48; fs = 13; } else if (count >= 10) { sz = 42; }
          return L.divIcon({ html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${CLUSTER_GRADIENTS[ds] || CLUSTER_GRADIENTS.inactive};border:2.5px solid ${CLUSTER_BORDER[ds] || '#94a3b8'};box-shadow:0 2px 12px rgba(0,0,0,0.18),0 0 0 4px ${(CLUSTER_BORDER[ds] || '#94a3b8')}28;display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:900;color:${CLUSTER_TEXT[ds] || '#1e293b'};letter-spacing:-0.5px;">${count}</div>`, className: 'fleet-cluster-icon', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
        },
      });
      clusterGroup.addTo(map);
      clusterGroupRef.current = clusterGroup;
      mapRef.current = map;
      const invalidate = () => { if (mapRef.current) { try { mapRef.current.invalidateSize({ animate: false }); } catch {} } };
      setTimeout(invalidate, 150); setTimeout(invalidate, 600);
    } catch { setMapError(true); }
  }, [mapReady]);

  // ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    let t = null;
    const obs = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (mapRef.current) { try { mapRef.current.invalidateSize({ animate: false }); } catch {} } }, 80); });
    obs.observe(containerRef.current);
    return () => { obs.disconnect(); clearTimeout(t); };
  }, [mapReady]);

  const removeRoute = useCallback(entry => {
    if (entry.polyline)     { try { entry.polyline.remove();     } catch {} entry.polyline     = null; }
    if (entry.glowPolyline) { try { entry.glowPolyline.remove(); } catch {} entry.glowPolyline = null; }
    if (entry.dashPolyline) { try { entry.dashPolyline.remove(); } catch {} entry.dashPolyline = null; }
  }, []);

  const syncRouteLine = useCallback((name, state, entry, curLat, curLng) => {
    if (!mapRef.current || !window.L) return;
    const r = getRoute(name), path = r?.roadPath;
    if (!path || path.length < 2) return;
    const L = window.L, color = STATE_COLOR[state] || themeColorRef.current;
    let closestIdx = 0, minDist = Infinity;
    for (let i = Math.max(0, path.length - TRAIL_MAX - 50); i < path.length; i++) {
      const d = Math.abs(path[i].lat - curLat) + Math.abs(path[i].lng - curLng);
      if (d < minDist) { minDist = d; closestIdx = i; }
    }
    const pts = path.slice(Math.max(0, closestIdx + 1 - TRAIL_MAX), closestIdx + 1).map(p => [p.lat, p.lng]);
    if (pts.length < 2) return;
    try {
      if (entry.glowPolyline) { entry.glowPolyline.setLatLngs(pts); entry.glowPolyline.setStyle({ color }); } else entry.glowPolyline = L.polyline(pts, { color, weight: 12, opacity: 0.14 }).addTo(mapRef.current);
      if (entry.polyline)     { entry.polyline.setLatLngs(pts);     entry.polyline.setStyle({ color });     } else entry.polyline     = L.polyline(pts, { color, weight: 3.5, opacity: 0.90 }).addTo(mapRef.current);
      if (entry.dashPolyline) { entry.dashPolyline.setLatLngs(pts); }                                          else entry.dashPolyline = L.polyline(pts, { color: '#fff', weight: 1.2, opacity: 0.5, dashArray: '6, 10' }).addTo(mapRef.current);
    } catch {}
  }, []);

  useEffect(() => { syncRouteRef.current = syncRouteLine; }, [syncRouteLine]);

  const makeLeafletIcon = useCallback((type, state, heading, selected) => {
    if (!window.L) return null;
    const sz   = selected ? 64 : 48;
    const html = makeVehicleMarkerHTML(state, selected, heading, type, themeColorRef.current);
    return window.L.divIcon({ html, className: 'fleet-marker', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -(sz / 2 + 4)] });
  }, []);

  const openVehiclePopup = useCallback((v, marker) => {
    if (!mapRef.current || !window.L) return;
    const ia   = isRealAddress(v.address) ? v.address : getAddrCached(v.lat, v.lng);
    const html = buildPopupHTML(v, ia, themeColorRef.current || '#4a2c8f');
    try {
      marker.unbindPopup();
      marker.bindPopup(html, { maxWidth: 320, minWidth: 300, className: 'fleet-popup' });
      marker.openPopup();
      marker.on('popupopen', () => {
        if (!ia && v.lat && v.lng) {
          geocodeLatLng(v.lat, v.lng).then(addr => {
            if (addr) { try { marker.setPopupContent(buildPopupHTML(v, addr, themeColorRef.current || '#4a2c8f')); } catch {} }
          });
        }
      });
    } catch {}
  }, []);

  // RAF loop
  useEffect(() => {
    if (!mapReady) return;
    let raf = null, lastFrameTime = performance.now();
    const tick = now => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(now - lastFrameTime, 100);
      lastFrameTime = now;
      if (!mapRef.current) return;
      Object.entries(smoothRef.current).forEach(([name, vs]) => {
        const entry = markersRef.current[name];
        if (!entry) return;
        const r = getRoute(name), path = r?.roadPath;
        if (!path || path.length < 1) return;
        const isMoving = vs.state === 'running' || vs.state === 'overspeed';
        const isSel    = selectedRef.current?.vehicle === name;
        if (r.startTime !== vs._routeStartTime) { vs._routeStartTime = r.startTime; vs.roadPathIdx = 0; vs.curLat = path[0].lat; vs.curLng = path[0].lng; vs.heading = r.heading || 0; }
        if (isMoving && path.length > 1) {
          const rawPts = r.positions;
          let speed = 0.0000111;
          if (rawPts.length >= 2) { const p1 = rawPts[rawPts.length - 2], p2 = rawPts[rawPts.length - 1]; const dDeg = Math.sqrt((p2.lat - p1.lat) ** 2 + (p2.lng - p1.lng) ** 2), dMs = Math.max(p2.ts - p1.ts, 1000); speed = Math.min(Math.max((dDeg / dMs) * 0.6 + 0.0000111 * 0.4, 0.0000028), 0.0000222); }
          let remaining = speed * dt, idx = Math.min(vs.roadPathIdx || 0, path.length - 1);
          while (remaining > 0 && idx < path.length - 1) { const next = path[idx + 1], dLat = next.lat - vs.curLat, dLng = next.lng - vs.curLng, dist = Math.sqrt(dLat * dLat + dLng * dLng); if (dist <= remaining) { vs.heading = shortestAngle(vs.heading, calcBearing(vs.curLat, vs.curLng, next.lat, next.lng)); vs.curLat = next.lat; vs.curLng = next.lng; idx++; remaining -= dist; } else { const frac = remaining / dist; vs.heading = shortestAngle(vs.heading, calcBearing(vs.curLat, vs.curLng, next.lat, next.lng)); vs.curLat += dLat * frac; vs.curLng += dLng * frac; remaining = 0; } }
          vs.roadPathIdx = idx;
        } else { const last = path[path.length - 1]; vs.curLat = last.lat; vs.curLng = last.lng; vs.roadPathIdx = path.length - 1; }
        try { entry.marker.setLatLng([vs.curLat, vs.curLng]); } catch { return; }
        const stateChanged = entry._lastState !== vs.state, selChanged = entry._lastSelected !== isSel;
        if (stateChanged || selChanged) { const icon = makeLeafletIcon(entry._v?.vehicleType || entry._v?.type || 'car', vs.state, vs.heading, isSel); if (icon) { try { entry.marker.setIcon(icon); entry.marker.setZIndexOffset(isSel ? 999 : 0); } catch {} } entry._lastState = vs.state; entry._lastSelected = isSel; } else { const el = entry.marker.getElement(); if (el) { const img = el.querySelector('.fleet-marker-img'); if (img) img.style.transform = `rotate(${((vs.heading % 360) + 360) % 360}deg)`; } }
        if ((isMoving || isSel) && syncRouteRef.current) syncRouteRef.current(name, vs.state, entry, vs.curLat, vs.curLng);
        else if (!isMoving && !isSel) removeRoute(entry);
        if (isSel && mapRef.current && isMoving) { try { const c = mapRef.current.getCenter(); if (Math.abs(c.lat - vs.curLat) + Math.abs(c.lng - vs.curLng) > 0.001) mapRef.current.panTo([vs.curLat, vs.curLng], { animate: true, duration: 2, easeLinearity: 0.3 }); } catch {} }
      });
      const pv = popupVehicleRef.current;
      if (pv && mapRef.current) {
        const pvs = smoothRef.current[pv.vehicle];
        const lat = pvs?.curLat != null ? pvs.curLat : Number(pv.lat);
        const lng = pvs?.curLng != null ? pvs.curLng : Number(pv.lng);
        if (!isNaN(lat) && !isNaN(lng)) { try { const pt = mapRef.current.latLngToContainerPoint([lat, lng]); setPopupScreenPos(prev => (!prev || Math.abs(prev.x - pt.x) > 1 || Math.abs(prev.y - pt.y) > 1) ? { x: Math.round(pt.x), y: Math.round(pt.y) } : prev); } catch {} }
      }
    };
    raf = requestAnimationFrame(tick);
    rafLoopRef.current = raf;
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [mapReady, makeLeafletIcon, removeRoute]);

  // Markers sync
  useEffect(() => {
    if (!mapRef.current || !clusterGroupRef.current || !window.L || !mapReady || mapError) return;
    const L = window.L, vehicles = vehiclesRef.current || [], activeKeys = filteredKeysRef.current || new Set(), clusterGroup = clusterGroupRef.current, now = Date.now();
    Object.keys(markersRef.current).forEach(name => {
      if (!activeKeys.has(name)) {
        const e = markersRef.current[name];
        try { clusterGroup.removeLayer(e.marker); } catch {}
        if (e.polyline)     { try { e.polyline.remove();     } catch {} e.polyline     = null; }
        if (e.glowPolyline) { try { e.glowPolyline.remove(); } catch {} e.glowPolyline = null; }
        if (e.dashPolyline) { try { e.dashPolyline.remove(); } catch {} e.dashPolyline = null; }
        e._hidden = true;
        const r = routeCache.get(name);
        if (r && r.positions.length > 0) { const lp = r.positions[r.positions.length - 1], lr = r.roadPath.length > 0 ? r.roadPath[r.roadPath.length - 1] : lp; routeCache.set(name, { positions: [lp], roadPath: [lr], totalDistance: r.totalDistance, heading: r.heading, startTime: r.startTime, lastUpdate: r.lastUpdate, lastState: r.lastState, _snapped: true, _pending: false }); if (smoothRef.current[name]) smoothRef.current[name].roadPathIdx = 0; }
      }
    });
    const newMarkers = [];
    vehicles.forEach(v => {
      if (!v.lat || !v.lng || !activeKeys.has(v.vehicle)) return;
      const newLat = Number(v.lat), newLng = Number(v.lng);
      if (isNaN(newLat) || isNaN(newLng)) return;
      const isSel = selectedRef.current?.vehicle === v.vehicle, type = v.vehicleType || v.type || 'car', state = v.state || 'stopped';
      pushRoutePoint(v.vehicle, newLat, newLng, now, state);
      const vs = smoothRef.current[v.vehicle], entry = markersRef.current[v.vehicle];
      if (entry) {
        entry._v = v;
        if (entry._hidden) { entry._hidden = false; try { clusterGroup.addLayer(entry.marker); } catch {} }
        if (vs) { vs.state = state; vs.lastPacketTime = now; const r = getRoute(v.vehicle); if (r && r.positions.length >= 2) { const p1 = r.positions[r.positions.length - 2], p2 = r.positions[r.positions.length - 1]; const nb = calcBearing(p1.lat, p1.lng, p2.lat, p2.lng); if (Math.abs(((nb - ((vs.heading % 360) + 360) % 360 + 540) % 360) - 180) < 100 || r.positions.length <= 2) vs.heading = shortestAngle(vs.heading, nb); } }
        entry.marker.options._vehicleState = state;
        if (NON_MOVING_STATES.has(state) && !isSel) removeRoute(entry);
        entry.marker.off('click');
        entry.marker.on('click', () => { openVehiclePopup(entry._v, entry.marker); onMarkerClick?.(entry._v); });
      } else {
        const r = getRoute(v.vehicle);
        smoothRef.current[v.vehicle] = { curLat: newLat, curLng: newLng, roadPathIdx: 0, heading: 0, state, lastPacketTime: now, _routeStartTime: r?.startTime || now };
        const icon = makeLeafletIcon(type, state, 0, isSel);
        if (!icon) return;
        const marker = L.marker([newLat, newLng], { icon, zIndexOffset: isSel ? 999 : 0, title: v.vehicle, _vehicleState: state });
        const newEntry = { marker, polyline: null, glowPolyline: null, dashPolyline: null, _v: v, _lastState: state, _lastSelected: isSel };
        marker.on('click', () => { openVehiclePopup(newEntry._v, marker); onMarkerClick?.(newEntry._v); });
        markersRef.current[v.vehicle] = newEntry;
        newMarkers.push(marker);
      }
    });
    if (newMarkers.length > 0) { try { clusterGroup.addLayers(newMarkers); } catch { newMarkers.forEach(m => { try { clusterGroup.addLayer(m); } catch {} }); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncVersion, mapReady, mapError, makeLeafletIcon, openVehiclePopup, removeRoute, onMarkerClick]);

  // Fly to selected
  useEffect(() => {
    if (!selectedVehicle?.lat || !selectedVehicle?.lng || !mapRef.current || !mapReady) return;
    const lat = Number(selectedVehicle.lat), lng = Number(selectedVehicle.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    try { mapRef.current.setView([lat, lng], 16, { animate: true, duration: 1.2 }); } catch {}
    const entry = markersRef.current[selectedVehicle.vehicle];
    if (entry && clusterGroupRef.current) { setTimeout(() => { if (clusterGroupRef.current && entry.marker) { try { clusterGroupRef.current.zoomToShowLayer(entry.marker, () => {}); } catch {} } }, 350); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicle?.vehicle, mapReady]);

  const goToLocation = useCallback(() => {
    if (!mapRef.current || !searchVal.trim()) return;
    const parts = searchVal.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) { try { mapRef.current.setView([parts[0], parts[1]], 14); } catch {} return; }
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchVal)}&format=json&limit=1`, { headers: { 'User-Agent': 'FleetApp/1.0' } }).then(r => r.json()).then(d => { if (d?.[0] && mapRef.current) { try { mapRef.current.setView([parseFloat(d[0].lat), parseFloat(d[0].lon)], 14); } catch {} } }).catch(() => {});
  }, [searchVal]);

  // Cleanup
  useEffect(() => () => {
    if (rafLoopRef.current) cancelAnimationFrame(rafLoopRef.current);
    clusterGroupRef.current = null;
    if (mapRef.current) { try { mapRef.current.remove(); } catch {} mapRef.current = null; }
    tileLayerRef.current = null; smoothRef.current = {};
  }, []);

  if (mapError) return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: '#f8fafc' }}>
      <div style={{ color: '#dc2626', fontWeight: 600 }}>Map failed to load</div>
      <button onClick={() => window.location.reload()} style={{ padding: '6px 16px', background: 'var(--theme-color)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>Reload</button>
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#f1f5f9' }}>
      <MapLayerSwitcher mapStyle={mapStyle} onSwitch={setMapStyle} themeColor={themeColor} />
      {/* Search bar */}
      <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#fff', borderRadius: 3, border: '1.5px solid #e2e8f0', display: 'flex', overflow: 'hidden', boxShadow: '0 4px 18px rgba(0,0,0,0.10)', minWidth: 300 }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 12, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </div>
        <input type="text" placeholder="Search address or lat, lng…" value={searchVal} onChange={e => setSearchVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && goToLocation()} style={{ padding: '9px 12px', border: 'none', fontSize: 12, width: 240, outline: 'none', background: 'transparent', color: '#1e293b' }} />
        <button onClick={goToLocation} style={{ padding: '0 18px', background: 'var(--theme-color)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Go</button>
      </div>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} />
      {/* Floating React popup card */}
      {popupVehicle && popupScreenPos && (
        <div style={{ position: 'absolute', left: popupScreenPos.x, top: popupScreenPos.y - 32, transform: 'translateX(-50%) translateY(-100%)', zIndex: 900, pointerEvents: 'auto', maxWidth: 'calc(100% - 20px)' }}>
          <MapPopupCard v={popupVehicle} themeColor={themeColor} onClose={onPopupClose} />
          <div style={{ width: 0, height: 0, borderLeft: '11px solid transparent', borderRight: '11px solid transparent', borderTop: `11px solid ${STATE_COLOR[popupVehicle.state] || themeColor}40`, margin: '0 auto', position: 'relative', zIndex: 1 }} />
          <div style={{ width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: '9px solid #fff', margin: '-10px auto 0', position: 'relative', zIndex: 2 }} />
        </div>
      )}
      {!mapReady && !mapError && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', flexDirection: 'column', gap: 12, zIndex: 10 }}>
          <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTop: '4px solid var(--theme-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: 'var(--theme-color)', fontWeight: 600, fontSize: 14 }}>Loading Map…</span>
        </div>
      )}
    </div>
  );
};

export default MapView;