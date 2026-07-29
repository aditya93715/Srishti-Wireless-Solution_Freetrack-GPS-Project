import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../../context/ThemeContext';

const ACCENT_DEFAULT    = '#0d9488';
const HEADER_BG_DEFAULT = '#134e4a';
let ACCENT    = ACCENT_DEFAULT;
let HEADER_BG = HEADER_BG_DEFAULT;

const EMPTY = {
  username:                   '',
  password:                   '',
  confirmPassword:             '',
  fullName:                   '',
  email:                      '',
  phone:                      '',
  company:                    '',
  address:                    '',
  language:                   'English',
  domain:                     '',
  maxVehicles:                '',
  timezone:                   'Asia/Calcutta',
  status:                     'Active',
  subscriptionStartDate:      '',
  subscriptionDueDate:        '',
  subscriptionExtendDate:     '',
  subscriptionExpiryCount:    '10',
  autoExpiry:                 'N',
  overwriteSubscription:      false,
  vehicleInactiveAfterExpiry: false,
};

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
const INP_RO = {
  ...INP,
  background: '#f3f4f6', color: '#6b7280',
  cursor: 'not-allowed', border: '1px solid #e5e7eb',
};
const SEL = {
  ...INP,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
  backgroundSize: '14px', paddingRight: 28, cursor: 'pointer',
};

const GRID4 = { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 };

// const fo = e => (e.target.style.borderColor = ACCENT);
// const fb = e => (e.target.style.borderColor = '#d1d5db');
const toNum = v => { const n = Number(v); return isNaN(n) ? null : n; };

const TabBtn = ({ active, onClick, children, color = ACCENT_DEFAULT }) => (
  <button onClick={onClick} type="button" style={{
    flex: 1, padding: '10px 8px', textAlign: 'center', fontSize: 12, cursor: 'pointer',
    color: active ? color : '#6b7280', fontWeight: active ? 700 : 500,
    background: active ? `${color}15` : '#fff', border: 'none',
    borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
    fontFamily: 'inherit', transition: 'all 0.2s',
  }}>{children}</button>
);

const Toggle = ({ checked, onChange, color = ACCENT_DEFAULT }) => (
  <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
    <span style={{ position: 'absolute', inset: 0, background: checked ? color : '#d1d5db', borderRadius: 20, transition: '0.3s' }}>
      <span style={{ position: 'absolute', height: 14, width: 14, left: checked ? 19 : 3, bottom: 3, background: '#fff', borderRadius: '50%', transition: '0.3s' }} />
    </span>
  </label>
);

/**
 * AddUser — Admin dashboard user form.
 * No "Admin" display field shown. All rows are 4 columns.
 * Row 1: Username / Password / Confirm Password / Select Dealer
 *
 * Props:
 *   open        {boolean}
 *   onClose     {() => void}
 *   onSubmit    {(payload) => void}
 *   editUser    {object|null}
 *   currentUser {object}        — role: 'admin'
 *   loading     {boolean}
 *   dealersList {array}         — dealers belonging to this admin
 */
const AddUser = ({
  open        = false,
  onClose,
  onSubmit,
  editUser    = null,
  currentUser = null,
  loading     = false,
  dealersList = [],
}) => {
  const theme = useTheme();
  ACCENT    = theme?.activeColor || ACCENT_DEFAULT;
  HEADER_BG = theme?.activeColor || HEADER_BG_DEFAULT;

  const fo = e => (e.target.style.borderColor = ACCENT);
  const fb = e => (e.target.style.borderColor = '#d1d5db');

  const [activeTab,   setActiveTab]   = useState(1);
  const [form,        setForm]        = useState(EMPTY);
  const [accessRoles, setAccessRoles] = useState(DEFAULT_ROLES);
  const [roleSearch,  setRoleSearch]  = useState('');
  const [error,       setError]       = useState('');
  const [selDealerId, setSelDealerId] = useState('');

  const isEdit = !!editUser;

  const selDealerObj = useMemo(
    () => dealersList.find(d => toNum(d.user_id) === toNum(selDealerId)) || null,
    [dealersList, selDealerId]
  );

  const buildEditForm = (u) => ({
    username:                   u.username || '',
    password:                   '',
    confirmPassword:             '',
    fullName:                   u.fullName || u.name || '',
    email:                      u.email    || '',
    phone:                      u.phone    || '',
    company:                    u.company  || '',
    address:                    u.address  || '',
    language:                   u.language || 'English',
    domain:                     u.domain   || '',
    maxVehicles:                u.maxVehicles ?? u.maxVehicleCount ?? '',
    timezone:                   u.timezone || 'Asia/Calcutta',
    status:                     u.status   || 'Active',
    subscriptionStartDate:      u.subscriptionStartDate  ? u.subscriptionStartDate.split('T')[0]  : '',
    subscriptionDueDate:        u.subscriptionDueDate    ? u.subscriptionDueDate.split('T')[0]    : '',
    subscriptionExtendDate:     u.subscriptionExtendDate ? u.subscriptionExtendDate.split('T')[0] : '',
    subscriptionExpiryCount:    String(u.subscriptionExpiryCount ?? '10'),
    autoExpiry:                 u.autoExpiry || 'N',
    overwriteSubscription:      u.overwriteSubscription      ?? false,
    vehicleInactiveAfterExpiry: u.vehicleInactiveAfterExpiry ?? false,
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    setActiveTab(1);
    setRoleSearch('');
    if (isEdit) {
      setForm(buildEditForm(editUser));
      setAccessRoles(editUser.accessRoles?.length ? editUser.accessRoles : DEFAULT_ROLES);
      setSelDealerId(editUser.dealerId ? String(editUser.dealerId) : '');
    } else {
      setForm({ ...EMPTY });
      setAccessRoles(DEFAULT_ROLES);
      setSelDealerId('');
    }
  }, [open, editUser]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleReset = () => {
    setError('');
    if (isEdit) {
      setForm(buildEditForm(editUser));
      setAccessRoles(editUser.accessRoles?.length ? editUser.accessRoles : DEFAULT_ROLES);
      setSelDealerId(editUser.dealerId ? String(editUser.dealerId) : '');
    } else {
      setForm({ ...EMPTY });
      setAccessRoles(DEFAULT_ROLES);
      setSelDealerId('');
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) return setError('Full Name is required');
    if (!form.username.trim()) return setError('Username is required');
    if (!isEdit) {
      if (!selDealerId)                           return setError('Please select a Dealer');
      if (!form.password.trim())                  return setError('Password is required');
      if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    } else if (form.password && form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }

    // KEY: always send role:'user' so backend does not default to creating a dealer
    const payload = { ...form, role: 'user', accessRoles };
    delete payload.confirmPassword;
    if (isEdit && !payload.password) delete payload.password;

    if (payload.maxVehicles !== '' && payload.maxVehicles != null) {
      const n = Number(payload.maxVehicles);
      payload.maxVehicles     = isNaN(n) ? null : n;
      payload.maxVehicleCount = payload.maxVehicles;
    } else {
      payload.maxVehicles     = null;
      payload.maxVehicleCount = null;
    }
    payload.subscriptionExpiryCount = Number(payload.subscriptionExpiryCount) || 10;

    if (!isEdit) {
      const finalDealerId  = toNum(selDealerId);
      payload.superAdminId = toNum(currentUser?.superAdminId) ?? null;
      payload.adminId      = toNum(currentUser?.user_id);
      payload.dealerId     = finalDealerId;
      payload.parentId     = finalDealerId;
      payload.createdBy    = finalDealerId;
      payload.ownerId      = finalDealerId;
      payload.ownerName    = selDealerObj
        ? (selDealerObj.fullName || selDealerObj.name || selDealerObj.username)
        : '';
    }

    onSubmit(payload);
  };

  const filteredRoles = accessRoles.filter(r =>
    r.roleName.toLowerCase().includes(roleSearch.toLowerCase())
  );
  const mid   = Math.ceil(filteredRoles.length / 2);
  const left  = filteredRoles.slice(0, mid);
  const right = filteredRoles.slice(mid);

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.50)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px 0', overflowY: 'auto' }}
    >
      <div style={{ width: '98vw', maxWidth: 1200, background: '#f9fafb', borderRadius: 6, display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden', margin: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 48, background: HEADER_BG, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{isEdit ? 'Edit User' : 'Add User'}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, opacity: 0.8, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
          <TabBtn active={activeTab === 1} onClick={() => setActiveTab(1)} color={ACCENT}>Basic Info</TabBtn>
          <TabBtn active={activeTab === 2} onClick={() => setActiveTab(2)} color={ACCENT}>Access Management</TabBtn>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit} autoComplete="off">
            <div style={{ padding: '18px 24px 14px', background: '#fff' }}>

              {error && (
                <div style={{ padding: '8px 14px', marginBottom: 14, background: '#fef2f2', border: '1px solid #fca5a5', borderLeft: '4px solid #ef4444', borderRadius: 4, fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
                  ⚠ {error}
                </div>
              )}

              {activeTab === 1 && (
                <>
                  {/* Row 1: Username / Password / Confirm Password / Select Dealer */}
                  <div style={GRID4}>
                    <div>
                      <L text="Username" req />
                      <input style={INP} value={form.username} onChange={e => set('username', e.target.value)}
                        placeholder="Username" autoComplete="off" onFocus={fo} onBlur={fb} />
                      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>[A-z, 0-9, _, *, @]</div>
                    </div>
                    <div>
                      <L text={isEdit ? 'New Password' : 'Password'} req={!isEdit} opt={isEdit} />
                      <input style={INP} type="password" value={form.password}
                        onChange={e => set('password', e.target.value)}
                        placeholder={isEdit ? 'Leave blank to keep' : 'Set password'}
                        autoComplete="new-password" onFocus={fo} onBlur={fb} />
                    </div>
                    <div>
                      <L text="Confirm Password" req={!isEdit} opt={isEdit} />
                      <input style={INP} type="password" value={form.confirmPassword}
                        onChange={e => set('confirmPassword', e.target.value)}
                        placeholder={isEdit ? 'Leave blank to keep' : 'Confirm password'}
                        autoComplete="new-password" onFocus={fo} onBlur={fb} />
                    </div>
                    <div>
                      <L text="Select Dealer" req={!isEdit} />
                      {!isEdit ? (
                        <select style={SEL} value={selDealerId} onChange={e => setSelDealerId(e.target.value)}>
                          <option value="">— Select Dealer —</option>
                          {dealersList.map(d => (
                            <option key={d._id || d.user_id} value={d.user_id}>
                              {d.fullName || d.name || d.username} (ID: {d.user_id})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input style={INP_RO}
                          value={selDealerObj?.fullName || selDealerObj?.name || selDealerObj?.username || '—'}
                          readOnly />
                      )}
                      {dealersList.length === 0 && !isEdit && (
                        <div style={{ fontSize: 9, color: '#ef4444', marginTop: 2 }}>No dealers yet — create a dealer first.</div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Full Name / Company / Email / Phone */}
                  <div style={GRID4}>
                    <div>
                      <L text="Full Name" req />
                      <input style={INP} value={form.fullName} onChange={e => set('fullName', e.target.value)}
                        placeholder="Full Name" autoComplete="off" onFocus={fo} onBlur={fb} />
                    </div>
                    <div>
                      <L text="Company" opt />
                      <input style={INP} value={form.company} onChange={e => set('company', e.target.value)}
                        placeholder="Company Name" autoComplete="off" onFocus={fo} onBlur={fb} />
                    </div>
                    <div>
                      <L text="Email" opt />
                      <input style={INP} type="email" value={form.email} onChange={e => set('email', e.target.value)}
                        placeholder="Email" autoComplete="off" onFocus={fo} onBlur={fb} />
                    </div>
                    <div>
                      <L text="Phone" opt />
                      <input style={INP} value={form.phone} onChange={e => set('phone', e.target.value)}
                        placeholder="Phone" autoComplete="off" onFocus={fo} onBlur={fb} />
                    </div>
                  </div>

                  {/* Row 3: Address / Language / Max Vehicle Count / Timezone */}
                  <div style={GRID4}>
                    <div>
                      <L text="Address" opt />
                      <input style={INP} value={form.address} onChange={e => set('address', e.target.value)}
                        placeholder="Address" autoComplete="off" onFocus={fo} onBlur={fb} />
                    </div>
                    <div>
                      <L text="Language" req />
                      <select style={SEL} value={form.language} onChange={e => set('language', e.target.value)}>
                        {['English', 'Hindi', 'Gujarati', 'Marathi', 'Tamil', 'Telugu'].map(l =>
                          <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <L text="Max Vehicle Count" opt />
                      <input style={INP} type="number" min="0" value={form.maxVehicles}
                        onChange={e => set('maxVehicles', e.target.value)}
                        placeholder="Max Vehicles" autoComplete="off" onFocus={fo} onBlur={fb} />
                      {isEdit && form.maxVehicles !== '' && form.maxVehicles != null && (
                        <div style={{ fontSize: 9, color: '#059669', marginTop: 2 }}>Current: {form.maxVehicles} vehicles</div>
                      )}
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

                  {/* Row 4: Subscription Start / Due / Extend / Expiry Count */}
                  <div style={GRID4}>
                    <div>
                      <L text="Subscription Start Date" req />
                      <input style={INP} type="date" value={form.subscriptionStartDate}
                        onChange={e => set('subscriptionStartDate', e.target.value)} onFocus={fo} onBlur={fb} />
                    </div>
                    <div>
                      <L text="Subscription Due Date" req />
                      <input style={INP} type="date" value={form.subscriptionDueDate}
                        onChange={e => set('subscriptionDueDate', e.target.value)} onFocus={fo} onBlur={fb} />
                    </div>
                    <div>
                      <L text="Subscription Extend Date" opt />
                      <input style={INP} type="date" value={form.subscriptionExtendDate}
                        onChange={e => set('subscriptionExtendDate', e.target.value)} onFocus={fo} onBlur={fb} />
                    </div>
                    <div>
                      <L text="Subscription Expiry Count" opt />
                      <input style={INP} type="number" value={form.subscriptionExpiryCount}
                        onChange={e => set('subscriptionExpiryCount', e.target.value)}
                        placeholder="Days" onFocus={fo} onBlur={fb} />
                    </div>
                  </div>

                  {/* Row 5: Auto Expiry / Timezone (already in row 3) — just Auto Expiry standalone */}
                  <div style={GRID4}>
                    <div>
                      <L text="Auto Expiry" />
                      <select style={SEL} value={form.autoExpiry} onChange={e => set('autoExpiry', e.target.value)}>
                        <option value="N">No</option>
                        <option value="Y">Yes</option>
                      </select>
                    </div>
                    <div /><div /><div />
                  </div>

                  {/* Row 6: Checkboxes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.status === 'Active'}
                        onChange={e => set('status', e.target.checked ? 'Active' : 'Inactive')}
                        style={{ width: 15, height: 15, accentColor: ACCENT, cursor: 'pointer' }} />
                      <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>Active</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.overwriteSubscription}
                        onChange={e => set('overwriteSubscription', e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: ACCENT, cursor: 'pointer' }} />
                      <span style={{ fontSize: 14, color: '#374151' }}>Overwrite Subscription for all vehicles</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.vehicleInactiveAfterExpiry}
                        onChange={e => set('vehicleInactiveAfterExpiry', e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: ACCENT, cursor: 'pointer' }} />
                      <span style={{ fontSize: 14, color: '#374151' }}>Vehicle inactive after subscription expire</span>
                    </label>
                  </div>
                </>
              )}

              {activeTab === 2 && (
                <div>
                  <div style={{ paddingBottom: 10, borderBottom: '1px solid #e5e7eb', marginBottom: 12 }}>
                    <input style={{ ...INP, width: 260 }} placeholder="Search roles..."
                      value={roleSearch} onChange={e => setRoleSearch(e.target.value)} />
                  </div>
                  <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      {[left, right].map((col, ci) => (
                        <div key={ci}>
                          {col.map(role => {
                            const idx = accessRoles.findIndex(r => r.roleName === role.roleName);
                            return (
                              <div key={role.roleName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
                                <span style={{ fontSize: 12, color: '#374151' }}>{role.roleName}</span>
                                 <Toggle checked={role.isEnabled} color={ACCENT} onChange={e => {
                                  const upd = [...accessRoles];
                                  upd[idx] = { ...upd[idx], isEnabled: e.target.checked };
                                  setAccessRoles(upd);
                                }} />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 24px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
              {error && <span style={{ flex: 1, fontSize: 11, color: '#dc2626', fontWeight: 500 }}>⚠ {error}</span>}
              <button type="button" onClick={handleReset}
                style={{ height: 36, padding: '0 18px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                RESET
              </button>
              <button type="button" onClick={onClose}
                style={{ height: 36, padding: '0 22px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                CANCEL
              </button>
              <button type="submit" disabled={loading}
                style={{ height: 36, padding: '0 30px', background: loading ? '#6ee7b7' : ACCENT, color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                {loading
                  ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'auaFix .7s linear infinite' }} />Saving…</>
                  : isEdit ? 'UPDATE' : 'SAVE'
                }
              </button>
            </div>
          </form>
        </div>
      </div>
      <style>{`@keyframes auaFix { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AddUser;