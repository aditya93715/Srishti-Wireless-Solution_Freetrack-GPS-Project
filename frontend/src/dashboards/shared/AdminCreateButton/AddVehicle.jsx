// src/dashboards/admin/AddVehicleAdmin.jsx
//
// SELECTOR CASCADE (Admin dashboard):
//   ① Dealer   → on open: fetchDealers(currentUser.user_id)
//                  → User_Master (role=dealer, adminId=currentUser.user_id)
//   ② User     → selDealer changes: fetchUsers(dealerId)
//                  → User_Master (role=user, dealerId=X)
//   ③ Device   → selDealer changes: fetchDevicesByDealer(dealerId)
//                  → reads dealer.devices[] (IMEI_No) from User_Master
//                  → queries Device_Master by IMEI_No
//                  → returns free + assigned devices
//
// On Save → POST /api/vehicles
//   → backend finds Device_Master doc by IMEI_No
//   → stamps vehicleInfo + userId + dealerId + adminId onto it
//
// NOTE: Admin selector removed — admin_id is always currentUser.user_id (the logged-in admin).
//       All cascade logic is IDENTICAL to SuperAdmin form, starting one level lower.
//       Dealer select triggers User + Device load — same as SuperAdmin's dealer select.

import React, { useState, useEffect, useRef } from 'react';
import {
  fetchDealers,
  fetchUsers,
  fetchDevicesByDealer,
  checkVehicleNoExists,
  createVehicle,
} from '../../../api/vehicleApi';
import { useTheme } from '../../../context/ThemeContext';

const safeA = v => (Array.isArray(v) ? v : []);

const ACC_DEFAULT = '#3d2b6b';
const HDR_DEFAULT = '#3d2b6b';
let ACC = ACC_DEFAULT;
let HDR = HDR_DEFAULT;

const inp = {
  padding: '7px 10px', border: '1px solid #d0d7de', borderRadius: 3,
  fontSize: 13, width: '100%', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', background: '#fff', color: '#1a1f2e',
};
const sel = {
  ...inp, cursor: 'pointer', appearance: 'none', paddingRight: 30,
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 16,
};
const lbl = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' };
// const onFocus = e => { e.target.style.borderColor = ACC; e.target.style.boxShadow = `0 0 0 2px rgba(61,43,107,0.12)`; };
// const onBlur  = e => { e.target.style.borderColor = '#d0d7de'; e.target.style.boxShadow = 'none'; };

const Fld = ({ label, req, opt, hint, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <label style={lbl}>
      {label}
      {req && <span style={{ color: '#ef4444' }}> *</span>}
      {opt && <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: 11 }}> (Optional)</span>}
    </label>
    {children}
    {hint && <small style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{hint}</small>}
  </div>
);

const Grid4 = ({ children, style }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px 16px', ...style }}>
    {children}
  </div>
);

const SH = ({ title, color = '#3d2b6b' }) => (
  <div style={{
    fontSize: 12, fontWeight: 700, color: color, textTransform: 'uppercase',
    letterSpacing: '0.06em', padding: '10px 0 6px', borderBottom: `2px solid ${color}`, marginBottom: 14,
  }}>
    {title}
  </div>
);

const Spin = () => (
  <span style={{
    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
    border: '2px solid #d0d7de', borderTopColor: ACC,
    animation: 'vSpin .7s linear infinite', marginLeft: 6, verticalAlign: 'middle',
  }} />
);

const VEH_TYPES  = ['car', 'truck', 'bus', 'bike', 'tractor', 'auto', 'van', 'pickup', 'tanker', 'JCB'];
const FUEL_TYPES = ['Petrol','Diesel','CNG','Electric'];
const BODY_TYPES = ['Sedan','SUV','Hatchback','MUV','Van','Truck','Bus','Pickup','Open','Closed'];
const OWN_TYPES  = ['Owner','Leased','Company','Government','Private'];

export default function AddVehicleAdmin({ open, onClose, onSaved, currentUser }) {
  const theme = useTheme();
  ACC = theme?.activeColor || ACC_DEFAULT;
  HDR = theme?.activeColor || HDR_DEFAULT;

  const onFocus = e => { e.target.style.borderColor = ACC; e.target.style.boxShadow = `0 0 0 2px ${ACC}30`; };
  const onBlur  = e => { e.target.style.borderColor = '#d0d7de'; e.target.style.boxShadow = 'none'; };

  const [dealers, setDealers] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [devices, setDevices] = useState([]);

  const [ldDealers, setLdDealers] = useState(false);
  const [ldUsers,   setLdUsers]   = useState(false);
  const [ldDevices, setLdDevices] = useState(false);

  const [errDealers, setErrDealers] = useState('');
  const [errUsers,   setErrUsers]   = useState('');
  const [errDevices, setErrDevices] = useState('');

  const [selDealer, setSelDealer] = useState('');
  const [selUser,   setSelUser]   = useState('');
  const [selImei,   setSelImei]   = useState('');

  const today    = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1))
                     .toISOString().slice(0, 10);

  const INIT = {
  vehicle_no: '', vehicle_type: '', speed_limit_kph: '60', mileage: '1',
  fuel_type: '', sub_start: today, sub_due: nextYear,
  nickname: '', odometer: '', duration_odometer: '',
  parking_alarm: false,
  owner_name: '', owned_by: '', vehicle_brand: '', vehicle_model: '',
  vehicle_body: '', capacity: '0', manufacture_date: today, purchase_date: today,
  };

  const [vF,     setVF]     = useState(INIT);
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState('');
  const [vnoErr, setVnoErr] = useState(false);
  const [detail, setDetail] = useState(false);

  const setField = k => e =>
    setVF(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const vnoTimer = useRef(null);

  // ── STEP 1: Load dealers when modal opens ─────────────────────────────────
  // SuperAdmin equivalent: fetchDealers(selAdmin)  →  here selAdmin = currentUser.user_id (implicit)
  useEffect(() => {
    if (!open) return;
    resetAll();
    setLdDealers(true);
    setErrDealers('');
    fetchDealers(currentUser?.user_id)
      .then(data => {
        const list = safeA(data);
        setDealers(list);
        if (list.length === 0) setErrDealers('No dealers found under your account');
      })
      .catch(err => {
        console.error('[fetchDealers]', err);
        setErrDealers('Failed to load dealers. Please try again.');
      })
      .finally(() => setLdDealers(false));
  }, [open]);

  // ── STEP 2: Dealer selected → load users + devices ───────────────────────
  // Exact mirror of SuperAdmin Step 3 — selDealer triggers both calls
  useEffect(() => {
    setUsers([]); setDevices([]);
    setSelUser(''); setSelImei('');
    setErrUsers(''); setErrDevices('');
    if (!selDealer) return;

    // Load users under this dealer
    setLdUsers(true);
    fetchUsers(selDealer)
      .then(data => {
        const list = safeA(data);
        setUsers(list);
        if (list.length === 0) setErrUsers('No users found under this dealer');
      })
      .catch(err => {
        console.error('[fetchUsers]', err);
        setErrUsers('Failed to load users. Please try again.');
      })
      .finally(() => setLdUsers(false));

    // Load devices from dealer's IMEI_No inventory
    setLdDevices(true);
    fetchDevicesByDealer(selDealer)
      .then(data => {
        const list = safeA(data);
        setDevices(list);
        if (list.length === 0) setErrDevices('No devices found under this dealer');
      })
      .catch(err => {
        console.error('[fetchDevicesByDealer]', err);
        setErrDevices('Failed to load devices. Please try again.');
      })
      .finally(() => setLdDevices(false));
  }, [selDealer]);

  const resetAll = () => {
    setMsg(''); setVnoErr(false); setVF(INIT); setDetail(false);
    setDealers([]); setUsers([]); setDevices([]);
    setSelDealer(''); setSelUser(''); setSelImei('');
    setErrDealers(''); setErrUsers(''); setErrDevices('');
    if (vnoTimer.current) clearTimeout(vnoTimer.current);
  };

  const checkVno = val => {
    setVnoErr(false);
    if (vnoTimer.current) clearTimeout(vnoTimer.current);
    if (!val || val.length < 3) return;
    vnoTimer.current = setTimeout(async () => {
      try {
        const exists = await checkVehicleNoExists(val);
        setVnoErr(exists);
      } catch (err) {
        console.error('[checkVno]', err);
      }
    }, 500);
  };

  const save = async () => {
    const vno = (vF.vehicle_no || '').toUpperCase().trim();
    if (!vno)       return setMsg('✗ Vehicle number is required');
    if (vnoErr)     return setMsg('✗ Vehicle number already exists');
    if (!selDealer) return setMsg('✗ Please select a Dealer');
    if (!selUser)   return setMsg('✗ Please select a User');
    if (!selImei)   return setMsg('✗ Please select a Device (IMEI)');

    // Warn if device already assigned
    const selectedDevice = devices.find(d => (d.IMEI_No || d.imei) === selImei);
    if (selectedDevice?.hasVehicle) {
      return setMsg(`✗ Device ${selImei} already assigned to "${selectedDevice.vehicleInfo?.vehicleNo}"`);
    }

    setSaving(true);
    setMsg('');
    try {
    const payload = {
      ...vF,
      vehicle_no:        vno,
      speed_limit_kph:   Number(vF.speed_limit_kph)   || 60,
      mileage:           Number(vF.mileage)           || 1,
      odometer:          Number(vF.odometer)          || 0,
      duration_odometer: Number(vF.duration_odometer) || 0,
      capacity:          Number(vF.capacity)          || 0,
      parking_alarm:     !!vF.parking_alarm,
      user_id:           parseInt(selUser),
      dealer_id:         parseInt(selDealer),
      admin_id:          currentUser?.user_id || null,  // implicit — logged-in admin
      super_admin_id:    null,
      device_imei:       selImei,
    };

      await createVehicle(payload);
      setMsg('✓ Vehicle added successfully!');
      onSaved?.();
      setTimeout(() => { onClose?.(); resetAll(); }, 900);
    } catch (err) {
      const m = err.message || 'Network error';
      if (/already exists|duplicate|11000/i.test(m)) {
        setVnoErr(true);
        setMsg('✗ Vehicle number already exists');
      } else {
        setMsg(`✗ ${m}`);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const selBorder = (val, prevSelected) => {
    if (val) return ACC;
    if (prevSelected) return '#f59e0b';
    return '#d0d7de';
  };

  // Filter only free devices (not assigned to any vehicle)
  const freeDevices = devices.filter(d => !d.hasVehicle);
  const freeCount = freeDevices.length;
  const assignedCount = devices.filter(d => d.hasVehicle).length;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflowY: 'auto', padding: '20px 0',
      }}
      onClick={e => e.target === e.currentTarget && (onClose?.(), resetAll())}
    >
     <div style={{
        background: '#fff', width: '97%', maxWidth: 1400, borderRadius: 4,
        boxShadow: '0 32px 80px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column',
        maxHeight: '90vh', margin: 'auto',
      }}>

        {/* Header */}
        <div style={{
          background: HDR, color: '#fff', padding: '11px 20px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, borderRadius: '4px 4px 0 0',
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Add Vehicle</span>
          <button onClick={() => { onClose?.(); resetAll(); }}
            style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {msg && msg.startsWith('✗') && (
            <div style={{ marginBottom: 14, padding: '9px 14px', background: '#fff5f5', border: '1px solid #fca5a5', borderLeft: '3px solid #ef4444', fontSize: 12, color: '#dc2626', fontWeight: 600, borderRadius: 3 }}>
              ⚠️ {msg.replace('✗ ', '')}
            </div>
          )}

         <SH title="Assigned Devices" color={ACC} />
          <Grid4 style={{ marginBottom: 20 }}>

            {/* ① Dealer */}
            <Fld label="Dealer" req>
              <div style={{ position: 'relative' }}>
                <select style={{ ...sel, borderColor: selBorder(selDealer, false) }}
                  value={selDealer} onChange={e => setSelDealer(e.target.value)}
                  onFocus={onFocus} onBlur={onBlur} disabled={ldDealers}>
                  <option value="">{ldDealers ? 'Loading dealers…' : '— Select Dealer —'}</option>
                  {dealers.map(d => (
                    <option key={d.user_id} value={String(d.user_id)}>
                      {d.username}
                    </option>
                  ))}
                </select>
                {ldDealers && <span style={{ position: 'absolute', right: 34, top: '50%', transform: 'translateY(-50%)' }}><Spin /></span>}
              </div>
            </Fld>

            {/* ② User — disabled until dealer selected, same gating as SuperAdmin */}
            <Fld label="User (Vehicle Owner)" req>
              <div style={{ position: 'relative' }}>
                <select style={{ ...sel, borderColor: selBorder(selUser, !!selDealer) }}
                  value={selUser} onChange={e => setSelUser(e.target.value)}
                  onFocus={onFocus} onBlur={onBlur} disabled={!selDealer || ldUsers}>
                  <option value="">{ldUsers ? 'Loading users…' : !selDealer ? '← Select dealer first' : '— Select User —'}</option>
                  {users.map(u => (
                    <option key={u.user_id} value={String(u.user_id)}>
                      {u.username}
                    </option>
                  ))}
                </select>
                {ldUsers && <span style={{ position: 'absolute', right: 34, top: '50%', transform: 'translateY(-50%)' }}><Spin /></span>}
              </div>
            </Fld>

            {/* ③ Device — ONLY FREE devices, showing only IMEI number */}
            <Fld label="Device (IMEI)" req>
              <div style={{ position: 'relative' }}>
                <select
                  style={{
                    ...sel,
                    borderColor: selBorder(selImei, !!selDealer),
                  }}
                  value={selImei}
                  onChange={e => setSelImei(e.target.value)}
                  onFocus={onFocus} onBlur={onBlur}
                  disabled={!selDealer || ldDevices}>
                  <option value="">
                    {ldDevices ? 'Loading devices…'
                      : !selDealer ? '← Select dealer first'
                      : freeDevices.length === 0 ? 'No free devices available'
                      : '— Select Device —'}
                  </option>
                  {freeDevices.map(d => {
                    const imeiVal = d.IMEI_No || d.imei;
                    return (
                      <option key={imeiVal} value={imeiVal}>
                        {imeiVal}
                      </option>
                    );
                  })}
                </select>
                {ldDevices && <span style={{ position: 'absolute', right: 34, top: '50%', transform: 'translateY(-50%)' }}><Spin /></span>}
              </div>
            </Fld>

          </Grid4>

          {/* Vehicle Information */}
         <SH title="Vehicle Information" color={ACC} />
          <Grid4 style={{ marginBottom: 16 }}>
            <Fld label="Vehicle Number" req hint="e.g. MH12AB1234">
              <input style={{ ...inp, borderColor: vnoErr ? '#ef4444' : '#d0d7de', background: vnoErr ? '#fff5f5' : '#fff' }}
                value={vF.vehicle_no} placeholder="MH12AB1234" autoFocus
                onChange={e => { setField('vehicle_no')(e); setMsg(''); checkVno(e.target.value); }}
                onFocus={onFocus} onBlur={onBlur} />
              {vnoErr && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>⚠ Already exists</span>}
            </Fld>
            <Fld label="Vehicle Type" req>
              <select style={sel} value={vF.vehicle_type} onChange={setField('vehicle_type')} onFocus={onFocus} onBlur={onBlur}>
                <option value="">— Select —</option>
                {VEH_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </Fld>
            <Fld label="Speed Limit (km/h)" req>
              <input style={inp} type="number" min={0} value={vF.speed_limit_kph} onChange={setField('speed_limit_kph')} onFocus={onFocus} onBlur={onBlur} />
            </Fld>
            <Fld label="Mileage (km/l)" req>
              <input style={inp} type="number" min={0} value={vF.mileage} onChange={setField('mileage')} onFocus={onFocus} onBlur={onBlur} />
            </Fld>
            <Fld label="Fuel Type" opt>
              <select style={sel} value={vF.fuel_type} onChange={setField('fuel_type')} onFocus={onFocus} onBlur={onBlur}>
                <option value="">— Select —</option>
                {FUEL_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </Fld>
            <Fld label="Subscription Start" req>
              <input style={inp} type="date" value={vF.sub_start} onChange={setField('sub_start')} onFocus={onFocus} onBlur={onBlur} />
            </Fld>
            <Fld label="Subscription Due" req>
              <input style={inp} type="date" value={vF.sub_due} onChange={setField('sub_due')} onFocus={onFocus} onBlur={onBlur} />
            </Fld>
            <Fld label="Vehicle Nickname" opt>
              <input style={inp} value={vF.nickname} placeholder="Nickname" onChange={setField('nickname')} onFocus={onFocus} onBlur={onBlur} />
            </Fld>
            <Fld label="Current Odometer (km)" opt>
              <input style={inp} type="number" min={0} value={vF.odometer} onChange={setField('odometer')} onFocus={onFocus} onBlur={onBlur} />
            </Fld>
            <Fld label="Duration Odometer (km)" opt>
              <input style={inp} type="number" min={0} value={vF.duration_odometer} onChange={setField('duration_odometer')} onFocus={onFocus} onBlur={onBlur} />
            </Fld>
          </Grid4>

          {/* Parking alarm */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
              <input type="checkbox" checked={!!vF.parking_alarm} onChange={setField('parking_alarm')} style={{ accentColor: ACC, width: 14, height: 14 }} />
              Enable parking violation alarm on Ignition ON
            </label>
          </div>

          {/* Additional Vehicle Details (collapsible) */}
          <div onClick={() => setDetail(o => !o)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0f2f5', padding: '9px 16px', border: '1px solid #dde1e7', cursor: 'pointer', userSelect: 'none', borderRadius: 3, marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Additional Vehicle Details</span>
            <span style={{ fontSize: 20, color: ACC, fontWeight: 700, lineHeight: 1 }}>{detail ? '−' : '+'}</span>
          </div>

          {detail && (
            <div style={{ paddingTop: 16 }}>
              <Grid4>
                <Fld label="Owner Name" opt>
                  <input style={inp} value={vF.owner_name} placeholder="Owner Name" onChange={setField('owner_name')} onFocus={onFocus} onBlur={onBlur} />
                </Fld>
                <Fld label="Owned By" opt>
                  <select style={sel} value={vF.owned_by} onChange={setField('owned_by')} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">— Select —</option>
                    {OWN_TYPES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </Fld>
                <Fld label="Vehicle Brand" opt>
                  <input style={inp} value={vF.vehicle_brand} placeholder="e.g. Toyota" onChange={setField('vehicle_brand')} onFocus={onFocus} onBlur={onBlur} />
                </Fld>
                <Fld label="Vehicle Model" opt>
                  <input style={inp} value={vF.vehicle_model} placeholder="e.g. Innova" onChange={setField('vehicle_model')} onFocus={onFocus} onBlur={onBlur} />
                </Fld>
                <Fld label="Vehicle Body" opt>
                  <select style={sel} value={vF.vehicle_body} onChange={setField('vehicle_body')} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">— Select —</option>
                    {BODY_TYPES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </Fld>
                <Fld label="Seating Capacity" opt>
                  <input style={inp} type="number" min={0} value={vF.capacity} onChange={setField('capacity')} onFocus={onFocus} onBlur={onBlur} />
                </Fld>
                <Fld label="Manufacture Date" opt>
                  <input style={inp} type="date" value={vF.manufacture_date} onChange={setField('manufacture_date')} onFocus={onFocus} onBlur={onBlur} />
                </Fld>
                <Fld label="Purchase Date" opt>
                  <input style={inp} type="date" value={vF.purchase_date} onChange={setField('purchase_date')} onFocus={onFocus} onBlur={onBlur} />
                </Fld>
              </Grid4>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, background: '#f8fafc', flexShrink: 0, flexWrap: 'wrap', borderRadius: '0 0 4px 4px' }}>
          {msg && (
            <span style={{ fontSize: 12, marginRight: 'auto', fontWeight: 600, color: msg[0] === '✓' ? '#16a34a' : '#dc2626' }}>{msg}</span>
          )}
          <button onClick={() => { onClose?.(); resetAll(); }}
            style={{ height: 34, padding: '0 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Close
          </button>
          <button onClick={resetAll}
            style={{ height: 34, padding: '0 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Reset
          </button>
          <button onClick={save} disabled={saving}
            style={{ height: 34, padding: '0 28px', background: saving ? '#a78bfa' : ACC, color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving
              ? <><span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'vSpin .7s linear infinite', display: 'inline-block' }} />Saving…</>
              : 'Save Vehicle'}
          </button>
        </div>
      </div>
      <style>{`@keyframes vSpin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}



