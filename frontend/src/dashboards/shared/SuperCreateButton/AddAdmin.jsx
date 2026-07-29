import React, { useState, useEffect } from 'react';
import { useTheme } from '../../../context/ThemeContext';

const EMPTY = {
  username: '', password: '', confirmPassword: '',
  fullName: '', email: '', phone: '',
  company: '', address: '', language: 'English',
  domain: '', maxVehicles: '', timezone: 'Asia/Calcutta',
  status: 'Active', ownerName: '',
  allocatedCoins: '',
};

const ACCENT_DEFAULT    = '#0d9488';
const HEADER_BG_DEFAULT = '#134e4a';
let ACCENT    = ACCENT_DEFAULT;
let HEADER_BG = HEADER_BG_DEFAULT;

const AddAdmin = ({
  open,
  onClose,
  onSubmit,
  editAdmin   = null,
  currentUser = null,
  loading     = false,
}) => {
  const theme = useTheme();
  ACCENT    = theme?.activeColor || ACCENT_DEFAULT;
  HEADER_BG = theme?.activeColor || HEADER_BG_DEFAULT;

  const [form,  setForm]  = useState(EMPTY);
  const [error, setError] = useState('');

  const isEditMode = !!editAdmin;

  // ✅ buildForm - Edit mode mein allocatedCoins EMPTY rakho
  const buildForm = (src) => {
    const maxVehiclesValue =
      src.maxVehicles     != null ? src.maxVehicles
      : src.maxVehicleCount != null ? src.maxVehicleCount
      : '';
    return {
      username:        src.username        || '',
      password:        '',
      confirmPassword: '',
      fullName:        src.fullName || src.name || '',
      email:           src.email    || '',
      phone:           src.phone    || '',
      company:         src.company  || '',
      address:         src.address  || '',
      language:        src.language || 'English',
      domain:          src.domain   || '',
      maxVehicles:     maxVehiclesValue,
      timezone:        src.timezone || 'Asia/Calcutta',
      status:          src.status   || 'Active',
      ownerName:       src.ownerName || (currentUser?.fullName || currentUser?.name || ''),
      // ✅ EDIT MODE: allocatedCoins hamesha EMPTY
      allocatedCoins:  '',
    };
  };

  useEffect(() => {
    if (!open) return;
    setError('');

    if (editAdmin) {
      // ✅ Edit mode mein allocatedCoins EMPTY set karo
      setForm(buildForm(editAdmin));
    } else {
      setForm({
        ...EMPTY,
        ownerName: currentUser?.fullName || currentUser?.name || '',
      });
    }
  }, [editAdmin, open, currentUser]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleReset = () => {
    setError('');
    if (editAdmin) {
      setForm(buildForm(editAdmin));
    } else {
      setForm({
        ...EMPTY,
        ownerName: currentUser?.fullName || currentUser?.name || '',
      });
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) return setError('Full name is required');
    if (!form.username.trim()) return setError('Username is required');

    if (!isEditMode) {
      if (!form.password.trim())                  return setError('Password is required');
      if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    } else {
      if (form.password || form.confirmPassword) {
        if (form.password !== form.confirmPassword) return setError('Passwords do not match');
      }
    }

    // ── COIN VALIDATION ──────────────────────────────────────────────────────
    let coinAmount = 0;
    const coinRaw = form.allocatedCoins;

    if (coinRaw !== '' && coinRaw != null && coinRaw !== undefined) {
      const reqCoins = Number(coinRaw);
      if (isNaN(reqCoins) || reqCoins < 0) return setError('Invalid coin value');
      coinAmount = reqCoins;
    }

    // CREATE MODE: SuperAdmin has unlimited pool - no check needed
    // EDIT MODE: Check if parent has enough coins for the ADDITIONAL amount
    if (isEditMode && coinAmount > 0) {
      // SuperAdmin is creating/editing Admin, so no parent coin check needed
      // (SuperAdmin has unlimited pool)
      // But we still need to check if the current user (SuperAdmin) has enough
      // Actually SuperAdmin has unlimited, so skip check
    }
    // ──────────────────────────────────────────────────────────────────────────

    const submitData = { ...form };

    if (!isEditMode) {
      submitData.role      = 'admin';
      submitData.createdBy = currentUser?.user_id;
      submitData.ownerId   = currentUser?.user_id;
    }

    delete submitData.confirmPassword;
    if (isEditMode && !submitData.password) delete submitData.password;
    if (isEditMode) delete submitData.ownerName;

    if (submitData.maxVehicles !== '' && submitData.maxVehicles != null) {
      submitData.maxVehicleCount = submitData.maxVehicles;
    }

    // ✅ EDIT MODE: Send isEdit flag and coinAmount (additional coins)
    submitData.allocatedCoins = coinAmount;
    submitData.isEdit = isEditMode; // Tell backend this is edit mode

    onSubmit(submitData);
  };

  const title = isEditMode ? 'Edit Admin' : 'Add Admin';

  const L = ({ text, req, opt }) => (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#4b5565', marginBottom: 5 }}>
      {text}
      {req && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      {opt && <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400, marginLeft: 3 }}>(Optional)</span>}
    </label>
  );

  const inp = {
    width: '100%', height: 32, padding: '0 10px',
    background: '#fff', border: '1px solid #d0d7de', borderRadius: 3,
    fontSize: 12, color: '#1a1f2e', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };

  const selectStyle = {
    ...inp,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    backgroundSize: '16px',
    paddingRight: '32px',
  };

  const fo = e => (e.target.style.borderColor = ACCENT);
  const fb = e => (e.target.style.borderColor = '#d0d7de');

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '20px 0', overflowY: 'auto',
      }}
    >
      <div style={{
        width: '98vw', maxWidth: 1400, background: '#f5f7fa', borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden',
        maxHeight: '90vh', margin: 'auto',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 46, background: HEADER_BG, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>{title}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 22, opacity: 0.8, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={{ padding: '20px 24px 16px', background: '#fff', overflowY: 'auto', flex: 1 }}>

            {error && (
              <div style={{ padding: '7px 12px', marginBottom: 14, background: '#fff5f5', border: '1px solid #fca5a5', borderLeft: '3px solid #ef4444', borderRadius: 3, fontSize: 12, color: '#dc2626' }}>
                {error}
              </div>
            )}

            {/* Row 1: Owner / Username / Password / Confirm Password */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
              <div>
                <L text="Owner Name" req />
                <input
                  style={{ ...inp, background: '#f1f5f9', color: '#6b7280', cursor: 'not-allowed', border: '1px solid #e2e8f0' }}
                  value={form.ownerName}
                  readOnly
                  tabIndex={-1}
                  autoComplete="off"
                />
                <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>
                  {isEditMode ? 'Owner: ' + (editAdmin?.ownerName || 'Unknown') : 'Auto-filled from your account'}
                </div>
              </div>
              <div>
                <L text="Username" req />
                <input
                  style={inp}
                  value={form.username}
                  onChange={e => set('username', e.target.value)}
                  placeholder="New admin username"
                  autoComplete="off"
                  onFocus={fo}
                  onBlur={fb}
                  disabled={isEditMode}
                />
                <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>
                  Only [ A-z, 0-9, _, -, *, @ ] {isEditMode && '— cannot be changed after creation'}
                </div>
              </div>
              <div>
                <L text={isEditMode ? 'New Password' : 'Password'} req={!isEditMode} />
                <input style={inp} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder={isEditMode ? 'Leave blank to keep current' : 'Set password'} autoComplete="new-password" onFocus={fo} onBlur={fb} />
                {isEditMode && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Leave blank to keep current password</div>}
              </div>
              <div>
                <L text="Confirm Password" req={!isEditMode} />
                <input style={inp} type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder={isEditMode ? 'Leave blank to keep current' : 'Confirm password'} autoComplete="new-password" onFocus={fo} onBlur={fb} />
              </div>
            </div>

            {/* Row 2: Full Name / Company / Email / Phone */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
              <div><L text="Full Name" req /><input style={inp} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Full Name" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
              <div><L text="Company Name" opt /><input style={inp} value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company Name" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
              <div><L text="Email" opt /><input style={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
              <div><L text="Phone" opt /><input style={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
            </div>

            {/* Row 3: Address / Language / Timezone / Max Vehicle */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 14 }}>
              <div><L text="Address" opt /><input style={inp} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Address" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
              <div>
                <L text="Language" req />
                <select style={selectStyle} value={form.language} onChange={e => set('language', e.target.value)}>
                  <option>English</option><option>Hindi</option><option>Gujarati</option><option>Marathi</option>
                </select>
              </div>
              <div>
                <L text="Timezone" req />
                <select style={selectStyle} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  <option value="Asia/Calcutta">(GMT+5:30) Asia/Calcutta</option>
                  <option value="Asia/Kolkata">(GMT+5:30) Asia/Kolkata</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">(GMT-5:00) New York</option>
                  <option value="Europe/London">(GMT+0:00) London</option>
                </select>
              </div>
              <div>
                <L text="Max Vehicle Count" opt />
                <input style={inp} type="number" min="0" value={form.maxVehicles} onChange={e => set('maxVehicles', e.target.value)} placeholder="Max Vehicle Count" autoComplete="off" onFocus={fo} onBlur={fb} />
                {isEditMode && form.maxVehicles !== '' && form.maxVehicles != null && (
                  <div style={{ fontSize: 9, color: '#059669', marginTop: 2 }}>Current: {form.maxVehicles} vehicles</div>
                )}
              </div>
            </div>

            {/* Row 4: Coins / Active */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 18px', marginBottom: 16 }}>

              {/* ── COIN ALLOCATION FIELD ── */}
              <div>
                <L text={isEditMode ? 'Add Additional Coins' : 'Allocate Coins'} opt />
                <input
                  style={{ ...inp }}
                  type="number"
                  min="0"
                  value={form.allocatedCoins}
                  onChange={e => set('allocatedCoins', e.target.value)}
                  placeholder={isEditMode ? 'Add more coins' : '0'}
                  onFocus={fo}
                  onBlur={fb}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.status === 'Active'} onChange={e => set('status', e.target.checked ? 'Active' : 'Inactive')} style={{ width: 14, height: 14, accentColor: ACCENT, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Active</span>
                </label>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '10px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            {error && <span style={{ flex: 1, fontSize: 11, color: '#dc2626' }}>{error}</span>}
            <button type="button" onClick={handleReset} style={{ height: 34, padding: '0 18px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>RESET</button>
            <button type="button" onClick={onClose} style={{ height: 34, padding: '0 22px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>CANCEL</button>
            <button type="submit" disabled={loading} style={{ height: 34, padding: '0 28px', background: loading ? '#93c5fd' : ACCENT, color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {loading ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'aaSpin .7s linear infinite' }} />Saving…</> : isEditMode ? 'UPDATE' : 'SAVE'}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes aaSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default AddAdmin;