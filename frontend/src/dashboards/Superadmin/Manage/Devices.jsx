import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useTheme } from '../../../context/ThemeContext';
import { getDevicesApi } from '../../../api/devices';
import {
  fetchAdmins,
  fetchDealers,
  fetchUsers,
} from '../../../api/vehicleApi';

const HEADER_BG_DEFAULT = '#3d2b6b';
const ACCENT_DEFAULT    = '#3d2b6b';
let HEADER_BG = HEADER_BG_DEFAULT;
let ACCENT    = ACCENT_DEFAULT;

const months = [
  { value: '01', label: 'January'   }, { value: '02', label: 'February' },
  { value: '03', label: 'March'     }, { value: '04', label: 'April'    },
  { value: '05', label: 'May'       }, { value: '06', label: 'June'     },
  { value: '07', label: 'July'      }, { value: '08', label: 'August'   },
  { value: '09', label: 'September' }, { value: '10', label: 'October'  },
  { value: '11', label: 'November'  }, { value: '12', label: 'December' },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const getDeviceImei = d => d.IMEI_No || d.imei || '—';
const getDeviceName = d => d.device_name || d.deviceType || '—';

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const SortIcon = ({ col, sortCol, sortDir }) => (
  <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.4, fontSize: 10 }}>
    {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
  </span>
);

const FlagBadge = ({ val }) => (
  <span style={{
    display: 'inline-block', width: 22, height: 22, lineHeight: '22px',
    textAlign: 'center', borderRadius: 3, fontSize: 11, fontWeight: 700,
    background: val ? '#dbeafe' : '#f1f5f9',
    color: val ? '#1976d2' : '#94a3b8',
  }}>
    {val ? 'Y' : 'N'}
  </span>
);

const NameBadge = ({ name, loading, bg = '#f1f5f9', border = '#e2e8f0', color = '#475569' }) => {
  if (loading) {
    return (
      <span style={{ color: '#94a3b8', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
          border: `2px solid #e2e8f0`, borderTopColor: ACCENT,
          animation: 'saDSpin .7s linear infinite',
        }} />…
      </span>
    );
  }
  if (!name) return <span style={{ color: '#d1d5db' }}>—</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '2px 10px', background: bg,
      border: `1px solid ${border}`, borderRadius: 10,
      fontSize: 11, fontWeight: 600, color,
      whiteSpace: 'nowrap',
    }}>
      {name}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_COLS = {
  srNo:                 true,
  admin:                true,
  dealer:               true,
  user:                 true,
  imei:                 true,
  sim_card:             true,
  simOperator:          true,
  secondarySimCard:     false,
  secondarySimOperator: false,
  device_name:          true,
  ignitionWirePlus:     true,
  ignitionWireNotConnected: false,
  acWirePlus:           false,
  attendance:           false,
  timezoneSetting:      false,
  added:                true,
};

const COL_LABELS = {
  srNo:                 'SR.NO',
  admin:                'Admin',
  dealer:               'Dealer',
  user:                 'User',
  imei:                 'IMEI No',
  sim_card:             'SIM Number',
  simOperator:          'SIM Operator',
  secondarySimCard:     'Secondary SIM',
  secondarySimOperator: 'Secondary Operator',
  device_name:          'Device Type',
  ignitionWirePlus:     'Ignition Wire (+)',
  ignitionWireNotConnected: 'Ignition Wire NC',
  acWirePlus:           'AC Wire (+)',
  attendance:           'Attendance',
  timezoneSetting:      'Timezone Setting',
  added:                'Created',
};

const SORTABLE = new Set(['imei', 'sim_card', 'simOperator', 'device_name', 'added']);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const DevicesSuperAdmin = () => {
  const { user } = useAuth();
  const toast    = useToast();
  const theme    = useTheme();
  HEADER_BG = theme?.activeColor || HEADER_BG_DEFAULT;
  ACCENT    = theme?.activeColor || ACCENT_DEFAULT;

  const [devices,      setDevices]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [namesLoading, setNamesLoading] = useState(false);

  const [adminNames,  setAdminNames]  = useState({});
  const [dealerNames, setDealerNames] = useState({});
  const [userNames,   setUserNames]   = useState({});

  const [filterMonth,  setFilterMonth]  = useState('');
  const [search,       setSearch]       = useState('');

  const [sortCol,     setSortCol]     = useState('added');
  const [sortDir,     setSortDir]     = useState('desc');
  const [page,        setPage]        = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  const [visibleCols, setVisibleCols] = useState(DEFAULT_COLS);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  // Close column picker on outside click
  useEffect(() => {
    if (!colMenuOpen) return;
    const h = e => { if (!e.target.closest('[data-colmenu]')) setColMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [colMenuOpen]);

  // ── Fetch devices ──────────────────────────────────────────────────────────
  const fetchDevices = useCallback(async () => {
    if (!user?.role) return;
    setLoading(true);
    try {
      const res = await getDevicesApi({ role: user.role, userId: user.user_id, limit: 500 });
      setDevices(res.data?.devices || []);
    } catch (err) {
      console.error('[DevicesSA] fetch error:', err);
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [user?.role, user?.user_id, toast]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // ── Build all three name maps after devices load ───────────────────────────
  useEffect(() => {
    if (devices.length === 0) {
      setAdminNames({});
      setDealerNames({});
      setUserNames({});
      return;
    }

    const uniqueAdminIds  = [...new Set(devices.map(d => d.adminId).filter(Boolean))];
    const uniqueDealerIds = [...new Set(devices.map(d => d.dealerId).filter(Boolean))];

    setNamesLoading(true);

    const run = async () => {
      const aMap = {};
      const dMap = {};
      const uMap = {};

      try {
        try {
          const admins = await fetchAdmins();
          admins.forEach(a => {
            aMap[a.user_id] = a.username || a.fullName || String(a.user_id);
          });
        } catch (_) { /* 403 or network — silently skip */ }

        await Promise.all(
          uniqueAdminIds.map(async adminId => {
            try {
              const dealers = await fetchDealers(adminId);
              dealers.forEach(d => {
                dMap[d.user_id] = d.username || d.fullName || String(d.user_id);
              });
            } catch (_) { /* skip */ }
          })
        );

        await Promise.all(
          uniqueDealerIds.map(async dealerId => {
            try {
              const users = await fetchUsers(dealerId);
              users.forEach(u => {
                uMap[u.user_id] = u.username || u.fullName || String(u.user_id);
              });
            } catch (_) { /* skip */ }
          })
        );
      } catch (err) {
        console.error('[DevicesSA fetchUsernames]', err);
      } finally {
        setAdminNames(aMap);
        setDealerNames(dMap);
        setUserNames(uMap);
        setNamesLoading(false);
      }
    };

    run();
  }, [devices]);

  // ── Filter + sort + paginate ───────────────────────────────────────────────
  const filtered = devices
    .filter(d => {
      if (filterMonth) {
        const m = String(
          new Date(d.createdAt || d.assignedAt || Date.now()).getMonth() + 1
        ).padStart(2, '0');
        if (m !== filterMonth) return false;
      }
      if (search) {
        const q       = search.toLowerCase();
        const adminN  = (adminNames[d.adminId]                           || '').toLowerCase();
        const dealerN = (dealerNames[d.dealerId]                         || '').toLowerCase();
        const userN   = (userNames[d.userId ?? d.user_id]                || '').toLowerCase();
        return (
          (d.IMEI_No       || '').toLowerCase().includes(q) ||
          (d.sim_card      || '').toLowerCase().includes(q) ||
          (d.simOperator   || '').toLowerCase().includes(q) ||
          (d.device_name   || d.deviceType || '').toLowerCase().includes(q) ||
          adminN.includes(q) || dealerN.includes(q) || userN.includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const valOf = {
        imei:        d => d.IMEI_No || '',
        sim_card:    d => d.sim_card || '',
        simOperator: d => d.simOperator || '',
        device_name: d => d.device_name || d.deviceType || '',
        added:       d => d.createdAt || d.assignedAt || '',
      };
      const fn = valOf[sortCol] || valOf.added;
      const va = fn(a), vb = fn(b);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated  = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const handleSort = col => {
    if (!SORTABLE.has(col)) return;
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const toggleCol    = k => setVisibleCols(p => ({ ...p, [k]: !p[k] }));
  const handleReset  = () => { setFilterMonth(''); setSearch(''); setPage(1); };
  const visibleCount = Object.values(visibleCols).filter(Boolean).length;

  // ── Table styles ───────────────────────────────────────────────────────────
  const thBase = {
    padding: '9px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700,
    color: '#fff', background: HEADER_BG, whiteSpace: 'nowrap',
    userSelect: 'none', position: 'sticky', top: 0, zIndex: 2,
    borderRight: '1px solid rgba(255,255,255,0.1)',
  };
  const thSort = { ...thBase, cursor: 'pointer' };
  const tdBase = {
    padding: '9px 12px', fontSize: 12, textAlign: 'center',
    borderBottom: '1px solid #edf0f4', verticalAlign: 'middle',
    whiteSpace: 'nowrap', color: '#1e293b',
  };
  const selStyle = {
    height: 36, padding: '0 28px 0 10px', fontSize: 13,
    border: '1px solid #d0d7de', borderRadius: 3,
    background: '#fff', color: '#374151', cursor: 'pointer',
    appearance: 'none', outline: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
    backgroundSize: 14, minWidth: 130,
  };

  return (
    <div style={{ padding: '0', background: '#f4f6f9', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0',
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#f8fafc', border: '1px solid #e2e8f0',
          padding: '0 10px', height: 36, borderRadius: 3, minWidth: 300, flex: '0 1 340px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            placeholder="Search IMEI, SIM, admin, dealer, user, device name…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, width: '100%', color: '#1e293b' }}
          />
          {search && (
            <button type="button" onClick={() => { setSearch(''); setPage(1); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
          )}
        </div>

        <select style={{ ...selStyle, minWidth: 150 }} value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}>
          <option value="">All Months</option>
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <button type="button" onClick={handleReset}
          style={{ height: 36, padding: '0 14px', background: '#fff', border: '1px solid #d0d7de', borderRadius: 3, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#374151' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Reset
        </button>

        <button type="button" onClick={fetchDevices} disabled={loading}
          style={{ height: 36, padding: '0 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 3, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#374151', opacity: loading ? 0.6 : 1 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation: loading ? 'saDSpin .8s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>

        <div style={{ flex: 1 }} />

        {/* Names loading indicator */}
        {namesLoading && (
          <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: ACCENT, animation: 'saDSpin .7s linear infinite' }} />
            Loading names…
          </span>
        )}

        <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
          {filtered.length !== devices.length
            ? <><strong style={{ color: '#1e293b' }}>{filtered.length}</strong> / {devices.length} devices</>
            : <><strong style={{ color: '#1e293b' }}>{devices.length}</strong> device{devices.length !== 1 ? 's' : ''}</>}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>Rows:</span>
          <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            style={{ height: 36, padding: '0 8px', border: '1px solid #e2e8f0', fontSize: 13, borderRadius: 3, outline: 'none' }}>
            {[15, 25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Column picker */}
        <div style={{ position: 'relative' }} data-colmenu>
          <button type="button" onClick={() => setColMenuOpen(v => !v)}
            style={{
              height: 36, padding: '0 14px',
              background: colMenuOpen ? '#f0f4ff' : '#fff',
              border: `1px solid ${colMenuOpen ? ACCENT : '#e2e8f0'}`,
              borderRadius: 3, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, color: '#334155',
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6"  x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6"  x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Columns ▾
          </button>
          {colMenuOpen && (
            <div data-colmenu style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 3,
              zIndex: 500, minWidth: 220, padding: '6px 0',
              boxShadow: '0 8px 24px rgba(0,0,0,0.13)', maxHeight: 360, overflowY: 'auto',
            }}>
              <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Toggle Columns
              </div>
              {Object.keys(DEFAULT_COLS).map(k => (
                <label key={k}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: '#374151' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <input type="checkbox" checked={visibleCols[k]} onChange={() => toggleCol(k)}
                    style={{ accentColor: ACCENT, width: 14, height: 14 }} />
                  {COL_LABELS[k]}
                </label>
              ))}
            </div>
          )}
        </div>
        {/* NOTE: No Add button — SuperAdmin view is read-only */}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto', background: '#fff', borderTop: 'none', position: 'relative', zIndex: 0, flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              {visibleCols.srNo && <th style={{ ...thBase, minWidth: 60 }}>SR.NO</th>}
              {visibleCols.admin  && <th style={thBase}>Admin</th>}
              {visibleCols.dealer && <th style={thBase}>Dealer</th>}
              {visibleCols.user   && <th style={thBase}>User</th>}
              {visibleCols.imei && (
                <th style={thSort} onClick={() => handleSort('imei')}>
                  IMEI No <SortIcon col="imei" sortCol={sortCol} sortDir={sortDir}/>
                </th>
              )}
              {visibleCols.sim_card && (
                <th style={thSort} onClick={() => handleSort('sim_card')}>
                  SIM Number <SortIcon col="sim_card" sortCol={sortCol} sortDir={sortDir}/>
                </th>
              )}
              {visibleCols.simOperator && (
                <th style={thSort} onClick={() => handleSort('simOperator')}>
                  SIM Operator <SortIcon col="simOperator" sortCol={sortCol} sortDir={sortDir}/>
                </th>
              )}
              {visibleCols.secondarySimCard     && <th style={thBase}>Secondary SIM</th>}
              {visibleCols.secondarySimOperator && <th style={thBase}>Secondary Operator</th>}
              {visibleCols.device_name && (
                <th style={thSort} onClick={() => handleSort('device_name')}>
                  Device Type <SortIcon col="device_name" sortCol={sortCol} sortDir={sortDir}/>
                </th>
              )}
              {visibleCols.ignitionWirePlus         && <th style={thBase}>Ign (+)</th>}
              {visibleCols.ignitionWireNotConnected && <th style={thBase}>Ign NC</th>}
              {visibleCols.acWirePlus               && <th style={thBase}>AC Wire</th>}
              {visibleCols.attendance               && <th style={thBase}>Attendance</th>}
              {visibleCols.timezoneSetting          && <th style={thBase}>Timezone</th>}
              {visibleCols.added && (
                <th style={thSort} onClick={() => handleSort('added')}>
                  Created <SortIcon col="added" sortCol={sortCol} sortDir={sortDir}/>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleCount} style={{ padding: 50, textAlign: 'center' }}>
                  <div style={{ display: 'inline-block', width: 28, height: 28, border: `3px solid #e2e8f0`, borderTopColor: HEADER_BG, borderRadius: '50%', animation: 'saDSpin .7s linear infinite' }} />
                  <div style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>Loading devices…</div>
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={visibleCount} style={{ padding: 56, textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                      <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    <span style={{ fontSize: 14, color: '#9ca3af' }}>
                      {devices.length === 0 ? 'No devices found.' : 'No devices match your filters.'}
                    </span>
                    {(search || filterMonth) && (
                      <button type="button" onClick={handleReset}
                        style={{ fontSize: 12, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Clear filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((d, idx) => {
                const isEven     = idx % 2 === 0;
                const serialNo   = (page - 1) * rowsPerPage + idx + 1;

                const adminName  = adminNames[d.adminId]                ?? null;
                const dealerName = dealerNames[d.dealerId]              ?? null;
                const userName   = userNames[d.userId ?? d.user_id]     ?? null;

                return (
                  <tr key={d._id || d.IMEI_No || idx}
                    style={{ background: isEven ? '#fff' : '#fafbfc', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                    onMouseLeave={e => e.currentTarget.style.background = isEven ? '#fff' : '#fafbfc'}>

                    {visibleCols.srNo && (
                      <td style={{ ...tdBase, fontWeight: 600, color: '#64748b' }}>{serialNo}</td>
                    )}

                    {visibleCols.admin && (
                      <td style={tdBase}>
                        <NameBadge
                          name={adminName || null}
                          loading={namesLoading && !!d.adminId && !adminName}
                          bg="#ede9fe" border="#c4b5fd" color="#5b21b6"
                        />
                      </td>
                    )}

                    {visibleCols.dealer && (
                      <td style={tdBase}>
                        <NameBadge
                          name={dealerName || null}
                          loading={namesLoading && !!d.dealerId && !dealerName}
                          bg="#f1f5f9" border="#e2e8f0" color="#475569"
                        />
                      </td>
                    )}

                    {visibleCols.user && (
                      <td style={tdBase}>
                        <NameBadge
                          name={userName || null}
                          loading={namesLoading && !!(d.userId ?? d.user_id) && !userName}
                          bg="#f0fdf4" border="#bbf7d0" color="#166534"
                        />
                      </td>
                    )}

                    {visibleCols.imei && (
                      <td style={{ ...tdBase, color: '#1976d2', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                        {getDeviceImei(d)}
                      </td>
                    )}

                    {visibleCols.sim_card && <td style={tdBase}>{d.sim_card || '—'}</td>}

                    {visibleCols.simOperator && (
                      <td style={tdBase}>
                        {d.simOperator
                          ? <span style={{ padding: '2px 8px', background: '#ede9fe', color: '#5b21b6', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{d.simOperator}</span>
                          : '—'}
                      </td>
                    )}

                    {visibleCols.secondarySimCard     && <td style={tdBase}>{d.secondarySimCard     || '—'}</td>}
                    {visibleCols.secondarySimOperator && <td style={tdBase}>{d.secondarySimOperator || '—'}</td>}

                    {visibleCols.device_name && (
                      <td style={tdBase}>
                        {getDeviceName(d) !== '—'
                          ? <span style={{ padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{getDeviceName(d)}</span>
                          : '—'}
                      </td>
                    )}

                    {visibleCols.ignitionWirePlus         && <td style={tdBase}><FlagBadge val={d.ignitionWirePlus}/></td>}
                    {visibleCols.ignitionWireNotConnected && <td style={tdBase}><FlagBadge val={d.ignitionWireNotConnected}/></td>}
                    {visibleCols.acWirePlus               && <td style={tdBase}><FlagBadge val={d.acWirePlus}/></td>}
                    {visibleCols.attendance               && <td style={tdBase}><FlagBadge val={d.attendance}/></td>}
                    {visibleCols.timezoneSetting          && <td style={tdBase}><FlagBadge val={d.timezoneSetting}/></td>}

                    {visibleCols.added && (
                      <td style={{ ...tdBase, color: '#64748b', fontSize: 12 }}>
                        {d.createdAt
                          ? new Date(d.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : d.assignedAt
                            ? new Date(d.assignedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10,
        padding: '10px 16px', background: '#fff',
        borderTop: '1px solid #e2e8f0', fontSize: 13, flexShrink: 0,
      }}>
        <span style={{ color: '#64748b' }}>
          Showing{' '}
          <strong>{filtered.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)}</strong>
          {' '}of <strong>{filtered.length}</strong> device{filtered.length !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { label: '«', action: () => setPage(1),           disabled: page === 1 },
            { label: '‹', action: () => setPage(p => p - 1), disabled: page === 1 },
          ].map(btn => (
            <button key={btn.label} type="button" onClick={btn.action} disabled={btn.disabled}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 3, background: btn.disabled ? '#f5f5f5' : '#fff', cursor: btn.disabled ? 'not-allowed' : 'pointer', color: btn.disabled ? '#cbd5e1' : '#475569' }}>
              {btn.label}
            </button>
          ))}
          {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
            const p = totalPages <= 5        ? idx + 1
                    : page <= 3              ? idx + 1
                    : page >= totalPages - 2 ? totalPages - 4 + idx
                    : page - 2 + idx;
            return (
              <button key={p} type="button" onClick={() => setPage(p)}
                style={{ padding: '5px 11px', border: '1px solid #e2e8f0', borderRadius: 3, background: p === page ? HEADER_BG : '#fff', color: p === page ? '#fff' : '#1e293b', fontWeight: p === page ? 600 : 400, cursor: 'pointer' }}>
                {p}
              </button>
            );
          })}
          {[
            { label: '›', action: () => setPage(p => p + 1), disabled: page === totalPages },
            { label: '»', action: () => setPage(totalPages), disabled: page === totalPages },
          ].map(btn => (
            <button key={btn.label} type="button" onClick={btn.action} disabled={btn.disabled}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 3, background: btn.disabled ? '#f5f5f5' : '#fff', cursor: btn.disabled ? 'not-allowed' : 'pointer', color: btn.disabled ? '#cbd5e1' : '#475569' }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <style>{`@keyframes saDSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default DevicesSuperAdmin;