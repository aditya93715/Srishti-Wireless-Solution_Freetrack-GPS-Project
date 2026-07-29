import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../../context/ThemeContext';

const ACCENT_DEFAULT    = '#0d9488';
const HEADER_BG_DEFAULT = '#134e4a';
let ACCENT    = ACCENT_DEFAULT;
let HEADER_BG = HEADER_BG_DEFAULT;

const EMPTY = {
  username: '', password: '', confirmPassword: '',
  fullName: '', email: '', phone: '',
  company: '', address: '', language: 'English',
  domain: '', maxVehicles: '', timezone: 'Asia/Calcutta',
  status: 'Active',
  inactiveTime: '12',
  subscriptionStartDate: '',
  subscriptionDueDate: '',
  subscriptionExtendDate: '',
  subscriptionExpiryCount: '10',
  maxRadiusNearestPOI: '',
  minDistanceForAddress: '',
  dataRestrictionDays: '',
  overwriteSubscription: false,
  vehicleInactiveAfterExpiry: false,
  autoExpiry: 'N',
};

// Default roles for Access Management
const DEFAULT_ROLES = [
  'Basic reports', 'Battery_Hooter', 'Geofence Access Full', 'Geofence reports',
  'Schedule Parking', 'Sim Tracking', 'Tickets', 'User_Bulk_Upload', 'User Change Password',
  'Vehicle Lock', 'VEHICLE_LOCK_PASSWORD', 'Users & group access', 'Analytics dashboard Access',
  'No Dashboard Access', 'History No Access', 'No Driver Access', 'No History Access',
  'No Notification Access', 'No Parking Access', 'No Service Reminder Access',
  'No Setting Access', 'No Share Access',
].map(r => ({ roleName: r, isEnabled: false }));

const L = ({ text, req, opt }) => (
  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
    {text}
    {req && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    {opt && <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400, marginLeft: 3 }}>(Optional)</span>}
  </label>
);

const INP = {
  width: '100%', height: 34, padding: '0 10px',
  background: '#fff', border: '1px solid #d1d5db', borderRadius: 4,
  fontSize: 12, color: '#111827', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
};
const INP_RO = { ...INP, background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed', border: '1px solid #e5e7eb' };
const SEL = {
  ...INP, appearance: 'none',
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
  backgroundSize: '14px', paddingRight: 28, cursor: 'pointer',
};
const SEL_DISABLED = { ...SEL, opacity: 0.5, cursor: 'not-allowed', background: '#f9fafb' };

// const fo = e => (e.target.style.borderColor = ACCENT);
// const fb = e => (e.target.style.borderColor = '#d1d5db');

const toNum = (val) => {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
};

const TabBtn = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    flex: 1, padding: '10px 8px', textAlign: 'center', fontSize: 12, cursor: 'pointer',
    color: active ? ACCENT : '#6b7280', fontWeight: active ? 700 : 500,
    background: active ? '#f0fdf4' : '#fff', border: 'none',
    borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
    fontFamily: 'inherit', transition: 'all 0.2s',
  }}>{children}</button>
);

const Toggle = ({ checked, onChange }) => (
  <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
    <span style={{ position: 'absolute', inset: 0, background: checked ? ACCENT : '#d1d5db', borderRadius: 20, transition: '0.3s' }}>
      <span style={{ position: 'absolute', height: 14, width: 14, left: checked ? 19 : 3, bottom: 3, background: '#fff', borderRadius: '50%', transition: '0.3s' }} />
    </span>
  </label>
);

const AddUser = ({
  open        = false,
  onClose,
  onSubmit,
  editUser    = null,
  currentUser = null,
  loading     = false,
  adminsList  = [],
  dealersList = [],
}) => {
  const theme = useTheme();
  ACCENT    = theme?.activeColor || ACCENT_DEFAULT;
  HEADER_BG = theme?.activeColor || HEADER_BG_DEFAULT;

  const fo = e => (e.target.style.borderColor = ACCENT);
  const fb = e => (e.target.style.borderColor = '#d1d5db');

  const [activeTab, setActiveTab] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [accessRoles, setAccessRoles] = useState(DEFAULT_ROLES);
  const [roleSearch, setRoleSearch] = useState('');
  const [error, setError] = useState('');
  const [selAdminId, setSelAdminId] = useState('');
  const [selDealerId, setSelDealerId] = useState('');

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'admin';
  const isDealer = currentUser?.role === 'dealer';

  const dealersForSelectedAdmin = useMemo(() => {
    if (!selAdminId) return [];
    const selectedAdminId = toNum(selAdminId);
    if (!selectedAdminId) return [];
    return dealersList.filter(d =>
      toNum(d.adminId) === selectedAdminId ||
      toNum(d.parentId) === selectedAdminId ||
      toNum(d.createdBy) === selectedAdminId ||
      toNum(d.ownerId) === selectedAdminId
    );
  }, [dealersList, selAdminId]);

  const dealersForCurrentAdmin = useMemo(() => {
    if (!isAdmin) return [];
    const myId = toNum(currentUser?.user_id);
    if (!myId) return [];
    return dealersList.filter(d =>
      toNum(d.adminId) === myId ||
      toNum(d.parentId) === myId ||
      toNum(d.createdBy) === myId ||
      toNum(d.ownerId) === myId
    );
  }, [dealersList, isAdmin, currentUser]);

  const selAdminObj = useMemo(() =>
    adminsList.find(a => toNum(a.user_id) === toNum(selAdminId)) || null,
    [adminsList, selAdminId]);

  const availableDealers = isSuperAdmin ? dealersForSelectedAdmin : dealersForCurrentAdmin;
  const selDealerObj = useMemo(() =>
    availableDealers.find(d => toNum(d.user_id) === toNum(selDealerId)) || null,
    [availableDealers, selDealerId]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setActiveTab(1);
    if (editUser) {
      const mv = editUser.maxVehicles ?? editUser.maxVehicleCount ?? '';
      setForm({
        username: editUser.username || '',
        password: '',
        confirmPassword: '',
        fullName: editUser.fullName || editUser.name || '',
        email: editUser.email || '',
        phone: editUser.phone || '',
        company: editUser.company || '',
        address: editUser.address || '',
        language: editUser.language || 'English',
        domain: editUser.domain || '',
        maxVehicles: mv != null ? mv : '',
        timezone: editUser.timezone || 'Asia/Calcutta',
        status: editUser.status || 'Active',
        inactiveTime: String(editUser.inactiveTime ?? '12'),
        subscriptionStartDate: editUser.subscriptionStartDate ? editUser.subscriptionStartDate.split('T')[0] : '',
        subscriptionDueDate: editUser.subscriptionDueDate ? editUser.subscriptionDueDate.split('T')[0] : '',
        subscriptionExtendDate: editUser.subscriptionExtendDate ? editUser.subscriptionExtendDate.split('T')[0] : '',
        subscriptionExpiryCount: String(editUser.subscriptionExpiryCount ?? '10'),
        maxRadiusNearestPOI: String(editUser.maxRadiusNearestPOI ?? ''),
        minDistanceForAddress: String(editUser.minDistanceForAddress ?? ''),
        dataRestrictionDays: String(editUser.dataRestrictionDays ?? ''),
        overwriteSubscription: editUser.overwriteSubscription ?? false,
        vehicleInactiveAfterExpiry: editUser.vehicleInactiveAfterExpiry ?? false,
        autoExpiry: editUser.autoExpiry || 'N',
      });
      setAccessRoles(editUser.accessRoles?.length ? editUser.accessRoles : DEFAULT_ROLES);
      setSelAdminId(editUser.adminId ? String(editUser.adminId) : '');
      setSelDealerId(editUser.dealerId ? String(editUser.dealerId) : '');
    } else {
      setForm({ ...EMPTY });
      setAccessRoles(DEFAULT_ROLES);
      setSelAdminId('');
      setSelDealerId('');
    }
  }, [open, editUser, adminsList, dealersList]);

  useEffect(() => {
    if (isSuperAdmin && !editUser) {
      setSelDealerId('');
    }
  }, [selAdminId, isSuperAdmin, editUser]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleReset = () => {
    setError('');
    if (editUser) {
      const mv = editUser.maxVehicles ?? editUser.maxVehicleCount ?? '';
      setForm({
        username: editUser.username || '',
        password: '',
        confirmPassword: '',
        fullName: editUser.fullName || editUser.name || '',
        email: editUser.email || '',
        phone: editUser.phone || '',
        company: editUser.company || '',
        address: editUser.address || '',
        language: editUser.language || 'English',
        domain: editUser.domain || '',
        maxVehicles: mv != null ? mv : '',
        timezone: editUser.timezone || 'Asia/Calcutta',
        status: editUser.status || 'Active',
        inactiveTime: String(editUser.inactiveTime ?? '12'),
        subscriptionStartDate: editUser.subscriptionStartDate ? editUser.subscriptionStartDate.split('T')[0] : '',
        subscriptionDueDate: editUser.subscriptionDueDate ? editUser.subscriptionDueDate.split('T')[0] : '',
        subscriptionExtendDate: editUser.subscriptionExtendDate ? editUser.subscriptionExtendDate.split('T')[0] : '',
        subscriptionExpiryCount: String(editUser.subscriptionExpiryCount ?? '10'),
        maxRadiusNearestPOI: String(editUser.maxRadiusNearestPOI ?? ''),
        minDistanceForAddress: String(editUser.minDistanceForAddress ?? ''),
        dataRestrictionDays: String(editUser.dataRestrictionDays ?? ''),
        overwriteSubscription: editUser.overwriteSubscription ?? false,
        vehicleInactiveAfterExpiry: editUser.vehicleInactiveAfterExpiry ?? false,
        autoExpiry: editUser.autoExpiry || 'N',
      });
      setAccessRoles(editUser.accessRoles?.length ? editUser.accessRoles : DEFAULT_ROLES);
      setSelAdminId(editUser.adminId ? String(editUser.adminId) : '');
      setSelDealerId(editUser.dealerId ? String(editUser.dealerId) : '');
    } else {
      setForm({ ...EMPTY });
      setAccessRoles(DEFAULT_ROLES);
      setSelAdminId('');
      setSelDealerId('');
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) return setError('Full Name is required');
    if (!form.username.trim()) return setError('Username is required');

    if (!editUser) {
      if (isSuperAdmin && !selAdminId) return setError('Please select an Admin');
      if ((isSuperAdmin || isAdmin) && !selDealerId) return setError('Please select a Dealer');
      if (!form.password.trim()) return setError('Password is required');
      if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    } else if (form.password && form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }

    const payload = { ...form, role: 'user', accessRoles };
    delete payload.confirmPassword;
    if (editUser && !payload.password) delete payload.password;

    if (payload.maxVehicles !== '' && payload.maxVehicles != null) {
      const n = Number(payload.maxVehicles);
      payload.maxVehicles = isNaN(n) ? null : n;
      payload.maxVehicleCount = payload.maxVehicles;
    } else {
      payload.maxVehicles = null;
      payload.maxVehicleCount = null;
    }

    payload.inactiveTime = Number(payload.inactiveTime) || 12;
    payload.subscriptionExpiryCount = Number(payload.subscriptionExpiryCount) || 10;
    payload.maxRadiusNearestPOI = payload.maxRadiusNearestPOI ? Number(payload.maxRadiusNearestPOI) : undefined;
    payload.minDistanceForAddress = payload.minDistanceForAddress ? Number(payload.minDistanceForAddress) : undefined;
    payload.dataRestrictionDays = payload.dataRestrictionDays ? Number(payload.dataRestrictionDays) : undefined;

    if (!editUser) {
      if (isSuperAdmin) {
        const finalDealerId = toNum(selDealerId);
        const finalAdminId = toNum(selAdminId);
        payload.superAdminId = toNum(currentUser.user_id);
        payload.adminId = finalAdminId;
        payload.dealerId = finalDealerId;
        payload.parentId = finalDealerId;
        payload.createdBy = finalDealerId;
        payload.ownerId = finalDealerId;
        payload.ownerName = selDealerObj ? (selDealerObj.fullName || selDealerObj.name || selDealerObj.username) : '';
      } else if (isAdmin) {
        const finalDealerId = toNum(selDealerId);
        payload.superAdminId = toNum(currentUser.superAdminId);
        payload.adminId = toNum(currentUser.user_id);
        payload.dealerId = finalDealerId;
        payload.parentId = finalDealerId;
        payload.createdBy = finalDealerId;
        payload.ownerId = finalDealerId;
        payload.ownerName = selDealerObj ? (selDealerObj.fullName || selDealerObj.name || selDealerObj.username) : '';
      } else if (isDealer) {
        const myId = toNum(currentUser.user_id);
        payload.superAdminId = toNum(currentUser.superAdminId);
        payload.adminId = toNum(currentUser.adminId);
        payload.dealerId = myId;
        payload.parentId = myId;
        payload.createdBy = myId;
        payload.ownerId = myId;
        payload.ownerName = currentUser.fullName || currentUser.name || currentUser.username;
      }
    }

    onSubmit(payload);
  };

  // Split roles into two columns for better display
  const filteredRoles = accessRoles.filter(r =>
    r.roleName.toLowerCase().includes(roleSearch.toLowerCase())
  );
  
  const midPoint = Math.ceil(filteredRoles.length / 2);
  const leftColumnRoles = filteredRoles.slice(0, midPoint);
  const rightColumnRoles = filteredRoles.slice(midPoint);

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.50)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px 0', overflowY: 'auto' }}
    >
      <div style={{ width: '98vw', maxWidth: 1200, background: '#f9fafb', borderRadius: 6, display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden', margin: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 48, background: HEADER_BG, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
              {editUser ? `Edit User ` : 'Add User'}
            </span>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, opacity: 0.8, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
          <TabBtn active={activeTab === 1} onClick={() => setActiveTab(1)}>
            Basic Info
          </TabBtn>
          <TabBtn active={activeTab === 2} onClick={() => setActiveTab(2)}>
            Access Management
          </TabBtn>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit} autoComplete="off">
            <div style={{ padding: '18px 24px 14px', background: '#fff' }}>

              {error && (
                <div style={{ padding: '8px 14px', marginBottom: 14, background: '#fef2f2', border: '1px solid #fca5a5', borderLeft: '4px solid #ef4444', borderRadius: 4, fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
                  ⚠ {error}
                </div>
              )}

          {/* Tab 1: Basic Info */}
          {activeTab === 1 && (
            <>
              {/* Row 1: Admin and Dealer Selection */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
                <div>
                  <L text="Username" req />
                  <input style={INP} value={form.username} onChange={e => set('username', e.target.value)} placeholder="Username" autoComplete="off" onFocus={fo} onBlur={fb} />
                  <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>[A-z, 0-9, _, *, @]</div>
                </div>
                <div>
                  <L text={editUser ? 'New Password' : 'Password'} req={!editUser} opt={!!editUser} />
                  <input style={INP} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder={editUser ? 'Leave blank to keep' : 'Set password'} autoComplete="new-password" onFocus={fo} onBlur={fb} />
                </div>
                <div>
                  <L text="Confirm Password" req={!editUser} opt={!!editUser} />
                  <input style={INP} type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="Confirm password" autoComplete="new-password" onFocus={fo} onBlur={fb} />
                </div>
                <div>
                  <L text="Select Admin" req={isSuperAdmin && !editUser} />
                  {isSuperAdmin && !editUser ? (
                    <select style={SEL} value={selAdminId} onChange={e => setSelAdminId(e.target.value)}>
                      <option value="">— Select Admin —</option>
                      {adminsList.map(a => (
                        <option key={a._id || a.user_id} value={a.user_id}>
                          {a.fullName || a.name || a.username} (ID: {a.user_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input style={INP_RO} value={selAdminObj?.fullName || selAdminObj?.username || (isAdmin ? currentUser?.fullName || currentUser?.username : '—')} readOnly />
                  )}
                </div>
              </div>

              {/* Row 2: Username / Password / Confirm Password / Full Name */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
                  <div>
                  <L text="Select Dealer" req={(isSuperAdmin || isAdmin) && !editUser} />
                  {(isSuperAdmin && !editUser) || (isAdmin && !editUser) ? (
                    <select style={(isSuperAdmin && !selAdminId) ? SEL_DISABLED : SEL} value={selDealerId} disabled={isSuperAdmin && !selAdminId} onChange={e => setSelDealerId(e.target.value)}>
                      <option value="">— Select Dealer —</option>
                      {availableDealers.map(d => (
                        <option key={d._id || d.user_id} value={d.user_id}>
                          {d.fullName || d.name || d.username} (ID: {d.user_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input style={INP_RO} value={selDealerObj?.fullName || selDealerObj?.username || (isDealer ? currentUser?.fullName || currentUser?.username : '—')} readOnly />
                  )}
                </div>
                <div>
                  <L text="Full Name" req />
                  <input style={INP} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Full Name" autoComplete="off" onFocus={fo} onBlur={fb} />
                </div>
                <div><L text="Company" opt /><input style={INP} value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company Name" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                <div><L text="Email" opt /><input style={INP} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
              </div>

              {/* Row 3: Company / Email / Phone / Address */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
                <div><L text="Phone" opt /><input style={INP} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                <div><L text="Address" opt /><input style={INP} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Address" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                <div>
                  <L text="Language" req />
                  <select style={SEL} value={form.language} onChange={e => set('language', e.target.value)}>
                    {['English', 'Hindi', 'Gujarati', 'Marathi', 'Tamil', 'Telugu'].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div><L text="Max Vehicle Count" opt /><input style={INP} type="number" min="0" value={form.maxVehicles} onChange={e => set('maxVehicles', e.target.value)} placeholder="Max Vehicles" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
              </div>

              {/* Row 5: Inactive Time / Auto Expiry / Subscription Extend Date / Subscription Expiry Count */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
                <div>
                  <L text="Subscription Start Date" req />
                  <input style={INP} type="date" value={form.subscriptionStartDate} onChange={e => set('subscriptionStartDate', e.target.value)} onFocus={fo} onBlur={fb} />
                </div>
                <div>
                  <L text="Subscription Due Date" req />
                  <input style={INP} type="date" value={form.subscriptionDueDate} onChange={e => set('subscriptionDueDate', e.target.value)} onFocus={fo} onBlur={fb} />
                </div>
                <div>
                  <L text="Subscription Extend Date" opt />
                  <input style={INP} type="date" value={form.subscriptionExtendDate} onChange={e => set('subscriptionExtendDate', e.target.value)} onFocus={fo} onBlur={fb} />
                </div>
                <div>
                  <L text="Subscription Expiry Count" opt />
                  <input style={INP} type="number" value={form.subscriptionExpiryCount} onChange={e => set('subscriptionExpiryCount', e.target.value)} placeholder="Days" onFocus={fo} onBlur={fb} />
                </div>
              </div>



              {/* Row 4: Language / Domain / Max Vehicle Count / Timezone */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
                  <div>
                  <L text="Auto Expiry" />
                  <select style={SEL} value={form.autoExpiry} onChange={e => set('autoExpiry', e.target.value)}>
                    <option value="N">No</option>
                    <option value="Y">Yes</option>
                  </select>
                </div>
                <div>
                  <L text="Timezone" req />
                  <select style={SEL} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                    <option value="Asia/Calcutta">(GMT+5:30) Asia/Calcutta</option>
                    <option value="Asia/Kolkata">(GMT+5:30) Asia/Kolkata</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">(GMT-5:00) New York</option>
                    <option value="Europe/London">(GMT+0:00) London</option>
                  </select>
                </div>
              </div>

              {/* Row 7: Checkboxes - All checkboxes in one row */}
              <div>
                <div >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
                  <input type="checkbox" checked={form.status === 'Active'} onChange={e => set('status', e.target.checked ? 'Active' : 'Inactive')} style={{ width: 15, height: 15, accentColor: ACCENT, cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>Active</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.overwriteSubscription} onChange={e => set('overwriteSubscription', e.target.checked)} style={{ width: 15, height: 15, accentColor: ACCENT, cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: '#374151' }}>Overwrite Subscription for all vehicles</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.vehicleInactiveAfterExpiry} onChange={e => set('vehicleInactiveAfterExpiry', e.target.checked)} style={{ width: 15, height: 15, accentColor: ACCENT, cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: '#374151' }}>Vehicle inactive after subscription expire</span>
                </label>
              </div>
                <div></div>
              </div>
            </>
          )}

              {/* Tab 2: Access Management - Two Column Layout */}
              {activeTab === 2 && (
                <div>
                  <div style={{ padding: '0 0 10px 0', borderBottom: '1px solid #e5e7eb', marginBottom: 12 }}>
                    <input
                      style={{ ...INP, width: 260 }}
                      placeholder="Search roles..."
                      value={roleSearch}
                      onChange={e => setRoleSearch(e.target.value)}
                    />
                  </div>
                  <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      {/* Left Column */}
                      <div>
                        {leftColumnRoles.map(role => {
                          const idx = accessRoles.findIndex(r => r.roleName === role.roleName);
                          return (
                            <div key={role.roleName} style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              borderBottom: '1px solid #f3f4f6'
                            }}>
                              <span style={{ fontSize: 12, color: '#374151' }}>{role.roleName}</span>
                              <Toggle
                                checked={role.isEnabled}
                                onChange={e => {
                                  const updated = [...accessRoles];
                                  updated[idx] = { ...updated[idx], isEnabled: e.target.checked };
                                  setAccessRoles(updated);
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Right Column */}
                      <div>
                        {rightColumnRoles.map(role => {
                          const idx = accessRoles.findIndex(r => r.roleName === role.roleName);
                          return (
                            <div key={role.roleName} style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              borderBottom: '1px solid #f3f4f6'
                            }}>
                              <span style={{ fontSize: 12, color: '#374151' }}>{role.roleName}</span>
                              <Toggle
                                checked={role.isEnabled}
                                onChange={e => {
                                  const updated = [...accessRoles];
                                  updated[idx] = { ...updated[idx], isEnabled: e.target.checked };
                                  setAccessRoles(updated);
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 24px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
              {error && <span style={{ flex: 1, fontSize: 11, color: '#dc2626', fontWeight: 500 }}>⚠ {error}</span>}
              <button type="button" onClick={onClose} style={{ height: 36, padding: '0 22px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>CANCLE</button>
              <button type="submit" disabled={loading}
                style={{ height: 36, padding: '0 30px', background: loading ? '#6ee7b7' : ACCENT, color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                {loading
                  ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'auSpin .7s linear infinite' }} />Saving…</>
                  : editUser ? 'UPDATE' : 'SAVE'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <style>{`@keyframes auSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AddUser;