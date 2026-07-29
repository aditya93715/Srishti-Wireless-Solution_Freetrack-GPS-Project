import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getUsersApi, createUserApi, updateUserApi } from '../../../api/users';
import { useTheme } from '../../../context/ThemeContext';
import Icon from '../../../components/Icon';
import AddDealer from '../../shared/AdminCreateButton/AddDealer';


// ── Status pill ─────────────────────────────────────────────────
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

// ── Sort icon ──────────────────────────────────────────────────────────────────
const SortIcon = ({ col, sortCol, sortDir }) => (
  <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.3, fontSize: 10 }}>
    {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
  </span>
);

// Months for dropdown
const months = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const DealerManagement = () => {
  const { user } = useAuth();
  const toast = useToast();
  const theme = useTheme();
  const activeColor = theme?.activeColor || '#2c3e50';

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';

  // ── Data ───────────────────────────────────────────────────────────────────
  const [dealers, setDealers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDealer, setEditingDealer] = useState(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [sortCol, setSortCol] = useState('user_id');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});

  // Column visibility - matching AdminManagement structure
  const [visibleCols, setVisibleCols] = useState({
    sn: true, username: true, name: true, phone: true, vehicles: true,
    created: true, inactiveDate: true, email: true, company: true,
    language: true, timezone: true, status: true, owner: true,
    password: true, suspension: true, address: true,
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  DATA FETCH
  // ─────────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (isSuperAdmin) {
        const [adminsRes, dealersRes] = await Promise.all([
          getUsersApi({ limit: 2000 }),
          getUsersApi({ limit: 5000, filterRole: 'dealer' }),
        ]);

        const adminsData = adminsRes.data.users || [];
        const dealersData = dealersRes.data.users || [];

        setAdmins(adminsData.filter(u => u.role === 'admin'));
        setDealers(dealersData.filter(u => u.role === 'dealer'));

      } else if (isAdmin) {
        const res = await getUsersApi({ limit: 2000 });
        const all = res.data.users || [];
        setDealers(all.filter(u =>
          u.role === 'dealer' &&
          (Number(u.adminId) === Number(user.user_id) ||
            Number(u.createdBy) === Number(user.user_id))
        ));
        setAdmins([]);
      }
    } catch (err) {
      console.error('[DealerManagement] fetchAll error:', err);
      toast.error('Failed to load dealers');
      setDealers([]);
    } finally {
      setLoading(false);
    }
  }, [user, isSuperAdmin, isAdmin, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─────────────────────────────────────────────────────────────────────────
  //  CRUD
  // ─────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (formData) => {
    setSaving(true);
    try {
      if (editingDealer) {
        const upd = { ...formData };
        delete upd.confirmPassword;
        if (!upd.password) delete upd.password;
        delete upd.superAdminId;
        delete upd.adminId;
        delete upd.parentId;
        delete upd.createdBy;
        delete upd.dealerId;
        delete upd.role;
        await updateUserApi(editingDealer._id, upd);
        toast.success(`Dealer "${formData.username}" updated successfully`);
      } else {
        await createUserApi(formData);
        toast.success(`Dealer "${formData.username}" created`);
      }
      setModalOpen(false);
      setEditingDealer(null);
      fetchAll();
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (dealer) => {
    setEditingDealer(dealer);
    setModalOpen(true);
  };

  const toggleStatus = async (dealer) => {
    if (dealer.status === 'Suspended') {
      toast.info('Please unsuspend the dealer first');
      return;
    }
    const newStatus = dealer.status === 'Active' ? 'Inactive' : 'Active';
    setSaving(true);
    try {
      await updateUserApi(dealer._id, { status: newStatus, active: newStatus === 'Active' });
      toast.success(`Status updated to ${newStatus}`);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const toggleSuspension = async (dealer) => {
    setSaving(true);
    try {
      const willBeSuspended = !dealer.isSuspended;
      await updateUserApi(dealer._id, {
        isSuspended: willBeSuspended,
        status: willBeSuspended ? 'Suspended' : (dealer.active ? 'Active' : 'Inactive'),
        active: willBeSuspended ? false : dealer.active,
        suspensionDate: willBeSuspended ? new Date() : null,
        suspendedBy: willBeSuspended ? (user?.user_id || 1) : null,
        suspendedReason: '',
      });
      toast.success(willBeSuspended ? 'Dealer suspended successfully' : 'Dealer unsuspended successfully');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update suspension');
    } finally {
      setSaving(false);
    }
  };

  const togglePasswordVisibility = (dealerId) => {
    setVisiblePasswords(prev => ({ ...prev, [dealerId]: !prev[dealerId] }));
  };

  const clearFilters = () => {
    setStatusFilter('ALL');
    setSelectedMonth('');
    setSelectedYear('');
    setSearch('');
    setPage(1);
  };

  const fc = {
    ALL: dealers.length,
    ACTIVE: dealers.filter(a => a.status === 'Active').length,
    INACTIVE: dealers.filter(a => a.status === 'Inactive').length,
    SUSPENDED: dealers.filter(a => a.status === 'Suspended').length,
  };

  const filtered = dealers
    .filter(a => {
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'ACTIVE' && a.status !== 'Active') return false;
        if (statusFilter === 'INACTIVE' && a.status !== 'Inactive') return false;
      }
      return true;
    })
    .filter(a => {
      if (selectedMonth || selectedYear) {
        const d = new Date(a.createdAt);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear().toString();
        if (selectedMonth && selectedYear) return month === selectedMonth && year === selectedYear;
        if (selectedMonth) return month === selectedMonth;
        if (selectedYear) return year === selectedYear;
      }
      return true;
    })
    .filter(a => {
      if (!search) return true;
      const q = search.toLowerCase();
      return ['username', 'fullName', 'ownerName', 'email', 'phone', 'company', 'domain', 'address']
        .some(k => (a[k] || '').toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const map = {
        username: 'username',
        status: 'status',
        vehicles: 'maxVehicles',
        created: 'createdAt',
      };
      const k = map[sortCol] || 'username';
      const va = a[k] ?? '';
      const vb = b[k] ?? '';
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const toggleCol = k => setVisibleCols(p => ({ ...p, [k]: !p[k] }));

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

      {/* Filter Bar - with buttons in right corner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 15, padding: '12px 15px',
        background: '#fff', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap',
        justifyContent: 'space-between'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 15,
          flexWrap: 'wrap', flex: 1
        }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#f1f5f9', border: '1px solid #e2e8f0',
            padding: '0 8px', height: 36, minWidth: 200
          }}>
            <Icon name="search" size={14} color="#64748b" />
            <input
              placeholder="Search..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{
                border: 'none', background: 'transparent', outline: 'none',
                fontSize: 13, color: '#1e293b', width: '100%'
              }}
            />
          </div>

          {/* Status radios */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 15,
            padding: '0 10px', borderLeft: '1px solid #e2e8f0',
            borderRight: '1px solid #e2e8f0', height: 36
          }}>
            {[
              { key: 'ALL', label: `All (${fc.ALL})`, color: '#1976d2' },
              { key: 'ACTIVE', label: `Active (${fc.ACTIVE})`, color: '#2e7d32' },
              { key: 'INACTIVE', label: `Inactive (${fc.INACTIVE})`, color: '#c62828' },
            ].map(({ key, label, color }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="status"
                  checked={statusFilter === key}
                  onChange={() => { setStatusFilter(key); setPage(1); }}
                  style={{ accentColor: color, width: 14, height: 14 }}
                />
                <span style={{ color: statusFilter === key ? color : '#64748b' }}>{label}</span>
              </label>
            ))}
          </div>

          {/* Month */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#fff', border: '1px solid #e2e8f0',
            padding: '0 8px', height: 36, minWidth: 120
          }}>
            <Icon name="calendar" size={14} color="#64748b" />
            <select
              value={selectedMonth}
              onChange={e => { setSelectedMonth(e.target.value); setPage(1); }}
              style={{
                border: 'none', outline: 'none', fontSize: 13,
                color: '#1e293b', background: 'transparent',
                width: '100%', cursor: 'pointer'
              }}
            >
              <option value="">Month</option>
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {/* Year */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#fff', border: '1px solid #e2e8f0',
            padding: '0 8px', height: 36, minWidth: 100
          }}>
            <Icon name="calendar" size={14} color="#64748b" />
            <select
              value={selectedYear}
              onChange={e => { setSelectedYear(e.target.value); setPage(1); }}
              style={{
                border: 'none', outline: 'none', fontSize: 13,
                color: '#1e293b', background: 'transparent',
                width: '100%', cursor: 'pointer'
              }}
            >
              <option value="">Year</option>
              {Array.from({ length: 101 }, (_, i) => new Date().getFullYear() - 50 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Clear */}
          {(statusFilter !== 'ALL' || selectedMonth || selectedYear || search) && (
            <button
              onClick={clearFilters}
              style={{
                padding: '0 12px', background: 'transparent',
                border: '1px solid #c62828', fontSize: 12, color: '#c62828',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                gap: 4, height: 36, whiteSpace: 'nowrap'
              }}
            >
              <Icon name="close" size={12} color="#c62828" /> Clear
            </button>
          )}
        </div>

        {/* Right side - Buttons and rows per page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Show</span>
            <select
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
              style={{
                height: 36, padding: '0 8px', background: '#fff',
                border: '1px solid #e2e8f0', color: '#1e293b',
                fontSize: 13, cursor: 'pointer', outline: 'none', minWidth: 70
              }}
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Columns Button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setColMenuOpen(!colMenuOpen)}
              style={{
                padding: '0 12px', background: '#fff', border: '1px solid #e2e8f0',
                fontSize: 13, color: '#334155', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, height: 36,
                whiteSpace: 'nowrap'
              }}
            >
              <Icon name="settings" size={14} /> Columns ▾
            </button>
            {colMenuOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: '#fff', border: '1px solid #e2e8f0', zIndex: 200,
                minWidth: 200, padding: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                maxHeight: 300, overflowY: 'auto'
              }}>
                {Object.keys(visibleCols).map(k => (
                  <label
                    key={k}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                      color: '#334155'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols[k]}
                      onChange={() => toggleCol(k)}
                      style={{ accentColor: '#1976d2' }}
                    />
                    {k === 'sn' ? 'S.No' : k === 'username' ? 'Dealer' : k === 'name' ? 'Full_Name' : k === 'phone' ? 'Phone No' : k === 'vehicles' ? 'No. of Vehicles' : k === 'created' ? 'Added/Created' : k === 'inactiveDate' ? 'Inactive Date' : k === 'email' ? 'Email' : k === 'company' ? 'Company' : k === 'language' ? 'Language' : k === 'timezone' ? 'Timezone' : k === 'status' ? 'Status' : k === 'owner' ? 'Admin' : k === 'password' ? 'Password' : k === 'suspension' ? 'Suspension' : k === 'address' ? 'Address' : k}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Add Dealer Button */}
          {/* <button
            style={{
              padding: '0 16px', background: activeColor, border: 'none',
              fontSize: 13, color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, height: 36,
              whiteSpace: 'nowrap'
            }}
            onClick={() => { setEditingDealer(null); setModalOpen(true); }}
          >
            <Icon name="plus" size={14} /> Add Dealer
          </button> */}
        </div>
      </div>

      {/* Active filters display */}
      {(statusFilter !== 'ALL' || selectedMonth || selectedYear) && (
        <div style={{
          padding: '6px 15px', background: '#e3f2fd',
          border: '1px solid #90caf9', borderTop: 'none',
          fontSize: 12, color: '#1976d2',
          display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap'
        }}>
          <span><strong>Filters:</strong></span>
          {statusFilter !== 'ALL' && <span style={{ background: '#bbdefb', padding: '2px 10px', borderRadius: 12 }}>{statusFilter}</span>}
          {selectedMonth && <span style={{ background: '#bbdefb', padding: '2px 10px', borderRadius: 12 }}>{months.find(m => m.value === selectedMonth)?.label}</span>}
          {selectedYear && <span style={{ background: '#bbdefb', padding: '2px 10px', borderRadius: 12 }}>{selectedYear}</span>}
          <span style={{ marginLeft: 'auto' }}><strong>{filtered.length}</strong> records found</span>
        </div>
      )}

      {/* Table */}
      <div style={{
        borderTop: 'none',
        overflowX: 'auto', background: '#fff', width: '100%', flex: 1
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              {visibleCols.sn && <th style={thStyle}>#</th>}
              {visibleCols.owner && <th style={thStyle}>Admin</th>}
              {visibleCols.username && <th style={thStyle} onClick={() => handleSort('username')}>Dealer <SortIcon col="username" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.name && <th style={thStyle}>Full_Name</th>}
              {visibleCols.phone && <th style={thStyle}>Phone No</th>}
              {visibleCols.vehicles && <th style={{ ...thStyle, textAlign: 'center' }} onClick={() => handleSort('vehicles')}>No.of.Vehicle <SortIcon col="vehicles" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.created && <th style={thStyle} onClick={() => handleSort('created')}>Created <SortIcon col="created" sortCol={sortCol} sortDir={sortDir} /></th>}
              {visibleCols.inactiveDate && <th style={thStyle}>Inactive Date</th>}
              {visibleCols.email && <th style={thStyle}>Email</th>}
              {visibleCols.company && <th style={thStyle}>Company</th>}
              {visibleCols.language && <th style={thStyle}>Language</th>}
              {visibleCols.timezone && <th style={thStyle}>Timezone</th>}
              {visibleCols.status && <th style={thStyle}>Status</th>}
              {visibleCols.password && <th style={thStyle}>Password</th>}
              {visibleCols.suspension && <th style={thStyle}>Suspension</th>}
              {visibleCols.address && <th style={thStyle}>Address</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="16" style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan="16" style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  No dealer accounts found
                </td>
              </tr>
            ) : (
              paginated.map((a, i) => (
               // NEW
                <tr
                  key={a._id}
                  style={{
                    background: a.status === 'Suspended' ? '#fff5f5' : (i % 2 === 0 ? '#fff' : '#fafbfc'),
                    transition: 'background 0.1s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = a.status === 'Suspended' ? '#fff5f5' : (i % 2 === 0 ? '#fff' : '#fafbfc')}
                  onClick={() => handleEditClick(a)}
                >
                  {visibleCols.sn && <td style={tdStyle}>{(page - 1) * rowsPerPage + i + 1}</td>}
                  {visibleCols.owner && <td style={tdStyle}>{a.ownerName || '—'}</td>}

                  {visibleCols.username && (
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1976d2', cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); handleEditClick(a); }}>
                      {a.username}
                    </td>
                  )}



                  {visibleCols.name && <td style={tdStyle}>{a.fullName || a.name || '—'}</td>}
                  {visibleCols.phone && <td style={tdStyle}>{a.phone || '—'}</td>}

                  {/* No. of Vehicle column */}
                  {visibleCols.vehicles && (
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{
                        background: (a.maxVehicles ?? a.maxVehicleCount ?? 0) > 0 ? '#e3f2fd' : '#f1f5f9',
                        padding: '4px 8px',
                        fontWeight: 600,
                        color: (a.maxVehicles ?? a.maxVehicleCount ?? 0) > 0 ? '#1976d2' : '#64748b',
                      }}>
                        {a.maxVehicles ?? a.maxVehicleCount ?? 0}
                      </span>
                    </td>
                  )}

                  {visibleCols.created && (
                    <td style={tdStyle}>
                      {a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                    </td>
                  )}

                  {visibleCols.inactiveDate && (
                    <td style={tdStyle}>
                      {a.inactiveDate ? new Date(a.inactiveDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                    </td>
                  )}

                  {visibleCols.email && <td style={tdStyle}>{a.email || '—'}</td>}
                  {visibleCols.company && <td style={tdStyle}>{a.company || '—'}</td>}
                  {visibleCols.language && <td style={tdStyle}>{a.language || 'English'}</td>}
                  {visibleCols.timezone && <td style={tdStyle}>{a.timezone || 'Asia/Calcutta'}</td>}

                  {/* Status */}
                  {visibleCols.status && (
                    <td style={tdStyle} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => toggleStatus(a)}
                        style={{
                          background: 'none', border: 'none',
                          cursor: a.status === 'Suspended' ? 'not-allowed' : 'pointer',
                          padding: 0
                        }}
                        disabled={a.status === 'Suspended'}
                      >
                        <StatusPill status={a.status} />
                      </button>
                    </td>
                  )}


                  {/* Password */}
                  {visibleCols.password && (
                    <td style={tdStyle} onClick={e => e.stopPropagation()}>
                      {visiblePasswords[a._id] ? (
                        <span
                          onClick={() => togglePasswordVisibility(a._id)}
                          style={{
                            fontFamily: 'monospace', fontSize: 12, padding: '4px 12px',
                            background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0',
                            cursor: 'pointer', display: 'inline-block', minWidth: 80,
                            textAlign: 'center'
                          }}
                        >
                          {a.password || 'No password'}
                        </span>
                      ) : (
                        <button
                          onClick={() => togglePasswordVisibility(a._id)}
                          style={{
                            background: '#2e7d32', border: 'none', padding: '4px 12px',
                            fontSize: 12, fontWeight: 500, color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                            minWidth: 60, justifyContent: 'center'
                          }}
                        >
                          <Icon name="eye" size={14} color="white" /> Show
                        </button>
                      )}
                    </td>
                  )}

                  {/* Suspension */}
                  {visibleCols.suspension && (
                    <td style={tdStyle} onClick={e => e.stopPropagation()}>
                      {a.isSuspended ? (
                        <button
                          onClick={() => toggleSuspension(a)}
                          style={{
                            background: '#c62828', border: 'none', padding: '4px 12px',
                            fontSize: 12, fontWeight: 500, color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                            minWidth: 80, justifyContent: 'center'
                          }}
                        >
                          <Icon name="check" size={14} color="white" /> Unsuspend
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleSuspension(a)}
                          style={{
                            background: '#2e7d32', border: 'none', padding: '4px 12px',
                            fontSize: 12, fontWeight: 500, color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                            minWidth: 80, justifyContent: 'center'
                          }}
                        >
                          <Icon name="block" size={14} color="white" /> Suspend
                        </button>
                      )}
                    </td>
                  )}

                  {visibleCols.address && <td style={tdStyle}>{a.address || '—'}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '12px 16px', background: '#fff',
        borderTop: '1px solid #e2e8f0', fontSize: 13, flexShrink: 0
      }}>
        <span style={{ color: '#64748b', marginRight: 15 }}>
          Showing <span style={{ fontWeight: 600, color: '#1e293b' }}>
            {filtered.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)}
          </span> of <span style={{ fontWeight: 600, color: '#1e293b' }}>{filtered.length}</span>
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { label: '«', action: () => setPage(1), disabled: page === 1 },
            { label: '‹', action: () => setPage(p => Math.max(1, p - 1)), disabled: page === 1 },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              disabled={btn.disabled}
              style={{
                padding: '6px 10px', border: '1px solid #e2e8f0',
                background: btn.disabled ? '#f5f5f5' : '#fff',
                cursor: btn.disabled ? 'not-allowed' : 'pointer',
                color: btn.disabled ? '#bdc3c7' : '#1e293b'
              }}
            >
              {btn.label}
            </button>
          ))}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  padding: '6px 12px', border: '1px solid #e2e8f0',
                  background: p === page ? activeColor : '#fff',
                  color: p === page ? '#fff' : '#1e293b',
                  cursor: 'pointer', fontWeight: p === page ? 600 : 400
                }}
              >
                {p}
              </button>
            );
          })}
          {[
            { label: '›', action: () => setPage(p => Math.min(totalPages, p + 1)), disabled: page === totalPages },
            { label: '»', action: () => setPage(totalPages), disabled: page === totalPages },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              disabled={btn.disabled}
              style={{
                padding: '6px 10px', border: '1px solid #e2e8f0',
                background: btn.disabled ? '#f5f5f5' : '#fff',
                cursor: btn.disabled ? 'not-allowed' : 'pointer',
                color: btn.disabled ? '#bdc3c7' : '#1e293b'
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <AddDealer
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingDealer(null); }}
        onSubmit={handleSubmit}
        editDealer={editingDealer}
        currentUser={user}
        loading={saving}
        adminsList={admins}
        accent="#1db690"
      />
    </div>
  );
};

export default DealerManagement;