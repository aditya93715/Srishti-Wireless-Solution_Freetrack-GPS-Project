import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useTheme } from '../../../context/ThemeContext';
import {
  getUsersApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
} from '../../../api/users';
import Icon from '../../../components/Icon';
import AddUser from '../../shared/DealerCreateButton/AddUser';

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);
// NEW
const StatusPill = ({ status }) => {
  const cfg = {
    Active:    { bg: '#e8f5e9', color: '#2e7d32', border: '#4caf50' },
    Inactive:  { bg: '#fff5f5', color: '#dc2626', border: '#fca5a5' },
    Suspended: { bg: '#fff5f5', color: '#dc2626', border: '#fca5a5' },
  };
  const s = cfg[status] || cfg.Inactive;
  return (
    <span style={{
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 600,
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      borderRadius: 10,
      display: 'inline-block',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
};

const SortIcon = ({ col, sortCol, sortDir }) => (
  <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.3, fontSize: 10 }}>
    {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
  </span>
);

const months = [
  { value: '01', label: 'January' },  { value: '02', label: 'February' },
  { value: '03', label: 'March' },    { value: '04', label: 'April' },
  { value: '05', label: 'May' },      { value: '06', label: 'June' },
  { value: '07', label: 'July' },     { value: '08', label: 'August' },
  { value: '09', label: 'September' },{ value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

// ══════════════════════════════════════════════════════════════════════════════
//  Dealer — User Management
// ══════════════════════════════════════════════════════════════════════════════
const UserManagement = () => {
  const { user } = useAuth();
  const toast    = useToast();
  const theme    = useTheme();
  const activeColor = theme?.activeColor || '#2c3e50';

  const [users,            setUsers]            = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [modalOpen,        setModalOpen]        = useState(false);
  const [editingUser,      setEditingUser]      = useState(null);
  const [search,           setSearch]           = useState('');
  const [statusFilter,     setStatusFilter]     = useState('ALL');
  const [selectedMonth,    setSelectedMonth]    = useState('');
  const [selectedYear,     setSelectedYear]     = useState('');
  const [sortCol,          setSortCol]          = useState('username');
  const [sortDir,          setSortDir]          = useState('asc');
  const [page,             setPage]             = useState(1);
  const [rowsPerPage,      setRowsPerPage]      = useState(10);
  const [colMenuOpen,      setColMenuOpen]      = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});

  const [visibleCols, setVisibleCols] = useState({
    sn: true,owner: true, username: true, vehicles: true, contact: true,
    phone: true, email: true, company: true, timezone: true, status: true,
    autoExp: true, subStart: true, subDue: true, subExtended: true,
    language: true, suspension: true, showPassword: true, address: true, delete: true,
  });

  const colLabels = {
    sn: 'SN',owner: 'Dealer', username: 'User_name',
    vehicles: 'No. of Vehicles', contact: 'Full_Name', phone: 'Phone No.',
    email: 'Email', company: 'Company', timezone: 'Timezone', status: 'Status',
    autoExp: 'Auto EXP', subStart: 'Sub Start', subDue: 'Sub Due',
    subExtended: 'Sub Extended', language: 'Language',
    suspension: 'Suspension', showPassword: 'Show Password',
    address: 'Address', delete: 'Delete',
  };

  const dealerDisplayName = user?.fullName || user?.name || user?.username || '—';

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUsersApi({ limit: 5000 });
      const all = res.data.users || [];
      // Client-side guard: only show users that truly belong to this dealer
      const mine = all.filter(u =>
        u.role === 'user' &&
        (Number(u.dealerId)  === Number(user.user_id) ||
         Number(u.createdBy) === Number(user.user_id))
      );
      setUsers(mine);
    } catch (err) {
      console.error('[DealerUserManagement] fetchUsers error:', err);
      toast.error('Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (formData) => {
    setSaving(true);
    try {
      if (editingUser) {
        const upd = { ...formData };
        delete upd.confirmPassword;
        if (!upd.password) delete upd.password;
        ['superAdminId', 'adminId', 'dealerId', 'parentId', 'createdBy', 'ownerId', 'ownerName', 'role']
          .forEach(k => delete upd[k]);
        await updateUserApi(editingUser._id, upd);
        toast.success(`User "${formData.username}" updated successfully`);
      } else {
        await createUserApi(formData);
        toast.success(`User "${formData.username}" created`);
      }
      setModalOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick    = u => { setEditingUser(u); setModalOpen(true); };
  const togglePasswordVisibility = id => setVisiblePasswords(p => ({ ...p, [id]: !p[id] }));
  const clearFilters = () => { setStatusFilter('ALL'); setSelectedMonth(''); setSelectedYear(''); setSearch(''); setPage(1); };
  const toggleCol    = k => setVisibleCols(p => ({ ...p, [k]: !p[k] }));
  const handleSort   = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const toggleStatus = async (u) => {
    if (u.status === 'Suspended') { toast.info('Please unsuspend the user first'); return; }
    const ns = u.status === 'Active' ? 'Inactive' : 'Active';
    setSaving(true);
    try {
      await updateUserApi(u._id, { status: ns, active: ns === 'Active' });
      toast.success(`Status updated to ${ns}`);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update status'); }
    finally { setSaving(false); }
  };

  const toggleSuspension = async (u) => {
    setSaving(true);
    const willSuspend = !u.isSuspended;
    try {
      await updateUserApi(u._id, {
        isSuspended:     willSuspend,
        status:          willSuspend ? 'Suspended' : (u.active ? 'Active' : 'Inactive'),
        active:          willSuspend ? false : u.active,
        suspensionDate:  willSuspend ? new Date() : null,
        suspendedBy:     willSuspend ? (user?.user_id || null) : null,
        suspendedReason: '',
      });
      toast.success(willSuspend ? 'User suspended' : 'User unsuspended');
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update suspension'); }
    finally { setSaving(false); }
  };

  const handleDeleteUser = async (u) => {
    if (u.status !== 'Inactive') {
      toast.error('Cannot delete active user. Please make the user inactive first.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete user "${u.username}"?`)) {
      setSaving(true);
      try {
        await deleteUserApi(u._id);
        toast.success(`User "${u.username}" deleted successfully`);
        fetchUsers();
      } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete user'); }
      finally { setSaving(false); }
    }
  };

  // ── Filter / Sort / Paginate ───────────────────────────────────────────────
  const fc = {
    ALL:      users.length,
    ACTIVE:   users.filter(u => u.status === 'Active').length,
    INACTIVE: users.filter(u => u.status === 'Inactive').length,
  };

  const filtered = users
    .filter(u => {
      if (statusFilter === 'ACTIVE'   && u.status !== 'Active')   return false;
      if (statusFilter === 'INACTIVE' && u.status !== 'Inactive') return false;
      return true;
    })
    .filter(u => {
      if (!selectedMonth && !selectedYear) return true;
      const dt    = new Date(u.createdAt);
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const year  = String(dt.getFullYear());
      if (selectedMonth && selectedYear) return month === selectedMonth && year === selectedYear;
      if (selectedMonth) return month === selectedMonth;
      return year === selectedYear;
    })
    .filter(u => {
      if (!search) return true;
      const q = search.toLowerCase();
      return ['username', 'fullName', 'name', 'email', 'phone', 'company', 'address']
        .some(k => (u[k] || '').toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const map = {
        username: 'username', status: 'status', vehicles: 'maxVehicles',
        phone: 'phone', email: 'email', company: 'company', language: 'language',
      };
      const k  = map[sortCol] || 'username';
      const va = a[k] ?? '';
      const vb = b[k] ?? '';
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated  = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

// NEW
const thStyle = {
  padding: '9px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700,
  color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
  background: activeColor, borderRight: '1px solid rgba(255,255,255,0.1)',
  position: 'sticky', top: 0, zIndex: 2,
};
const tdStyle = {
  padding: '9px 12px', fontSize: 12, textAlign: 'center',
  borderBottom: '1px solid #edf0f4', verticalAlign: 'middle',
  whiteSpace: 'nowrap', color: '#1e293b',
};

  return (
    <div style={{ padding: '0', background: '#f8fafc', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '12px 15px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', justifyContent: 'space-between' }}>        <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap', flex: 1 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0 8px', height: 36, minWidth: 200 }}>
            <Icon name="search" size={14} color="#64748b" />
            <input placeholder="Search users..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#1e293b', width: '100%' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '0 10px', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', height: 36 }}>
            {[
              { key: 'ALL',      label: `All (${fc.ALL})`,           color: '#1976d2' },
              { key: 'ACTIVE',   label: `Active (${fc.ACTIVE})`,     color: '#2e7d32' },
              { key: 'INACTIVE', label: `Inactive (${fc.INACTIVE})`, color: '#c62828' },
            ].map(({ key, label, color }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="dealerUserStatus"
                  checked={statusFilter === key}
                  onChange={() => { setStatusFilter(key); setPage(1); }}
                  style={{ accentColor: color, width: 14, height: 14 }} />
                <span style={{ color: statusFilter === key ? color : '#64748b' }}>{label}</span>
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e2e8f0', padding: '0 8px', height: 36, minWidth: 120 }}>
            <Icon name="calendar" size={14} color="#64748b" />
            <select value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setPage(1); }}
              style={{ border: 'none', outline: 'none', fontSize: 13, color: '#1e293b', background: 'transparent', width: '100%', cursor: 'pointer' }}>
              <option value="">Month</option>
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e2e8f0', padding: '0 8px', height: 36, minWidth: 100 }}>
            <Icon name="calendar" size={14} color="#64748b" />
            <select value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setPage(1); }}
              style={{ border: 'none', outline: 'none', fontSize: 13, color: '#1e293b', background: 'transparent', width: '100%', cursor: 'pointer' }}>
              <option value="">Year</option>
              {Array.from({ length: 101 }, (_, i) => new Date().getFullYear() - 50 + i).map(y =>
                <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {(statusFilter !== 'ALL' || selectedMonth || selectedYear || search) && (
            <button onClick={clearFilters}
              style={{ padding: '0 12px', background: 'transparent', border: '1px solid #c62828', fontSize: 12, color: '#c62828', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, height: 36, whiteSpace: 'nowrap' }}>
              <Icon name="close" size={12} color="#c62828" /> Clear
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Show</span>
            <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
              style={{ height: 36, padding: '0 8px', background: '#fff', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: 13, cursor: 'pointer', outline: 'none', minWidth: 70 }}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div style={{ position: 'relative' }}>
            <button onClick={() => setColMenuOpen(!colMenuOpen)}
              style={{ padding: '0 12px', background: '#fff', border: '1px solid #e2e8f0', fontSize: 13, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, height: 36, whiteSpace: 'nowrap' }}>
              <Icon name="settings" size={14} /> Columns ▾
            </button>
            {colMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', zIndex: 200, minWidth: 200, padding: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 300, overflowY: 'auto' }}>
                {Object.keys(visibleCols).map(k => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#334155' }}>
                    <input type="checkbox" checked={visibleCols[k]} onChange={() => toggleCol(k)} style={{ accentColor: '#1976d2' }} />
                    {colLabels[k] || k}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => { setEditingUser(null); setModalOpen(true); }}
            style={{ padding: '0 16px', background: activeColor, border: 'none', fontSize: 13, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, height: 36, whiteSpace: 'nowrap' }}>
            <Icon name="plus" size={14} /> Add User
          </button>
        </div>
      </div>

      {/* Active filters pill */}
      {(statusFilter !== 'ALL' || selectedMonth || selectedYear) && (
        <div style={{ padding: '6px 15px', background: '#e3f2fd', border: '1px solid #90caf9', borderTop: 'none', fontSize: 12, color: '#1976d2', display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
          <span><strong>Filters:</strong></span>
          {statusFilter !== 'ALL' && <span style={{ background: '#bbdefb', padding: '2px 10px', borderRadius: 12 }}>{statusFilter}</span>}
          {selectedMonth && <span style={{ background: '#bbdefb', padding: '2px 10px', borderRadius: 12 }}>{months.find(m => m.value === selectedMonth)?.label}</span>}
          {selectedYear  && <span style={{ background: '#bbdefb', padding: '2px 10px', borderRadius: 12 }}>{selectedYear}</span>}
          <span style={{ marginLeft: 'auto' }}><strong>{filtered.length}</strong> records found</span>
        </div>
      )}

      {/* Table */}
      <div style={{ borderTop: 'none', overflowX: 'auto', background: '#fff', width: '100%', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              {visibleCols.sn           && <th style={thStyle}>#</th>}
              {visibleCols.owner        && <th style={thStyle}>Dealer</th>}
              {visibleCols.username     && <th style={thStyle} onClick={() => handleSort('username')}>User_name <SortIcon col="username" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.vehicles     && <th style={{ ...thStyle, textAlign: 'center' }} onClick={() => handleSort('vehicles')}>No. of Vehicles <SortIcon col="vehicles" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.contact      && <th style={thStyle}>Full_Name</th>}
              {visibleCols.phone        && <th style={thStyle} onClick={() => handleSort('phone')}>Phone No. <SortIcon col="phone" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.email        && <th style={thStyle} onClick={() => handleSort('email')}>Email <SortIcon col="email" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.company      && <th style={thStyle} onClick={() => handleSort('company')}>Company <SortIcon col="company" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.timezone     && <th style={thStyle}>Timezone</th>}
              {visibleCols.status       && <th style={thStyle} onClick={() => handleSort('status')}>Status <SortIcon col="status" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.autoExp      && <th style={thStyle}>Auto EXP</th>}
              {visibleCols.subStart     && <th style={thStyle}>Sub Start</th>}
              {visibleCols.subDue       && <th style={thStyle}>Sub Due</th>}
              {visibleCols.subExtended  && <th style={thStyle}>Sub Extended</th>}
              {visibleCols.language     && <th style={thStyle} onClick={() => handleSort('language')}>Language <SortIcon col="language" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.suspension   && <th style={thStyle}>Suspension</th>}
              {visibleCols.showPassword && <th style={thStyle}>Show Password</th>}
              {visibleCols.address      && <th style={thStyle}>Address</th>}
              {visibleCols.delete       && <th style={{ ...thStyle, textAlign: 'center' }}>Delete</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="30" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
              </td></tr>
            ) : paginated.length === 0 ? (
              <tr><td colSpan="30" style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No user accounts found
              </td></tr>
            ) : (
              paginated.map((u, idx) => {
                const isSus      = u.status === 'Suspended';
                const isInactive = u.status === 'Inactive';
                const rowBg      = isSus ? '#fff5f5' : '#fff';
                return (
                  <tr key={u._id}
                    style={{ background: rowBg, transition: 'background 0.2s', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = isSus ? '#ffe5e5' : '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = rowBg}
                    onClick={() => handleEditClick(u)}
                  >
                    {visibleCols.sn && <td style={tdStyle}>{(page - 1) * rowsPerPage + idx + 1}</td>}
                    {/* Owner — always the logged-in dealer's name */}
                    {visibleCols.owner && <td style={tdStyle}>{u.ownerName || dealerDisplayName}</td>}

                    {visibleCols.username && (
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#1976d2', cursor: 'pointer' }}
                        onClick={e => { e.stopPropagation(); handleEditClick(u); }}>
                        {u.username}
                      </td>
                    )}

                    {visibleCols.vehicles && (
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          background: (u.maxVehicles ?? u.maxVehicleCount ?? 0) > 0 ? '#e3f2fd' : '#f1f5f9',
                          padding: '4px 8px', fontWeight: 600,
                          color: (u.maxVehicles ?? u.maxVehicleCount ?? 0) > 0 ? '#1976d2' : '#64748b',
                        }}>
                          {u.maxVehicles ?? u.maxVehicleCount ?? 0}
                        </span>
                      </td>
                    )}

                    {visibleCols.contact  && <td style={tdStyle}>{u.fullName || u.name || '—'}</td>}
                    {visibleCols.phone    && <td style={tdStyle}>{u.phone    || '—'}</td>}
                    {visibleCols.email    && <td style={tdStyle}>{u.email    || '—'}</td>}
                    {visibleCols.company  && <td style={tdStyle}>{u.company  || '—'}</td>}
                    {visibleCols.timezone && <td style={tdStyle}>{u.timezone || 'Asia/Calcutta'}</td>}

                    {visibleCols.status && (
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleStatus(u)}
                          style={{ background: 'none', border: 'none', cursor: isSus ? 'not-allowed' : 'pointer', padding: 0 }}
                          disabled={isSus}>
                          <StatusPill status={u.status} />
                        </button>
                      </td>
                    )}

                    {/* ── Correct DB field names ── */}
                    {visibleCols.autoExp     && <td style={tdStyle}>{u.autoExpiry || '—'}</td>}
                    {visibleCols.subStart    && <td style={tdStyle}>{fmtDate(u.subscriptionStartDate)}</td>}
                    {visibleCols.subDue      && <td style={tdStyle}>{fmtDate(u.subscriptionDueDate)}</td>}
                    {visibleCols.subExtended && <td style={tdStyle}>{fmtDate(u.subscriptionExtendDate)}</td>}

                    {visibleCols.language && <td style={tdStyle}>{u.language || 'English'}</td>}

                    {visibleCols.suspension && (
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        {u.isSuspended ? (
                          <button onClick={() => toggleSuspension(u)}
                            style={{ background: '#c62828', border: 'none', padding: '4px 12px', fontSize: 12, fontWeight: 500, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, minWidth: 80, justifyContent: 'center' }}>
                            <Icon name="check" size={14} color="white" /> Unsuspend
                          </button>
                        ) : (
                          <button onClick={() => toggleSuspension(u)}
                            style={{ background: '#2e7d32', border: 'none', padding: '4px 12px', fontSize: 12, fontWeight: 500, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, minWidth: 80, justifyContent: 'center' }}>
                            <Icon name="block" size={14} color="white" /> Suspend
                          </button>
                        )}
                      </td>
                    )}

                    {visibleCols.showPassword && (
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        {visiblePasswords[u._id] ? (
                          <span onClick={() => togglePasswordVisibility(u._id)}
                            style={{ fontFamily: 'monospace', fontSize: 12, padding: '4px 12px', background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'inline-block', minWidth: 80, textAlign: 'center' }}>
                            {u.password || 'No password'}
                          </span>
                        ) : (
                          <button onClick={() => togglePasswordVisibility(u._id)}
                            style={{ background: '#2e7d32', border: 'none', padding: '4px 12px', fontSize: 12, fontWeight: 500, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, minWidth: 60, justifyContent: 'center' }}>
                            <Icon name="eye" size={14} color="white" /> Show
                          </button>
                        )}
                      </td>
                    )}

                    {visibleCols.address && <td style={tdStyle}>{u.address || '—'}</td>}

                    {visibleCols.delete && (
                      <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        {isInactive ? (
                          <button onClick={() => handleDeleteUser(u)} title="Delete user"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <TrashIcon />
                          </button>
                        ) : (
                          <span title="Make user inactive first to delete"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 4, cursor: 'not-allowed', color: '#d1d5db' }}>
                            <TrashIcon />
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '12px 16px', background: '#fff', borderTop: '1px solid #e2e8f0', fontSize: 13, flexShrink: 0 }}>        <span style={{ color: '#64748b', marginRight: 15 }}>
          Showing <span style={{ fontWeight: 600, color: '#1e293b' }}>
            {filtered.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)}
          </span> of <span style={{ fontWeight: 600, color: '#1e293b' }}>{filtered.length}</span>
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { label: '«', action: () => setPage(1),                             disabled: page === 1 },
            { label: '‹', action: () => setPage(p => Math.max(1, p - 1)),       disabled: page === 1 },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} disabled={btn.disabled}
              style={{ padding: '6px 10px', border: '1px solid #e2e8f0', background: btn.disabled ? '#f5f5f5' : '#fff', cursor: btn.disabled ? 'not-allowed' : 'pointer', color: btn.disabled ? '#bdc3c7' : '#1e293b' }}>
              {btn.label}
            </button>
          ))}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
            return (
              <button key={p} onClick={() => setPage(p)}
                style={{ padding: '6px 12px', border: '1px solid #e2e8f0', background: p === page ? activeColor : '#fff', color: p === page ? '#fff' : '#1e293b', cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}>                {p}
              </button>
            );
          })}
          {[
            { label: '›', action: () => setPage(p => Math.min(totalPages, p + 1)), disabled: page === totalPages },
            { label: '»', action: () => setPage(totalPages),                        disabled: page === totalPages },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} disabled={btn.disabled}
              style={{ padding: '6px 10px', border: '1px solid #e2e8f0', background: btn.disabled ? '#f5f5f5' : '#fff', cursor: btn.disabled ? 'not-allowed' : 'pointer', color: btn.disabled ? '#bdc3c7' : '#1e293b' }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <AddUser
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingUser(null); }}
        onSubmit={handleSubmit}
        editUser={editingUser}
        currentUser={user}
        loading={saving}
      />
    </div>
  );
};

export default UserManagement;