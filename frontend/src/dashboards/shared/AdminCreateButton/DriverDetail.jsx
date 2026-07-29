// components/shared/DealerCreateButton/DriverDetail.jsx
import React, { useState, useEffect, useCallback } from "react";
import { saveDriverDetails }         from "../../../api/driverApi";
import { fetchAdmins, fetchDealers, fetchUsers } from "../../../api/vehicleApi";
import { useTheme }                  from "../../../context/ThemeContext";

const ACC_DEFAULT = "#3d2b6b";
let ACC = ACC_DEFAULT;

const LICENSE_TYPES = [
  "LMV", "HMV", "HPMV", "MGV", "Transport",
  "Non-Transport", "Motorcycle", "Commercial",
];

const inp = {
  padding: "8px 10px", border: "1px solid #d0d7de", borderRadius: 4,
  fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", background: "#fff", color: "#1a1f2e", height: 38,
};
const sel = {
  ...inp, cursor: "pointer", appearance: "none", paddingRight: 30,
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: 16,
};
const lbl = { fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" };

const toDateInput = (v) => {
  if (!v) return "";
  try { const d = new Date(v); return isNaN(d) ? "" : d.toISOString().slice(0, 10); }
  catch { return ""; }
};

const Spin = ({ size = 14, color = ACC_DEFAULT }) => (
  <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", border: `2px solid #e2e8f0`, borderTopColor: color, animation: "ddSpin .7s linear infinite", flexShrink: 0 }} />
);

const Fld = ({ label, opt, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    <label style={lbl}>
      {label}
      {opt && <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 11 }}> (Optional)</span>}
    </label>
    {children}
  </div>
);

const SH = ({ title, color = ACC_DEFAULT }) => (
  <div style={{ marginBottom: 14, paddingBottom: 8, borderBottom: `2px solid ${color}` }}>
    <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
  </div>
);

const INIT_F = {
  first_name: "", last_name: "", dob: "", phone_no: "", address: "",
  date_of_joining: "", date_of_leaving: "", experience: "", salary: "",
  license_no: "", license_to_drive: "", license_issue_date: "", license_expiry_date: "",
};

export default function DriverDetailForm({
  isOpen, onClose, onSaved, currentUser,
  allVehicles = [],       // ALL vehicles (assigned + unassigned)
  initialVehicle = null,  // null = ADD mode | vehicle object = EDIT mode
}) {
  const theme = useTheme();
  ACC = theme?.activeColor || ACC_DEFAULT;

  // ── Role detection ───────────────────────────────────────────────────────────
  const role = currentUser?.role || "user";
  const isSuperAdmin = role === "super_admin";
  const isAdmin      = role === "admin";
  const isDealer     = role === "dealer";
  const isUser       = role === "user";

  // Mode detection
  const isEditMode = !!initialVehicle;

  const onFocus = (e) => { e.target.style.borderColor = ACC; e.target.style.boxShadow = `0 0 0 2px ${ACC}30`; };
  const onBlur  = (e) => { e.target.style.borderColor = "#d0d7de"; e.target.style.boxShadow = "none"; };

  // ── Dropdown data ────────────────────────────────────────────────────────────
  const [admins,       setAdmins]       = useState([]);
  const [dealers,      setDealers]      = useState([]);
  const [users,        setUsers]        = useState([]);
  const [userVehicles, setUserVehicles] = useState([]);

  const [ldAdmins,  setLdAdmins]  = useState(false);
  const [ldDealers, setLdDealers] = useState(false);
  const [ldUsers,   setLdUsers]   = useState(false);

  // ── Selections ───────────────────────────────────────────────────────────────
  const [selAdmin,   setSelAdmin]   = useState("");
  const [selDealer,  setSelDealer]  = useState("");
  const [selUser,    setSelUser]    = useState("");
  const [selVehicle, setSelVehicle] = useState(null);

  // ── Form ─────────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState("");
  const [f,      setF]      = useState(INIT_F);

  const setField = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const populateForm = useCallback((veh) => {
    setSelVehicle(veh);
    setMsg("");
    setF({
      first_name:          veh.firstName           || "",
      last_name:           veh.lastName            || "",
      dob:                 toDateInput(veh.dob),
      phone_no:            veh.phone_no            || "",
      address:             veh.address             || "",
      date_of_joining:     toDateInput(veh.date_of_joining),
      date_of_leaving:     toDateInput(veh.date_of_leaving),
      experience:          veh.experience          || "",
      salary:              veh.salary != null ? String(veh.salary) : "",
      license_no:          veh.license_no          || "",
      license_to_drive:    veh.license_to_drive    || "",
      license_issue_date:  toDateInput(veh.license_issue_date),
      license_expiry_date: toDateInput(veh.license_expiry_date),
    });
  }, []);

  // ── Reset on close ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setSelAdmin(""); setSelDealer(""); setSelUser(""); setSelVehicle(null);
      setUserVehicles([]); setF(INIT_F); setMsg("");
      setAdmins([]); setDealers([]); setUsers([]);
    }
  }, [isOpen]);

  // ── EDIT MODE: pre-populate from initialVehicle ──────────────────────────────
  useEffect(() => {
    if (isOpen && isEditMode && initialVehicle) {
      setSelAdmin(initialVehicle.adminId   ? String(initialVehicle.adminId)   : "");
      setSelDealer(initialVehicle.dealerId ? String(initialVehicle.dealerId)  : "");
      setSelUser(initialVehicle.user_id    ? String(initialVehicle.user_id)   : "");
      populateForm(initialVehicle);
    }
  }, [isOpen, isEditMode, initialVehicle, populateForm]);

  // ── Load Admins (super_admin only) ───────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !isSuperAdmin || isEditMode) return;
    setLdAdmins(true);
    fetchAdmins?.()
      .then((data) => setAdmins(Array.isArray(data) ? data : []))
      .catch((err)  => console.error("[DriverForm fetchAdmins]", err))
      .finally(()   => setLdAdmins(false));
  }, [isOpen, isSuperAdmin, isEditMode]);

  // ── Load Dealers ─────────────────────────────────────────────────────────────
  // super_admin: triggered by selAdmin
  // admin:       triggered by isOpen (uses currentUser.user_id as adminId)
  useEffect(() => {
    if (isEditMode) return;
    if (isDealer || isUser) return; // dealer/user don't need dealer list

    let adminId = null;
    if (isSuperAdmin) {
      if (!selAdmin) { setDealers([]); return; }
      adminId = selAdmin;
    } else if (isAdmin) {
      if (!isOpen) return;
      adminId = currentUser?.user_id;
    }
    if (!adminId) return;

    setLdDealers(true);
    fetchDealers(adminId)
      .then((data) => setDealers(Array.isArray(data) ? data : []))
      .catch((err)  => console.error("[DriverForm fetchDealers]", err))
      .finally(()   => setLdDealers(false));
  }, [isOpen, selAdmin, isSuperAdmin, isAdmin, isDealer, isUser, isEditMode, currentUser?.user_id]);

  // ── Load Users ───────────────────────────────────────────────────────────────
  // super_admin + admin: triggered by selDealer
  // dealer:              triggered by isOpen (uses currentUser.user_id as dealerId)
  useEffect(() => {
    if (isEditMode) return;
    if (isUser) return;

    let dealerId = null;
    if (isSuperAdmin || isAdmin) {
      if (!selDealer) { setUsers([]); return; }
      dealerId = selDealer;
    } else if (isDealer) {
      if (!isOpen) return;
      dealerId = currentUser?.user_id;
    }
    if (!dealerId) return;

    setLdUsers(true);
    fetchUsers(dealerId)
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((err)  => console.error("[DriverForm fetchUsers]", err))
      .finally(()   => setLdUsers(false));
  }, [isOpen, selDealer, isSuperAdmin, isAdmin, isDealer, isUser, isEditMode, currentUser?.user_id]);

  // ── User → Vehicles (unassigned only) ───────────────────────────────────────
  useEffect(() => {
    if (isEditMode) return;

    let uid = null;
    if (isSuperAdmin || isAdmin || isDealer) {
      if (!selUser) { setUserVehicles([]); return; }
      uid = Number(selUser);
    } else if (isUser) {
      uid = currentUser?.user_id;
    }
    if (!uid) { setUserVehicles([]); return; }

    setUserVehicles(
      allVehicles.filter((v) => v.user_id === uid && v.vehicle_no && !v.driver_id)
    );
  }, [selUser, allVehicles, isEditMode, isSuperAdmin, isAdmin, isDealer, isUser, currentUser?.user_id]);

  // ── Vehicle selector (ADD mode) ──────────────────────────────────────────────
  const handleVehicleSelect = (e) => {
    const vno = e.target.value;
    if (!vno) { setSelVehicle(null); setF(INIT_F); return; }
    const veh = userVehicles.find((v) => v.vehicle_no === vno);
    if (veh) populateForm(veh);
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!selVehicle)      return setMsg("✗ Please select a vehicle first");
    if (!selVehicle._id)  return setMsg("✗ Vehicle ID missing");

    setSaving(true);
    setMsg("");
    try {
      const payload = {
        first_name:          f.first_name,
        last_name:           f.last_name,
        dob:                 f.dob                 || null,
        phone_no:            f.phone_no,
        address:             f.address,
        date_of_joining:     f.date_of_joining     || null,
        date_of_leaving:     f.date_of_leaving     || null,
        experience:          f.experience,
        salary:              f.salary ? Number(f.salary) : null,
        license_no:          f.license_no,
        license_to_drive:    f.license_to_drive,
        license_issue_date:  f.license_issue_date  || null,
        license_expiry_date: f.license_expiry_date || null,
      };

      await saveDriverDetails(selVehicle._id, payload);
      setMsg("✓ Driver details saved successfully!");
      onSaved?.();
      setTimeout(() => onClose?.(), 1200);
    } catch (err) {
      setMsg(`✗ ${err?.response?.data?.message || err.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // ── Helper: locked info badge ────────────────────────────────────────────────
  const LockedBadge = ({ text, bg = "#e2e8f0", color = "#475569" }) => (
    <div style={{ ...inp, background: "#f8fafc", color: "#64748b", display: "flex", alignItems: "center" }}>
      <span style={{ padding: "2px 8px", background: bg, color, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
        {text || "—"}
      </span>
    </div>
  );

  // ── ADD MODE: number of cascade columns needed ───────────────────────────────
  // super_admin: Admin + Dealer + User + Vehicle = 4
  // admin:       Dealer + User + Vehicle = 3
  // dealer:      User + Vehicle = 2
  // user:        Vehicle = 1
  const cascadeCols = isSuperAdmin ? 4 : isAdmin ? 3 : isDealer ? 2 : 1;
  const gridCols = `repeat(${cascadeCols}, 1fr)`;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0", overflowY: "auto" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 6, width: "min(980px, 96vw)", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", margin: "auto" }}>

          {/* Header */}
          <div style={{ background: ACC, color: "#fff", padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {isEditMode ? "Edit Driver" : "Add Driver"}
              </span>
              {/* Role badge */}
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", background: "rgba(255,255,255,0.2)", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {role}
              </span>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>

            {/* ══ VEHICLE SELECTION SECTION ══ */}
            {isEditMode ? (
              // ── EDIT MODE: Show locked vehicle info (role-aware) ──────────────
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${isSuperAdmin ? 4 : isAdmin ? 3 : isDealer ? 2 : 1}, 1fr)`, gap: "14px 18px", marginBottom: 20 }}>
                {/* Admin — only super_admin sees this */}
                {isSuperAdmin && (
                  <Fld label="Admin">
                    <LockedBadge text={initialVehicle?.adminUsername || (selAdmin ? `ID:${selAdmin}` : "—")} />
                  </Fld>
                )}
                {/* Dealer — super_admin + admin see this */}
                {(isSuperAdmin || isAdmin) && (
                  <Fld label="Dealer">
                    <LockedBadge
                      text={dealers.find(d => String(d.user_id) === selDealer)?.username || (selDealer ? `ID:${selDealer}` : "—")}
                      bg="#e2e8f0" color="#475569"
                    />
                  </Fld>
                )}
                {/* User — super_admin + admin + dealer see this */}
                {!isUser && (
                  <Fld label="User">
                    <LockedBadge
                      text={initialVehicle?.userUsername || (initialVehicle?.user_id ? `ID:${initialVehicle.user_id}` : "—")}
                      bg="#dcfce7" color="#166534"
                    />
                  </Fld>
                )}
                {/* Vehicle — always shown, locked in edit mode */}
                <Fld label="Vehicle No.">
                  <div style={{ ...inp, background: "#fef9c3", border: "1px solid #fbbf24", color: "#92400e", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    {selVehicle?.vehicle_no || "—"}
                  </div>
                </Fld>
              </div>
            ) : (
              // ── ADD MODE: Role-based cascade ──────────────────────────────────
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: "14px 18px", marginBottom: 24 }}>

                {/* Admin picker — super_admin only */}
                {isSuperAdmin && (
                  <Fld label="Select Admin">
                    <div style={{ position: "relative" }}>
                      <select style={{ ...sel, borderColor: selAdmin ? ACC : "#d0d7de" }} value={selAdmin}
                        onChange={(e) => { setSelAdmin(e.target.value); setSelDealer(""); setSelUser(""); setSelVehicle(null); setUserVehicles([]); setDealers([]); setUsers([]); setF(INIT_F); setMsg(""); }}
                        onFocus={onFocus} onBlur={onBlur} disabled={ldAdmins}>
                        <option value="">{ldAdmins ? "Loading admins…" : "— Select Admin —"}</option>
                        {admins.map((a) => <option key={a.user_id} value={String(a.user_id)}>{a.username}</option>)}
                      </select>
                      {ldAdmins && <span style={{ position: "absolute", right: 34, top: "50%", transform: "translateY(-50%)" }}><Spin size={12} color={ACC} /></span>}
                    </div>
                  </Fld>
                )}

                {/* Dealer picker — super_admin (after admin) + admin */}
                {(isSuperAdmin || isAdmin) && (
                  <Fld label="Select Dealer">
                    <div style={{ position: "relative" }}>
                      <select
                        style={{ ...sel, borderColor: selDealer ? ACC : (isSuperAdmin ? (selAdmin ? "#f59e0b" : "#d0d7de") : "#d0d7de"), opacity: (isSuperAdmin && !selAdmin) ? 0.6 : 1 }}
                        value={selDealer}
                        onChange={(e) => { setSelDealer(e.target.value); setSelUser(""); setSelVehicle(null); setUserVehicles([]); setUsers([]); setF(INIT_F); setMsg(""); }}
                        onFocus={onFocus} onBlur={onBlur}
                        disabled={(isSuperAdmin && !selAdmin) || ldDealers}>
                        <option value="">{ldDealers ? "Loading dealers…" : isSuperAdmin && !selAdmin ? "← Select admin first" : "— Select Dealer —"}</option>
                        {dealers.map((d) => <option key={d.user_id} value={String(d.user_id)}>{d.username}</option>)}
                      </select>
                      {ldDealers && <span style={{ position: "absolute", right: 34, top: "50%", transform: "translateY(-50%)" }}><Spin size={12} color={ACC} /></span>}
                    </div>
                  </Fld>
                )}

                {/* User picker — super_admin + admin (after dealer) + dealer */}
                {!isUser && (
                  <Fld label="Select User">
                    <div style={{ position: "relative" }}>
                      {(() => {
                        const needsDealer = isSuperAdmin || isAdmin;
                        const disabled    = (needsDealer && !selDealer) || ldUsers;
                        const placeholder = ldUsers
                          ? "Loading users…"
                          : needsDealer && !selDealer
                            ? "← Select dealer first"
                            : "— Select User —";
                        return (
                          <select
                            style={{ ...sel, borderColor: selUser ? ACC : (needsDealer && selDealer ? "#f59e0b" : "#d0d7de"), opacity: disabled ? 0.6 : 1 }}
                            value={selUser}
                            onChange={(e) => { setSelUser(e.target.value); setSelVehicle(null); setF(INIT_F); setMsg(""); }}
                            onFocus={onFocus} onBlur={onBlur}
                            disabled={disabled}>
                            <option value="">{placeholder}</option>
                            {users.map((u) => <option key={u.user_id} value={String(u.user_id)}>{u.username}</option>)}
                          </select>
                        );
                      })()}
                      {ldUsers && <span style={{ position: "absolute", right: 34, top: "50%", transform: "translateY(-50%)" }}><Spin size={12} color={ACC} /></span>}
                    </div>
                    {selUser && (
                      <span style={{ fontSize: 11, color: userVehicles.length === 0 ? "#dc2626" : "#64748b", marginTop: 2 }}>
                        {userVehicles.length === 0
                          ? "⚠ No unassigned vehicles for this user"
                          : `${userVehicles.length} vehicle${userVehicles.length !== 1 ? "s" : ""} available`}
                      </span>
                    )}
                  </Fld>
                )}

                {/* Vehicle picker — all roles */}
                <Fld label={isUser ? "Select Vehicle (Unassigned only)" : "Select Vehicle (Unassigned only)"}>
                  {(() => {
                    const userReady  = isUser || !!selUser;
                    const noVehicles = userVehicles.length === 0;
                    return (
                      <>
                        <select
                          style={{ ...sel, borderColor: selVehicle ? ACC : userReady ? "#f59e0b" : "#d0d7de", opacity: !userReady ? 0.6 : 1 }}
                          value={selVehicle?.vehicle_no || ""}
                          onChange={handleVehicleSelect}
                          onFocus={onFocus} onBlur={onBlur}
                          disabled={!userReady || noVehicles}>
                          <option value="">
                            {!userReady
                              ? "← Select user first"
                              : noVehicles
                                ? "No unassigned vehicles"
                                : "— Select Vehicle —"}
                          </option>
                          {userVehicles.map((v) => (
                            <option key={v._id} value={v.vehicle_no}>{v.vehicle_no} ({v.vehicle_type || "—"})</option>
                          ))}
                        </select>
                        {isUser && userVehicles.length === 0 && (
                          <span style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>⚠ No unassigned vehicles for your account</span>
                        )}
                      </>
                    );
                  })()}
                </Fld>
              </div>
            )}

            {/* ── PERSONAL DETAILS ── */}
            <SH title="Personal Details" color={ACC} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px 20px", marginBottom: 20 }}>
              <Fld label="First Name" opt>
                <input style={inp} value={f.first_name} placeholder="First name"
                  onChange={setField("first_name")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
              <Fld label="Last Name" opt>
                <input style={inp} value={f.last_name} placeholder="Last name"
                  onChange={setField("last_name")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
              <Fld label="Date of Birth" opt>
                <input style={inp} type="date" value={f.dob}
                  onChange={setField("dob")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
              <Fld label="Phone Number" opt>
                <input style={inp} value={f.phone_no} placeholder="Mobile number"
                  onChange={setField("phone_no")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
              <div style={{ gridColumn: "span 4" }}>
                <Fld label="Address" opt>
                  <input style={inp} value={f.address} placeholder="Full address"
                    onChange={setField("address")} onFocus={onFocus} onBlur={onBlur} />
                </Fld>
              </div>
            </div>

            {/* ── EMPLOYMENT DETAILS ── */}
            <SH title="Employment Details" color={ACC} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px 20px", marginBottom: 20 }}>
              <Fld label="Date of Joining" opt>
                <input style={inp} type="date" value={f.date_of_joining}
                  onChange={setField("date_of_joining")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
              <Fld label="Date of Leaving" opt>
                <input style={inp} type="date" value={f.date_of_leaving}
                  onChange={setField("date_of_leaving")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
              <Fld label="Experience" opt>
                <input style={inp} value={f.experience} placeholder="e.g. 3 years"
                  onChange={setField("experience")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
              <Fld label="Salary (₹)" opt>
                <input style={inp} type="number" min={0} value={f.salary} placeholder="Monthly salary"
                  onChange={setField("salary")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
            </div>

            {/* ── LICENSE DETAILS ── */}
            <SH title="License Details" color={ACC} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px 20px", marginBottom: 20 }}>
              <Fld label="License Number" opt>
                <input style={inp} value={f.license_no} placeholder="DL number"
                  onChange={setField("license_no")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
              <Fld label="License to Drive" opt>
                <select style={sel} value={f.license_to_drive}
                  onChange={setField("license_to_drive")} onFocus={onFocus} onBlur={onBlur}>
                  <option value="">— Select —</option>
                  {LICENSE_TYPES.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Fld>
              <Fld label="License Issue Date" opt>
                <input style={inp} type="date" value={f.license_issue_date}
                  onChange={setField("license_issue_date")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
              <Fld label="License Expiry Date" opt>
                <input style={inp} type="date" value={f.license_expiry_date}
                  onChange={setField("license_expiry_date")} onFocus={onFocus} onBlur={onBlur} />
              </Fld>
            </div>

            {/* Message */}
            {msg && (
              <div style={{ padding: "8px 14px", borderRadius: 4, marginBottom: 12, fontSize: 12, fontWeight: 600, background: msg[0] === "✓" ? "#f0fdf4" : "#fff5f5", color: msg[0] === "✓" ? "#16a34a" : "#dc2626", border: `1px solid ${msg[0] === "✓" ? "#86efac" : "#fca5a5"}` }}>
                {msg}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 24px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexShrink: 0, background: "#fafbfc" }}>
            <button onClick={onClose} style={{ height: 36, padding: "0 18px", background: "#fff", border: "1px solid #d0d7de", borderRadius: 4, fontSize: 13, color: "#374151", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
            <button onClick={save} disabled={saving || !selVehicle}
              style={{ height: 36, padding: "0 24px", background: saving || !selVehicle ? "#a78bfa" : ACC, color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: saving || !selVehicle ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              {saving ? (
                <><Spin size={12} color="#fff" /> Saving…</>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  {isEditMode ? "Update Driver" : "Assign Driver"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes ddSpin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}