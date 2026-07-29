import React, { useState, useEffect } from 'react';
import { useTheme } from '../../../context/ThemeContext';

// ─────────────────────────────────────────────────────────────────────────────
//  AddDealer.jsx — UPDATED with Admin selector in Admin field
//  
//  Clean 4-column layout with proper field arrangement
//  Consistent styling with AddUser component
// ─────────────────────────────────────────────────────────────────────────────

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
};

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
  ...INP,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
  backgroundSize: '14px', paddingRight: 28, cursor: 'pointer',
};

// const fo = e => (e.target.style.borderColor = ACCENT);
// const fb = e => (e.target.style.borderColor = '#d1d5db');

const AddDealer = ({
  open        = false,
  onClose,
  onSubmit,
  editDealer  = null,
  currentUser = null,
  loading     = false,
  adminsList  = [],
}) => {
  const theme = useTheme();
  ACCENT    = theme?.activeColor || ACCENT_DEFAULT;
  HEADER_BG = theme?.activeColor || HEADER_BG_DEFAULT;

  const fo = e => (e.target.style.borderColor = ACCENT);
  const fb = e => (e.target.style.borderColor = '#d1d5db');

  const [form,        setForm]        = useState(EMPTY);
  const [error,       setError]       = useState('');
  const [selAdminId,  setSelAdminId]  = useState('');
  const [selAdminObj, setSelAdminObj] = useState(null);

  const isEdit       = !!editDealer;
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin      = currentUser?.role === 'admin';

  useEffect(() => {
    if (!open) return;
    setError('');

    if (isEdit) {
      const mv = editDealer.maxVehicles ?? editDealer.maxVehicleCount ?? '';
      setForm({
        username:        editDealer.username  || '',
        password:        '',
        confirmPassword: '',
        fullName:        editDealer.fullName  || editDealer.name || '',
        email:           editDealer.email     || '',
        phone:           editDealer.phone     || '',
        company:         editDealer.company   || '',
        address:         editDealer.address   || '',
        language:        editDealer.language  || 'English',
        domain:          editDealer.domain    || '',
        maxVehicles:     mv != null ? mv : '',
        timezone:        editDealer.timezone  || 'Asia/Calcutta',
        status:          editDealer.status    || 'Active',
      });
      const aid = editDealer.adminId;
      const aidStr = aid ? String(aid) : '';
      setSelAdminId(aidStr);
      setSelAdminObj(adminsList.find(a => Number(a.user_id) === Number(aid)) || null);
    } else {
      setForm({ ...EMPTY });
      setSelAdminId('');
      setSelAdminObj(null);
    }
  }, [open, isEdit, editDealer, adminsList]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleReset = () => {
    setError('');
    if (isEdit) {
      const mv = editDealer.maxVehicles ?? editDealer.maxVehicleCount ?? '';
      setForm({
        username:        editDealer.username  || '',
        password:        '',
        confirmPassword: '',
        fullName:        editDealer.fullName  || editDealer.name || '',
        email:           editDealer.email     || '',
        phone:           editDealer.phone     || '',
        company:         editDealer.company   || '',
        address:         editDealer.address   || '',
        language:        editDealer.language  || 'English',
        domain:          editDealer.domain    || '',
        maxVehicles:     mv != null ? mv : '',
        timezone:        editDealer.timezone  || 'Asia/Calcutta',
        status:          editDealer.status    || 'Active',
      });
      const aid = editDealer.adminId;
      setSelAdminId(aid ? String(aid) : '');
      setSelAdminObj(adminsList.find(a => Number(a.user_id) === Number(aid)) || null);
    } else {
      setForm({ ...EMPTY });
      setSelAdminId('');
      setSelAdminObj(null);
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) return setError('Full Name is required');
    if (!form.username.trim()) return setError('Username is required');
    if (isSuperAdmin && !isEdit && !selAdminId)
      return setError('Please select a Parent Admin for this Dealer');
    if (!isEdit) {
      if (!form.password.trim())                  return setError('Password is required');
      if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    } else if (form.password && form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }

    const payload = { ...form, role: 'dealer' };
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

    if (!isEdit) {
      if (isSuperAdmin) {
        const adminData = adminsList.find(a => Number(a.user_id) === Number(selAdminId));
        payload.superAdminId = currentUser.user_id;
        payload.adminId      = adminData ? adminData.user_id : Number(selAdminId);
        payload.dealerId     = null;
        payload.parentId     = adminData ? adminData.user_id : Number(selAdminId);
        payload.createdBy    = adminData ? adminData.user_id : Number(selAdminId);
        payload.ownerId      = adminData ? adminData.user_id : Number(selAdminId);
        payload.ownerName    = adminData
          ? (adminData.fullName || adminData.name || adminData.username)
          : '';
      } else if (isAdmin) {
        payload.superAdminId = currentUser.superAdminId ?? null;
        payload.adminId      = currentUser.user_id;
        payload.dealerId     = null;
        payload.parentId     = currentUser.user_id;
        payload.createdBy    = currentUser.user_id;
        payload.ownerId      = currentUser.user_id;
        payload.ownerName    = currentUser.fullName || currentUser.name || currentUser.username;
      }
    }

    onSubmit(payload);
  };

  const adminDisplay = isEdit
    ? (selAdminObj?.fullName || selAdminObj?.name || selAdminObj?.username || '—')
    : isSuperAdmin
      ? (selAdminObj ? (selAdminObj.fullName || selAdminObj.name || selAdminObj.username) : '— Select Admin —')
      : (currentUser?.fullName || currentUser?.name || currentUser?.username || '');

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
       style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px 0', overflowY: 'auto' }}
    >
      <div style={{ width: '98vw', maxWidth: 1200, background: '#f9fafb', borderRadius: 6, display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden', margin: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 48, background: HEADER_BG, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            {isEdit ? `Edit Dealer` : 'Add Dealer'}
          </span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, opacity: 0.8, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit} autoComplete="off">
            <div style={{ padding: '18px 24px 14px', background: '#fff' }}>

              {error && (
                <div style={{ padding: '8px 14px', marginBottom: 14, background: '#fef2f2', border: '1px solid #fca5a5', borderLeft: '4px solid #ef4444', borderRadius: 4, fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
                  ⚠ {error}
                </div>
              )}

              {/* Row 1: Admin / Username / Password / Confirm Password */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
                <div>
                  <L text="Admin" req={!isEdit && (isSuperAdmin || isAdmin)} />
                  {isSuperAdmin && !isEdit ? (
                    <select style={SEL} value={selAdminId}
                      onChange={e => {
                        const v = e.target.value;
                        setSelAdminId(v);
                        setSelAdminObj(adminsList.find(a => Number(a.user_id) === Number(v)) || null);
                      }}>
                      <option value="">— Select Admin —</option>
                      {adminsList.map(a => (
                        <option key={a._id || a.user_id} value={a.user_id}>
                          {a.fullName || a.name || a.username} (ID: {a.user_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input style={INP_RO} value={adminDisplay} readOnly tabIndex={-1} autoComplete="off" />
                  )}
                </div>
                <div>
                  <L text="Username" req />
                  <input
                    style={INP}
                    value={form.username}
                    onChange={e => set('username', e.target.value)}
                    placeholder="Username"
                    autoComplete="off"
                    onFocus={fo} onBlur={fb}
                  />
                  <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>[A-z, 0-9, _, *, @]</div>
                </div>
                <div>
                  <L text={isEdit ? 'New Password' : 'Password'} req={!isEdit} opt={isEdit} />
                  <input
                    style={INP}
                    type="password"
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder={isEdit ? 'Leave blank to keep' : 'Set password'}
                    autoComplete="new-password"
                    onFocus={fo} onBlur={fb}
                  />
                </div>
                <div>
                  <L text="Confirm Password" req={!isEdit} opt={isEdit} />
                  <input
                    style={INP}
                    type="password"
                    value={form.confirmPassword}
                    onChange={e => set('confirmPassword', e.target.value)}
                    placeholder={isEdit ? 'Leave blank to keep' : 'Confirm password'}
                    autoComplete="new-password"
                    onFocus={fo} onBlur={fb}
                  />
                </div>
              </div>

              {/* Row 2: Full Name / Company / Email / Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
                <div><L text="Full Name" req /><input style={INP} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Full Name" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                <div><L text="Company" opt /><input style={INP} value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company Name" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                <div><L text="Email" opt /><input style={INP} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                <div><L text="Phone" opt /><input style={INP} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
              </div>

              {/* Row 3: Address / Language / Domain / Max Vehicle Count */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
                <div><L text="Address" opt /><input style={INP} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Address" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                <div>
                  <L text="Language" req />
                  <select style={SEL} value={form.language} onChange={e => set('language', e.target.value)}>
                    {['English', 'Hindi', 'Gujarati', 'Marathi', 'Tamil', 'Telugu'].map(l => <option key={l}>{l}</option>)}
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
                <div>
                  <L text="Max Vehicle Count" opt />
                  <input style={INP} type="number" min="0" value={form.maxVehicles} onChange={e => set('maxVehicles', e.target.value)} placeholder="Max Vehicles" autoComplete="off" onFocus={fo} onBlur={fb} />
                </div>
              </div>

              {/* Row 4: Timezone / Active / Empty / Empty */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.status === 'Active'} onChange={e => set('status', e.target.checked ? 'Active' : 'Inactive')} style={{ width: 15, height: 15, accentColor: ACCENT, cursor: 'pointer' }} />
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Active</span>
                  </label>
                </div>
                <div></div>
                <div></div>
              </div>

            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 24px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
              {error && <span style={{ flex: 1, fontSize: 11, color: '#dc2626', fontWeight: 500 }}>⚠ {error}</span>}
              <button type="button" onClick={onClose} style={{ height: 36, padding: '0 22px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>CANCLE</button>
              <button type="submit" disabled={loading}
                style={{ height: 36, padding: '0 30px', background: loading ? '#99f6e4' : ACCENT, color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                {loading
                  ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'adSpin .7s linear infinite' }} />Saving…</>
                  : isEdit ? ' UPDATE' : 'SAVE'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <style>{`@keyframes adSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AddDealer;