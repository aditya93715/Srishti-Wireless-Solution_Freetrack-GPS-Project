import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../../context/ThemeContext';

const ACCENT_DEFAULT    = '#0d9488';
const HEADER_BG_DEFAULT = '#134e4a';
let ACCENT    = ACCENT_DEFAULT;
let HEADER_BG = HEADER_BG_DEFAULT;

const EMPTY = {
  username:        '', password: '', confirmPassword: '',
  fullName:        '', email: '',   phone: '',
  company:         '', address: '', language: 'English',
  domain:          '', maxVehicles: '', timezone: 'Asia/Calcutta',
  status:          'Active',
  companyName:     '',
  logoUrl:         '',
  primaryColor:    '#6b46c1',
  secondaryColor:  '#9f7aea',
  allocatedCoins:  '',
};

const getFileName = (url) => {
  if (!url) return '';
  return url.split('/').pop();
};

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const getToken = () => {
  const keys = ['fleet_token', 'token', 'authToken', 'jwt', 'accessToken', 'auth_token', 'jwtToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v && JWT_PATTERN.test(v)) return v;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const v = localStorage.getItem(localStorage.key(i));
    if (v && JWT_PATTERN.test(v)) return v;
  }
  for (let i = 0; i < sessionStorage.length; i++) {
    const v = sessionStorage.getItem(sessionStorage.key(i));
    if (v && JWT_PATTERN.test(v)) return v;
  }
  return null;
};

const Ico = {
  close:  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  upload: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  spin:   <div style={{width:13,height:13,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'adaSpin .7s linear infinite'}}/>,
};

const TabBtn = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick} style={{
    flex:1, padding:'10px 8px', textAlign:'center', fontSize:12, cursor:'pointer',
    color: active ? ACCENT : '#6b7280', fontWeight: active ? 700 : 500,
    background: active ? '#f0fdf4' : '#fff', border:'none',
    borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
    fontFamily:'inherit', transition:'all 0.2s',
  }}>
    {children}
  </button>
);

const L = ({ text, req, opt }) => (
  <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#374151', marginBottom:4 }}>
    {text}
    {req && <span style={{ color:'#ef4444', marginLeft:2 }}>*</span>}
    {opt && <span style={{ fontSize:10, color:'#9ca3af', fontWeight:400, marginLeft:3 }}>(Optional)</span>}
  </label>
);

const INP = {
  width:'100%', height:34, padding:'0 10px',
  background:'#fff', border:'1px solid #d1d5db', borderRadius:4,
  fontSize:12, color:'#111827', outline:'none',
  boxSizing:'border-box', fontFamily:'inherit',
};
const INP_RO = { ...INP, background:'#f3f4f6', color:'#6b7280', cursor:'not-allowed', border:'1px solid #e5e7eb' };
const SEL = {
  ...INP,
  appearance:'none',
  backgroundImage:`url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
  backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center',
  backgroundSize:'14px', paddingRight:28, cursor:'pointer',
};

const AddDealer = ({
  open=false, onClose, onSubmit,
  editDealer=null, currentUser=null, loading=false,
}) => {
  const theme = useTheme();
  ACCENT    = theme?.activeColor || ACCENT_DEFAULT;
  HEADER_BG = theme?.activeColor || HEADER_BG_DEFAULT;

  const fo = e => (e.target.style.borderColor = ACCENT);
  const fb = e => (e.target.style.borderColor = '#d1d5db');

  const [form,           setForm]           = useState(EMPTY);
  const [error,          setError]          = useState('');
  const [activeTab,      setActiveTab]      = useState(1);
  const [uploading,      setUploading]      = useState(false);
  const [freshAvailable, setFreshAvailable] = useState(null);
  const logoInputRef = useRef(null);
  const isEdit = !!editDealer;

  const adminDisplayName = currentUser?.fullName || currentUser?.name || currentUser?.username || '—';
  const parentAvailable = freshAvailable;

  const fetchFreshCoins = async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch('/api/users/my-coins', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        console.log('[AddDealer] Fresh coins available:', data.coins.available);
        setFreshAvailable(data.coins.available);
      }
    } catch (_) {
      console.error('[AddDealer] Failed to fetch coins');
    }
  };

  const buildForm = (src) => ({
    username:       src.username      || '',
    password:       '', confirmPassword: '',
    fullName:       src.fullName       || src.name || '',
    email:          src.email          || '',
    phone:          src.phone          || '',
    company:        src.company        || '',
    address:        src.address        || '',
    language:       src.language       || 'English',
    domain:         src.domain         || '',
    maxVehicles:    src.maxVehicles != null ? src.maxVehicles : (src.maxVehicleCount != null ? src.maxVehicleCount : ''),
    timezone:       src.timezone       || 'Asia/Calcutta',
    status:         src.status         || 'Active',
    companyName:    src.companyName    || src.company || '',
    logoUrl:        src.logoUrl        || '',
    primaryColor:   src.primaryColor   || '#6b46c1',
    secondaryColor: src.secondaryColor || '#9f7aea',
    allocatedCoins: '',
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    setActiveTab(1);
    fetchFreshCoins();

    if (isEdit) {
      const formData = buildForm(editDealer);
      setForm(formData);

      const token = getToken();
      if (token && editDealer.user_id) {
        fetch(`/api/tenant/by-owner/${editDealer.user_id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
          .then(r => r.json())
          .then(data => {
            if (data.success && data.tenant) {
              const t = data.tenant;
              setForm(prev => ({
                ...prev,
                companyName:    t.companyName    || prev.companyName    || '',
                logoUrl:        t.logoUrl        || prev.logoUrl        || '',
                primaryColor:   t.primaryColor   || prev.primaryColor   || '#6b46c1',
                secondaryColor: t.secondaryColor || prev.secondaryColor || '#9f7aea',
                domain:         t.domain         || prev.domain         || '',
              }));
            }
          })
          .catch(() => {});
      }
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, isEdit, editDealer]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleReset = () => {
    setError('');
    if (isEdit) {
      const formData = buildForm(editDealer);
      setForm(formData);
      const token = getToken();
      if (token && editDealer.user_id) {
        fetch(`/api/tenant/by-owner/${editDealer.user_id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
          .then(r => r.json())
          .then(data => {
            if (data.success && data.tenant) {
              const t = data.tenant;
              setForm(prev => ({
                ...prev,
                companyName:    t.companyName    || prev.companyName    || '',
                logoUrl:        t.logoUrl        || prev.logoUrl        || '',
                primaryColor:   t.primaryColor   || prev.primaryColor   || '#6b46c1',
                secondaryColor: t.secondaryColor || prev.secondaryColor || '#9f7aea',
                domain:         t.domain         || prev.domain         || '',
              }));
            }
          })
          .catch(() => {});
      }
    } else {
      setForm({ ...EMPTY });
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const username = form.username.trim();
    if (!username) {
      setError('Please enter Username first (Basic Info tab) before uploading logo');
      e.target.value = '';
      return;
    }
    const fd = new FormData();
    fd.append('username', username);
    fd.append('logo', file);
    setUploading(true);
    setError('');
    try {
      const token = getToken();
      if (!token) { setError('Please login first'); e.target.value = ''; setUploading(false); return; }
      const res = await fetch('/api/upload/logo', {
        method:'POST',
        headers:{ 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`Server error (${res.status}): ${t}`); }
      const data = await res.json();
      if (data.success) { set('logoUrl', data.fileUrl); setError(''); }
      else setError(data.message || 'Upload failed');
    } catch (err) {
      setError('Upload error: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim())    return setError('Full Name is required');
    if (!form.username.trim())    return setError('Username is required');
    if (!isEdit) {
      if (!form.password.trim())                  return setError('Password is required');
      if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    } else if (form.password && form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }
    if (!isEdit) {
      if (!form.companyName.trim()) return setError('Company Name (Brand) is required — go to Branding tab');
      if (!form.domain.trim())      return setError('Domain is required — go to Branding tab');
    }

    // ── ✅ COIN VALIDATION ──────────────────────────────────────────────────────
    let coinAmount = 0;
    const coinRaw = form.allocatedCoins;
    
    if (coinRaw !== '' && coinRaw != null && coinRaw !== undefined) {
      const reqCoins = Number(coinRaw);
      if (isNaN(reqCoins) || reqCoins < 0) return setError('Invalid coin value');
      coinAmount = reqCoins;
    }

    // ✅ CREATE MODE: Check parent's available coins
    if (!isEdit && coinAmount > 0) {
      if (parentAvailable !== null && coinAmount > parentAvailable) {
        return setError(`You only have ${parentAvailable} coin(s) available`);
      }
    }

    // ✅ EDIT MODE: Check parent has enough coins for additional amount
    if (isEdit && coinAmount > 0) {
      if (parentAvailable !== null && coinAmount > parentAvailable) {
        return setError(`You only have ${parentAvailable} coin(s) available to add`);
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    const payload = { ...form, role:'dealer' };
    delete payload.confirmPassword;
    if (isEdit && !payload.password) delete payload.password;

    if (payload.maxVehicles !== '' && payload.maxVehicles != null) {
      const n = Number(payload.maxVehicles);
      payload.maxVehicles = isNaN(n) ? null : n;
      payload.maxVehicleCount = payload.maxVehicles;
    } else {
      payload.maxVehicles = null;
      payload.maxVehicleCount = null;
    }

    // ✅ EDIT MODE: Send isEdit flag and coinAmount
    payload.allocatedCoins = coinAmount;
    payload.isEdit = isEdit;

    console.log('[AddDealer] Submitting payload:', {
      username: payload.username,
      role: payload.role,
      allocatedCoins: payload.allocatedCoins,
      isEdit: payload.isEdit,
    });

    if (!isEdit) {
      payload.superAdminId = currentUser?.superAdminId ?? null;
      payload.adminId      = currentUser?.user_id;
      payload.dealerId     = null;
      payload.parentId     = currentUser?.user_id;
      payload.createdBy    = currentUser?.user_id;
      payload.ownerId      = currentUser?.user_id;
      payload.ownerName    = currentUser?.fullName || currentUser?.name || currentUser?.username || '';
    }

    onSubmit(payload);
  };

  const coinInfoStyle = (avail) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 8px', borderRadius: 4, fontSize: 11,
    marginTop: 3, fontWeight: 500,
    background: avail > 0 ? '#f0fdf4' : '#fef2f2',
    color: avail > 0 ? '#059669' : '#dc2626',
    border: `1px solid ${avail > 0 ? '#bbf7d0' : '#fca5a5'}`,
  });

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.48)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:'20px 0', overflowY:'auto' }}
    >
      <div style={{ width:'98vw', maxWidth:1100, background:'#f9fafb', borderRadius:6, display:'flex', flexDirection:'column', maxHeight:'90vh', boxShadow:'0 24px 64px rgba(0,0,0,0.4)', overflow:'hidden', margin:'auto' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', height:48, background:HEADER_BG, flexShrink:0 }}>
          <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{isEdit ? 'Edit Dealer' : 'Add Dealer'}</span>
          <button type="button" onClick={onClose} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', opacity:0.85 }}>
            {Ico.close}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #e5e7eb', background:'#fff', flexShrink:0 }}>
          <TabBtn active={activeTab===1} onClick={()=>setActiveTab(1)}>Basic Info</TabBtn>
          <TabBtn active={activeTab===2} onClick={()=>setActiveTab(2)}>Branding</TabBtn>
        </div>

        <div style={{ overflowY:'auto', flex:1 }}>
          <form onSubmit={handleSubmit} autoComplete="off">
            <div style={{ padding:'18px 24px 14px', background:'#fff' }}>

              {error && (
                <div style={{ padding:'8px 14px', marginBottom:14, background:'#fef2f2', border:'1px solid #fca5a5', borderLeft:'4px solid #ef4444', borderRadius:4, fontSize:12, color:'#dc2626', fontWeight:500 }}>
                  ⚠ {error}
                </div>
              )}

              {/* ── TAB 1: BASIC INFO ── */}
              {activeTab === 1 && (
                <>
                  {/* Row 1 */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px 18px', marginBottom:14 }}>
                    <div>
                      <L text="Admin (Owner)" />
                      <input style={INP_RO} value={adminDisplayName} readOnly tabIndex={-1} />
                      <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>Auto-filled from your account</div>
                    </div>
                    <div>
                      <L text="Username" req />
                      <input style={INP} value={form.username} onChange={e=>set('username',e.target.value)}
                        placeholder="Dealer username" autoComplete="off" onFocus={fo} onBlur={fb} disabled={isEdit} />
                      <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>
                        [A-z, 0-9, _, *, @]{isEdit && ' — cannot be changed'}
                      </div>
                    </div>
                    <div>
                      <L text={isEdit?'New Password':'Password'} req={!isEdit} opt={isEdit} />
                      <input style={INP} type="password" value={form.password} onChange={e=>set('password',e.target.value)}
                        placeholder={isEdit?'Leave blank to keep':'Set password'} autoComplete="new-password" onFocus={fo} onBlur={fb} />
                      {isEdit && <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>Leave blank to keep current</div>}
                    </div>
                    <div>
                      <L text="Confirm Password" req={!isEdit} opt={isEdit} />
                      <input style={INP} type="password" value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)}
                        placeholder={isEdit?'Leave blank to keep':'Confirm password'} autoComplete="new-password" onFocus={fo} onBlur={fb} />
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px 18px', marginBottom:14 }}>
                    <div><L text="Full Name" req /><input style={INP} value={form.fullName} onChange={e=>set('fullName',e.target.value)} placeholder="Full Name" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                    <div><L text="Company" opt /><input style={INP} value={form.company} onChange={e=>set('company',e.target.value)} placeholder="Company Name" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                    <div><L text="Email" opt /><input style={INP} type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="Email" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                    <div><L text="Phone" opt /><input style={INP} value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="Phone" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                  </div>

                  {/* Row 3 */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px 18px', marginBottom:14 }}>
                    <div><L text="Address" opt /><input style={INP} value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Address" autoComplete="off" onFocus={fo} onBlur={fb} /></div>
                    <div>
                      <L text="Language" req />
                      <select style={SEL} value={form.language} onChange={e=>set('language',e.target.value)}>
                        {['English','Hindi','Gujarati','Marathi','Tamil','Telugu'].map(l=><option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <L text="Timezone" req />
                      <select style={SEL} value={form.timezone} onChange={e=>set('timezone',e.target.value)}>
                        <option value="Asia/Calcutta">(GMT+5:30) Asia/Calcutta</option>
                        <option value="Asia/Kolkata">(GMT+5:30) Asia/Kolkata</option>
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">(GMT-5:00) New York</option>
                        <option value="Europe/London">(GMT+0:00) London</option>
                      </select>
                    </div>
                    <div>
                      <L text="Max Vehicle Count" opt />
                      <input style={INP} type="number" min="0" value={form.maxVehicles} onChange={e=>set('maxVehicles',e.target.value)} placeholder="Max Vehicles" autoComplete="off" onFocus={fo} onBlur={fb} />
                      {isEdit && form.maxVehicles !== '' && form.maxVehicles != null && (
                        <div style={{ fontSize:9, color:'#059669', marginTop:2 }}>Current: {form.maxVehicles} vehicles</div>
                      )}
                    </div>
                  </div>

                  {/* Row 4: Coins + Active */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px 18px', marginBottom:14 }}>

                    {/* ── COIN ALLOCATION ── */}
                    <div>
                      <L text={isEdit ? 'Add Additional Coins' : 'Allocate Coins'} opt />
                      <input
                        style={{ ...INP }}
                        type="number"
                        min="0"
                        max={parentAvailable ?? undefined}
                        value={form.allocatedCoins}
                        onChange={e => set('allocatedCoins', e.target.value)}
                        placeholder={isEdit ? 'Add more coins' : '0'}
                        onFocus={fo}
                        onBlur={fb}
                      />
                      {parentAvailable !== null && (
                        <div style={coinInfoStyle(parentAvailable)}>
                          {parentAvailable > 0 ? '✅' : '⚠️'} {parentAvailable} coin(s) available
                        </div>
                      )}
                      {isEdit && (
                        <div style={{ fontSize:9, color:'#6b7280', marginTop:2 }}>
                          Current allocated: {editDealer?.allocatedCoins || 0} coins
                        </div>
                      )}
                    </div>

                    <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:4 }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                        <input type="checkbox" checked={form.status==='Active'} onChange={e=>set('status',e.target.checked?'Active':'Inactive')}
                          style={{ width:15, height:15, accentColor:ACCENT, cursor:'pointer' }} />
                        <span style={{ fontSize:13, color:'#374151', fontWeight:600 }}>Active</span>
                      </label>
                    </div>
                    <div/><div/>
                  </div>
                </>
              )}

              {/* ── TAB 2: BRANDING ── */}
              {activeTab === 2 && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px 18px' }}>
                  <div>
                    <L text="Company Name (Brand)" req />
                    <input style={INP} value={form.companyName} onChange={e=>set('companyName',e.target.value)}
                      placeholder="e.g. Vinod Fleet Solutions" onFocus={fo} onBlur={fb} />
                    <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>Shown on login screen</div>
                  </div>
                  <div>
                    <L text="Domain" req />
                    <input style={INP} value={form.domain} onChange={e=>set('domain',e.target.value)}
                      placeholder="e.g. vinod.in" onFocus={fo} onBlur={fb} />
                    <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>Domain-based branding ke liye</div>
                  </div>
                  <div>
                    <L text="Logo" opt />
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <input
                        style={{ ...INP_RO, flex:1, cursor:'default', color: form.logoUrl ? '#059669' : '#9ca3af', fontStyle: form.logoUrl ? 'normal' : 'italic' }}
                        value={getFileName(form.logoUrl)}
                        readOnly tabIndex={-1} placeholder="No logo uploaded"
                      />
                      <input type="file" ref={logoInputRef} accept="image/*" onChange={handleLogoUpload} style={{ display:'none' }} />
                      <button type="button" onClick={()=>logoInputRef.current?.click()}
                        disabled={uploading || !form.username.trim()}
                        style={{
                          height:34, padding:'0 12px', display:'flex', alignItems:'center', gap:5,
                          background:(uploading||!form.username.trim())?'#93c5fd':ACCENT,
                          color:'#fff', border:'none', borderRadius:4, fontSize:11,
                          cursor:(uploading||!form.username.trim())?'not-allowed':'pointer', whiteSpace:'nowrap',
                        }}>
                        {uploading ? Ico.spin : Ico.upload}
                        {uploading ? 'Uploading...' : 'Upload'}
                      </button>
                    </div>
                    {!form.username.trim() && (
                      <div style={{ fontSize:9, color:'#ef4444', marginTop:2 }}>Fill Username in Basic Info tab first</div>
                    )}
                    {form.logoUrl && (
                      <div style={{ marginTop:6 }}>
                        <img src={form.logoUrl} alt="Logo preview"
                          style={{ height:40, width:'auto', maxWidth:150, objectFit:'contain', border:'1px solid #e5e7eb', borderRadius:3, padding:4 }} />
                      </div>
                    )}
                  </div>
                  <div>
                    <L text="Primary Color" opt />
                    <input style={{ ...INP, padding:2, height:36 }} type="color" value={form.primaryColor} onChange={e=>set('primaryColor',e.target.value)} />
                  </div>
                  <div>
                    <L text="Secondary Color" opt />
                    <input style={{ ...INP, padding:2, height:36 }} type="color" value={form.secondaryColor} onChange={e=>set('secondaryColor',e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10, padding:'12px 24px', borderTop:'1px solid #e5e7eb', background:'#f9fafb' }}>
              {error && <span style={{ flex:1, fontSize:11, color:'#dc2626', fontWeight:500 }}>⚠ {error}</span>}
              <button type="button" onClick={handleReset}
                style={{ height:36, padding:'0 18px', background:'#f1f5f9', color:'#374151', border:'1px solid #e2e8f0', borderRadius:4, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                RESET
              </button>
              <button type="button" onClick={onClose}
                style={{ height:36, padding:'0 22px', background:'#e5e7eb', color:'#374151', border:'none', borderRadius:4, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                CANCEL
              </button>
              <button type="submit" disabled={loading||uploading}
                style={{ height:36, padding:'0 30px', background:(loading||uploading)?'#99f6e4':ACCENT, color:'#fff', border:'none', borderRadius:4, fontSize:13, fontWeight:700, cursor:(loading||uploading)?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:7 }}>
                {(loading||uploading)
                  ? <>{Ico.spin}{uploading?'Uploading…':'Saving…'}</>
                  : isEdit?'UPDATE':'SAVE'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <style>{`@keyframes adaSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default AddDealer;