import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  listVehicles,
  updateVehicle as apiUpdateVehicle,
} from "../../../api/vehicleApi";
import { useTheme } from "../../../context/ThemeContext";

// ── Brand accent ──────────────────────────────────────────────────────────────
const ACC_DEFAULT = "#3d2b6b";
let ACC = ACC_DEFAULT;

// ── Months list for filter ────────────────────────────────────────────────────
const MONTHS = [
  { value: "01", label: "January"   }, { value: "02", label: "February"  },
  { value: "03", label: "March"     }, { value: "04", label: "April"     },
  { value: "05", label: "May"       }, { value: "06", label: "June"      },
  { value: "07", label: "July"      }, { value: "08", label: "August"    },
  { value: "09", label: "September" }, { value: "10", label: "October"   },
  { value: "11", label: "November"  }, { value: "12", label: "December"  },
];

// ── Option lists ──────────────────────────────────────────────────────────────
const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric"];
const BODY_TYPES = ["Sedan", "SUV", "Hatchback", "MUV", "Van", "Truck", "Bus", "Pickup", "Open", "Closed"];
const OWN_TYPES  = ["Owner", "Leased", "Company", "Government", "Private"];
const VEH_TYPES  = ["car", "truck", "bus", "bike", "tractor", "auto", "van", "pickup", "tanker", "JCB"];

// ── Date helpers ──────────────────────────────────────────────────────────────
const fmtDate = v => {
  if (!v) return "—";
  try {
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleDateString("en-IN");
  } catch {
    return String(v);
  }
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

// ── Normalize raw Device_Master doc ──────────────────────────────────────────
const normalize = v => ({
  ...v,
  _id:              v._id,
  vehicle_no:       v.vehicle_no       || "",
  vehicle_type:     v.vehicle_type     || "",
  fuelType:         v.fuelType         || v.fuel_type || "",
  vehicleBrand:     v.vehicleBrand     || "",
  vehicleModel:     v.vehicleModel     || "",
  vehicleBody:      v.vehicleBody      || "",
  nickname:         v.nickname         || "",
  speed_limit_kph:  v.speed_limit_kph  ?? null,
  mileage:          v.mileage          ?? null,
  capacity:         v.capacity         ?? null,
  odometer:         v.odometer         ?? null,
  durationOdometer: v.durationOdometer ?? null,
  parkingAlarm:     !!v.parkingAlarm,
  ownerName:        v.ownerName        || "",
  ownedBy:          v.ownedBy          || "",
  subStart:         v.subStart         || null,
  subDue:           v.subDue           || null,
  manufactureDate:  v.manufactureDate  || null,
  purchaseDate:     v.purchaseDate     || null,
  vehicleAssignedAt:v.vehicleAssignedAt|| null,
  user_id:          v.user_id != null ? Number(v.user_id) : null,
  clientActive:     v.clientActive !== false,
});

// ── Micro components ──────────────────────────────────────────────────────────
const Spin = ({ size = 14, color = ACC_DEFAULT }) => (
  <span style={{
    display: "inline-block", width: size, height: size, borderRadius: "50%",
    border: `2px solid #e2e8f0`, borderTopColor: color,
    animation: "vdSpin .7s linear infinite", flexShrink: 0,
  }} />
);

const SortIcon = ({ col, sortCol, sortDir }) => (
  <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.35, fontSize: 10, userSelect: "none" }}>
    {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
  </span>
);

// ── Style tokens ──────────────────────────────────────────────────────────────
const selBarStyle = {
  height: 38, padding: "0 28px 0 10px", fontSize: 13,
  border: "1px solid #d0d7de", borderRadius: 4,
  background: "#fff", color: "#374151", cursor: "pointer",
  appearance: "none", outline: "none",
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
  backgroundSize: 16, minWidth: 160,
};

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

// ── Form field wrapper ────────────────────────────────────────────────────────
const Fld = ({ label, req, opt, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    <label style={lbl}>
      {label}
      {req && <span style={{ color: "#ef4444" }}> *</span>}
      {opt && <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 11 }}> (Optional)</span>}
    </label>
    {children}
  </div>
);

// ── Section heading ───────────────────────────────────────────────────────────
const SH = ({ title, color = ACC_DEFAULT }) => (
  <div style={{ marginBottom: 14, paddingBottom: 8, borderBottom: `2px solid ${color}` }}>
    <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {title}
    </div>
  </div>
);

// ── TABLE COLUMNS ─────────────────────────────────────────────────────────────
const TABLE_COLS = [
  { key: "sn",               label: "SN",           sort: false },
  { key: "vehicle_no",       label: "Vehicle No.",  sort: true  },
  { key: "vehicle_type",     label: "Vehicle Type", sort: true  },
  { key: "owned_by",         label: "Owned By",     sort: false },
  { key: "vehicle_brand",    label: "Brand",        sort: true  },
  { key: "vehicle_model",    label: "Model",        sort: true  },
  { key: "fuel_type",        label: "Fuel",         sort: true  },
  { key: "capacity",         label: "Capacity",     sort: false },
  { key: "odometer",         label: "Odometer",     sort: false },
  { key: "manufacture_date", label: "Manufacture",  sort: true  },
  { key: "purchase_date",    label: "Purchase",     sort: true  },
  { key: "vstatus",          label: "Status",       sort: false },
  { key: "actions",          label: "Actions",      sort: false },
];

const DEFAULT_VIS = {
  sn:               true,
  vehicle_no:       true,
  vehicle_type:     true,
  owned_by:         true,
  vehicle_brand:    true,
  vehicle_model:    true,
  fuel_type:        true,
  capacity:         true,
  odometer:         true,
  manufacture_date: true,
  purchase_date:    true,
  vstatus:          true,
  actions:          true,
};

const SORT_MAP = {
  vehicle_no:       "vehicle_no",
  vehicle_type:     "vehicle_type",
  vehicle_brand:    "vehicleBrand",
  vehicle_model:    "vehicleModel",
  fuel_type:        "fuelType",
  manufacture_date: "manufactureDate",
  purchase_date:    "purchaseDate",
};

// ═════════════════════════════════════════════════════════════════════════════
// EDIT FORM MODAL
// ═════════════════════════════════════════════════════════════════════════════
const VehicleDetailEditModalUser = ({ vehicle, onClose, onSaved }) => {
  const accentColor = ACC;

  const onFocus = e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 2px ${accentColor}30`; };
  const onBlur  = e => { e.target.style.borderColor = "#d0d7de"; e.target.style.boxShadow = "none"; };

  const [f, setF]           = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");

  useEffect(() => {
    if (!vehicle) return;
    setMsg("");
    setF({
      vehicle_no:        vehicle.vehicle_no      || "",
      vehicle_type:      vehicle.vehicle_type    || "",
      owned_by:          vehicle.ownedBy         || "",
      vehicle_brand:     vehicle.vehicleBrand    || "",
      vehicle_model:     vehicle.vehicleModel    || "",
      vehicle_body:      vehicle.vehicleBody     || "",
      fuel_type:         vehicle.fuelType        || "",
      capacity:          vehicle.capacity != null ? String(vehicle.capacity) : "",
      odometer:          vehicle.odometer != null ? String(vehicle.odometer) : "",
      duration_odometer: vehicle.durationOdometer != null ? String(vehicle.durationOdometer) : "",
      manufacture_date:  toDateInput(vehicle.manufactureDate),
      purchase_date:     toDateInput(vehicle.purchaseDate),
      speed_limit_kph:   vehicle.speed_limit_kph != null ? String(vehicle.speed_limit_kph) : "",
      mileage:           vehicle.mileage != null ? String(vehicle.mileage) : "",
      nickname:          vehicle.nickname        || "",
      parking_alarm:     !!vehicle.parkingAlarm,
      sub_start:         toDateInput(vehicle.subStart),
      sub_due:           toDateInput(vehicle.subDue),
    });
  }, [vehicle]);

  const setField = k => e =>
    setF(p => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const save = async () => {
    if (!vehicle) return;
    if (!f.vehicle_no) return setMsg("✗ Vehicle number is required");
    setSaving(true); setMsg("");
    try {
      await apiUpdateVehicle(vehicle._id, {
        vehicle_no:        f.vehicle_no,
        vehicle_type:      f.vehicle_type,
        owned_by:          f.owned_by,
        vehicle_brand:     f.vehicle_brand,
        vehicle_model:     f.vehicle_model,
        vehicle_body:      f.vehicle_body,
        fuel_type:         f.fuel_type,
        capacity:          Number(f.capacity)           || 0,
        odometer:          Number(f.odometer)           || 0,
        duration_odometer: Number(f.duration_odometer)  || 0,
        manufacture_date:  f.manufacture_date,
        purchase_date:     f.purchase_date,
        speed_limit_kph:   Number(f.speed_limit_kph)    || 60,
        mileage:           Number(f.mileage)            || 1,
        nickname:          f.nickname,
        parking_alarm:     f.parking_alarm,
        sub_start:         f.sub_start,
        sub_due:           f.sub_due,
      });
      setMsg("✓ Details saved successfully!");
      onSaved?.();
      setTimeout(() => onClose?.(), 1000);
    } catch (err) {
      setMsg(`✗ ${err?.response?.data?.message || err.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  };

  if (!vehicle) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 0", overflowY: "auto",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff", borderRadius: 6, width: "min(900px, 96vw)",
          maxHeight: "90vh", overflow: "hidden", display: "flex",
          flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", margin: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: accentColor, color: "#fff", padding: "13px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Vehicle Details</span>
          </div>
          <button onClick={onClose}
            style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "#fff", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>

          {msg && msg.startsWith("✗") && (
            <div style={{ marginBottom: 14, padding: "9px 14px", background: "#fff5f5", border: "1px solid #fca5a5", borderLeft: "3px solid #ef4444", fontSize: 12, color: "#dc2626", fontWeight: 600, borderRadius: 3 }}>
              ⚠️ {msg.replace("✗ ", "")}
            </div>
          )}

          <SH title="Vehicle Details" color={accentColor} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px 20px", marginBottom: 20 }}>

            <Fld label="Vehicle Number" req>
              <input style={inp} value={f.vehicle_no || ""} placeholder="MH00AB0000"
                onChange={setField("vehicle_no")} onFocus={onFocus} onBlur={onBlur} />
            </Fld>

            <Fld label="Vehicle Type" opt>
              <select style={sel} value={f.vehicle_type || ""} onChange={setField("vehicle_type")} onFocus={onFocus} onBlur={onBlur}>
                <option value="">— Select —</option>
                {VEH_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </Fld>

            <Fld label="Owned By" opt>
              <select style={sel} value={f.owned_by || ""} onChange={setField("owned_by")} onFocus={onFocus} onBlur={onBlur}>
                <option value="">— Select —</option>
                {OWN_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </Fld>

            <Fld label="Vehicle Brand" opt>
              <input style={inp} value={f.vehicle_brand || ""} placeholder="e.g. Toyota"
                onChange={setField("vehicle_brand")} onFocus={onFocus} onBlur={onBlur} />
            </Fld>

            <Fld label="Vehicle Model" opt>
              <input style={inp} value={f.vehicle_model || ""} placeholder="e.g. Innova"
                onChange={setField("vehicle_model")} onFocus={onFocus} onBlur={onBlur} />
            </Fld>

            <Fld label="Fuel Type" opt>
              <select style={sel} value={f.fuel_type || ""} onChange={setField("fuel_type")} onFocus={onFocus} onBlur={onBlur}>
                <option value="">— Select —</option>
                {FUEL_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </Fld>

            <Fld label="Capacity" opt>
              <input style={inp} type="number" min={0} value={f.capacity ?? ""}
                placeholder="0" onChange={setField("capacity")} onFocus={onFocus} onBlur={onBlur} />
            </Fld>

            <Fld label="Odometer (km)" opt>
              <input style={inp} type="number" min={0} value={f.odometer ?? ""}
                placeholder="Current reading" onChange={setField("odometer")} onFocus={onFocus} onBlur={onBlur} />
            </Fld>

            <Fld label="Manufacture Date" opt>
              <input style={inp} type="date" value={f.manufacture_date || ""}
                onChange={setField("manufacture_date")} onFocus={onFocus} onBlur={onBlur} />
            </Fld>

            <Fld label="Purchase Date" opt>
              <input style={inp} type="date" value={f.purchase_date || ""}
                onChange={setField("purchase_date")} onFocus={onFocus} onBlur={onBlur} />
            </Fld>

          </div>

          {/* Parking alarm */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "#374151" }}>
              <input
                type="checkbox"
                checked={!!f.parking_alarm}
                onChange={setField("parking_alarm")}
                style={{ accentColor: accentColor, width: 14, height: 14 }}
              />
              Enable parking violation alarm on Ignition ON
            </label>
          </div>

          {msg && msg.startsWith("✓") && (
            <div style={{ padding: "8px 14px", borderRadius: 4, fontSize: 12, fontWeight: 600, background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac" }}>
              {msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 24px", borderTop: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 8, flexShrink: 0, background: "#fafbfc", flexWrap: "wrap",
        }}>
          <button onClick={onClose}
            style={{ height: 36, padding: "0 18px", background: "#fff", border: "1px solid #d0d7de", borderRadius: 4, fontSize: 13, color: "#374151", cursor: "pointer", fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            style={{
              height: 36, padding: "0 24px",
              background: saving ? "#a78bfa" : accentColor,
              color: "#fff", border: "none", borderRadius: 4,
              fontSize: 13, fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
            {saving ? (
              <><Spin size={12} color="#fff" /> Saving…</>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// TABLE COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
const VehicleDetailsTableUser = ({
  vehicles, loading, onEditRow,
  page, setPage, rowsPerPage, setRowsPerPage,
  search, setSearch,
  filterStatus, setFilterStatus,
  filterMonth, setFilterMonth,
  sortCol, setSortCol, sortDir, setSortDir,
  visibleCols, setVisibleCols,
}) => {
  const colRef = useRef();
  const [colMenuOpen, setColMenuOpen] = useState(false);

  useEffect(() => {
    const h = e => { if (colRef.current && !colRef.current.contains(e.target)) setColMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = useMemo(() => {
    let list = [...vehicles];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        (v.vehicle_no    || "").toLowerCase().includes(q) ||
        (v.vehicle_type  || "").toLowerCase().includes(q) ||
        (v.ownedBy       || "").toLowerCase().includes(q) ||
        (v.vehicleBrand  || "").toLowerCase().includes(q) ||
        (v.vehicleModel  || "").toLowerCase().includes(q) ||
        (v.fuelType      || "").toLowerCase().includes(q)
      );
    }

    if (filterStatus === "active")   list = list.filter(v => v.clientActive !== false);
    if (filterStatus === "inactive") list = list.filter(v => v.clientActive === false);

    if (filterMonth) {
      list = list.filter(v => {
        const d = v.purchaseDate || v.manufactureDate;
        if (!d) return false;
        try {
          const month = String(new Date(d).getMonth() + 1).padStart(2, "0");
          return month === filterMonth;
        } catch { return false; }
      });
    }

    const bk = SORT_MAP[sortCol];
    if (bk) list.sort((a, b) => {
      const va = String(a[bk] ?? ""), vb = String(b[bk] ?? "");
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    return list;
  }, [vehicles, search, filterStatus, filterMonth, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated  = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  };

  const resetFilters = () => { setSearch(""); setFilterStatus(""); setFilterMonth(""); setPage(1); };

  const thS = {
    padding: "9px 12px", textAlign: "center", fontSize: 12, fontWeight: 700,
    color: "#fff", background: ACC, borderRight: "1px solid rgba(255,255,255,0.1)",
    whiteSpace: "nowrap", userSelect: "none", position: "sticky", top: 0, zIndex: 2,
  };
  const tdS = {
    padding: "9px 12px", fontSize: 12, borderBottom: "1px solid #edf0f4",
    verticalAlign: "middle", whiteSpace: "nowrap", color: "#1e293b", textAlign: "center",
  };

  const renderCell = (key, v, i) => {
    switch (key) {
      case "sn":
        return <td key={key} style={{ ...tdS, color: "#9ca3af", width: 44, fontWeight: 500 }}>{(page - 1) * rowsPerPage + i + 1}</td>;

      case "vehicle_no":
        return (
          <td key={key} style={{ ...tdS, fontWeight: 700 }}>
            {v.vehicle_no || "—"}
          </td>
        );

      case "vehicle_type":
        return (
          <td key={key} style={tdS}>
            {v.vehicle_type
              ? <span style={{ padding: "2px 9px", background: "#ede9fe", color: "#5b21b6", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{v.vehicle_type}</span>
              : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "owned_by":
        return <td key={key} style={tdS}>{v.ownedBy || <span style={{ color: "#d1d5db" }}>—</span>}</td>;

      case "vehicle_brand":
        return <td key={key} style={{ ...tdS, fontWeight: v.vehicleBrand ? 600 : 400 }}>{v.vehicleBrand || <span style={{ color: "#d1d5db" }}>—</span>}</td>;

      case "vehicle_model":
        return <td key={key} style={tdS}>{v.vehicleModel || <span style={{ color: "#d1d5db" }}>—</span>}</td>;

      case "fuel_type":
        return (
          <td key={key} style={tdS}>
            {v.fuelType
              ? <span style={{ padding: "2px 9px", background: "#e0f2fe", color: "#0369a1", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{v.fuelType}</span>
              : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "capacity":
        return <td key={key} style={tdS}>{v.capacity != null && v.capacity !== "" ? v.capacity : <span style={{ color: "#d1d5db" }}>—</span>}</td>;

      case "odometer":
        return <td key={key} style={tdS}>{v.odometer != null && v.odometer !== "" ? `${v.odometer} km` : <span style={{ color: "#d1d5db" }}>—</span>}</td>;

      case "manufacture_date":
        return <td key={key} style={{ ...tdS, fontSize: 11 }}>{v.manufactureDate ? fmtDate(v.manufactureDate) : <span style={{ color: "#d1d5db" }}>—</span>}</td>;

      case "purchase_date":
        return <td key={key} style={{ ...tdS, fontSize: 11 }}>{v.purchaseDate ? fmtDate(v.purchaseDate) : <span style={{ color: "#d1d5db" }}>—</span>}</td>;

      case "vstatus": {
        const active = v.clientActive !== false;
        return (
          <td key={key} style={tdS}>
            <span style={{
              padding: "2px 10px", fontSize: 11, fontWeight: 600,
              background: active ? "#e8f5e9" : "#fff5f5",
              color: active ? "#2e7d32" : "#dc2626",
              border: `1px solid ${active ? "#4caf50" : "#fca5a5"}`,
              borderRadius: 10,
            }}>
              {active ? "Active" : "Inactive"}
            </span>
          </td>
        );
      }

      case "actions":
        return (
          <td key={key} style={{ ...tdS, textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onEditRow(v)}
              title="Edit"
              style={{ background: "none", border: "1px solid #e2e8f0", cursor: "pointer", padding: "4px 7px", color: ACC, borderRadius: 3, display: "inline-flex", alignItems: "center" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#ede9fe"; e.currentTarget.style.borderColor = ACC; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </td>
        );

      default:
        return <td key={key} style={{ ...tdS, color: "#9ca3af" }}>—</td>;
    }
  };

  const activeKeys = TABLE_COLS.filter(c => visibleCols[c.key]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fff", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", padding: "0 10px", height: 38, borderRadius: 4, minWidth: 260 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input placeholder="Search vehicle, owned by, brand, model, fuel…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, color: "#1e293b", width: "100%" }} />
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 0 }}>✕</button>
          )}
        </div>

        {/* Status filter */}
        <select style={selBarStyle} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        {/* Month filter */}
        <select style={selBarStyle} value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}>
          <option value="">All Months</option>
          {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* Reset */}
        <button onClick={resetFilters}
          style={{ height: 38, padding: "0 14px", background: "#fff", border: "1px solid #d0d7de", borderRadius: 4, fontSize: 13, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
          </svg>
          Reset
        </button>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 12, color: "#64748b" }}>
          <strong style={{ color: "#1e293b" }}>{filtered.length}</strong>
          {filtered.length !== vehicles.length ? ` / ${vehicles.length}` : ""} vehicles
        </span>

        {/* Rows per page */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Rows:</span>
          <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            style={{ height: 38, padding: "0 8px", border: "1px solid #e2e8f0", fontSize: 12, cursor: "pointer", outline: "none", borderRadius: 4 }}>
            {[15, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Column toggle */}
        <div ref={colRef} style={{ position: "relative" }}>
          <button onClick={() => setColMenuOpen(v => !v)}
            style={{ height: 38, padding: "0 14px", background: colMenuOpen ? "#f0f4ff" : "#fff", border: `1px solid ${colMenuOpen ? ACC : "#e2e8f0"}`, borderRadius: 4, fontSize: 13, color: "#334155", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Columns ▾
          </button>
          {colMenuOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, zIndex: 400, minWidth: 200, padding: "6px 0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 380, overflowY: "auto" }}>
              <div style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>Toggle Columns</div>
              {TABLE_COLS.map(c => (
                <label key={c.key}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#374151" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <input type="checkbox" checked={!!visibleCols[c.key]}
                    onChange={() => setVisibleCols(p => ({ ...p, [c.key]: !p[c.key] }))}
                    style={{ accentColor: ACC }} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", background: "#fff", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
          <thead>
            <tr>
              {activeKeys.map(c => (
                <th key={c.key} style={{ ...thS, cursor: c.sort ? "pointer" : "default" }}
                  onClick={c.sort ? () => handleSort(c.key) : undefined}>
                  {c.label}{c.sort && <SortIcon col={c.key} sortCol={sortCol} sortDir={sortDir} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={activeKeys.length} style={{ padding: 60, textAlign: "center" }}>
                  <Spin size={28} color={ACC} />
                  <div style={{ marginTop: 10, fontSize: 13, color: "#64748b" }}>Loading vehicles…</div>
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={activeKeys.length} style={{ padding: 60, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>
                    {vehicles.length === 0 ? "No vehicles found" : "No vehicles data found "}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                    {vehicles.length === 0 ? "No vehicles are assigned to your account yet" : "Try adjusting your search or filters"}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((v, i) => (
                <tr key={v._id || i}
                  style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f0f4ff"}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafbfc"}>
                  {activeKeys.map(c => renderCell(c.key, v, i))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#fff", borderTop: "1px solid #e2e8f0", fontSize: 12, flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
        <span style={{ color: "#64748b" }}>
          Showing{" "}
          <strong style={{ color: "#1e293b" }}>
            {filtered.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)}
          </strong>{" "}
          of <strong style={{ color: "#1e293b" }}>{filtered.length}</strong>
        </span>
        <div style={{ display: "flex", gap: 3 }}>
          {[
            { label: "«", action: () => setPage(1),                              disabled: page === 1 },
            { label: "‹", action: () => setPage(p => Math.max(1, p - 1)),        disabled: page === 1 },
          ].map((btn, idx) => (
            <button key={idx} onClick={btn.action} disabled={btn.disabled}
              style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 4, background: btn.disabled ? "#f8fafc" : "#fff", cursor: btn.disabled ? "not-allowed" : "pointer", color: btn.disabled ? "#cbd5e1" : "#475569" }}>
              {btn.label}
            </button>
          ))}
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let p;
            if (totalPages <= 7)             p = i + 1;
            else if (page <= 4)              p = i + 1;
            else if (page >= totalPages - 3) p = totalPages - 6 + i;
            else                             p = page - 3 + i;
            return (
              <button key={p} onClick={() => setPage(p)}
                style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 4, background: p === page ? ACC : "#fff", color: p === page ? "#fff" : "#475569", cursor: "pointer", fontWeight: p === page ? 700 : 400 }}>
                {p}
              </button>
            );
          })}
          {[
            { label: "›", action: () => setPage(p => Math.min(totalPages, p + 1)), disabled: page === totalPages },
            { label: "»", action: () => setPage(totalPages),                        disabled: page === totalPages },
          ].map((btn, idx) => (
            <button key={idx} onClick={btn.action} disabled={btn.disabled}
              style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 4, background: btn.disabled ? "#f8fafc" : "#fff", cursor: btn.disabled ? "not-allowed" : "pointer", color: btn.disabled ? "#cbd5e1" : "#475569" }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE EXPORT
// ═════════════════════════════════════════════════════════════════════════════
export default function VehicleAdditionalDetailsUser({ currentUser }) {
  const theme = useTheme();
  ACC = theme?.activeColor || ACC_DEFAULT;

  const [vehicles,     setVehicles]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [fetchErr,     setFetchErr]     = useState("");

  // Table state
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMonth,  setFilterMonth]  = useState("");
  const [sortCol,      setSortCol]      = useState("vehicle_no");
  const [sortDir,      setSortDir]      = useState("asc");
  const [page,         setPage]         = useState(1);
  const [rowsPerPage,  setRowsPerPage]  = useState(15);
  const [visibleCols,  setVisibleCols]  = useState(DEFAULT_VIS);

  // Modal state
  const [editVehicle,  setEditVehicle]  = useState(null);

  const fetchVehicles = useCallback(async () => {
    setLoading(true); setFetchErr("");
    try {
      const data = await listVehicles({ page: 1, limit: 1000, search: "" });
      const raw  = Array.isArray(data.vehicles) ? data.vehicles : [];
      setVehicles(raw.map(normalize).filter(v => v.vehicle_no));
    } catch (err) {
      console.error("[VehicleAdditionalDetailsUser fetchVehicles]", err);
      setFetchErr(err?.response?.data?.message || err.message || "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  return (
    <div style={{
      padding: "0", background: "#f4f6f9", height: "100%",
      display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* Error banner */}
      {fetchErr && (
        <div style={{
          padding: "10px 16px", background: "#fff5f5", border: "1px solid #fca5a5",
          color: "#dc2626", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          ⚠️ {fetchErr}
          <button onClick={fetchVehicles}
            style={{ background: "none", border: "1px solid #fca5a5", borderRadius: 4, padding: "2px 10px", cursor: "pointer", fontSize: 11, color: "#dc2626" }}>
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <VehicleDetailsTableUser
        vehicles={vehicles}
        loading={loading}
        onEditRow={v => setEditVehicle(v)}
        page={page}               setPage={setPage}
        rowsPerPage={rowsPerPage} setRowsPerPage={setRowsPerPage}
        search={search}           setSearch={setSearch}
        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
        filterMonth={filterMonth}   setFilterMonth={setFilterMonth}
        sortCol={sortCol}         setSortCol={setSortCol}
        sortDir={sortDir}         setSortDir={setSortDir}
        visibleCols={visibleCols} setVisibleCols={setVisibleCols}
      />

      {/* Edit Modal */}
      <VehicleDetailEditModalUser
        vehicle={editVehicle}
        onClose={() => setEditVehicle(null)}
        onSaved={fetchVehicles}
      />

      <style>{`@keyframes vdSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}