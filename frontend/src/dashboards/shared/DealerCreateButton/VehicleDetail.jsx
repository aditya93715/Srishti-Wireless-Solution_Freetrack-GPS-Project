import React, { useState, useEffect, useCallback } from "react";
import {
  updateVehicle as apiUpdateVehicle,
  fetchUsers,
} from "../../../api/vehicleApi";
import { useTheme } from "../../../context/ThemeContext";

// ── Brand accent (matches entire dealer dashboard) ────────────────────────────
const ACC_DEFAULT = "#3d2b6b";
let ACC = ACC_DEFAULT;

// ── Option lists ──────────────────────────────────────────────────────────────
const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric"];
const BODY_TYPES = ['car', 'truck', 'bus', 'bike', 'tractor', 'auto', 'van', 'pickup', 'tanker', 'JCB'];
const OWN_TYPES  = ["Owner", "Leased", "Company", "Government", "Private"];

// ── Dealer ID resolver ────────────────────────────────────────────────────────
const resolveDealerId = currentUser => {
  if (currentUser?.user_id) return currentUser.user_id;
  if (currentUser?.id)      return currentUser.id;
  if (currentUser?.userId)  return currentUser.userId;
  try {
    const stored = localStorage.getItem("fleet_user");
    if (stored) {
      const p = JSON.parse(stored);
      if (p?.user_id) return p.user_id;
      if (p?.id)      return p.id;
      if (p?.userId)  return p.userId;
    }
  } catch (_) {}
  return null;
};

// ── Style tokens ──────────────────────────────────────────────────────────────
const inp = {
  padding: "8px 10px",
  border: "1px solid #d0d7de",
  borderRadius: 4,
  fontSize: 13,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "#fff",
  color: "#1a1f2e",
  height: 38,
};
const sel = {
  ...inp,
  cursor: "pointer",
  appearance: "none",
  paddingRight: 30,
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  backgroundSize: 16,
};
const lbl = {
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 4,
  display: "block",
};

// ── Disabled field style (grayed out) ────────────────────────────────────────
const disabledStyle = {
  background: "#f1f5f9",
  color: "#94a3b8",
  cursor: "not-allowed",
  border: "1px solid #e2e8f0",
};

const toDateInput = v => {
  if (!v) return "";
  try {
    const d = new Date(v);
    return isNaN(d) ? "" : d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
};

// ── Spinner ───────────────────────────────────────────────────────────────────
const Spin = ({ size = 14, color = ACC_DEFAULT }) => (
  <span style={{
    display: "inline-block", width: size, height: size, borderRadius: "50%",
    border: `2px solid #e2e8f0`, borderTopColor: color,
    animation: "dfSpin .7s linear infinite", flexShrink: 0,
  }} />
);

// ── Field wrapper — now accepts disabled prop ─────────────────────────────────
const Fld = ({ label, req, opt, disabled, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    <label style={{ ...lbl, color: disabled ? "#94a3b8" : "#374151" }}>
      {label}
      {req && <span style={{ color: disabled ? "#cbd5e1" : "#ef4444" }}> *</span>}
      {opt && (
        <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 11 }}>
          {" "}(Optional)
        </span>
      )}
    </label>
    {children}
  </div>
);

// ── Section heading ───────────────────────────────────────────────────────────
const SH = ({ title, sub, color = ACC_DEFAULT }) => (
  <div style={{ marginBottom: 14, paddingBottom: 8, borderBottom: `2px solid ${color}` }}>
    <div style={{
      fontSize: 11, fontWeight: 700, color: color,
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {title}
    </div>
    {sub && (
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{sub}</div>
    )}
  </div>
);

// ── Fill badge ────────────────────────────────────────────────────────────────
const FillBadge = ({ filled, total }) => {
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
  const color = pct >= 80 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626";
  const bg    = pct >= 80 ? "#f0fdf4"  : pct >= 40 ? "#fffbeb"  : "#fff5f5";
  const border= pct >= 80 ? "#86efac"  : pct >= 40 ? "#fde68a"  : "#fca5a5";
  return (
    <span style={{
      padding: "2px 10px", fontSize: 11, fontWeight: 700,
      background: bg, color, border: `1px solid ${border}`,
      borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <span style={{
        width: 48, height: 4, background: "#e5e7eb", borderRadius: 2,
        display: "inline-block", overflow: "hidden",
      }}>
        <span style={{
          display: "block", height: "100%", width: `${pct}%`,
          background: color, borderRadius: 2,
        }} />
      </span>
      {filled}/{total}
    </span>
  );
};

// ── Count filled fields ───────────────────────────────────────────────────────
const countFill = v => {
  const fields = [
    v.ownerName, v.ownedBy, v.vehicleBrand, v.vehicleModel,
    v.vehicleBody, v.capacity, v.manufactureDate, v.purchaseDate,
    v.fuelType, v.odometer, v.durationOdometer, v.nickname,
  ];
  const filled = fields.filter(f => f !== null && f !== undefined && f !== "" && f !== 0).length;
  return { filled, total: fields.length };
};

// ── Normalize vehicle doc ─────────────────────────────────────────────────────
const normalize = v => ({
  ...v,
  _id:              v._id,
  imei:             v.IMEI_No || v.imei || "",
  vehicle_no:       v.vehicle_no || "",
  vehicle_type:     v.vehicle_type || "",
  fuelType:         v.fuelType || "",
  vehicleBrand:     v.vehicleBrand || "",
  vehicleModel:     v.vehicleModel || "",
  vehicleBody:      v.vehicleBody || "",
  nickname:         v.nickname || "",
  speed_limit_kph:  v.speed_limit_kph ?? null,
  mileage:          v.mileage ?? null,
  capacity:         v.capacity ?? null,
  odometer:         v.odometer ?? null,
  durationOdometer: v.durationOdometer ?? null,
  parkingAlarm:     !!v.parkingAlarm,
  ownerName:        v.ownerName || "",
  ownedBy:          v.ownedBy || "",
  subStart:         v.subStart || null,
  subDue:           v.subDue || null,
  manufactureDate:  v.manufactureDate || null,
  purchaseDate:     v.purchaseDate || null,
  user_id:          v.user_id != null ? Number(v.user_id) : null,
  dealerId:         v.dealerId || null,
  clientActive:     v.clientActive !== false,
  sim_card_number:  v.sim_card || v.sim_card_number || "",
});

// ── Initial form state (all fields empty) ────────────────────────────────────
const INIT_F = {
  owner_name: "", owned_by: "", vehicle_brand: "", vehicle_model: "",
  vehicle_body: "", capacity: "", manufacture_date: "", purchase_date: "",
  fuel_type: "", odometer: "", duration_odometer: "", nickname: "",
  parking_alarm: false,
  vehicle_no: "", vehicle_type: "", speed_limit_kph: "", mileage: "",
  sub_start: "", sub_due: "",
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN FORM COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function VehicleAdditionalDetailsFormDealer({
  isOpen,
  onClose,
  onSaved,
  currentUser,
  allVehicles = [],
  initialVehicle = null,
}) {
  const theme = useTheme();
  ACC = theme?.activeColor || ACC_DEFAULT;

  // ── Edit mode: true when opened by clicking a table row ──────────────────
  // When initialVehicle exists → edit mode → lock Select User, Select Vehicle, Owner Name
  const isEditMode = !!initialVehicle;

  const onFocus = e => {
    e.target.style.borderColor = ACC;
    e.target.style.boxShadow = `0 0 0 2px ${ACC}30`;
  };
  const onBlur = e => {
    e.target.style.borderColor = "#d0d7de";
    e.target.style.boxShadow = "none";
  };

  const [users,        setUsers]        = useState([]);
  const [ldUsers,      setLdUsers]      = useState(false);
  const [errUsers,     setErrUsers]     = useState("");

  const [selUser,      setSelUser]      = useState("");
  const [userVehicles, setUserVehicles] = useState([]);
  const [selVehicle,   setSelVehicle]   = useState(null);

  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState("");

  const [f, setF] = useState(INIT_F);

  const setField = k => e =>
    setF(p => ({
      ...p,
      [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  // ── Populate form from vehicle object ─────────────────────────────────────
  const populateForm = useCallback(veh => {
    setSelVehicle(veh);
    setMsg("");
    setF({
      owner_name:        veh.ownerName       || "",
      owned_by:          veh.ownedBy         || "",
      vehicle_brand:     veh.vehicleBrand    || "",
      vehicle_model:     veh.vehicleModel    || "",
      vehicle_body:      veh.vehicleBody     || "",
      capacity:          veh.capacity != null ? String(veh.capacity) : "",
      manufacture_date:  toDateInput(veh.manufactureDate),
      purchase_date:     toDateInput(veh.purchaseDate),
      fuel_type:         veh.fuelType        || "",
      odometer:          veh.odometer != null ? String(veh.odometer) : "",
      duration_odometer: veh.durationOdometer != null ? String(veh.durationOdometer) : "",
      nickname:          veh.nickname        || "",
      parking_alarm:     !!veh.parkingAlarm,
      vehicle_no:        veh.vehicle_no      || "",
      vehicle_type:      veh.vehicle_type    || "",
      speed_limit_kph:   veh.speed_limit_kph != null ? String(veh.speed_limit_kph) : "",
      mileage:           veh.mileage != null ? String(veh.mileage) : "",
      sub_start:         toDateInput(veh.subStart),
      sub_due:           toDateInput(veh.subDue),
    });
  }, []);

  // ── Reset everything when modal closes ───────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setSelUser(""); setSelVehicle(null);
      setUserVehicles([]); setF(INIT_F); setMsg("");
    }
  }, [isOpen]);

  // ── Pre-select if initialVehicle passed (from table edit row) ─────────────
  useEffect(() => {
    if (isOpen && initialVehicle) {
      const userId = initialVehicle.user_id ? String(initialVehicle.user_id) : "";
      setSelUser(userId);
      populateForm(initialVehicle);
    }
  }, [isOpen, initialVehicle, populateForm]);

  // ── Load users on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const dealerId = resolveDealerId(currentUser);
    if (!dealerId) {
      setErrUsers("Could not resolve dealer ID — please re-login.");
      return;
    }
    setLdUsers(true);
    fetchUsers(dealerId)
      .then(data => {
        let arr = [];
        if (Array.isArray(data))                           arr = data;
        else if (data?.users && Array.isArray(data.users)) arr = data.users;
        else if (data?.data  && Array.isArray(data.data))  arr = data.data;
        setUsers(arr);
        if (arr.length === 0) setErrUsers("No users found under your account.");
      })
      .catch(err => {
        console.error("[FormDealer fetchUsers]", err);
        setErrUsers("Failed to load users. Please try again.");
      })
      .finally(() => setLdUsers(false));
  }, [isOpen, currentUser]);

  // ── User → filter vehicles (only used in add mode) ───────────────────────
  useEffect(() => {
    if (!selUser) { setUserVehicles([]); return; }
    const uid = Number(selUser);
    setUserVehicles(allVehicles.filter(v => v.user_id === uid && v.vehicle_no));
  }, [selUser, allVehicles]);

  // ── Vehicle selector handler (only used in add mode) ─────────────────────
  const handleVehicleSelect = e => {
    const vno = e.target.value;
    if (!vno) { setSelVehicle(null); setF(INIT_F); return; }
    const veh = userVehicles.find(v => v.vehicle_no === vno);
    if (veh) populateForm(veh);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!selVehicle) return setMsg("✗ Please select a vehicle first");
    setSaving(true); setMsg("");
    try {
      await apiUpdateVehicle(selVehicle._id, {
        owner_name:        f.owner_name,
        owned_by:          f.owned_by,
        vehicle_brand:     f.vehicle_brand,
        vehicle_model:     f.vehicle_model,
        vehicle_body:      f.vehicle_body,
        capacity:          Number(f.capacity)          || 0,
        manufacture_date:  f.manufacture_date,
        purchase_date:     f.purchase_date,
        fuel_type:         f.fuel_type,
        odometer:          Number(f.odometer)          || 0,
        duration_odometer: Number(f.duration_odometer) || 0,
        nickname:          f.nickname,
        parking_alarm:     f.parking_alarm,
        vehicle_no:        selVehicle.vehicle_no,
        vehicle_type:      selVehicle.vehicle_type,
        speed_limit_kph:   selVehicle.speed_limit_kph  || 60,
        mileage:           selVehicle.mileage           || 1,
        sub_start:         f.sub_start,
        sub_due:           f.sub_due,
      });
      setMsg("✓ Details saved successfully!");
      onSaved?.();
      setTimeout(() => onClose?.(), 1200);
    } catch (err) {
      setMsg(`✗ ${err?.response?.data?.message || err.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const { filled, total } = selVehicle ? countFill(selVehicle) : { filled: 0, total: 12 };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px 0", overflowY: "auto",
        }}
      >
        {/* Modal box */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: "#fff", borderRadius: 6, width: "min(980px, 96vw)",
            maxHeight: "90vh", overflow: "hidden", display: "flex",
            flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            margin: "auto",
          }}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div style={{
            background: ACC, color: "#fff", padding: "13px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Vehicle Details</span>
              {/* Edit mode badge in header */}
              {isEditMode && (
                <span style={{
                  background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)",
                  borderRadius: 10, padding: "2px 10px", fontSize: 11, fontWeight: 600,
                  color: "#fff", display: "flex", alignItems: "center", gap: 4,
                }}>
                Edit Mode
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.15)", border: "none",
                color: "#fff", borderRadius: "50%", width: 26, height: 26,
                cursor: "pointer", fontSize: 14, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>

          {/* ── Scrollable body ─────────────────────────────────────────── */}
          <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>

            {/* ── TOP 2 ROLE FIELDS — disabled in edit mode ──────────────── */}
            <SH title="Select User" color={ACC} />

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
              gap: "14px 18px", marginBottom: 24,
            }}>

              {/* ── Select User ── DISABLED in edit mode ───────────────── */}
              <Fld label="Select User" req disabled={isEditMode}>
                <div style={{ position: "relative" }}>
                  <select
                    style={{
                      ...sel,
                      ...(isEditMode ? disabledStyle : {
                        borderColor: selUser ? ACC : "#d0d7de",
                        opacity: ldUsers ? 0.7 : 1,
                      }),
                    }}
                    value={selUser}
                    onChange={e => {
                      if (isEditMode) return; // extra guard
                      setSelUser(e.target.value);
                      setSelVehicle(null);
                      setF(INIT_F);
                      setMsg("");
                    }}
                    onFocus={isEditMode ? undefined : onFocus}
                    onBlur={isEditMode ? undefined : onBlur}
                    disabled={isEditMode || ldUsers}
                  >
                    <option value="">
                      {ldUsers ? "Loading users…" : "— Select User —"}
                    </option>
                    {users.map(u => (
                      <option key={u.user_id} value={String(u.user_id)}>
                        {u.username}
                      </option>
                    ))}
                  </select>
                  {ldUsers && !isEditMode && (
                    <span style={{
                      position: "absolute", right: 34, top: "50%",
                      transform: "translateY(-50%)",
                    }}>
                      <Spin size={12} color={ACC} />
                    </span>
                  )}
                </div>
                {errUsers && !isEditMode && (
                  <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>
                    ⚠ {errUsers}
                  </span>
                )}
                {selUser && !isEditMode && (
                  <span style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                    {userVehicles.length === 0
                      ? "⚠ No vehicles assigned to this user"
                      : `${userVehicles.length} vehicle${userVehicles.length > 1 ? "s" : ""} assigned`}
                  </span>
                )}
              </Fld>

              {/* ── Select Vehicle ── DISABLED in edit mode ─────────────── */}
              <Fld label="Select Vehicle" req disabled={isEditMode}>
                <select
                  style={{
                    ...sel,
                    ...(isEditMode ? disabledStyle : {
                      borderColor: selVehicle ? ACC : selUser ? "#f59e0b" : "#d0d7de",
                      opacity: (!selUser || userVehicles.length === 0) ? 0.6 : 1,
                    }),
                  }}
                  value={selVehicle?.vehicle_no || ""}
                  onChange={isEditMode ? undefined : handleVehicleSelect}
                  onFocus={isEditMode ? undefined : onFocus}
                  onBlur={isEditMode ? undefined : onBlur}
                  disabled={isEditMode || !selUser || userVehicles.length === 0}
                >
                  <option value="">
                    {!selUser ? "← Select user first"
                      : userVehicles.length === 0 ? "No vehicles found"
                      : "— Select Vehicle —"}
                  </option>
                  {/* In edit mode show pre-selected vehicle */}
                  {isEditMode && selVehicle && (
                    <option value={selVehicle.vehicle_no}>
                      {selVehicle.vehicle_no}
                    </option>
                  )}
                  {!isEditMode && userVehicles.map(v => (
                    <option key={v._id} value={v.vehicle_no}>
                      {v.vehicle_no}
                    </option>
                  ))}
                </select>
              </Fld>
            </div>

            {/* ── VEHICLE DETAIL FIELDS ─────────────────────────────────────
                Owner Name → DISABLED in edit mode
                All other fields → always editable
            ──────────────────────────────────────────────────────────────── */}
            <SH title="Fill Vehicle Details" color={ACC} />

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: "16px 20px", marginBottom: 20,
            }}>

              {/* ── Owner Name ── DISABLED in edit mode ────────────────── */}
              <Fld label="Owner Name" opt disabled={isEditMode}>
                <input
                  style={{ ...inp, ...(isEditMode ? disabledStyle : {}) }}
                  value={f.owner_name}
                  placeholder="Full name of owner"
                  onChange={isEditMode ? undefined : setField("owner_name")}
                  onFocus={isEditMode ? undefined : onFocus}
                  onBlur={isEditMode ? undefined : onBlur}
                  disabled={isEditMode}
                />
              </Fld>

              {/* ── All fields below are always editable ─────────────────── */}
              <Fld label="Owned By" opt>
                <select style={sel} value={f.owned_by}
                  onChange={setField("owned_by")}
                  onFocus={onFocus} onBlur={onBlur}>
                  <option value="">— Select —</option>
                  {OWN_TYPES.map(o => <option key={o}>{o}</option>)}
                </select>
              </Fld>

              <Fld label="Vehicle Brand" opt>
                <input style={inp} value={f.vehicle_brand}
                  placeholder="e.g. Toyota"
                  onChange={setField("vehicle_brand")}
                  onFocus={onFocus} onBlur={onBlur} />
              </Fld>

              <Fld label="Vehicle Model" opt>
                <input style={inp} value={f.vehicle_model}
                  placeholder="e.g. Innova"
                  onChange={setField("vehicle_model")}
                  onFocus={onFocus} onBlur={onBlur} />
              </Fld>

              <Fld label="Vehicle Body" opt>
                <select style={sel} value={f.vehicle_body}
                  onChange={setField("vehicle_body")}
                  onFocus={onFocus} onBlur={onBlur}>
                  <option value="">— Select —</option>
                  {BODY_TYPES.map(o => <option key={o}>{o}</option>)}
                </select>
              </Fld>

              <Fld label="Fuel Type" opt>
                <select style={sel} value={f.fuel_type}
                  onChange={setField("fuel_type")}
                  onFocus={onFocus} onBlur={onBlur}>
                  <option value="">— Select —</option>
                  {FUEL_TYPES.map(o => <option key={o}>{o}</option>)}
                </select>
              </Fld>

              <Fld label="Capacity" opt>
                <input style={inp} type="number" min={0} value={f.capacity}
                  placeholder="0"
                  onChange={setField("capacity")}
                  onFocus={onFocus} onBlur={onBlur} />
              </Fld>

              <Fld label="Nickname" opt>
                <input style={inp} value={f.nickname}
                  placeholder="Short name / alias"
                  onChange={setField("nickname")}
                  onFocus={onFocus} onBlur={onBlur} />
              </Fld>

              <Fld label="Odometer (km)" opt>
                <input style={inp} type="number" min={0} value={f.odometer}
                  placeholder="Current reading"
                  onChange={setField("odometer")}
                  onFocus={onFocus} onBlur={onBlur} />
              </Fld>

              <Fld label="Duration Odometer (km)" opt>
                <input style={inp} type="number" min={0} value={f.duration_odometer}
                  placeholder="Duration reading"
                  onChange={setField("duration_odometer")}
                  onFocus={onFocus} onBlur={onBlur} />
              </Fld>

              <Fld label="Manufacture Date" opt>
                <input style={inp} type="date" value={f.manufacture_date}
                  onChange={setField("manufacture_date")}
                  onFocus={onFocus} onBlur={onBlur} />
              </Fld>

              <Fld label="Purchase Date" opt>
                <input style={inp} type="date" value={f.purchase_date}
                  onChange={setField("purchase_date")}
                  onFocus={onFocus} onBlur={onBlur} />
              </Fld>
            </div>

            {/* Message */}
            {msg && (
              <div style={{
                padding: "8px 14px", borderRadius: 4, marginBottom: 12,
                fontSize: 12, fontWeight: 600,
                background: msg[0] === "✓" ? "#f0fdf4" : "#fff5f5",
                color: msg[0] === "✓" ? "#16a34a" : "#dc2626",
                border: `1px solid ${msg[0] === "✓" ? "#86efac" : "#fca5a5"}`,
              }}>
                {msg}
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div style={{
            padding: "12px 24px", borderTop: "1px solid #e2e8f0",
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            gap: 8, flexShrink: 0, background: "#fafbfc",
          }}>
            <button
              onClick={onClose}
              style={{
                height: 36, padding: "0 18px", background: "#fff",
                border: "1px solid #d0d7de", borderRadius: 4, fontSize: 13,
                color: "#374151", cursor: "pointer", fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !selVehicle}
              style={{
                height: 36, padding: "0 24px",
                background: saving || !selVehicle ? "#a78bfa" : ACC,
                color: "#fff", border: "none", borderRadius: 4,
                fontSize: 13, fontWeight: 700,
                cursor: saving || !selVehicle ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              {saving ? (
                <><Spin size={12} color="#fff" /> Saving…</>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  Save Details
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dfSpin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}