import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  listVehicles,
  fetchAdmins,
  fetchDealers,
  fetchUsers,
} from "../../../api/vehicleApi";
import { useTheme } from "../../../context/ThemeContext";

// ── Brand color ───────────────────────────────────────────────────────────────
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

// ── Normalize raw vehicle doc ─────────────────────────────────────────────────
const normalize = v => ({
  ...v,
  _id:               v._id,
  adminId:           v.adminId            ?? null,
  dealerId:          v.dealerId           ?? null,
  user_id:           v.user_id            ?? null,
  imei:              v.IMEI_No            || v.imei             || "",
  vehicle_no:        v.vehicle_no         || "",
  vehicle_type:      v.vehicle_type       || "",
  fuelType:          v.fuelType           || "",
  vehicleBrand:      v.vehicleBrand       || "",
  vehicleModel:      v.vehicleModel       || "",
  vehicleBody:       v.vehicleBody        || "",
  nickname:          v.nickname           || "",
  speed_limit_kph:   v.speed_limit_kph    ?? v.overspeed ?? null,
  mileage:           v.mileage            ?? null,
  capacity:          v.capacity           ?? null,
  odometer:          v.odometer           ?? null,
  durationOdometer:  v.durationOdometer   ?? null,
  ownerName:         v.ownerName          || "",
  ownedBy:           v.ownedBy            || "",
  subStart:          v.subStart           || null,
  subDue:            v.subDue             || null,
  manufactureDate:   v.manufactureDate    || null,
  purchaseDate:      v.purchaseDate       || null,
  vehicleAssignedAt: v.vehicleAssignedAt  || null,
  vstatus:           v.vstatus            || "Active",
  sim_card_number:   v.sim_card           || v.sim_card_number  || "",
  clientActive:      v.clientActive !== false,
});

const fmtDate = v => {
  if (!v) return "—";
  try {
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleDateString("en-IN");
  } catch {
    return String(v);
  }
};

// ── Small spinner ─────────────────────────────────────────────────────────────
const Spin = ({ size = 14, color = ACC_DEFAULT }) => (
  <span style={{
    display: "inline-block", width: size, height: size, borderRadius: "50%",
    border: `2px solid #e2e8f0`, borderTopColor: color,
    animation: "saSpin .7s linear infinite", flexShrink: 0,
  }} />
);

// ── Sort icon ─────────────────────────────────────────────────────────────────
const SortIcon = ({ col, sortCol, sortDir }) => (
  <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.4, fontSize: 10 }}>
    {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
  </span>
);

// ── Name badge ────────────────────────────────────────────────────────────────
const NameBadge = ({ name, bg = "#f1f5f9", border = "#e2e8f0", color = "#475569" }) => {
  if (!name) return <span style={{ color: "#d1d5db" }}>—</span>;
  return (
    <span style={{
      padding: "2px 9px", background: bg,
      border: `1px solid ${border}`, borderRadius: 10,
      fontSize: 11, fontWeight: 600, color,
      whiteSpace: "nowrap", display: "inline-block",
    }}>
      {name}
    </span>
  );
};

// ── Table column definitions ──────────────────────────────────────────────────
const TABLE_COLS = [
  { key: "sn",               label: "SN",               sort: false },
  { key: "admin",            label: "Admin",            sort: false },
  { key: "dealer",           label: "Dealer",           sort: false },
  { key: "user",             label: "User",             sort: false },
  { key: "vehicle_no",       label: "Vehicle No.",      sort: true  },
  { key: "vehicle_type",     label: "Vehicle Type",     sort: true  },
  { key: "imei",             label: "IMEI",             sort: true  },
  { key: "sim_card_number",  label: "SIM Card",         sort: true  },
  { key: "owner_name",       label: "Owner Name",       sort: true  },
  { key: "owned_by",         label: "Owned By",         sort: true  },
  { key: "vehicle_brand",    label: "Brand",            sort: true  },
  { key: "vehicle_model",    label: "Model",            sort: true  },
  { key: "vehicle_body",     label: "Body",             sort: false },
  { key: "fuel_type",        label: "Fuel Type",        sort: true  },
  { key: "capacity",         label: "Capacity",         sort: false },
  { key: "odometer",         label: "Odometer (km)",    sort: false },
  { key: "duration_odometer",label: "Duration Odometer",sort: false },
  { key: "manufacture_date", label: "Manufacture Date", sort: true  },
  { key: "purchase_date",    label: "Purchase Date",    sort: true  },
  { key: "sub_due",          label: "Sub Due",          sort: true  },
  { key: "assigned_at",      label: "Assigned At",      sort: true  },
  { key: "vstatus",          label: "Status",           sort: false },
];

const DEFAULT_VIS = {
  sn: true, admin: true, dealer: true, user: true,
  vehicle_no: true, vehicle_type: true, imei: true, sim_card_number: true,
  owner_name: true, owned_by: false, vehicle_brand: true,
  vehicle_model: true, vehicle_body: false, fuel_type: true,
  capacity: false, odometer: false, duration_odometer: false,
  manufacture_date: false, purchase_date: false,
  sub_due: true, assigned_at: false, vstatus: true,
};

// ── Toolbar select style ──────────────────────────────────────────────────────
const selBarStyle = {
  height: 38, padding: "0 28px 0 10px", fontSize: 13,
  border: "1px solid #d0d7de", borderRadius: 3,
  background: "#fff", color: "#374151", cursor: "pointer",
  appearance: "none", outline: "none",
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
  backgroundSize: 16, minWidth: 130,
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE — SuperAdmin: read-only vehicle detail table
// ═════════════════════════════════════════════════════════════════════════════
export default function VehicleAdditionalDetailsSuperAdmin({ currentUser }) {
  const theme = useTheme();
  ACC = theme?.activeColor || ACC_DEFAULT;

  const [vehicles,     setVehicles]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [fetchErr,     setFetchErr]     = useState("");
  const [namesLoading, setNamesLoading] = useState(false);

  // name maps
  const [adminNames,  setAdminNames]  = useState({});  // { adminId  → username }
  const [dealerNames, setDealerNames] = useState({});  // { dealerId → username }
  const [userNames,   setUserNames]   = useState({});  // { user_id  → username }

  // table controls
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMonth,  setFilterMonth]  = useState("");
  const [sortCol,      setSortCol]      = useState("vehicle_no");
  const [sortDir,      setSortDir]      = useState("asc");
  const [page,         setPage]         = useState(1);
  const [rowsPerPage,  setRowsPerPage]  = useState(15);
  const [visibleCols,  setVisibleCols]  = useState(DEFAULT_VIS);

  // column picker
  const colRef = useRef();
  const [colMenuOpen, setColMenuOpen] = useState(false);
  useEffect(() => {
    const h = e => {
      if (colRef.current && !colRef.current.contains(e.target))
        setColMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Fetch vehicles ────────────────────────────────────────────────────────
  const fetchVehicles = useCallback(async () => {
    setLoading(true); setFetchErr("");
    try {
      const data = await listVehicles({ page: 1, limit: 1000, search: "" });
      const raw  = Array.isArray(data.vehicles) ? data.vehicles : [];
      setVehicles(raw.map(normalize).filter(v => v.vehicle_no));
    } catch (err) {
      setFetchErr(err?.response?.data?.message || err.message || "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  // ── Build admin / dealer / user name maps ────────────────────────────────
  useEffect(() => {
    if (vehicles.length === 0) return;

    const uniqueAdminIds  = [...new Set(vehicles.map(v => v.adminId).filter(Boolean))];
    const uniqueDealerIds = [...new Set(vehicles.map(v => v.dealerId).filter(Boolean))];

    setNamesLoading(true);

    const run = async () => {
      const aMap = {}, dMap = {}, uMap = {};
      try {
        // ── Admins ──────────────────────────────────────────────────────────
        try {
          const admins = await fetchAdmins();
          admins.forEach(a => {
            aMap[a.user_id] = a.username || a.fullName || `ID:${a.user_id}`;
          });
        } catch (_) { /* 403 or network — skip */ }

        // ── Dealers per admin ───────────────────────────────────────────────
        await Promise.all(
          uniqueAdminIds.map(async adminId => {
            try {
              const dealers = await fetchDealers(adminId);
              dealers.forEach(d => {
                dMap[d.user_id] = d.username || d.fullName || `ID:${d.user_id}`;
              });
            } catch (_) {}
          })
        );

        // ── Users per dealer ────────────────────────────────────────────────
        await Promise.all(
          uniqueDealerIds.map(async dealerId => {
            try {
              const users = await fetchUsers(dealerId);
              users.forEach(u => {
                uMap[u.user_id] = u.username || u.fullName || `ID:${u.user_id}`;
              });
            } catch (_) {}
          })
        );
      } catch (err) {
        console.error("[VehicleAdditionalDetailsSA buildNames]", err);
      } finally {
        setAdminNames(aMap);
        setDealerNames(dMap);
        setUserNames(uMap);
        setNamesLoading(false);
      }
    };
    run();
  }, [vehicles]);

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...vehicles];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        (v.vehicle_no      || "").toLowerCase().includes(q) ||
        (v.imei            || "").includes(search) ||
        (v.sim_card_number || "").includes(search) ||
        (v.ownerName       || "").toLowerCase().includes(q) ||
        (v.ownedBy         || "").toLowerCase().includes(q) ||
        (v.vehicleBrand    || "").toLowerCase().includes(q) ||
        (v.vehicleModel    || "").toLowerCase().includes(q) ||
        (v.fuelType        || "").toLowerCase().includes(q) ||
        (v.vehicleBody     || "").toLowerCase().includes(q) ||
        (adminNames[v.adminId]   || "").toLowerCase().includes(q) ||
        (dealerNames[v.dealerId] || "").toLowerCase().includes(q) ||
        (userNames[v.user_id]    || "").toLowerCase().includes(q)
      );
    }

    if (filterStatus === "Active")   list = list.filter(v => v.clientActive !== false);
    if (filterStatus === "Inactive") list = list.filter(v => v.clientActive === false);

    if (filterMonth) {
      list = list.filter(v => {
        const d = v.vehicleAssignedAt || v.purchaseDate;
        if (!d) return false;
        try {
          return String(new Date(d).getMonth() + 1).padStart(2, "0") === filterMonth;
        } catch { return false; }
      });
    }

    const sortMap = {
      vehicle_no:       "vehicle_no",
      vehicle_type:     "vehicle_type",
      imei:             "imei",
      sim_card_number:  "sim_card_number",
      owner_name:       "ownerName",
      owned_by:         "ownedBy",
      vehicle_brand:    "vehicleBrand",
      vehicle_model:    "vehicleModel",
      fuel_type:        "fuelType",
      manufacture_date: "manufactureDate",
      purchase_date:    "purchaseDate",
      sub_due:          "subDue",
      assigned_at:      "vehicleAssignedAt",
    };
    const bk = sortMap[sortCol];
    if (bk) {
      list.sort((a, b) => {
        const va = String(a[bk] ?? ""), vb = String(b[bk] ?? "");
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }, [vehicles, search, filterStatus, filterMonth, sortCol, sortDir, adminNames, dealerNames, userNames]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated  = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  };

  const reset = () => {
    setSearch(""); setFilterStatus(""); setFilterMonth(""); setPage(1);
  };

  // ── Table styles ──────────────────────────────────────────────────────────
  const thS = {
    padding: "9px 12px", textAlign: "center", fontSize: 12, fontWeight: 700,
    color: "#fff", background: ACC, borderRight: "1px solid rgba(255,255,255,0.1)",
    whiteSpace: "nowrap", userSelect: "none", position: "sticky", top: 0, zIndex: 2,
  };
  const tdS = {
    padding: "9px 12px", fontSize: 12, borderBottom: "1px solid #edf0f4",
    verticalAlign: "middle", whiteSpace: "nowrap", color: "#1e293b", textAlign: "center",
  };

  // ── Render single cell ────────────────────────────────────────────────────
  const renderCell = (key, v, i) => {
    switch (key) {

      case "sn":
        return (
          <td key={key} style={{ ...tdS, color: "#9ca3af", width: 44, fontWeight: 500 }}>
            {(page - 1) * rowsPerPage + i + 1}
          </td>
        );

      case "admin":
        return (
          <td key={key} style={tdS}>
            <NameBadge
              name={adminNames[v.adminId] || (v.adminId ? `ID:${v.adminId}` : "")}
              bg="#ede9fe" border="#c4b5fd" color="#5b21b6"
            />
          </td>
        );

      case "dealer":
        return (
          <td key={key} style={tdS}>
            <NameBadge
              name={dealerNames[v.dealerId] || (v.dealerId ? `ID:${v.dealerId}` : "")}
              bg="#f1f5f9" border="#e2e8f0" color="#475569"
            />
          </td>
        );

      case "user":
        return (
          <td key={key} style={tdS}>
            <NameBadge
              name={userNames[v.user_id] || (v.user_id ? `ID:${v.user_id}` : "")}
              bg="#f0fdf4" border="#bbf7d0" color="#166534"
            />
          </td>
        );

      case "vehicle_no":
        return (
          <td key={key} style={tdS}>
            <span style={{ color: ACC, fontWeight: 700, fontSize: 12 }}>
              {v.vehicle_no || "—"}
            </span>
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

      case "imei":
        return (
          <td key={key} style={{ ...tdS, fontFamily: "monospace", fontSize: 11, color: "#0369a1", fontWeight: 700 }}>
            {v.imei || "—"}
          </td>
        );

      case "sim_card_number":
        return (
          <td key={key} style={{ ...tdS, fontFamily: "monospace", fontSize: 11, color: "#4b5563", fontWeight: 600 }}>
            {v.sim_card_number || "—"}
          </td>
        );

      case "owner_name":
        return (
          <td key={key} style={tdS}>
            {v.ownerName
              ? v.ownerName
              : <span style={{ color: "#d1d5db", fontStyle: "italic" }}>Not filled</span>}
          </td>
        );

      case "owned_by":
        return (
          <td key={key} style={tdS}>
            {v.ownedBy
              ? <span style={{ padding: "2px 9px", background: "#f0fdf4", color: "#15803d", borderRadius: 10, fontSize: 11, fontWeight: 600, border: "1px solid #bbf7d0" }}>{v.ownedBy}</span>
              : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "vehicle_brand":
        return (
          <td key={key} style={{ ...tdS, fontWeight: v.vehicleBrand ? 600 : 400 }}>
            {v.vehicleBrand || <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "vehicle_model":
        return (
          <td key={key} style={tdS}>
            {v.vehicleModel || <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "vehicle_body":
        return (
          <td key={key} style={tdS}>
            {v.vehicleBody || <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "fuel_type":
        return (
          <td key={key} style={tdS}>
            {v.fuelType
              ? <span style={{ padding: "2px 9px", background: "#e0f2fe", color: "#0369a1", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{v.fuelType}</span>
              : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "capacity":
        return (
          <td key={key} style={tdS}>
            {v.capacity != null && v.capacity !== "" ? v.capacity : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "odometer":
        return (
          <td key={key} style={tdS}>
            {v.odometer != null && v.odometer !== ""
              ? `${v.odometer} km`
              : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "duration_odometer":
        return (
          <td key={key} style={tdS}>
            {v.durationOdometer != null && v.durationOdometer !== ""
              ? `${v.durationOdometer} km`
              : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "manufacture_date":
        return (
          <td key={key} style={{ ...tdS, fontSize: 11, color: "#475569" }}>
            {v.manufactureDate ? fmtDate(v.manufactureDate) : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "purchase_date":
        return (
          <td key={key} style={{ ...tdS, fontSize: 11, color: "#475569" }}>
            {v.purchaseDate ? fmtDate(v.purchaseDate) : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "sub_due": {
        let color = "#475569", bold = false;
        if (v.subDue) {
          const diff = (new Date(v.subDue) - new Date()) / 86400000;
          if (diff < 0)        { color = "#dc2626"; bold = true; }
          else if (diff <= 30) { color = "#d97706"; bold = true; }
        }
        return (
          <td key={key} style={{ ...tdS, fontSize: 11, color, fontWeight: bold ? 700 : 400 }}>
            {fmtDate(v.subDue)}
          </td>
        );
      }

      case "assigned_at":
        return (
          <td key={key} style={{ ...tdS, fontSize: 11, color: "#475569" }}>
            {v.vehicleAssignedAt ? fmtDate(v.vehicleAssignedAt) : <span style={{ color: "#d1d5db" }}>—</span>}
          </td>
        );

      case "vstatus": {
        const active = v.clientActive !== false;
        return (
          <td key={key} style={tdS}>
            <span style={{
              padding: "2px 10px", fontSize: 11, fontWeight: 600,
              background: active ? "#e8f5e9" : "#fff5f5",
              color: active ? "#2e7d32" : "#dc2626",
              border: `1px solid ${active ? "#4caf50" : "#fca5a5"}`,
              borderRadius: 10, display: "inline-block", whiteSpace: "nowrap",
            }}>
              {active ? "Active" : "Inactive"}
            </span>
          </td>
        );
      }

      default:
        return <td key={key} style={{ ...tdS, color: "#9ca3af" }}>—</td>;
    }
  };

  const activeKeys = TABLE_COLS.filter(c => visibleCols[c.key]);

  return (
    <div style={{
      padding: "0", background: "#f4f6f9", height: "100%",
      display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {fetchErr && (
        <div style={{
          padding: "10px 16px", background: "#fff5f5",
          border: "1px solid #fca5a5",
          color: "#dc2626", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          ⚠️ {fetchErr}
          <button onClick={fetchVehicles} style={{
            background: "none", border: "1px solid #fca5a5",
            borderRadius: 3, padding: "2px 10px", cursor: "pointer",
            fontSize: 11, color: "#dc2626",
          }}>Retry</button>
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 14px", background: "#fff", borderBottom: "1px solid #e2e8f0",
      }}>

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#f8fafc", border: "1px solid #e2e8f0",
          padding: "0 10px", height: 38, borderRadius: 3, minWidth: 300,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            placeholder="Search vehicle, IMEI, SIM, admin, dealer, user, brand..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{
              border: "none", background: "transparent", outline: "none",
              fontSize: 13, color: "#1e293b", width: "100%",
            }}
          />
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 0 }}>
              ✕
            </button>
          )}
        </div>

        {/* Status filter */}
        <select style={selBarStyle} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>

        {/* Month filter */}
        <select style={{ ...selBarStyle, minWidth: 155 }} value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}>
          <option value="">All Months</option>
          {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* Reset */}
        <button onClick={reset} style={{
          height: 38, padding: "0 14px", background: "#fff",
          border: "1px solid #e2e8f0", borderRadius: 3,
          fontSize: 13, color: "#374151", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Reset
        </button>

        {/* Refresh */}
        <button onClick={fetchVehicles} disabled={loading} style={{
          height: 38, padding: "0 14px", background: "#fff",
          border: "1px solid #e2e8f0", borderRadius: 3,
          fontSize: 13, color: "#374151",
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: 6,
          opacity: loading ? 0.6 : 1,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation: loading ? "saSpin .8s linear infinite" : "none" }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          {loading ? "Loading…" : "Refresh"}
        </button>

        <div style={{ flex: 1 }} />

        {/* Names loading indicator */}
        {namesLoading && (
          <span style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 5 }}>
            <Spin size={10} color={ACC} /> Loading names…
          </span>
        )}

        {/* Vehicle count */}
        <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
          {filtered.length !== vehicles.length
            ? <><strong style={{ color: "#1e293b" }}>{filtered.length}</strong> / {vehicles.length} vehicles</>
            : <><strong style={{ color: "#1e293b" }}>{vehicles.length}</strong> vehicles</>}
        </span>

        {/* Rows per page */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Rows:</span>
          <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            style={{ height: 38, padding: "0 8px", border: "1px solid #e2e8f0", fontSize: 12, cursor: "pointer", outline: "none", borderRadius: 3 }}>
            {[15, 25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Column picker */}
        <div ref={colRef} style={{ position: "relative" }}>
          <button onClick={() => setColMenuOpen(v => !v)} style={{
            height: 38, padding: "0 14px",
            background: colMenuOpen ? "#f0f4ff" : "#fff",
            border: `1px solid ${colMenuOpen ? ACC : "#e2e8f0"}`,
            borderRadius: 3, fontSize: 13, color: "#334155",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6"  x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6"  x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Columns ▾
          </button>
          {colMenuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4,
              zIndex: 400, minWidth: 220, padding: "6px 0",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              maxHeight: 400, overflowY: "auto",
            }}>
              <div style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Toggle Columns
              </div>
              {TABLE_COLS.map(c => (
                <label key={c.key}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#374151" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <input
                    type="checkbox"
                    checked={!!visibleCols[c.key]}
                    onChange={() => setVisibleCols(p => ({ ...p, [c.key]: !p[c.key] }))}
                    style={{ accentColor: ACC }}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto", background: "#fff", borderTop: "none", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
          <thead>
            <tr>
              {activeKeys.map(c => (
                <th key={c.key}
                  style={{ ...thS, cursor: c.sort ? "pointer" : "default" }}
                  onClick={c.sort ? () => handleSort(c.key) : undefined}>
                  {c.label}
                  {c.sort && <SortIcon col={c.key} sortCol={sortCol} sortDir={sortDir} />}
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
                  <div style={{ fontSize: 34, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>
                    {vehicles.length === 0 ? "No vehicles found" : "No vehicles match your filters"}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                    {vehicles.length === 0
                      ? "Vehicles assigned to users will appear here."
                      : "Try adjusting your search or filters."}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((v, i) => (
                <tr key={v._id || v.imei || i}
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

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", background: "#fff", borderTop: "1px solid #e2e8f0",
        fontSize: 12, flexWrap: "wrap", gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: "#64748b" }}>
          Showing{" "}
          <strong style={{ color: "#1e293b" }}>
            {filtered.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)}
          </strong>{" "}
          of <strong style={{ color: "#1e293b" }}>{filtered.length}</strong>
        </span>
        <div style={{ display: "flex", gap: 3 }}>
          {[
            { label: "«", action: () => setPage(1),                             disabled: page === 1 },
            { label: "‹", action: () => setPage(p => Math.max(1, p - 1)),       disabled: page === 1 },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} disabled={btn.disabled}
              style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 3, background: btn.disabled ? "#f8fafc" : "#fff", cursor: btn.disabled ? "not-allowed" : "pointer", color: btn.disabled ? "#cbd5e1" : "#475569" }}>
              {btn.label}
            </button>
          ))}
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let p;
            if      (totalPages <= 7)          p = i + 1;
            else if (page <= 4)                p = i + 1;
            else if (page >= totalPages - 3)   p = totalPages - 6 + i;
            else                               p = page - 3 + i;
            return (
              <button key={p} onClick={() => setPage(p)}
                style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 3, background: p === page ? ACC : "#fff", color: p === page ? "#fff" : "#475569", cursor: "pointer", fontWeight: p === page ? 700 : 400 }}>
                {p}
              </button>
            );
          })}
          {[
            { label: "›", action: () => setPage(p => Math.min(totalPages, p + 1)), disabled: page === totalPages },
            { label: "»", action: () => setPage(totalPages),                        disabled: page === totalPages },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} disabled={btn.disabled}
              style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 3, background: btn.disabled ? "#f8fafc" : "#fff", cursor: btn.disabled ? "not-allowed" : "pointer", color: btn.disabled ? "#cbd5e1" : "#475569" }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <style>{`@keyframes saSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}