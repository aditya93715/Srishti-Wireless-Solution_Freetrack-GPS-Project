// src/pages/Devices.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useTheme } from '../../../context/ThemeContext';
import {
  getDevicesApi,
  createDeviceApi,
  updateDeviceApi,
  deleteDeviceApi,
  assignMultipleDevicesApi,
} from '../../../api/devices';
import AddDevices from '../../shared/DealerCreateButton/addDevices';

const HEADER_BG_DEFAULT = '#3d2b6b';
let HEADER_BG = HEADER_BG_DEFAULT;

const months = [
  { value: '01', label: 'January'   }, { value: '02', label: 'February' },
  { value: '03', label: 'March'     }, { value: '04', label: 'April'    },
  { value: '05', label: 'May'       }, { value: '06', label: 'June'     },
  { value: '07', label: 'July'      }, { value: '08', label: 'August'   },
  { value: '09', label: 'September' }, { value: '10', label: 'October'  },
  { value: '11', label: 'November'  }, { value: '12', label: 'December' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const SortIcon = ({ col, sortCol, sortDir }) => (
  <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.4, fontSize: 10 }}>
    {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
  </span>
);

const Badge = ({ label, color = '#1976d2' }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, background: color, color: '#fff',
    fontSize: 11, fontWeight: 700, borderRadius: 3,
  }}>
    {label}
  </span>
);

// Helper to get device IMEI from either field
const getDeviceImei = (device) => device.IMEI_No || device.imei || '—';

// Helper to get device name from either field
const getDeviceName = (device) => device.device_name || device.deviceType || '—';

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_COLS = {
  srNo: true,
  imei: true, sim: true, secondarySim: false, operator: true, secondaryOperator: false,
  type: true, client: true, ignWire: true, acWire: false,
  attendance: false, assigned: true, added: true, delete: true,
};

const COL_LABELS = {
  srNo: 'SR.NO',
  imei: 'IMEI', sim: 'SIM Number', secondarySim: 'Secondary SIM', operator: 'Operator',
  secondaryOperator: 'Secondary Operator', type: 'Device Types', client: 'Owner Name',
  ignWire: 'Ign Wire', acWire: 'AC Wire', attendance: 'Attendance',
  assigned: 'Assigned', added: 'Added', delete: 'Delete',
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const Devices = () => {
  const { user } = useAuth();
  const toast    = useToast();
  const theme    = useTheme();
  HEADER_BG = theme?.activeColor || HEADER_BG_DEFAULT;

  const [devices,       setDevices]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [dealerUsername, setDealerUsername] = useState('');

  const [filterMonth,  setFilterMonth]  = useState('');
  const [search,       setSearch]       = useState('');
  const [sortCol,     setSortCol]     = useState('added');
  const [sortDir,     setSortDir]     = useState('desc');
  const [page,        setPage]        = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_COLS);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const isDealer = (user?.role || '') === 'dealer';

  // ── Fetch dealer's own username ────────────────────────────────────────────
  useEffect(() => {
    if (!isDealer) return;
    const usernameFromCtx =
      user?.username ||
      user?.user_name ||
      user?.name ||
      '';
    if (usernameFromCtx) {
      setDealerUsername(usernameFromCtx);
      return;
    }
    const fetchDealerUsername = async () => {
      try {
        const res = await fetch(
          `/api/users/${user?.user_id}`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        const data = await res.json();
        const uname =
          data?.user?.username ||
          data?.username       ||
          data?.user?.name     ||
          '';
        setDealerUsername(uname);
      } catch (err) {
        console.warn('[Devices] Could not fetch dealer username:', err);
        setDealerUsername(String(user?.user_id || ''));
      }
    };
    fetchDealerUsername();
  }, [isDealer, user]);

  // ── Resolve the "Owner Name" for a device row ──────────────────────────────
  const resolveOwnerName = useCallback((device) => {
    if (isDealer) {
      return dealerUsername || user?.username || String(user?.user_id || '—');
    }
    return device.client || device.assignedToName || '—';
  }, [isDealer, dealerUsername, user]);

  // ── Fetch devices ──────────────────────────────────────────────────────────
  const fetchDevices = useCallback(async () => {
    if (!user?.role) return;
    setLoading(true);
    try {
      const res  = await getDevicesApi({ role: user.role, userId: user.user_id, limit: 500 });
      const list = res.data?.devices || [];
      setDevices(list);
      console.log(`[Devices] fetched ${list.length} for role=${user.role}`);
    } catch (err) {
      console.error('[Devices] fetch error:', err);
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [user?.role, user?.user_id, toast]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // ── Create / Update / Multi-assign ────────────────────────────────────────
  const handleSubmit = async (formData, currentUser, sensors = []) => {
    setSaving(true);
    try {
      if (editingDevice) {
        const deviceId = editingDevice.IMEI_No || editingDevice._id;
        await updateDeviceApi(deviceId, formData, currentUser);
        toast.success(`Device "${formData.imei || formData.device_name}" updated`);
      } else if (formData._isMulti) {
        const res     = await assignMultipleDevicesApi(formData, currentUser);
        const results = res.data?.results || {};
        const created = results.created?.length || 0;
        const skipped = results.skipped?.length || 0;
        toast.success(
          `${created} device(s) assigned` +
          (skipped > 0 ? `, ${skipped} skipped` : '')
        );
      } else {
        await createDeviceApi(formData, currentUser, sensors);
        toast.success(`Device "${formData.imei}" assigned`);
      }
      setModalOpen(false);
      setEditingDevice(null);
      fetchDevices();
    } catch (err) {
      console.error('[Devices] save error:', err);
      toast.error(err.response?.data?.message || 'Failed to save device');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (device, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete device ${getDeviceImei(device)}? This cannot be undone.`)) return;
    try {
      setDevices(prev => prev.filter(d => d._id !== device._id));
      const deviceId = device.IMEI_No || device._id;
      await deleteDeviceApi(deviceId, user);
      toast.success(`Device "${getDeviceImei(device)}" deleted`);
    } catch (err) {
      fetchDevices();
      toast.error(err.response?.data?.message || 'Failed to delete device');
    }
  };

  const handleReset = () => { setFilterMonth(''); setSearch(''); setPage(1); };

  // ── Filter + sort + paginate ───────────────────────────────────────────────
  const filtered = devices
    .filter(d => {
      if (filterMonth) {
        const m = String(new Date(d.createdAt || d.assignedAt || Date.now()).getMonth() + 1).padStart(2, '0');
        if (m !== filterMonth) return false;
      }
      if (search) {
        const q          = search.toLowerCase();
        const imei       = (d.IMEI_No || d.imei || '').toLowerCase();
        const sim        = (d.sim_card || '').toLowerCase();
        const operator   = (d.simOperator || '').toLowerCase();
        const deviceName = (d.device_name || d.deviceType || '').toLowerCase();
        const ownerName  = resolveOwnerName(d).toLowerCase();
        return imei.includes(q) || sim.includes(q) || operator.includes(q) ||
          deviceName.includes(q) || ownerName.includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const fieldMap = {
        imei:     (d) => d.IMEI_No || d.imei || '',
        sim:      'sim_card',
        operator: 'simOperator',
        type:     (d) => d.device_name || d.deviceType || '',
        client:   (d) => resolveOwnerName(d),
        added:    (d) => d.createdAt || d.assignedAt || '',
      };
      let va, vb;
      if (typeof fieldMap[sortCol] === 'function') {
        va = fieldMap[sortCol](a);
        vb = fieldMap[sortCol](b);
      } else if (fieldMap[sortCol]) {
        va = a[fieldMap[sortCol]] ?? '';
        vb = b[fieldMap[sortCol]] ?? '';
      } else {
        va = a.createdAt || a.assignedAt || '';
        vb = b.createdAt || b.assignedAt || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 :  1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated  = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const toggleCol = (k) => setVisibleCols(p => ({ ...p, [k]: !p[k] }));

  const ownerColHeader =
    isDealer                       ? 'Owner Name'
    : user?.role === 'super_admin' ? 'Admin'
    : user?.role === 'admin'       ? 'Dealer'
    : 'Account';

  const scopeNote =
    user?.role === 'super_admin' ? 'devices of all your admins'
    : user?.role === 'admin'     ? 'devices of your dealers'
    : user?.role === 'dealer'    ? 'your own devices' : '';

  const emptyMessage = (() => {
    if (filtered.length === 0 && devices.length > 0) return 'No devices match your filters';
    if (user?.role === 'super_admin') return 'No devices assigned to any admin yet. Click "Add" to assign a device.';
    if (user?.role === 'admin')       return 'No devices assigned to your dealers yet. Click "Add" to assign a device.';
    if (user?.role === 'dealer')      return 'No devices in your account. Click "Add" to add one.';
    return 'No devices found.';
  })();

  const visibleCount = Object.values(visibleCols).filter(Boolean).length;

  const prepareEditingDevice = (device) => ({
    ...device,
    imei:        device.IMEI_No || device.imei,
    device_name: device.device_name || device.deviceType,
    deviceType:  device.device_name || device.deviceType,
    sensors:     device.sensors || [],
  });

  // ── Styles ─────────────────────────────────────────────────────────────────
  const thStyle = {
    padding: '9px 12px',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: HEADER_BG,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    cursor: 'pointer',
    position: 'sticky',
    top: 0,
    zIndex: 2,
    borderRight: '1px solid rgba(255,255,255,0.1)',
  };

  const tdStyle = {
    padding: '9px 12px',
    fontSize: 12,
    textAlign: 'center',
    borderBottom: '1px solid #edf0f4',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    color: '#1e293b',
  };

  const selStyle = {
    height: 36, padding: '0 28px 0 10px', fontSize: 13,
    border: '1px solid #d0d7de', borderRadius: 3,
    background: '#fff', color: '#374151', cursor: 'pointer',
    appearance: 'none', outline: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 16, minWidth: 130,
  };

  return (
    <div style={{ padding: '0', background: '#f4f6f9', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0 10px', height: 36, borderRadius: 3, minWidth: 240 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            placeholder="Search IMEI, SIM, owner…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, width: '100%' }}
          />
        </div>

        <select style={{ ...selStyle, minWidth: 150 }} value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}>
          <option value="">All Months</option>
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <button
          onClick={handleReset}
          style={{ height: 36, padding: '0 16px', background: '#fff', border: '1px solid #d0d7de', borderRadius: 3, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Reset
        </button>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>Rows:</span>
          <select
            value={rowsPerPage}
            onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            style={{ height: 36, padding: '0 8px', border: '1px solid #e2e8f0', fontSize: 13, borderRadius: 3 }}>
            {[15, 25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setColMenuOpen(v => !v)}
            style={{ height: 36, padding: '0 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 3, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Columns ▾
          </button>
          {colMenuOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 3, zIndex: 200, minWidth: 170, padding: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 300, overflowY: 'auto' }}>
              {Object.keys(visibleCols).map(k => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={visibleCols[k]} onChange={() => toggleCol(k)} style={{ accentColor: HEADER_BG }}/>
                  {k === 'client' ? ownerColHeader : COL_LABELS[k]}
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => { setEditingDevice(null); setModalOpen(true); }}
          style={{ height: 36, padding: '0 20px', background: HEADER_BG, border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add
        </button>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto', background: '#fff', borderTop: 'none', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              {visibleCols.srNo && <th style={thStyle}>SR.NO</th>}
              {visibleCols.client && (
                <th style={thStyle} onClick={() => handleSort('client')}>
                  {ownerColHeader} <SortIcon col="client" sortCol={sortCol} sortDir={sortDir}/>
                </th>
              )}
              {visibleCols.imei && <th style={thStyle} onClick={() => handleSort('imei')}>IMEI <SortIcon col="imei" sortCol={sortCol} sortDir={sortDir}/></th>}
              {visibleCols.sim && <th style={thStyle} onClick={() => handleSort('sim')}>SIM Number <SortIcon col="sim" sortCol={sortCol} sortDir={sortDir}/></th>}
              {visibleCols.secondarySim && <th style={{ ...thStyle, cursor: 'default' }}>Secondary SIM</th>}
              {visibleCols.operator && <th style={thStyle} onClick={() => handleSort('operator')}>Operator <SortIcon col="operator" sortCol={sortCol} sortDir={sortDir}/></th>}
              {visibleCols.secondaryOperator && <th style={{ ...thStyle, cursor: 'default' }}>Secondary Operator</th>}
              {visibleCols.type && <th style={thStyle} onClick={() => handleSort('type')}>Device Types<SortIcon col="type" sortCol={sortCol} sortDir={sortDir}/></th>}
              {visibleCols.ignWire && <th style={{ ...thStyle, textAlign: 'center', cursor: 'default' }}>Ign Wire</th>}
              {visibleCols.acWire && <th style={{ ...thStyle, textAlign: 'center', cursor: 'default' }}>AC Wire</th>}
              {visibleCols.attendance && <th style={{ ...thStyle, textAlign: 'center', cursor: 'default' }}>Attendance</th>}
              {visibleCols.assigned && <th style={{ ...thStyle, textAlign: 'center', cursor: 'default' }}>Assigned</th>}
              {visibleCols.added && <th style={thStyle} onClick={() => handleSort('added')}>Added <SortIcon col="added" sortCol={sortCol} sortDir={sortDir}/></th>}
              {visibleCols.delete && <th style={{ ...thStyle, textAlign: 'center', cursor: 'default' }}>Delete</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleCount} style={{ padding: 50, textAlign: 'center' }}>
                  <div style={{ display: 'inline-block', width: 28, height: 28, border: `3px solid #e2e8f0`, borderTopColor: HEADER_BG, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                  <div style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>Loading devices…</div>
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={visibleCount} style={{ padding: 50, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : paginated.map((d, idx) => {
              const serialNumber = (page - 1) * rowsPerPage + idx + 1;
              return (
                <tr
                  key={d._id}
                  style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfc', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc'}
                  onClick={() => { setEditingDevice(prepareEditingDevice(d)); setModalOpen(true); }}>

                  {visibleCols.srNo && <td style={tdStyle}>{serialNumber}</td>}

                  {visibleCols.client && (
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '2px 10px',
                        background: isDealer ? '#eff6ff' : '#f0fdf4',
                        color:      isDealer ? '#1d4ed8' : '#15803d',
                        border:     `1px solid ${isDealer ? '#bfdbfe' : '#bbf7d0'}`,
                        borderRadius: 3, fontSize: 12, fontWeight: 500,
                      }}>
                        {isDealer && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                        )}
                        {resolveOwnerName(d)}
                      </span>
                    </td>
                  )}

                  {visibleCols.imei && (
                    <td style={{ ...tdStyle, color: '#1976d2', fontWeight: 600, fontFamily: 'monospace' }}>
                      {getDeviceImei(d)}
                    </td>
                  )}
                  {visibleCols.sim            && <td style={tdStyle}>{d.sim_card || '—'}</td>}
                  {visibleCols.secondarySim   && <td style={tdStyle}>{d.secondarySimCard || '—'}</td>}
                  {visibleCols.operator       && <td style={tdStyle}>{d.simOperator || '—'}</td>}
                  {visibleCols.secondaryOperator && <td style={tdStyle}>{d.secondarySimOperator || '—'}</td>}

                  {visibleCols.type && (
                    <td style={tdStyle}>
                      {getDeviceName(d) !== '—'
                        ? <span style={{ padding: '2px 8px', background: '#ede9fe', color: '#5b21b6', borderRadius: 3, fontSize: 12 }}>{getDeviceName(d)}</span>
                        : '—'}
                    </td>
                  )}

                  {visibleCols.ignWire && (
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <Badge label={d.ignitionWirePlus ? 'C' : 'N'} color={d.ignitionWirePlus ? '#1976d2' : '#90a4ae'}/>
                    </td>
                  )}
                  {visibleCols.acWire && (
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <Badge label={d.acWirePlus ? 'C' : 'N'} color={d.acWirePlus ? '#1976d2' : '#90a4ae'}/>
                    </td>
                  )}
                  {visibleCols.attendance && (
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <Badge label={d.attendance ? 'Y' : 'N'} color={d.attendance ? '#2e7d32' : '#90a4ae'}/>
                    </td>
                  )}
                  {visibleCols.assigned && (
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <Badge label={d.assigned ? 'Y' : 'N'} color={d.assigned ? '#2e7d32' : '#90a4ae'}/>
                    </td>
                  )}
                  {visibleCols.added && (
                    <td style={tdStyle}>
                      {d.createdAt  ? new Date(d.createdAt).toLocaleDateString('en-IN')  :
                       d.assignedAt ? new Date(d.assignedAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                  )}
                  {visibleCols.delete && (
                    <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => handleDelete(d, e)}
                        title="Delete device"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/>
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#fff', borderTop: '1px solid #e2e8f0', fontSize: 13, flexShrink: 0 }}>
        <span style={{ color: '#64748b' }}>
          Showing{' '}
          <strong>{filtered.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)}</strong>
          {' '}of <strong>{filtered.length}</strong> devices
          {scopeNote && <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 12 }}>({scopeNote})</span>}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ label: '«', action: () => setPage(1), disabled: page === 1 }, { label: '‹', action: () => setPage(p => p - 1), disabled: page === 1 }].map(btn => (
            <button key={btn.label} onClick={btn.action} disabled={btn.disabled}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 3, background: btn.disabled ? '#f5f5f5' : '#fff', cursor: btn.disabled ? 'not-allowed' : 'pointer' }}>
              {btn.label}
            </button>
          ))}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
            return (
              <button key={p} onClick={() => setPage(p)}
                style={{ padding: '5px 11px', border: '1px solid #e2e8f0', borderRadius: 3,
                  background: p === page ? HEADER_BG : '#fff', color: p === page ? '#fff' : '#1e293b', fontWeight: p === page ? 600 : 400 }}>
                {p}
              </button>
            );
          })}
          {[{ label: '›', action: () => setPage(p => p + 1), disabled: page === totalPages }, { label: '»', action: () => setPage(totalPages), disabled: page === totalPages }].map(btn => (
            <button key={btn.label} onClick={btn.action} disabled={btn.disabled}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 3, background: btn.disabled ? '#f5f5f5' : '#fff', cursor: btn.disabled ? 'not-allowed' : 'pointer' }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Modal ────────────────────────────────────────────────────────── */}
      <AddDevices
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingDevice(null); }}
        onSubmit={handleSubmit}
        editDevice={editingDevice}
        currentUser={user}
        loading={saving}
        onSensorsUpdate={updated => {
          if (editingDevice) {
            setEditingDevice(prev => ({ ...prev, sensors: updated }));
            setDevices(prev => prev.map(d =>
              d._id === editingDevice._id ? { ...d, sensors: updated } : d
            ));
          }
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Devices;