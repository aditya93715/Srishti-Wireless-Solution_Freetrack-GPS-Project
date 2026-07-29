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

// ── Filter Modal ──────────────────────────────────────────────────────────────
const FilterSelect = ({ label, icon, value, onChange, options, loading, disabled, placeholder, activeColor }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected   = options.find(o => String(o.user_id) === String(value));
  const isDisabled = loading || disabled;

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 9999 : 'auto' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {icon}{label}
        {loading && <div style={{ width: 9, height: 9, border: `2px solid ${activeColor}30`, borderTopColor: activeColor, borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginLeft: 2 }} />}
      </label>
      <div onClick={() => { if (!isDisabled) setOpen(o => !o); }}
        style={{ width: '100%', minHeight: 42, padding: '9px 38px 9px 12px', border: `1.5px solid ${open ? activeColor : value ? activeColor + '80' : '#e5e7eb'}`, borderRadius: 8, fontSize: 13, fontWeight: value ? 600 : 400, color: isDisabled ? '#9ca3af' : value ? '#111827' : '#9ca3af', background: isDisabled ? '#f9fafb' : '#fff', cursor: isDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', boxShadow: open ? `0 0 0 3px ${activeColor}20` : 'none', transition: 'all 0.15s', boxSizing: 'border-box', userSelect: 'none', position: 'relative' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loading ? <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 12 }}>Loading…</span> : selected ? selected.label : <span style={{ color: '#9ca3af', fontSize: 12 }}>{placeholder || `Select ${label}`}</span>}
        </span>
        {value && !loading && (
          <div style={{ position: 'absolute', right: 34, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: '50%', background: activeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
        )}
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, transition: 'transform 0.2s', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={open ? activeColor : isDisabled ? '#d1d5db' : '#6b7280'} strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>
      {open && !isDisabled && (
        <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, background: '#fff', border: `1.5px solid ${activeColor}40`, borderRadius: 10, boxShadow: '0 20px 48px rgba(0,0,0,0.22)', zIndex: 99999, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{options.length} {label.toLowerCase()}{options.length !== 1 ? 's' : ''} available</span>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {options.length === 0 ? (
              <div style={{ padding: '18px 14px', fontSize: 12, color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' }}>No {label.toLowerCase()}s found</div>
            ) : options.map((opt, idx) => {
              const isSel = String(opt.user_id) === String(value);
              return (
                <div key={opt.user_id} onClick={() => { onChange(String(opt.user_id)); setOpen(false); }}
                  style={{ padding: '10px 14px', fontSize: 13, fontWeight: isSel ? 700 : 500, color: isSel ? '#fff' : '#111827', background: isSel ? `linear-gradient(135deg,${activeColor},${activeColor}dd)` : '#fff', borderBottom: idx < options.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = `${activeColor}12`; e.currentTarget.style.color = activeColor; } }}
                  onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#111827'; } }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: isSel ? 'rgba(255,255,255,0.22)' : `${activeColor}15`, border: `1.5px solid ${isSel ? 'rgba(255,255,255,0.35)' : activeColor + '30'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: isSel ? '#fff' : activeColor }}>
                      {opt.label?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'inherit' }}>{opt.label}</span>
                  </div>
                  {isSel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const FilterModal = ({ isOpen, onClose, onApply, activeColor, currentRole }) => {
  const [admins,  setAdmins]  = useState([]);
  const [dealers, setDealers] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [selectedAdmin,  setSelectedAdmin]  = useState('');
  const [selectedDealer, setSelectedDealer] = useState('');
  const [selectedUser,   setSelectedUser]   = useState('');
  const [loadingAdmins,  setLoadingAdmins]  = useState(false);
  const [loadingDealers, setLoadingDealers] = useState(false);
  const [loadingUsers,   setLoadingUsers]   = useState(false);
  const [adminError,     setAdminError]     = useState('');
  const [dealerError,    setDealerError]    = useState('');
  const [userError,      setUserError]      = useState('');
  const [visible, setVisible] = useState(false);

  const isSuperAdmin  = currentRole === 'super_admin';
  const isAdmin       = currentRole === 'admin';
  const isDealer      = currentRole === 'dealer';
  const canSeeAdmins  = isSuperAdmin;
  const canSeeDealers = isSuperAdmin || isAdmin;
  const canSeeUsers   = isSuperAdmin || isAdmin || isDealer;

  useEffect(() => { if (isOpen) setTimeout(() => setVisible(true), 10); else setVisible(false); }, [isOpen]);
  useEffect(() => {
    if (!isOpen) { setAdmins([]); setDealers([]); setUsers([]); setSelectedAdmin(''); setSelectedDealer(''); setSelectedUser(''); setAdminError(''); setDealerError(''); setUserError(''); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !canSeeAdmins) return;
    setLoadingAdmins(true); setAdminError('');
    apiFetch(`${API_BASE}/dashboard/filters/admins`)
      .then(({ ok, data, status, error }) => { if (ok && data?.success) setAdmins(data.admins || []); else setAdminError(data?.message || `Failed (${status || error})`); })
      .finally(() => setLoadingAdmins(false));
  }, [isOpen, canSeeAdmins]);

  useEffect(() => {
    if (!isOpen || !canSeeDealers) return;
    if (isSuperAdmin && admins.length > 0 && !selectedAdmin) { setDealers([]); return; }
    setLoadingDealers(true); setDealerError('');
    const qs = selectedAdmin ? `?adminId=${selectedAdmin}` : '';
    apiFetch(`${API_BASE}/dashboard/filters/dealers${qs}`)
      .then(({ ok, data, status, error }) => { if (ok && data?.success) setDealers(data.dealers || []); else setDealerError(data?.message || `Failed (${status || error})`); })
      .finally(() => setLoadingDealers(false));
  }, [isOpen, canSeeDealers, isSuperAdmin, admins.length, selectedAdmin]);

  useEffect(() => {
    if (!isOpen || !canSeeUsers) return;
    if (!isDealer && dealers.length > 0 && !selectedDealer) { setUsers([]); return; }
    setLoadingUsers(true); setUserError('');
    const params = new URLSearchParams();
    if (selectedDealer) params.set('dealerId', selectedDealer);
    if (selectedAdmin)  params.set('adminId',  selectedAdmin);
    apiFetch(`${API_BASE}/dashboard/filters/users${params.toString() ? `?${params}` : ''}`)
      .then(({ ok, data, status, error }) => { if (ok && data?.success) setUsers(data.users || []); else setUserError(data?.message || `Failed (${status || error})`); })
      .finally(() => setLoadingUsers(false));
  }, [isOpen, canSeeUsers, isDealer, dealers.length, selectedDealer, selectedAdmin]);

  const handleAdminChange  = v => { setSelectedAdmin(v);  setSelectedDealer(''); setSelectedUser(''); setDealers([]); setUsers([]); };
  const handleDealerChange = v => { setSelectedDealer(v); setSelectedUser(''); setUsers([]); };
  const handleApply        = () => { onApply({ admin: selectedAdmin, dealer: selectedDealer, user: selectedUser }); onClose(); };

  const AdminIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
  const DealerIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  const UserIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
  const ErrorMsg   = ({ msg }) => msg ? <div style={{ marginTop: 6, padding: '6px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, fontSize: 11, color: '#dc2626' }}>{msg}</div> : null;

  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.2s ease' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 520, maxWidth: 'calc(100vw - 32px)', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'visible', transform: visible ? 'translateY(0) scale(1)' : 'translateY(-20px) scale(0.97)', transition: 'transform 0.2s ease' }}>
        <div style={{ background: `linear-gradient(135deg,${activeColor},${activeColor}cc)`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px 12px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            </div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Filter Vehicles</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {canSeeAdmins  && <><FilterSelect label="Admin"  icon={<AdminIcon />}  value={selectedAdmin}  onChange={handleAdminChange}  options={admins}  loading={loadingAdmins}  disabled={false}                                                      placeholder="Select Admin"  activeColor={activeColor} /><ErrorMsg msg={adminError}  /></>}
          {canSeeDealers && <><FilterSelect label="Dealer" icon={<DealerIcon />} value={selectedDealer} onChange={handleDealerChange} options={dealers} loading={loadingDealers} disabled={isSuperAdmin && admins.length > 0 && !selectedAdmin}        placeholder={isSuperAdmin && !selectedAdmin ? '— Select an Admin first —' : 'Select Dealer'} activeColor={activeColor} /><ErrorMsg msg={dealerError} /></>}
          {canSeeUsers   && <><FilterSelect label="User"   icon={<UserIcon />}   value={selectedUser}   onChange={setSelectedUser}    options={users}   loading={loadingUsers}   disabled={!isDealer && dealers.length > 0 && !selectedDealer}          placeholder="Select User"   activeColor={activeColor} /><ErrorMsg msg={userError}   /></>}
          {!canSeeAdmins && !canSeeDealers && !canSeeUsers && <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>No filters available for your role.</div>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 12px 12px', display: 'flex' }}>
          <button onClick={handleApply} style={{ padding: '8px 24px', background: activeColor, border: 'none', borderRadius: 6, fontSize: 12, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Apply Filter</button>
        </div>
      </div>
    </div>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const theme       = useTheme();
  const activeColor = theme?.activeColor || '#4f46e5';

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
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [appliedFilters,  setAppliedFilters]  = useState({ admin: '', dealer: '', user: '' });
  const [popupVehicle,    setPopupVehicle]    = useState(null);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const socketLiveRef    = useRef(false);
  const failCountRef     = useRef(0);
  const activeFiltersRef = useRef({ admin: '', dealer: '', user: '' });
  const vehiclesRef      = useRef([]);
  const filteredKeysRef  = useRef(new Set());
  const fetchAbortRef    = useRef(null);
  const popupTimerRef    = useRef(null);
  const MAX_SILENT_FAILS = 99;

  // ── Theme CSS var ────────────────────────────────────────────────────────────
  useEffect(() => { document.documentElement.style.setProperty('--theme-color', activeColor); }, [activeColor]);
  useEffect(() => { if (hasData && initialLoading) setInitialLoading(false); }, [hasData, initialLoading]);
  useEffect(() => { activeFiltersRef.current = appliedFilters; }, [appliedFilters]);

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

  // ── Build query string from filters ─────────────────────────────────────────
  const buildQS = useCallback(filters => {
    const p = new URLSearchParams();
    if (filters?.admin)  p.set('adminId',  filters.admin);
    if (filters?.dealer) p.set('dealerId', filters.dealer);
    if (filters?.user)   p.set('userId',   filters.user);
    return p.toString();
  }, []);

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
  const fetchAll = useCallback(async (isFirst = false, overrideFilters = null) => {
    // Guard: agar pehle se data hai, socket live hai, aur filter nahi laga toh skip karo
    if (
      !isFirst &&
      _vehicleStore.initialFetchDone &&
      socketLiveRef.current &&
      overrideFilters === null
    ) return;

    const filters = overrideFilters !== null ? overrideFilters : activeFiltersRef.current;
    const qs  = buildQS(filters);
    const url = `${API_BASE}/dashboard/vehicles${qs ? `?${qs}` : ''}`;
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
      _vehicleStore.initialFetchDone = true;        // ✅ hai?
      const vehicles = data.data || [];
      const hasFilter = !!(filters.admin || filters.dealer || filters.user);
      _vehicleStore.setAllowedKeys(hasFilter ? vehicles.map(v => v.vehicle) : null);
      _vehicleStore.replaceAll(vehicles);
      if (data.stats) {
        _vehicleStore.setStats(data.stats);         // ✅ backend stats trusted
      } else {
        _vehicleStore.recalcStats();                // fallback only
      }
    }
    if (isFirst) setInitialLoading(false);
    setFilterLoading(false);
  }, [buildQS]);

  // ── Filter apply ─────────────────────────────────────────────────────────────
  const handleFilterApply = useCallback(async filters => {
    setAppliedFilters(filters);
    activeFiltersRef.current = filters;
    setCurrentPage(1);
    setFilterLoading(true);
    const qs  = buildQS(filters);
    const url = `${API_BASE}/dashboard/vehicles${qs ? `?${qs}` : ''}`;
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    try {
      const { ok, data } = await apiFetch(url, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      fetchAbortRef.current = null;
      if (ok && data?.success) {
        const vehicles = data.data || [];
        const hasFilter = !!(filters.admin || filters.dealer || filters.user);
        _vehicleStore.setAllowedKeys(hasFilter ? vehicles.map(v => v.vehicle) : null);
        _vehicleStore.replaceAll(vehicles);
        if (data.stats) _vehicleStore.setStats(data.stats); else _vehicleStore.recalcStats();
      }
    } catch (e) { if (e?.name === 'AbortError') return; }
    finally { setFilterLoading(false); }
  }, [buildQS]);

  const handleClearFilters = useCallback(() => { _vehicleStore.setAllowedKeys(null); handleFilterApply({ admin: '', dealer: '', user: '' }); }, [handleFilterApply]);

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (_vehicleStore.hasData) {
      // Data already hai — seedha dikhao, fetch mat karo
      setInitialLoading(false);
      vehiclesRef.current     = _vehicleStore.vehicles;
      filteredKeysRef.current = new Set(
        _vehicleStore.vehicles.filter(v => v.lat && v.lng).map(v => v.vehicle)
      );
      setSyncVersion(n => n + 1);
      return; // ✅ early return — no fetch
    }
    // Pehli baar hi fetch karo
    fetchAll(true);
  }, []); // eslint-disable-line

  // ── Polling fallback ─────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => { if (!socketLiveRef.current) fetchAll(false, null); }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  // ── Socket ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = initSocket({
      onConnect:    ()     => { socketLiveRef.current = true;  failCountRef.current = 0; setCriticalError(null); },
      onDisconnect: reason => { socketLiveRef.current = false; if (reason !== 'io client disconnect') setTimeout(() => fetchAll(false, null), 500); },
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

  const hasActiveFilter = !!(appliedFilters.admin || appliedFilters.dealer || appliedFilters.user);
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

      <FilterModal isOpen={showFilterModal} onClose={() => setShowFilterModal(false)} onApply={handleFilterApply} activeColor={activeColor} currentRole={currentRole} />

      {/* ── Top bar (shared component) ───────────────────────────────────────── */}
      <DashboardTopbar
        search={search}           onSearchChange={v => { setSearch(v); setCurrentPage(1); }}
        stats={stats}             activeFilter={activeFilter}  onFilterChange={k => { setActiveFilter(k); setCurrentPage(1); }}
        activeColor={activeColor}
        showFilter={true}         hasActiveFilter={hasActiveFilter} onFilterClick={() => setShowFilterModal(true)} onClearFilter={handleClearFilters}
        showColumns={true}        colSettings={colSettings}    onColToggle={handleColToggle}
      />

      {criticalError && (
        <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#991b1b', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <span style={{ flex: 1 }}>{criticalError}</span>
          <button onClick={() => { setCriticalError(null); failCountRef.current = 0; fetchAll(true, null); }} style={{ padding: '3px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Retry</button>
          <button onClick={() => setCriticalError(null)} style={{ padding: '3px 8px', background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0, height: 0 }}>
        <FilterLoadingOverlay visible={filterLoading} message="Applying filter, loading vehicles…" />

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