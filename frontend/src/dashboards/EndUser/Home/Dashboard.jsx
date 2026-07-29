import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useTheme } from "../../../context/ThemeContext";

// ── Shared modules ────────────────────────────────────────────────────────────
import { API_BASE, SOCKET_URL, POLL_MS, apiFetch, safeNum, formatLU } from "./shared/apiHelpers.js";
import { warmClientCache, isRealAddress, getAddrCached }              from "./shared/addressCache.js";
import { _vehicleStore, useVehicleStore, initSocket, fetchAndStoreVehicles } from "./shared/vehicleStore.js";
import { pushRoutePoint, getRoute, routeCache }                       from "./shared/routeCache.js";
import { STATE_COLOR }                                                from "./shared/vehicleAssets.js";
import DashboardTopbar                                                from "./shared/DashboardTopbar.jsx";
import MapView                                                        from "./shared/MapView.jsx";
import {
  VehicleTypeIcon, BatteryIcon, GsmSignalIcon, GpsSatIcon,
  SpeedDisplay, TempIcon, HumidityIcon, SoCBar, AcFanIcon,
  GpsChip, AddressCell, Toggle, FilterLoadingOverlay, SkeletonRow,
} from "./shared/vehicleWidgets.jsx";

// ── Column definitions ────────────────────────────────────────────────────────
const SETTING_COLUMNS = [
  { key: 'state',       label: 'State',         defaultOn: true,  draggable: false },
  { key: 'branch',      label: 'Branch',         defaultOn: true,  draggable: true  },
  { key: 'vehicle',     label: 'Vehicle',        defaultOn: true,  draggable: false },
  { key: 'address',     label: 'Address',        defaultOn: true,  draggable: true  },
  { key: 'lu',          label: 'Last Update',    defaultOn: true,  draggable: true  },
  { key: 'parking',     label: 'Parking',        defaultOn: false, draggable: true  },
  { key: 'spd',         label: 'Speed (km/h)',   defaultOn: true,  draggable: true  },
  { key: 'km',          label: 'KM',             defaultOn: true,  draggable: true  },
  { key: 'since',       label: 'Since',          defaultOn: true,  draggable: true  },
  { key: 'ac',          label: 'AC',             defaultOn: true,  draggable: true  },
  { key: 'btr',         label: 'Battery',        defaultOn: true,  draggable: true  },
  { key: 'gsm',         label: 'GSM Signal',     defaultOn: true,  draggable: true  },
  { key: 'gps',         label: 'GPS',            defaultOn: true,  draggable: true  },
  { key: 'temperature', label: 'Temperature',    defaultOn: true,  draggable: true  },
  { key: 'humidity',    label: 'Humidity',       defaultOn: true,  draggable: true  },
  { key: 'locked',      label: 'Lock Status',    defaultOn: true,  draggable: true  },
  { key: 'iccid',       label: 'ICCID',          defaultOn: false, draggable: true  },
  { key: 'driver',      label: 'Driver Names',   defaultOn: true,  draggable: true  },
  { key: 'soc',         label: 'SoC (%)',        defaultOn: false, draggable: true  },
  { key: 'extPower',    label: 'Ext. Power (V)', defaultOn: true,  draggable: true  },
  { key: 'panic',       label: 'Panic',          defaultOn: false, draggable: true  },
];

const ALL_COLUMNS = [
  { key: 'sn',          label: 'SN',          width: 36  },
  { key: 'state',       label: 'STATE',       width: 76  },
  { key: 'branch',      label: 'BRANCH',      width: 90  },
  { key: 'vehicle',     label: 'VEHICLE',     width: 110 },
  { key: 'address',     label: 'ADDRESS',     width: 230 },
  { key: 'lu',          label: 'LAST UPDATE', width: 130 },
  { key: 'parking',     label: 'PARKING',     width: 90  },
  { key: 'spd',         label: 'SPEED',       width: 76  },
  { key: 'km',          label: 'KM',          width: 64  },
  { key: 'since',       label: 'SINCE',       width: 72  },
  { key: 'ac',          label: 'AC',          width: 40  },
  { key: 'btr',         label: 'BATTERY',     width: 56  },
  { key: 'gsm',         label: 'GSM',         width: 68  },
  { key: 'gps',         label: 'GPS',         width: 64  },
  { key: 'temperature', label: 'TEMP',        width: 72  },
  { key: 'humidity',    label: 'HUM',         width: 60  },
  { key: 'locked',      label: 'LOCK',        width: 60  },
  { key: 'iccid',       label: 'ICCID',       width: 140 },
  { key: 'driver',      label: 'DRIVER',      width: 120 },
  { key: 'soc',         label: 'SOC%',        width: 68  },
  { key: 'extPower',    label: 'EXT.V',       width: 64  },
  { key: 'panic',       label: 'PANIC',       width: 54  },
];

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const theme       = useTheme();
  const activeColor = theme?.activeColor || '#0b5347';

  const currentRole = useMemo(() => {
    if (theme?.user?.role) return theme.user.role;
    if (theme?.role)       return theme.role;
    try { const u = JSON.parse(localStorage.getItem('fleet_user') || localStorage.getItem('user') || '{}'); return u?.role || 'user'; } catch { return 'user'; }
  }, [theme]);

  const { vehicles: allVehicles, stats, hasData } = useVehicleStore();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [search,          setSearch]          = useState('');
  const [activeFilter,    setActiveFilter]    = useState('all');
  const [colSettings,     setColSettings]     = useState(() => SETTING_COLUMNS.map(c => ({ ...c, on: c.defaultOn })));
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [initialLoading,  setInitialLoading]  = useState(!_vehicleStore.hasData);
  const [filterLoading,   setFilterLoading]   = useState(false);
  const [criticalError,   setCriticalError]   = useState(null);
  const [entriesPerPage,  setEntriesPerPage]  = useState(15);
  const [currentPage,     setCurrentPage]     = useState(1);
  const [panelMode,       setPanelMode]       = useState('normal'); // 'normal' | 'fullTable' | 'fullMap'
  const [syncVersion,     setSyncVersion]     = useState(0);
  const [popupVehicle,    setPopupVehicle]    = useState(null);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const socketLiveRef    = useRef(false);
  const failCountRef     = useRef(0);
  const vehiclesRef      = useRef([]);
  const filteredKeysRef  = useRef(new Set());
  const fetchAbortRef    = useRef(null);
  const popupTimerRef    = useRef(null);
  const MAX_SILENT_FAILS = 99;

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
  useEffect(() => { if (!popupVehicle) return; const u = allVehicles.find(v => v.vehicle === popupVehicle.vehicle); if (u && u !== popupVehicle) setPopupVehicle(u); }, [allVehicles]); // eslint-disable-line
  useEffect(() => () => { if (popupTimerRef.current) clearTimeout(popupTimerRef.current); }, []);

  // ── Column toggle ────────────────────────────────────────────────────────────
  const handleColToggle = useCallback(key => { setColSettings(s => s.map(c => c.key === key ? { ...c, on: !c.on } : c)); }, []);

  // ── Filtered + paginated vehicles ────────────────────────────────────────────
  const filteredVehicles = useMemo(() => {
    let list = allVehicles;
    if (activeFilter !== 'all') list = list.filter(v => v.state === activeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(v => v.vehicle?.toLowerCase().includes(q) || v.driver?.toLowerCase().includes(q) || v.branch?.toLowerCase().includes(q) || v.imei?.toLowerCase().includes(q));
    }
    return list;
  }, [allVehicles, activeFilter, search]);

  const totalPages        = Math.max(1, Math.ceil(filteredVehicles.length / entriesPerPage));
  const safePage          = Math.min(currentPage, totalPages);
  const paginatedVehicles = useMemo(() => filteredVehicles.slice((safePage - 1) * entriesPerPage, safePage * entriesPerPage), [filteredVehicles, safePage, entriesPerPage]);

  // Keep vehiclesRef + filteredKeysRef in sync for MapView
  useEffect(() => {
    vehiclesRef.current = allVehicles;
    const keys = new Set();
    allVehicles.forEach(v => {
      if (!v.lat || !v.lng) return;
      let ok = true;
      if (activeFilter !== 'all' && v.state !== activeFilter) ok = false;
      if (ok && search.trim()) { const q = search.trim().toLowerCase(); if (!v.vehicle?.toLowerCase().includes(q) && !v.driver?.toLowerCase().includes(q)) ok = false; }
      if (ok) keys.add(v.vehicle);
    });
    filteredKeysRef.current = keys;
    setSyncVersion(n => n + 1);
  }, [allVehicles, activeFilter, search]);

  useEffect(() => { setCurrentPage(1); }, [activeFilter, search]);

  // ── Fetch all vehicles ───────────────────────────────────────────────────────
  const fetchAll = useCallback(async (isFirst = false) => {
    if (
      !isFirst &&
      _vehicleStore.initialFetchDone &&
      socketLiveRef.current
    ) return;

    const url = `${API_BASE}/dashboard/vehicles`;
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    const { ok, data, timedOut, unauthorized } = await apiFetch(url, { signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    fetchAbortRef.current = null;
    if (unauthorized) { setCriticalError('Session expired. Please login again.'); setInitialLoading(false); setFilterLoading(false); return; }
    if (timedOut || (!ok && !data)) { failCountRef.current++; if (failCountRef.current >= MAX_SILENT_FAILS) setCriticalError('Server unreachable.'); if (isFirst) setInitialLoading(false); setFilterLoading(false); return; }
    if (ok && data?.success) {
      failCountRef.current = 0; setCriticalError(null);
      _vehicleStore.initialFetchDone = true;
      const vehicles = data.data || [];
      _vehicleStore.setAllowedKeys(null);
      _vehicleStore.replaceAll(vehicles);
      if (data.stats) {
        _vehicleStore.setStats(data.stats);
      } else {
        _vehicleStore.recalcStats();
      }
    }
    if (isFirst) setInitialLoading(false);
    setFilterLoading(false);
  }, []);

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (_vehicleStore.hasData) {
      setInitialLoading(false);
      vehiclesRef.current     = _vehicleStore.vehicles;
      filteredKeysRef.current = new Set(
        _vehicleStore.vehicles.filter(v => v.lat && v.lng).map(v => v.vehicle)
      );
      setSyncVersion(n => n + 1);
      return;
    }
    fetchAll(true);
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
        setSelectedVehicle(prev => {
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

  // ── Row / marker click ───────────────────────────────────────────────────────
  const handleRowClick = useCallback(row => {
    setSelectedVehicle(prev => { const same = prev?.vehicle === row.vehicle; if (same) { closeMapPopup(); return null; } showMapPopup(row); return row; });
  }, [showMapPopup, closeMapPopup]);

  // ── Table render ─────────────────────────────────────────────────────────────
  const visibleKeys = ['sn', ...colSettings.filter(c => c.on).map(c => c.key)];
  const activeCols  = ALL_COLUMNS.filter(c => visibleKeys.includes(c.key));
  const base        = { padding: '6px 8px', verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9', fontSize: 11, color: '#374151', textAlign: 'left', whiteSpace: 'nowrap' };
  const centerBase  = { ...base, textAlign: 'center' };

  const renderCell = (col, v, i) => {
    const spd = safeNum(v.spd), km = safeNum(v.km);
    const vType = v.vehicleType || v.type || 'car';
    switch (col.key) {
      case 'sn':      return <td key="sn"      style={{ ...base, color: '#94a3b8', width: 36, textAlign: 'center', fontSize: 10 }}>{(safePage - 1) * entriesPerPage + i + 1}</td>;
      case 'state':   return <td key="state"   style={{ ...centerBase, padding: '4px 6px' }}><VehicleTypeIcon type={vType} state={v.state} size={48} /></td>;
      case 'branch':  return <td key="branch"  style={{ ...base, color: '#475569', fontSize: 11 }}><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 2.5, height: 20, borderRadius: 2, background: activeColor, flexShrink: 0, opacity: 0.5 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>{v.branch || '--'}</span></div></td>;
      case 'vehicle': return <td key="vehicle" style={{ ...base, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace', letterSpacing: '0.03em', fontSize: 11.5 }}>{v.vehicle}</td>;
      case 'address': return <AddressCell key={`addr-${v.vehicle}`} v={v} style={base} />;
      case 'lu':      return <td key="lu"      style={{ ...base, whiteSpace: 'nowrap', color: '#64748b', fontSize: 10, fontFamily: 'monospace' }}>{formatLU(v.lu)}</td>;
      case 'parking': return <td key="parking" style={{ ...base, fontSize: 10, color: '#94a3b8' }}>{v.parking || '--'}</td>;
      case 'spd':     return <td key="spd"     style={{ ...centerBase, padding: '2px 4px' }}><SpeedDisplay speed={spd} /></td>;
      case 'km':      return <td key="km"      style={{ ...centerBase, fontFamily: 'monospace', fontSize: 11 }}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}><span style={{ fontWeight: 700, color: '#1e293b' }}>{km.toLocaleString()}</span><span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600 }}>km</span></div></td>;
      case 'since':   return <td key="since"   style={{ ...centerBase, color: '#64748b', fontSize: 10 }}>{v.since || '--'}</td>;
      case 'ac': {
        const acOn = v.ac === true || v.ac === 1 || v.ac === '1' || v.ac === 'true' || v.ac === 'on';
        return <td key="ac" style={{ ...centerBase, padding: '4px 6px' }}><AcFanIcon on={acOn} /></td>;
      }
      case 'btr':         return <td key="btr"         style={{ ...centerBase, padding: '4px 6px' }}><BatteryIcon pct={safeNum(v.btr)} /></td>;
      case 'gsm':         return <td key="gsm"         style={{ ...centerBase, padding: '4px 6px' }}><GsmSignalIcon raw={safeNum(v.gsmRaw)} /></td>;
      case 'gps':         return <td key="gps"         style={{ ...centerBase, padding: '4px 6px' }}><GpsSatIcon satellites={safeNum(v.gpsSatellites ?? v.satellites)} fixType={v.fixType || 'No Fix'} /></td>;
      case 'temperature': return <td key="temperature" style={{ ...centerBase, padding: '4px 6px' }}><TempIcon value={v.temperature} /></td>;
      case 'humidity':    return <td key="humidity"    style={{ ...centerBase, padding: '4px 6px' }}><HumidityIcon value={v.humidity} /></td>;
      case 'locked':      return (<td key="locked" style={{ ...centerBase }}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><svg width="13" height="14" viewBox="0 0 24 28" fill="none">{v.locked ? (<><rect x="3" y="12" width="18" height="14" rx="2" fill="#7c3aed" opacity="0.9" /><path d="M8 12V8a4 4 0 0 1 8 0v4" stroke="#7c3aed" strokeWidth="2.5" fill="none" strokeLinecap="round" /><circle cx="12" cy="19" r="2" fill="#fff" opacity="0.9" /></>) : (<><rect x="3" y="12" width="18" height="14" rx="2" fill="#16a34a" opacity="0.9" /><path d="M8 12V8a4 4 0 0 1 8 0" stroke="#16a34a" strokeWidth="2.5" fill="none" strokeLinecap="round" /><circle cx="12" cy="19" r="2" fill="#fff" opacity="0.9" /></>)}</svg><span style={{ fontSize: 8, fontWeight: 700, color: v.locked ? '#7c3aed' : '#16a34a' }}>{v.locked ? 'LOCK' : 'OPEN'}</span></div></td>);
      case 'iccid':   return <td key="iccid"   style={{ ...base, fontSize: 9.5, color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{v.iccid || '--'}</td>;
      case 'driver':  return (<td key="driver" style={{ ...base, color: '#374151', fontSize: 11 }}>{v.driver && v.driver !== '--' ? (<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 20, height: 20, borderRadius: '50%', background: activeColor + '20', border: `1.5px solid ${activeColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: activeColor, flexShrink: 0 }}>{v.driver.charAt(0).toUpperCase()}</div><span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{v.driver}</span></div>) : <span style={{ color: '#94a3b8' }}>--</span>}</td>);
      case 'soc':     return <td key="soc"     style={{ ...centerBase }}><SoCBar pct={safeNum(v.soc)} /></td>;
      case 'extPower': { const ep = safeNum(v.extPower); const epc = ep > 12 ? '#16a34a' : ep > 0 ? '#ca8a04' : '#dc2626'; return <td key="extPower" style={{ ...centerBase }}><span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: epc, background: epc + '15', padding: '1px 5px', borderRadius: 2, border: `1px solid ${epc}30` }}>{ep.toFixed(1)}V</span></td>; }
      case 'panic':   return <td key="panic"   style={{ ...centerBase }}>{v.panic ? <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 10, background: '#fee2e2', padding: '1px 5px', borderRadius: 2, border: '1px solid #fca5a5', animation: 'pulse 1s infinite' }}>🚨</span> : <span style={{ color: '#94a3b8', fontSize: 10 }}>--</span>}</td>;
      default: return <td key={col.key} style={base}>--</td>;
    }
  };

  // ── Pagination ───────────────────────────────────────────────────────────────
  const pageNums = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4)   return [1, 2, 3, 4, 5, '...', totalPages];
    if (safePage >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', safePage - 1, safePage, safePage + 1, '...', totalPages];
  };

  const TABLE_W = 820, ARROW_W = 28;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f1f5f9', overflow: 'hidden', position: 'relative', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        :root { --theme-color: ${activeColor}; }
        @keyframes spin        { to { transform: rotate(360deg); } }
        @keyframes pulse       { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes liveRing    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.5)} }
        @keyframes markerPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.55;transform:scale(1.12)} }
        @keyframes acSpin      { to { transform: rotate(360deg); } }
        @keyframes shimmer     { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes dotBounce   { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-6px);opacity:1} }
        .fleet-marker          { background:transparent!important;border:none!important; }
        .fleet-cluster-icon    { background:transparent!important;border:none!important; }
        .fleet-popup .leaflet-popup-content-wrapper { padding:0!important;border-radius:4px!important;overflow:hidden!important; }
        .fleet-popup .leaflet-popup-content         { margin:0!important;width:auto!important; }
        .fleet-popup .leaflet-popup-tip-container   { display:none!important; }
        .leaflet-container     { font-family:'Segoe UI',sans-serif;background:#f1f5f9!important; }
        .leaflet-control-zoom  { border:1px solid #e2e8f0!important;border-radius:6px!important;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08)!important; }
        .leaflet-control-zoom a { background:#fff!important;color:#374151!important;line-height:30px!important; }
        .leaflet-control-zoom a:hover { background:#f8fafc!important;color:var(--theme-color)!important; }
        .leaflet-control-attribution { background:rgba(255,255,255,0.88)!important;color:#94a3b8!important;font-size:9px!important; }
        .dash-table tbody tr:hover td { background:${activeColor}0d!important;cursor:pointer; }
        .dash-table thead th { text-align:center!important; }
        .stat-btn { transition:all 0.15s; }
        .stat-btn:hover { transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,0.1)!important; }
        ::-webkit-scrollbar { width:4px;height:4px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1;border-radius:3px; }
      `}</style>

      {/* ── Top bar (shared component) ───────────────────────────────────────── */}
      <DashboardTopbar
        search={search}           onSearchChange={v => { setSearch(v); setCurrentPage(1); }}
        stats={stats}             activeFilter={activeFilter}  onFilterChange={k => { setActiveFilter(k); setCurrentPage(1); }}
        activeColor={activeColor}
        showFilter={false}
        showColumns={true}        colSettings={colSettings}    onColToggle={handleColToggle}
      />

      {criticalError && (
        <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#991b1b', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <span style={{ flex: 1 }}>{criticalError}</span>
          <button onClick={() => { setCriticalError(null); failCountRef.current = 0; fetchAll(true); }} style={{ padding: '3px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Retry</button>
          <button onClick={() => setCriticalError(null)} style={{ padding: '3px 8px', background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0, height: 0 }}>
        <FilterLoadingOverlay visible={filterLoading} message="Loading vehicles…" />

        {/* ── Table panel ──────────────────────────────────────────────────────── */}
        {panelMode !== 'fullMap' && (
          <div style={{ width: panelMode === 'fullTable' ? `calc(100% - ${ARROW_W}px)` : TABLE_W, display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0, overflow: 'hidden', transition: 'width 0.25s ease', borderRight: '1px solid #e2e8f0', zIndex: 1, position: 'relative' }}>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}>
              {initialLoading && !_vehicleStore.hasData ? (
                <>
                  <table className="dash-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr style={{ background: activeColor }}>
                        {activeCols.map(col => <th key={col.key} style={{ padding: '7px 6px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 10, minWidth: col.width, width: col.width, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.15)' }}>{col.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>{Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} cols={activeCols} />)}</tbody>
                  </table>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(2px)', zIndex: 10, marginTop: 32 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                      <div style={{ position: 'relative', width: 64, height: 64 }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${activeColor}18` }} />
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid transparent`, borderTopColor: activeColor, animation: 'spin 0.9s linear infinite' }} />
                        <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: `2px solid transparent`, borderTopColor: activeColor + '70', animation: 'spin 1.5s linear infinite reverse' }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="2" strokeLinecap="round"><path d="M1 3h15l3 5H1z" /><path d="M20 9l2 3v3h-4" /><circle cx="5" cy="17" r="2" /><circle cx="15" cy="17" r="2" /></svg>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Fetching vehicles</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Please wait…</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[0, 1, 2, 3, 4].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: activeColor, animation: `dotBounce 1.2s ${i * 0.15}s ease-in-out infinite`, opacity: 0.3 }} />)}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <table className="dash-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr style={{ background: activeColor }}>
                      {activeCols.map(col => <th key={col.key} style={{ padding: '7px 6px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 10, minWidth: col.width, width: col.width, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.15)' }}>{col.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedVehicles.length === 0 ? (
                      <tr><td colSpan={activeCols.length} style={{ textAlign: 'center', padding: '60px 20px', color: '#cbd5e1', fontSize: 13, fontWeight: 600 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                          No vehicles match this filter
                        </div>
                      </td></tr>
                    ) : paginatedVehicles.map((v, i) => {
                      const isSel = selectedVehicle?.vehicle === v.vehicle;
                      return (
                        <tr key={v.vehicle || i} style={{ background: isSel ? `${activeColor}12` : i % 2 === 0 ? '#fff' : '#fafbfc', cursor: 'pointer', outline: isSel ? `2px solid ${activeColor}` : 'none', outlineOffset: '-2px' }} onClick={() => handleRowClick(v)}>
                          {activeCols.map(col => renderCell(col, v, i))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {filteredVehicles.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', flexWrap: 'wrap', gap: 5, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
                  Show
                  <select value={entriesPerPage} onChange={e => { setEntriesPerPage(Number(e.target.value)); setCurrentPage(1); }} style={{ border: '1px solid #e2e8f0', borderRadius: 3, padding: '2px 6px', fontSize: 11, background: '#fff', color: '#374151' }}>
                    {[15, 25, 50, 100].map(n => <option key={n}>{n}</option>)}
                  </select>
                  entries
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Showing {(safePage - 1) * entriesPerPage + 1}–{Math.min(safePage * entriesPerPage, filteredVehicles.length)} of {filteredVehicles.length}</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1} style={{ border: '1px solid #e2e8f0', background: safePage === 1 ? '#f8fafc' : '#fff', padding: '3px 9px', borderRadius: 3, cursor: safePage === 1 ? 'default' : 'pointer', fontSize: 11, color: '#374151', opacity: safePage === 1 ? 0.5 : 1 }}>‹</button>
                  {pageNums().map((p, i2) => <button key={i2} onClick={() => typeof p === 'number' && setCurrentPage(p)} style={{ border: '1px solid', borderColor: safePage === p ? activeColor : '#e2e8f0', background: safePage === p ? activeColor : '#fff', color: safePage === p ? '#fff' : '#374151', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: safePage === p ? 700 : 400, minWidth: 28 }}>{p}</button>)}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} style={{ border: '1px solid #e2e8f0', background: safePage === totalPages ? '#f8fafc' : '#fff', padding: '3px 9px', borderRadius: 3, cursor: safePage === totalPages ? 'default' : 'pointer', fontSize: 11, color: '#374151', opacity: safePage === totalPages ? 0.5 : 1 }}>›</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Collapse arrow ────────────────────────────────────────────────────── */}
        <div style={{ width: ARROW_W, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRight: '1px solid #e2e8f0', gap: 4, flexShrink: 0, zIndex: 20 }}>
          <button onClick={() => setPanelMode(p => p === 'fullTable' ? 'normal' : 'fullTable')} title={panelMode === 'fullTable' ? 'Restore split' : 'Expand table'}
            style={{ width: 24, height: 44, background: panelMode === 'fullTable' ? activeColor : '#fff', border: `1px solid ${panelMode === 'fullTable' ? activeColor : '#e2e8f0'}`, color: panelMode === 'fullTable' ? '#fff' : '#64748b', cursor: 'pointer', borderRadius: '0 3px 3px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">{panelMode === 'fullTable' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}</svg>
          </button>
          <button onClick={() => setPanelMode(p => p === 'fullMap' ? 'normal' : 'fullMap')} title={panelMode === 'fullMap' ? 'Show table' : 'Full map'}
            style={{ width: 24, height: 44, background: panelMode === 'fullMap' ? '#16a34a' : '#fff', border: `1px solid ${panelMode === 'fullMap' ? '#16a34a' : '#e2e8f0'}`, color: panelMode === 'fullMap' ? '#fff' : '#64748b', cursor: 'pointer', borderRadius: '0 3px 3px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">{panelMode === 'fullMap' ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}</svg>
          </button>
        </div>

        {/* ── Map panel (shared MapView) ─────────────────────────────────────────── */}
        <div style={{ flex: 1, display: panelMode === 'fullTable' ? 'none' : 'block', overflow: 'hidden', minWidth: 0, minHeight: 0, position: 'relative' }}>
          <MapView
            vehiclesRef={vehiclesRef}
            filteredKeysRef={filteredKeysRef}
            selectedVehicle={selectedVehicle}
            onMarkerClick={v => { setSelectedVehicle(prev => prev?.vehicle === v.vehicle ? null : v); showMapPopup(v); }}
            themeColor={activeColor}
            syncVersion={syncVersion}
            popupVehicle={popupVehicle}
            onPopupClose={closeMapPopup}
          />
        </div>
      </div>
    </div>
  );
}