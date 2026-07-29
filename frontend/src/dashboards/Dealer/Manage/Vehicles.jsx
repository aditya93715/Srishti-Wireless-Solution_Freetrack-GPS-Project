import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import AddVehicleModal from "../../shared/DealerCreateButton/AddVehicle";
import { useTheme } from "../../../context/ThemeContext";

import {
  listVehicles,
  updateVehicle as apiUpdateVehicle,
  deleteVehicle as apiDeleteVehicle,
  fetchUsers,
} from "../../../api/vehicleApi";

const ACC_DEFAULT = "#3d2b6b";
let ACC = ACC_DEFAULT;

const MONTHS = [
  { value:"01",label:"January"   },{ value:"02",label:"February"  },
  { value:"03",label:"March"     },{ value:"04",label:"April"     },
  { value:"05",label:"May"       },{ value:"06",label:"June"      },
  { value:"07",label:"July"      },{ value:"08",label:"August"    },
  { value:"09",label:"September" },{ value:"10",label:"October"   },
  { value:"11",label:"November"  },{ value:"12",label:"December"  },
];

const VEH_TYPES  = ['car', 'truck', 'bus', 'bike', 'tractor', 'auto', 'van', 'pickup', 'tanker', 'JCB'];
const FUEL_TYPES = ["Petrol","Diesel","CNG","Electric"];
const BODY_TYPES = ["Sedan","SUV","Hatchback","MUV","Van","Truck","Bus","Pickup","Open","Closed"];
const OWN_TYPES  = ["Owner","Leased","Company","Government","Private"];

// ── style tokens ──────────────────────────────────────────────────────────────
const selStyle = {
  height:38, padding:"0 28px 0 10px", fontSize:13,
  border:"1px solid #d0d7de", borderRadius:3,
  background:"#fff", color:"#374151", cursor:"pointer",
  appearance:"none", outline:"none",
  backgroundImage:`url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat:"no-repeat", backgroundPosition:"right 8px center",
  backgroundSize:16, minWidth:130,
};

// ── Add-form style tokens (matching AddVehicle exactly) ───────────────────────
const ainp = {
  padding: '7px 10px', border: '1px solid #d0d7de', borderRadius: 3,
  fontSize: 13, width: '100%', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', background: '#fff', color: '#1a1f2e',
};
const asel = {
  ...ainp, cursor: 'pointer', appearance: 'none', paddingRight: 30,
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 16,
};
const albl = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' };

// ── date utils ────────────────────────────────────────────────────────────────
const fmtDate = v => {
  if (!v) return "—";
  try { const d = new Date(v); return isNaN(d) ? String(v) : d.toISOString().slice(0,10); }
  catch { return String(v); }
};
const toDateInput = v => {
  if (!v) return "";
  try { const d = new Date(v); return isNaN(d) ? "" : d.toISOString().slice(0,10); }
  catch { return ""; }
};

// ── micro components ──────────────────────────────────────────────────────────
const SortIcon = ({ col, sortCol, sortDir }) => (
  <span style={{ marginLeft:4, opacity:sortCol===col?1:0.35, fontSize:10, userSelect:"none" }}>
    {sortCol===col ? (sortDir==="asc"?"↑":"↓") : "↕"}
  </span>
);

const VBadge = ({ val, clientActive }) => {
  const isActive = clientActive !== false;
  return (
    <span style={{
      padding:"2px 10px", fontSize:11, fontWeight:600,
      background:isActive?"#e8f5e9":"#fff5f5",
      color:isActive?"#2e7d32":"#dc2626",
      border:`1px solid ${isActive?"#4caf50":"#fca5a5"}`,
      borderRadius:10, display:"inline-block", whiteSpace:"nowrap",
    }}>{isActive ? (val || "Active") : "Inactive"}</span>
  );
};

const BoolDot = ({ val }) => (
  <span style={{
    display:"inline-block", width:9, height:9, borderRadius:"50%",
    background:val?"#22c55e":"#d1d5db",
    boxShadow:val?"0 0 0 2px #bbf7d0":"none",
  }}/>
);

const UsernameBadge = ({ name, loading }) => {
  if (loading) return <span style={{ color:"#94a3b8", fontSize:11 }}>…</span>;
  if (!name)   return <span style={{ color:"#d1d5db" }}>—</span>;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      padding:"2px 8px", background:"#f1f5f9",
      border:"1px solid #e2e8f0", borderRadius:10,
      fontSize:11, fontWeight:600, color:"#475569",
      whiteSpace:"nowrap",
    }}>
      {name}
    </span>
  );
};

// ── Add-form atoms (matching AddVehicle layout) ───────────────────────────────
const AFld = ({ label, req, opt, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <label style={albl}>
      {label}
      {req && <span style={{ color: '#ef4444' }}> *</span>}
      {opt && <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: 11 }}> (Optional)</span>}
    </label>
    {children}
  </div>
);

const AGrid4 = ({ children, style }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px 16px', ...style }}>
    {children}
  </div>
);

const ASH = ({ title, accentColor }) => (
  <div style={{
    fontSize: 12, fontWeight: 700, color: accentColor, textTransform: 'uppercase',
    letterSpacing: '0.06em', padding: '10px 0 6px',
    borderBottom: `2px solid ${accentColor}`, marginBottom: 14,
  }}>
    {title}
  </div>
);

// ── EDIT MODAL — rebuilt to match Add Vehicle layout ─────────────────────────
const VehicleEditModalDealer = ({ vehicle, onClose, onSaved, userNames, namesLoading }) => {
  const [f, setF]           = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");
  const [detail, setDetail] = useState(false);

  // Resolved accent color (read from CSS variable fallback)
  const accentColor = ACC;

  const onFocus = e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 2px ${accentColor}30`; };
  const onBlur  = e => { e.target.style.borderColor = '#d0d7de'; e.target.style.boxShadow = 'none'; };

  useEffect(() => {
    if (!vehicle) return;
    setF({
      vehicle_no:        vehicle.vehicle_no        || "",
      vehicle_type:      vehicle.vehicle_type      || "",
      speed_limit_kph:   vehicle.speed_limit_kph   ?? "60",
      mileage:           vehicle.mileage           ?? "1",
      fuel_type:         vehicle.fuelType          || "",
      nickname:          vehicle.nickname          || "",
      sub_start:         toDateInput(vehicle.subStart),
      sub_due:           toDateInput(vehicle.subDue),
      odometer:          vehicle.odometer          ?? "",
      duration_odometer: vehicle.durationOdometer  ?? "",
      owner_name:        vehicle.ownerName         || "",
      owned_by:          vehicle.ownedBy           || "",
      vehicle_brand:     vehicle.vehicleBrand      || "",
      vehicle_model:     vehicle.vehicleModel      || "",
      vehicle_body:      vehicle.vehicleBody       || "",
      capacity:          vehicle.capacity          ?? "",
      manufacture_date:  toDateInput(vehicle.manufactureDate),
      purchase_date:     toDateInput(vehicle.purchaseDate),
      parking_alarm:     !!vehicle.parkingAlarm,
      sim_card_number:   vehicle.sim_card_number   || "",
    });
    setMsg("");
    setDetail(false);
  }, [vehicle]);

  const set = k => e =>
    setF(p => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const save = async () => {
    if (!f.vehicle_no) return setMsg("✗ Vehicle number is required");
    setSaving(true); setMsg("");
    try {
      await apiUpdateVehicle(vehicle._id, {
        vehicle_no:        f.vehicle_no,
        vehicle_type:      f.vehicle_type,
        speed_limit_kph:   Number(f.speed_limit_kph)    || 60,
        mileage:           Number(f.mileage)            || 1,
        fuel_type:         f.fuel_type,
        nickname:          f.nickname,
        sub_start:         f.sub_start,
        sub_due:           f.sub_due,
        odometer:          Number(f.odometer)           || 0,
        duration_odometer: Number(f.duration_odometer)  || 0,
        owner_name:        f.owner_name,
        owned_by:          f.owned_by,
        vehicle_brand:     f.vehicle_brand,
        vehicle_model:     f.vehicle_model,
        vehicle_body:      f.vehicle_body,
        capacity:          Number(f.capacity)           || 0,
        manufacture_date:  f.manufacture_date,
        purchase_date:     f.purchase_date,
        parking_alarm:     f.parking_alarm,
        sim_card_number:   f.sim_card_number,
      });
      setMsg("✓ Vehicle updated successfully!");
      onSaved();
      setTimeout(onClose, 900);
    } catch (err) {
      setMsg(`✗ ${err?.response?.data?.message || err.message || "Save failed"}`);
    } finally { setSaving(false); }
  };

  if (!vehicle) return null;

  // Resolved display values for disabled fields
  const displayUsername = userNames?.[vehicle.user_id]
    || (vehicle.user_id ? `User ${vehicle.user_id}` : "—");
  const displayImei = vehicle.imei || vehicle.IMEI_No || "—";

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px 0', overflowY: 'auto',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', width: '97%', maxWidth: 1400, borderRadius: 4,
        boxShadow: '0 32px 80px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column',
        maxHeight: '90vh', margin: 'auto',
      }}>

        {/* Header */}
        <div style={{
          background: accentColor, color: '#fff', padding: '11px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, borderRadius: '4px 4px 0 0',
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Edit Vehicle 
          </span>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3 }}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* Error banner */}
          {msg && msg.startsWith('✗') && (
            <div style={{ marginBottom: 14, padding: '9px 14px', background: '#fff5f5', border: '1px solid #fca5a5', borderLeft: '3px solid #ef4444', fontSize: 12, color: '#dc2626', fontWeight: 600, borderRadius: 3 }}>
              ⚠️ {msg.replace('✗ ', '')}
            </div>
          )}

          {/* ── Section 1: Assigned User & Device (disabled, read-only) ── */}
          <ASH title="Assigned User & Device" accentColor={accentColor} />
          <AGrid4 style={{ marginBottom: 20 }}>

            {/* User — disabled */}
            <AFld label="Assigned User">
              <div style={{ position: 'relative' }}>
                <input
                  style={{
                    ...ainp,
                    background: '#f3f4f6',
                    color: '#6b7280',
                    cursor: 'not-allowed',
                    borderColor: '#e5e7eb',
                  }}
                  value={namesLoading && vehicle.user_id != null ? 'Loading…' : displayUsername}
                  readOnly
                  disabled
                />
              </div>
            </AFld>

            {/* Device IMEI — disabled */}
            <AFld label="Device (IMEI)">
              <input
                style={{
                  ...ainp,
                  background: '#f3f4f6',
                  color: '#6b7280',
                  cursor: 'not-allowed',
                  borderColor: '#e5e7eb',
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}
                value={displayImei}
                readOnly
                disabled
              />
            </AFld>

          </AGrid4>

          {/* ── Section 2: Vehicle Information ── */}
          <ASH title="Vehicle Information" accentColor={accentColor} />
          <AGrid4 style={{ marginBottom: 16 }}>

            <AFld label="Vehicle Number" req>
              <input
                style={{ ...ainp }}
                value={f.vehicle_no || ""}
                placeholder="MH00AB0000"
                onChange={set("vehicle_no")}
                onFocus={onFocus} onBlur={onBlur}
              />
            </AFld>

            <AFld label="Vehicle Type" req>
              <select style={asel} value={f.vehicle_type || ""} onChange={set("vehicle_type")} onFocus={onFocus} onBlur={onBlur}>
                <option value="">— Select —</option>
                {VEH_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </AFld>

            <AFld label="Speed Limit (km/h)" req>
              <input style={ainp} type="number" min={0} value={f.speed_limit_kph ?? ""} onChange={set("speed_limit_kph")} onFocus={onFocus} onBlur={onBlur} />
            </AFld>

            <AFld label="Mileage (km/L)" req>
              <input style={ainp} type="number" min={0} value={f.mileage ?? ""} onChange={set("mileage")} onFocus={onFocus} onBlur={onBlur} />
            </AFld>

            <AFld label="Fuel Type" opt>
              <select style={asel} value={f.fuel_type || ""} onChange={set("fuel_type")} onFocus={onFocus} onBlur={onBlur}>
                <option value="">— Select —</option>
                {FUEL_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </AFld>

            <AFld label="Subscription Start" req>
              <input style={ainp} type="date" value={f.sub_start || ""} onChange={set("sub_start")} onFocus={onFocus} onBlur={onBlur} />
            </AFld>

            <AFld label="Subscription Due" req>
              <input style={ainp} type="date" value={f.sub_due || ""} onChange={set("sub_due")} onFocus={onFocus} onBlur={onBlur} />
            </AFld>

            <AFld label="Vehicle Nickname" opt>
              <input style={ainp} value={f.nickname || ""} placeholder="Nickname" onChange={set("nickname")} onFocus={onFocus} onBlur={onBlur} />
            </AFld>

            <AFld label="Current Odometer (km)" opt>
              <input style={ainp} type="number" min={0} value={f.odometer ?? ""} onChange={set("odometer")} onFocus={onFocus} onBlur={onBlur} />
            </AFld>

            <AFld label="Duration Odometer (km)" opt>
              <input style={ainp} type="number" min={0} value={f.duration_odometer ?? ""} onChange={set("duration_odometer")} onFocus={onFocus} onBlur={onBlur} />
            </AFld>

          </AGrid4>

          {/* Parking alarm */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
              <input
                type="checkbox"
                checked={!!f.parking_alarm}
                onChange={set("parking_alarm")}
                style={{ accentColor: accentColor, width: 14, height: 14 }}
              />
              Enable parking violation alarm on Ignition ON
            </label>
          </div>

          {/* ── Additional Vehicle Details (collapsible) ── */}
          <div
            onClick={() => setDetail(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#f0f2f5', padding: '9px 16px',
              border: '1px solid #dde1e7', cursor: 'pointer',
              userSelect: 'none', borderRadius: 3, marginTop: 4,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Additional Vehicle Details</span>
            <span style={{ fontSize: 20, color: accentColor, fontWeight: 700, lineHeight: 1 }}>{detail ? '−' : '+'}</span>
          </div>

          {detail && (
            <div style={{ paddingTop: 16 }}>
              <AGrid4>
                <AFld label="Owner Name" opt>
                  <input style={ainp} value={f.owner_name || ""} placeholder="Owner Name" onChange={set("owner_name")} onFocus={onFocus} onBlur={onBlur} />
                </AFld>
                <AFld label="Owned By" opt>
                  <select style={asel} value={f.owned_by || ""} onChange={set("owned_by")} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">— Select —</option>
                    {OWN_TYPES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </AFld>
                <AFld label="Vehicle Brand" opt>
                  <input style={ainp} value={f.vehicle_brand || ""} placeholder="e.g. Toyota" onChange={set("vehicle_brand")} onFocus={onFocus} onBlur={onBlur} />
                </AFld>
                <AFld label="Vehicle Model" opt>
                  <input style={ainp} value={f.vehicle_model || ""} placeholder="e.g. Innova" onChange={set("vehicle_model")} onFocus={onFocus} onBlur={onBlur} />
                </AFld>
                <AFld label="Vehicle Body" opt>
                  <select style={asel} value={f.vehicle_body || ""} onChange={set("vehicle_body")} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">— Select —</option>
                    {BODY_TYPES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </AFld>
                <AFld label="Seating Capacity" opt>
                  <input style={ainp} type="number" min={0} value={f.capacity ?? ""} onChange={set("capacity")} onFocus={onFocus} onBlur={onBlur} />
                </AFld>
                <AFld label="Manufacture Date" opt>
                  <input style={ainp} type="date" value={f.manufacture_date || ""} onChange={set("manufacture_date")} onFocus={onFocus} onBlur={onBlur} />
                </AFld>
                <AFld label="Purchase Date" opt>
                  <input style={ainp} type="date" value={f.purchase_date || ""} onChange={set("purchase_date")} onFocus={onFocus} onBlur={onBlur} />
                </AFld>
              </AGrid4>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          gap: 8, background: '#f8fafc', flexShrink: 0,
          flexWrap: 'wrap', borderRadius: '0 0 4px 4px',
        }}>
          {msg && (
            <span style={{
              fontSize: 12, marginRight: 'auto', fontWeight: 600,
              color: msg[0] === '✓' ? '#16a34a' : '#dc2626',
            }}>{msg}</span>
          )}
          <button
            onClick={onClose}
            style={{ height: 34, padding: '0 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Close
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              height: 34, padding: '0 28px',
              background: saving ? '#a78bfa' : accentColor,
              color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 13, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saving
              ? <><span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'vSpin .7s linear infinite', display: 'inline-block' }} />Saving…</>
              : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── DELETE MODAL ──────────────────────────────────────────────────────────────
const DeleteConfirmModal = ({ vehicle, onClose, onDeleted }) => {
  const [deleting,setDeleting] = useState(false);
  const [msg,setMsg]           = useState("");

  const doDelete = async ()=>{
    setDeleting(true); setMsg("");
    try {
      await apiDeleteVehicle(vehicle._id);
      setMsg("✓ Deleted");
      setTimeout(()=>{ onDeleted(); onClose(); }, 600);
    } catch(err){
      setMsg(`✗ ${err?.response?.data?.message||err.message||"Delete failed"}`);
    } finally { setDeleting(false); }
  };

  if (!vehicle) return null;

  return (
    <div
      style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:2000,
        display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:32,overflowY:"auto" }}
      onClick={e=>e.target===e.currentTarget&&onClose()}
    >
      <div style={{ background:"#fff",borderRadius:4,width:"95%",maxWidth:420,
        boxShadow:"0 24px 64px rgba(0,0,0,0.35)",display:"flex",flexDirection:"column",
        maxHeight:"92vh",marginBottom:32 }}>
        <div style={{ background:ACC,color:"#fff",padding:"12px 20px",display:"flex",
          alignItems:"center",justifyContent:"space-between",flexShrink:0,borderRadius:"4px 4px 0 0" }}>
          <span style={{ fontWeight:700,fontSize:14 }}>🗑️ Delete Vehicle</span>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.2)",border:"none",
            color:"#fff",fontSize:18,cursor:"pointer",borderRadius:3,width:28,height:28,
            display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
        </div>
        <div style={{ overflowY:"auto",flex:1,padding:20 }}>
          <div style={{ textAlign:"center",padding:"16px 0" }}>
            <div style={{ fontSize:48,marginBottom:12 }}>⚠️</div>
            <p style={{ fontSize:14,color:"#333",margin:0 }}>Permanently delete <strong>{vehicle?.vehicle_no}</strong>?</p>
            <p style={{ fontSize:12,color:"#888",marginTop:6 }}>
              IMEI: <strong style={{ fontFamily:"monospace" }}>{vehicle?.IMEI_No||vehicle?.imei}</strong><br/>
              SIM: <strong style={{ fontFamily:"monospace" }}>{vehicle?.sim_card_number||"—"}</strong><br/>
              This frees the device. Cannot be undone.
            </p>
          </div>
        </div>
        <div style={{ padding:"12px 20px",borderTop:"1px solid #e2e8f0",display:"flex",
          justifyContent:"flex-end",gap:8,background:"#f8fafc",flexShrink:0,
          flexWrap:"wrap",borderRadius:"0 0 4px 4px" }}>
          {msg&&<span style={{ fontSize:12,marginRight:"auto",color:msg[0]==="✓"?"#27ae60":"#e74c3c",fontWeight:600 }}>{msg}</span>}
          <button onClick={onClose}
            style={{ height:34,padding:"0 16px",background:"#fff",color:"#555",border:"1px solid #ccc",borderRadius:3,fontSize:12,cursor:"pointer" }}>
            Cancel
          </button>
          <button onClick={doDelete} disabled={deleting}
            style={{ height:34,padding:"0 16px",background:"#dc3545",color:"#fff",border:"none",borderRadius:3,fontSize:12,cursor:deleting?"not-allowed":"pointer",opacity:deleting?0.6:1 }}>
            {deleting?"Deleting…":"Delete"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── COLUMNS ──────────────────────────────────────────────────────────────
const ALL_COLS = [
  { key:"sn",               label:"SN",                  sort:false },
  { key:"user_id",          label:"User",                sort:false },
  { key:"imei",             label:"IMEI No",        sort:true  },
  { key:"sim_card_number",  label:"SIM Card No.",         sort:true  },
  { key:"vehicle_no",       label:"Vehicle No.",          sort:true  },
  { key:"vehicle_type",     label:"Vehicle Type",         sort:true  },
  { key:"fuel_type",        label:"Fuel Type",            sort:true  },
  { key:"speed_limit_kph",  label:"Speed Limit (km/h)",   sort:true  },
  { key:"mileage",          label:"Mileage (km/L)",       sort:true  },
  { key:"sub_start",        label:"Sub Start",            sort:true  },
  { key:"sub_due",          label:"Sub Due",              sort:true  },
  { key:"vstatus",          label:"Status",               sort:true  },
  { key:"nickname",         label:"Nickname",             sort:true  },
  { key:"odometer",         label:"Odometer (km)",        sort:false },
  { key:"duration_odo",     label:"Duration Odo.",        sort:false },
  { key:"parking_alarm",    label:"Parking Alarm",        sort:false },
  { key:"owned_by",         label:"Owned By",             sort:true  },
  { key:"vehicle_brand",    label:"Brand",                sort:true  },
  { key:"vehicle_model",    label:"Model",                sort:true  },
  { key:"vehicle_body",     label:"Body",                 sort:true  },
  { key:"capacity",         label:"Capacity",             sort:false },
  { key:"manufacture_date", label:"Manufacture Date",     sort:true  },
  { key:"purchase_date",    label:"Purchase Date",        sort:true  },
  { key:"assigned_at",      label:"Assigned At",          sort:true  },
  { key:"actions",          label:"Actions",              sort:false },
];

const DEFAULT_VIS = {
  sn:true, user_id:true, vehicle_no:true, vehicle_type:true, imei:true,
  sim_card_number:true,
  fuel_type:true, speed_limit_kph:true, mileage:true,
  sub_start:true, sub_due:true, vstatus:true,
  nickname:false, odometer:false, duration_odo:false,
  parking_alarm:false, owned_by:false,
  vehicle_brand:true, vehicle_model:true, vehicle_body:false,
  capacity:false, manufacture_date:false, purchase_date:false,
  assigned_at:false,
  actions:true,
};

const SORT_MAP = {
  vehicle_no:      "vehicle_no",
  vehicle_type:    "vehicle_type",
  imei:            "imei",
  sim_card_number: "sim_card_number",
  fuel_type:       "fuelType",
  speed_limit_kph: "speed_limit_kph",
  mileage:         "mileage",
  sub_start:       "subStart",
  sub_due:         "subDue",
  vstatus:         "vstatus",
  nickname:        "nickname",
  owned_by:        "ownedBy",
  vehicle_brand:   "vehicleBrand",
  vehicle_model:   "vehicleModel",
  vehicle_body:    "vehicleBody",
  manufacture_date:"manufactureDate",
  purchase_date:   "purchaseDate",
  assigned_at:     "vehicleAssignedAt",
};

const normalize = v => ({
  ...v,
  _id:              v._id,
  IMEI_No:          v.IMEI_No            || "",
  imei:             v.IMEI_No            || v.imei              || "",
  vehicle_no:       v.vehicle_no         || "",
  vehicle_type:     v.vehicle_type       || "",
  fuelType:         v.fuelType           || v.fuel_type         || "",
  vehicleBrand:     v.vehicleBrand       || "",
  vehicleModel:     v.vehicleModel       || "",
  vehicleBody:      v.vehicleBody        || "",
  nickname:         v.nickname           || "",
  speed_limit_kph:  v.speed_limit_kph    ?? null,
  mileage:          v.mileage            ?? null,
  capacity:         v.capacity           ?? null,
  odometer:         v.odometer           ?? null,
  durationOdometer: v.durationOdometer   ?? null,
  parkingAlarm:     !!v.parkingAlarm,
  ownerName:        v.ownerName          || "",
  ownedBy:          v.ownedBy            || "",
  subStart:         v.subStart           || null,
  subDue:           v.subDue             || null,
  manufactureDate:  v.manufactureDate    || null,
  purchaseDate:     v.purchaseDate       || null,
  vehicleAssignedAt:v.vehicleAssignedAt  || null,
  adminId:          v.adminId            || null,
  dealerId:         v.dealerId           || null,
  user_id:          v.user_id            != null ? Number(v.user_id) : null,
  vstatus:          v.vstatus            || "Active",
  sim_card_number:  v.sim_card           || v.sim_card_number   || "",
  clientActive:     v.clientActive !== false,
  clientStatus:     v.clientStatus || (v.vstatus !== "Inactive" ? "Active" : "Inactive"),
});

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function VehiclesDealer({ currentUser }) {
  const theme = useTheme();
  ACC = theme?.activeColor || ACC_DEFAULT;

  const [vehicles,     setVehicles]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [fetchErr,     setFetchErr]     = useState("");

  const [userNames,    setUserNames]    = useState({});
  const [namesLoading, setNamesLoading] = useState(false);

  const [search,       setSearch]       = useState("");
  const [vstatus,      setVstatus]      = useState("");
  const [filterMonth,  setFilterMonth]  = useState("");
  const [rowsPerPage,  setRowsPerPage]  = useState(15);
  const [sortCol,      setSortCol]      = useState("vehicle_no");
  const [sortDir,      setSortDir]      = useState("asc");
  const [page,         setPage]         = useState(1);
  const [visibleCols,  setVisibleCols]  = useState(DEFAULT_VIS);
  const [editV,        setEditV]        = useState(null);
  const [deleteV,      setDeleteV]      = useState(null);
  const [showAdd,      setShowAdd]      = useState(false);

  const colRef = useRef();
  const [colMenuOpen, setColMenuOpen] = useState(false);

  useEffect(()=>{
    const h = e=>{ if(colRef.current&&!colRef.current.contains(e.target)) setColMenuOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  const fetchVehicles = useCallback(async ()=>{
    setLoading(true);
    setFetchErr("");
    try {
      const data = await listVehicles({ page:1, limit:1000, search:"" });
      const raw  = Array.isArray(data.vehicles) ? data.vehicles : [];
      setVehicles(raw.map(normalize));
    } catch(err){
      console.error("[VehiclesDealer fetchVehicles]", err);
      setFetchErr(err?.response?.data?.message || err.message || "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  },[]);

  useEffect(()=>{ fetchVehicles(); },[fetchVehicles]);

  useEffect(() => {
    if (vehicles.length === 0) return;

    const uniqueUserIds = [...new Set(
      vehicles.map(v => v.user_id).filter(id => id != null)
    )];

    if (uniqueUserIds.length === 0) {
      setUserNames({});
      return;
    }

    setNamesLoading(true);

    const fetchUsernames = async () => {
      const uMap = {};
      try {
        const dealerId = currentUser?.user_id ?? currentUser?.id ?? currentUser?.userId;
        const response = await fetchUsers(dealerId);

        let usersArray = [];
        if (Array.isArray(response)) {
          usersArray = response;
        } else if (response?.users && Array.isArray(response.users)) {
          usersArray = response.users;
        } else if (response?.data && Array.isArray(response.data)) {
          usersArray = response.data;
        }

        usersArray.forEach(u => {
          const uid = u.user_id != null ? Number(u.user_id) : null;
          if (uid != null) {
            uMap[uid] = u.username || u.fullName || u.name || `User ${uid}`;
          }
        });

      } catch(err) {
        console.error("[VehiclesDealer] fetchUsers failed:", err);
        uniqueUserIds.forEach(uid => {
          if (!uMap[uid]) uMap[uid] = `User ${uid}`;
        });
      } finally {
        setUserNames(uMap);
        setNamesLoading(false);
      }
    };

    fetchUsernames();
  }, [vehicles, currentUser]);

  const filtered = useMemo(()=>{
    let list = [...vehicles];

    if (search){
      const q = search.toLowerCase();
      list = list.filter(v=>
        (v.vehicle_no          ||"").toLowerCase().includes(q)||
        (v.vehicle_type        ||"").toLowerCase().includes(q)||
        (v.ownerName           ||"").toLowerCase().includes(q)||
        (v.vehicleBrand        ||"").toLowerCase().includes(q)||
        (v.vehicleModel        ||"").toLowerCase().includes(q)||
        (v.nickname            ||"").toLowerCase().includes(q)||
        (v.imei                ||"").includes(search)||
        (v.sim_card_number     ||"").toLowerCase().includes(q)||
        (userNames[v.user_id]  ||"").toLowerCase().includes(q)
      );
    }

    if (vstatus === "active") {
      list = list.filter(v => v.clientActive !== false);
    }
    if (vstatus === "inactive") {
      list = list.filter(v => v.clientActive === false);
    }

    if (filterMonth){
      list = list.filter(v=>{
        const m = String(v.subStart||"").match(/^(\d{4})-(\d{2})/);
        return m ? m[2]===filterMonth : false;
      });
    }

    const bk = SORT_MAP[sortCol];
    if (bk){
      list.sort((a,b)=>{
        const va = String(a[bk]??""), vb = String(b[bk]??"");
        return sortDir==="asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  },[vehicles,search,vstatus,filterMonth,sortCol,sortDir,userNames]);

  const totalPages = Math.max(1, Math.ceil(filtered.length/rowsPerPage));
  const paginated  = filtered.slice((page-1)*rowsPerPage, page*rowsPerPage);

  const handleSort = col=>{
    if(sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  };
  const resetFilters = ()=>{ setVstatus(""); setFilterMonth(""); setSearch(""); setPage(1); };

  const thS = {
    padding:"9px 12px", textAlign:"center", fontSize:12, fontWeight:700,
    color:"#fff", background:ACC,
    borderRight:"1px solid rgba(255,255,255,0.1)",
    whiteSpace:"nowrap", userSelect:"none",
    position:"sticky", top:0, zIndex:2,
  };
  const tdS = {
    padding:"9px 12px", fontSize:12,
    borderBottom:"1px solid #edf0f4", verticalAlign:"middle",
    whiteSpace:"nowrap", color:"#1e293b", textAlign:"center",
  };

  const renderCell = (key,v,i)=>{
    switch(key){
      case "sn":
        return <td key={key} style={{ ...tdS,color:"#9ca3af",width:44,textAlign:"center",fontWeight:500 }}>{(page-1)*rowsPerPage+i+1}</td>;

      case "user_id":
        return (
          <td key={key} style={tdS}>
            <UsernameBadge
              name={userNames[v.user_id] || (v.user_id ? `User ${v.user_id}` : "")}
              loading={namesLoading && v.user_id != null && !userNames[v.user_id]}
            />
          </td>
        );

      case "vehicle_no":
        return (
          <td key={key} style={tdS}>
            <span style={{ color:ACC,cursor:"pointer",fontWeight:700,borderBottom:`1px dashed ${ACC}` }}
              onClick={()=>setEditV(v)}>{v.vehicle_no||"—"}</span>
          </td>
        );

      case "vehicle_type":
        return (
          <td key={key} style={tdS}>
            {v.vehicle_type
              ?<span style={{ padding:"2px 9px",background:"#ede9fe",color:"#5b21b6",borderRadius:10,fontSize:11,fontWeight:600 }}>{v.vehicle_type}</span>
              :<span style={{ color:"#d1d5db" }}>—</span>}
          </td>
        );

      case "imei":
        return <td key={key} style={{ ...tdS,fontFamily:"monospace",fontSize:11,color:"#0369a1",fontWeight:700,letterSpacing:"0.02em" }}>{v.imei||"—"}</td>;

      case "sim_card_number":
        return <td key={key} style={{ ...tdS,fontFamily:"monospace",fontSize:11,color:"#4b5563",fontWeight:600 }}>{v.sim_card_number||"—"}</td>;

      case "fuel_type":
        return (
          <td key={key} style={tdS}>
            {v.fuelType
              ?<span style={{ padding:"2px 9px",background:"#e0f2fe",color:"#0369a1",borderRadius:10,fontSize:11,fontWeight:600 }}>{v.fuelType}</span>
              :<span style={{ color:"#d1d5db" }}>—</span>}
          </td>
        );

      case "speed_limit_kph":
        return (
          <td key={key} style={{ ...tdS,color:v.speed_limit_kph?"#d97706":"#9ca3af",fontWeight:v.speed_limit_kph?700:400 }}>
            {v.speed_limit_kph!=null && v.speed_limit_kph!=="" ? `${v.speed_limit_kph} km/h` : "—"}
          </td>
        );

      case "mileage":
        return <td key={key} style={tdS}>{v.mileage!=null && v.mileage!=="" ? `${v.mileage} km/L` : "—"}</td>;

      case "sub_start":
        return <td key={key} style={{ ...tdS,fontSize:11,color:"#475569" }}>{fmtDate(v.subStart)}</td>;

      case "sub_due":{
        let extra={};
        if(v.subDue){
          const diff=(new Date(v.subDue)-new Date())/86400000;
          if(diff<0)    extra={color:"#dc2626",fontWeight:700};
          else if(diff<=30) extra={color:"#d97706",fontWeight:600};
        }
        return <td key={key} style={{ ...tdS,fontSize:11,...extra }}>{fmtDate(v.subDue)}</td>;
      }

      case "vstatus":
        return <td key={key} style={tdS}><VBadge val={v.vstatus} clientActive={v.clientActive}/></td>;

      case "nickname":
        return <td key={key} style={{ ...tdS,color:"#64748b",fontStyle:v.nickname?"normal":"italic" }}>{v.nickname||"—"}</td>;

      case "odometer":
        return <td key={key} style={tdS}>{v.odometer!=null && v.odometer!=="" ? `${v.odometer} km` : "—"}</td>;

      case "duration_odo":
        return <td key={key} style={tdS}>{v.durationOdometer!=null && v.durationOdometer!=="" ? `${v.durationOdometer} km` : "—"}</td>;

      case "parking_alarm":
        return <td key={key} style={{ ...tdS,textAlign:"center" }}><BoolDot val={!!v.parkingAlarm}/></td>;

      case "owned_by":
        return (
          <td key={key} style={tdS}>
            {v.ownedBy
              ?<span style={{ padding:"2px 9px",background:"#f0fdf4",color:"#15803d",borderRadius:10,fontSize:11,fontWeight:600,border:"1px solid #bbf7d0" }}>{v.ownedBy}</span>
              :<span style={{ color:"#d1d5db" }}>—</span>}
          </td>
        );

      case "vehicle_brand":
        return <td key={key} style={{ ...tdS,fontWeight:v.vehicleBrand?600:400 }}>{v.vehicleBrand||"—"}</td>;

      case "vehicle_model":
        return <td key={key} style={tdS}>{v.vehicleModel||"—"}</td>;

      case "vehicle_body":
        return <td key={key} style={tdS}>{v.vehicleBody||"—"}</td>;

      case "capacity":
        return <td key={key} style={tdS}>{v.capacity!=null && v.capacity!=="" ? v.capacity : "—"}</td>;

      case "manufacture_date":
        return <td key={key} style={{ ...tdS,fontSize:11,color:"#475569" }}>{fmtDate(v.manufactureDate)}</td>;

      case "purchase_date":
        return <td key={key} style={{ ...tdS,fontSize:11,color:"#475569" }}>{fmtDate(v.purchaseDate)}</td>;

      case "assigned_at":
        return <td key={key} style={{ ...tdS,fontSize:11,color:"#475569" }}>{fmtDate(v.vehicleAssignedAt)}</td>;

      // REPLACE WITH:
      case "actions":
        return (
          <td key={key} style={{ ...tdS,textAlign:"center" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex",gap:4,justifyContent:"center" }}>
              {/* Edit — always active */}
              <button onClick={()=>setEditV(v)} title="Edit"
                style={{ background:"none",border:"1px solid #e2e8f0",cursor:"pointer",padding:"4px 7px",color:ACC,borderRadius:3,display:"inline-flex",alignItems:"center" }}
                onMouseEnter={e=>{e.currentTarget.style.background="#ede9fe";e.currentTarget.style.borderColor=ACC;}}
                onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor="#e2e8f0";}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              {/* Delete — active only when inactive, disabled when active */}
              {v.clientActive === false ? (
                <button onClick={()=>setDeleteV(v)} title="Delete"
                  style={{ background:"none",border:"1px solid #e2e8f0",cursor:"pointer",padding:"4px 7px",color:"#ef4444",borderRadius:3,display:"inline-flex",alignItems:"center" }}
                  onMouseEnter={e=>{e.currentTarget.style.background="#fee2e2";e.currentTarget.style.borderColor="#fca5a5";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor="#e2e8f0";}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              ) : (
                <button disabled title="Cannot delete active vehicle"
                  style={{ background:"none",border:"1px solid #f1f5f9",cursor:"not-allowed",padding:"4px 7px",color:"#cbd5e1",borderRadius:3,display:"inline-flex",alignItems:"center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              )}
            </div>
          </td>
        );

      default:
        return <td key={key} style={{ ...tdS,color:"#9ca3af" }}>—</td>;
    }
  };

  const activeKeys = ALL_COLS.filter(c=>visibleCols[c.key]);

  return (
    <div style={{ padding:"0",background:"#f4f6f9",height:"100%",display:"flex",flexDirection:"column",fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      {/* toolbar */}
      <div style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#fff",borderBottom:"1px solid #e2e8f0",flexWrap:"wrap" }}>

        <div style={{ display:"flex",alignItems:"center",gap:6,background:"#f8fafc",border:"1px solid #e2e8f0",padding:"0 10px",height:38,borderRadius:3,minWidth:280 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input placeholder="Search vehicle no., IMEI, SIM, owner, brand, username…" value={search}
            onChange={e=>{setSearch(e.target.value);setPage(1);}}
            style={{ border:"none",background:"transparent",outline:"none",fontSize:13,color:"#1e293b",width:"100%" }}/>
          {search&&(
            <button onClick={()=>{setSearch("");setPage(1);}}
              style={{ background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:14,padding:0 }}>✕</button>
          )}
        </div>

        <select style={selStyle} value={vstatus} onChange={e=>{setVstatus(e.target.value);setPage(1);}}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select style={{ ...selStyle,minWidth:155 }} value={filterMonth} onChange={e=>{setFilterMonth(e.target.value);setPage(1);}}>
          <option value="">All Months</option>
          {MONTHS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <button onClick={resetFilters}
          style={{ height:38,padding:"0 14px",background:"#fff",border:"1px solid #e2e8f0",borderRadius:3,fontSize:13,color:"#374151",cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Reset
        </button>

        <button onClick={fetchVehicles} disabled={loading}
          style={{ height:38,padding:"0 14px",background:"#fff",border:"1px solid #e2e8f0",borderRadius:3,fontSize:13,color:"#374151",cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6,opacity:loading?0.6:1 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation:loading?"vSpin .8s linear infinite":"none" }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          {loading?"Loading…":"Refresh"}
        </button>

        <div style={{ flex:1 }}/>

        <span style={{ fontSize:12,color:"#64748b",whiteSpace:"nowrap" }}>
          {filtered.length!==vehicles.length
            ?<><strong style={{ color:"#1e293b" }}>{filtered.length}</strong> / {vehicles.length} vehicles</>
            :<><strong style={{ color:"#1e293b" }}>{vehicles.length}</strong> vehicles</>}
        </span>

        <div style={{ display:"flex",alignItems:"center",gap:6 }}>
          <span style={{ fontSize:12,color:"#64748b" }}>Rows:</span>
          <select value={rowsPerPage} onChange={e=>{setRowsPerPage(Number(e.target.value));setPage(1);}}
            style={{ height:38,padding:"0 8px",border:"1px solid #e2e8f0",fontSize:12,cursor:"pointer",outline:"none",borderRadius:3 }}>
            {[15,25,50,100,200,500].map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div ref={colRef} style={{ position:"relative" }}>
          <button onClick={()=>setColMenuOpen(v=>!v)}
            style={{ height:38,padding:"0 14px",background:colMenuOpen?"#f0f4ff":"#fff",border:`1px solid ${colMenuOpen?ACC:"#e2e8f0"}`,borderRadius:3,fontSize:13,color:"#334155",cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Columns ▾
          </button>
          {colMenuOpen&&(
            <div style={{ position:"absolute",top:"calc(100% + 4px)",right:0,background:"#fff",border:"1px solid #e2e8f0",borderRadius:4,zIndex:400,minWidth:200,padding:"6px 0",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",maxHeight:380,overflowY:"auto" }}>
              <div style={{ padding:"6px 12px 4px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em" }}>Toggle Columns</div>
              {ALL_COLS.map(c=>(
                <label key={c.key}
                  style={{ display:"flex",alignItems:"center",gap:8,padding:"6px 12px",cursor:"pointer",fontSize:12,color:"#374151" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <input type="checkbox" checked={!!visibleCols[c.key]}
                    onChange={()=>setVisibleCols(p=>({...p,[c.key]:!p[c.key]}))}
                    style={{ accentColor:ACC }}/>
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <button onClick={()=>setShowAdd(true)}
          style={{ height:38,padding:"0 20px",background:ACC,border:"none",borderRadius:3,fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Vehicle
        </button>
      </div>

      {fetchErr&&(
        <div style={{ padding:"10px 16px",background:"#fff5f5",border:"1px solid #fca5a5",borderTop:"none",color:"#dc2626",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:8 }}>
          ⚠️ {fetchErr}
          <button onClick={fetchVehicles}
            style={{ marginLeft:8,background:"none",border:"1px solid #fca5a5",borderRadius:3,padding:"2px 10px",cursor:"pointer",fontSize:11,color:"#dc2626" }}>
            Retry
          </button>
        </div>
      )}

      <div style={{ overflowX:"auto",background:"#fff",borderTop:"none",flex:1 }}>
        <table style={{ width:"100%",borderCollapse:"collapse",tableLayout:"auto" }}>
          <thead>
            <tr>
              {activeKeys.map(c=>(
                <th key={c.key} style={{ ...thS,cursor:c.sort?"pointer":"default" }}
                  onClick={c.sort?()=>handleSort(c.key):undefined}>
                  {c.label}{c.sort&&<SortIcon col={c.key} sortCol={sortCol} sortDir={sortDir}/>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading?(
              <tr>
                <td colSpan={activeKeys.length} style={{ padding:60,textAlign:"center" }}>
                  <div style={{ display:"inline-block",width:32,height:32,border:`3px solid #e2e8f0`,borderTopColor:ACC,borderRadius:"50%",animation:"vSpin .7s linear infinite" }}/>
                  <div style={{ marginTop:12,fontSize:13,color:"#64748b" }}>Loading vehicles…</div>
                </td>
              </tr>
            ):paginated.length===0?(
              <tr>
                <td colSpan={activeKeys.length} style={{ padding:60,textAlign:"center" }}>
                  <div style={{ fontSize:40,marginBottom:10 }}>🚗</div>
                  <div style={{ fontSize:14,color:"#374151",fontWeight:600 }}>
                    {vehicles.length===0?"No vehicles found":"No vehicles data found"}
                  </div>
                  <div style={{ fontSize:12,color:"#9ca3af",marginTop:4 }}>
                    {vehicles.length===0
                      ?"Click 'Add Vehicle' to assign a device to a vehicle"
                      :"Try adjusting your search or filters"}
                  </div>
                </td>
              </tr>
            ):(
              paginated.map((v,i)=>(
                <tr key={v._id||v.IMEI_No||i}
                  style={{ background:i%2===0?"#fff":"#fafbfc",transition:"background 0.1s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f4ff"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafbfc"}>
                  {activeKeys.map(c=>renderCell(c.key,v,i))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:"#fff",borderTop:"1px solid #e2e8f0",fontSize:12,flexWrap:"wrap",gap:8,flexShrink:0 }}>
        <span style={{ color:"#64748b" }}>
          Showing{" "}
          <strong style={{ color:"#1e293b" }}>
            {filtered.length===0?0:(page-1)*rowsPerPage+1}–{Math.min(page*rowsPerPage,filtered.length)}
          </strong>{" "}
          of <strong style={{ color:"#1e293b" }}>{filtered.length}</strong>
        </span>
        <div style={{ display:"flex",gap:3 }}>
          {[
            { label:"«",action:()=>setPage(1),                            disabled:page===1 },
            { label:"‹",action:()=>setPage(p=>Math.max(1,p-1)),          disabled:page===1 },
          ].map((btn,idx)=>(
            <button key={idx} onClick={btn.action} disabled={btn.disabled}
              style={{ padding:"5px 10px",border:"1px solid #e2e8f0",borderRadius:3,background:btn.disabled?"#f8fafc":"#fff",cursor:btn.disabled?"not-allowed":"pointer",color:btn.disabled?"#cbd5e1":"#475569" }}>
              {btn.label}
            </button>
          ))}
          {Array.from({length:Math.min(7,totalPages)},(_,i)=>{
            let p;
            if(totalPages<=7)           p=i+1;
            else if(page<=4)            p=i+1;
            else if(page>=totalPages-3) p=totalPages-6+i;
            else                        p=page-3+i;
            return (
              <button key={p} onClick={()=>setPage(p)}
                style={{ padding:"5px 10px",border:"1px solid #e2e8f0",borderRadius:3,background:p===page?ACC:"#fff",color:p===page?"#fff":"#475569",cursor:"pointer",fontWeight:p===page?700:400 }}>
                {p}
              </button>
            );
          })}
          {[
            { label:"›",action:()=>setPage(p=>Math.min(totalPages,p+1)), disabled:page===totalPages },
            { label:"»",action:()=>setPage(totalPages),                   disabled:page===totalPages },
          ].map((btn,idx)=>(
            <button key={idx} onClick={btn.action} disabled={btn.disabled}
              style={{ padding:"5px 10px",border:"1px solid #e2e8f0",borderRadius:3,background:btn.disabled?"#f8fafc":"#fff",cursor:btn.disabled?"not-allowed":"pointer",color:btn.disabled?"#cbd5e1":"#475569" }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Edit modal — now uses new Add-form-style layout ── */}
      <VehicleEditModalDealer
        vehicle={editV}
        onClose={()=>setEditV(null)}
        onSaved={fetchVehicles}
        userNames={userNames}
        namesLoading={namesLoading}
      />

      <DeleteConfirmModal vehicle={deleteV} onClose={()=>setDeleteV(null)} onDeleted={fetchVehicles}/>

      <AddVehicleModal
        open={showAdd}
        onClose={()=>setShowAdd(false)}
        onSaved={()=>{ setShowAdd(false); fetchVehicles(); }}
        currentUser={currentUser}
      />

      <style>{`@keyframes vSpin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );
}