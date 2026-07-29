import { createContext, useContext, useEffect, useState } from "react";

export const PALETTE_COLORS = [
  { id: "c00", hex: "#1A56DB", name: "Cobalt Prime",    group: "Blue"    },
  { id: "c01", hex: "#1971C2", name: "Atlantic",        group: "Blue"    },
  { id: "c02", hex: "#0C7FDA", name: "Sky Drive",       group: "Blue"    },
  { id: "c03", hex: "#1864AB", name: "Navy Core",       group: "Blue"    },
  { id: "c04", hex: "#2563EB", name: "Electric Blue",   group: "Blue"    },
  { id: "c05", hex: "#0D47A1", name: "Deep Navy",       group: "Blue"    },
  { id: "c06", hex: "#1E88E5", name: "Clarity Blue",    group: "Blue"    },
  { id: "c07", hex: "#3B82F6", name: "Skyline",         group: "Blue"    },
  { id: "c08", hex: "#0284C7", name: "Horizon",         group: "Blue"    },
  { id: "c09", hex: "#0369A1", name: "Pacific",         group: "Blue"    },
  { id: "c10", hex: "#0D9488", name: "Teal Pro",        group: "Teal"    },
  { id: "c11", hex: "#0F766E", name: "Deep Teal",       group: "Teal"    },
  { id: "c12", hex: "#14B8A6", name: "Cyan Slate",      group: "Teal"    },
  { id: "c13", hex: "#0891B2", name: "Cerulean",        group: "Teal"    },
  { id: "c14", hex: "#0E7490", name: "Gulf",            group: "Teal"    },
  { id: "c15", hex: "#2DD4BF", name: "Aqua Soft",       group: "Teal"    },
  { id: "c16", hex: "#06B6D4", name: "Cyan Bright",     group: "Teal"    },
  { id: "c17", hex: "#0369A1", name: "Lagoon",          group: "Teal"    },
  { id: "c18", hex: "#164E63", name: "Abyss",           group: "Teal"    },
  { id: "c19", hex: "#155E75", name: "Deep Ocean",      group: "Teal"    },
  { id: "c20", hex: "#16A34A", name: "Profit Green",    group: "Green"   },
  { id: "c21", hex: "#15803D", name: "Forest Core",     group: "Green"   },
  { id: "c22", hex: "#059669", name: "Emerald",         group: "Green"   },
  { id: "c23", hex: "#047857", name: "Deep Emerald",    group: "Green"   },
  { id: "c24", hex: "#22C55E", name: "Lime Glow",       group: "Green"   },
  { id: "c25", hex: "#4D7C0F", name: "Olive Prime",     group: "Green"   },
  { id: "c26", hex: "#3F6212", name: "Jungle",          group: "Green"   },
  { id: "c27", hex: "#65A30D", name: "Chartreuse Pro",  group: "Green"   },
  { id: "c28", hex: "#166534", name: "Pine",            group: "Green"   },
  { id: "c29", hex: "#14532D", name: "Deep Pine",       group: "Green"   },
  { id: "c30", hex: "#7C3AED", name: "Violet",          group: "Purple"  },
  { id: "c31", hex: "#6D28D9", name: "Amethyst",        group: "Purple"  },
  { id: "c32", hex: "#5B21B6", name: "Deep Violet",     group: "Purple"  },
  { id: "c33", hex: "#8B5CF6", name: "Lavender Bright", group: "Purple"  },
  { id: "c34", hex: "#4C1D95", name: "Royal Indigo",    group: "Purple"  },
  { id: "c35", hex: "#A855F7", name: "Orchid",          group: "Purple"  },
  { id: "c36", hex: "#9333EA", name: "Grape",           group: "Purple"  },
  { id: "c37", hex: "#6366F1", name: "Indigo",          group: "Purple"  },
  { id: "c38", hex: "#4F46E5", name: "Indigo Deep",     group: "Purple"  },
  { id: "c39", hex: "#3730A3", name: "Ultra Indigo",    group: "Purple"  },
  { id: "c40", hex: "#DC2626", name: "Alert Red",       group: "Red"     },
  { id: "c41", hex: "#B91C1C", name: "Deep Red",        group: "Red"     },
  { id: "c42", hex: "#EA580C", name: "Burnt Orange",    group: "Red"     },
  { id: "c43", hex: "#C2410C", name: "Rust",            group: "Red"     },
  { id: "c44", hex: "#D97706", name: "Amber",           group: "Warm"    },
  { id: "c45", hex: "#B45309", name: "Caramel",         group: "Warm"    },
  { id: "c46", hex: "#374151", name: "Graphite",        group: "Neutral" },
  { id: "c47", hex: "#1F2937", name: "Charcoal",        group: "Neutral" },
  { id: "c48", hex: "#111827", name: "Obsidian",        group: "Neutral" },
  { id: "c49", hex: "#4B5563", name: "Slate",           group: "Neutral" },
  { id: "c_default", hex: "#06314b", name: "Deep Forest", group: "Green" },
];

export const THEME_COLORS = PALETTE_COLORS;
const DEFAULT_COLOR = { id: "c_default", hex: "#06314b", name: "Deep Forest", group: "Green" };

// ── Storage key = role + userId → fully isolated per individual user ──────────
// Examples:
//   "app_theme_v3_super_admin_686abc123"  → superadmin A
//   "app_theme_v3_admin_686abc456"        → admin A
//   "app_theme_v3_admin_686abc789"        → admin B (different from admin A)
//   "app_theme_v3_dealer_686abcdef"       → dealer A
const getStorageKey = (role, userId) =>
  `app_theme_v3_${role || "default"}_${userId || "guest"}`;

function loadSaved(role, userId) {
  try {
    const r = localStorage.getItem(getStorageKey(role, userId));
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
}

function saveToStorage(role, userId, data) {
  try {
    localStorage.setItem(getStorageKey(role, userId), JSON.stringify(data));
  } catch {}
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function darkenHex(hex, amount = 30) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

function lightenHex(hex, amount = 80) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex) {
  const num = parseInt(hex.replace("#", ""), 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

export function getLuminance(hex) {
  const clean = hex.replace("#", "").padEnd(6, "0");
  const num = parseInt(clean, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function textOnColor(hex) {
  return getLuminance(hex) > 0.45 ? "#1E293B" : "#FFFFFF";
}

export function isValidHex(hex) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

export function normalizeHex(hex) {
  const h = hex.replace("#", "");
  if (h.length === 3) return "#" + h.split("").map(c => c + c).join("");
  return "#" + h;
}

// ── Apply Theme CSS Variables ─────────────────────────────────────────────────
export function applyThemeVars(colorHex) {
  const root = document.documentElement;
  const hex  = normalizeHex(colorHex);
  const dark = darkenHex(hex, 30);
  const light = lightenHex(hex, 80);
  const rgb  = hexToRgb(hex);
  const textColor = textOnColor(hex);
  const [rr, gg, bb] = rgb.split(", ");

  const vars = {
    "--theme-color":           hex,
    "--theme-color-dark":      dark,
    "--theme-color-light":     light,
    "--theme-color-rgb":       rgb,
    "--btn-primary-bg":        hex,
    "--btn-primary-text":      textColor,
    "--link-color":            hex,
    "--sidebar-bg":            hex,
    "--topbar-bg":             hex,
    "--theme-gradient":        `linear-gradient(160deg, ${hex} 0%, ${darkenHex(hex, 45)} 100%)`,
    "--theme-color-alpha-10":  `rgba(${rr}, ${gg}, ${bb}, 0.06)`,
    "--theme-gradient-alpha":  `rgba(${rr}, ${gg}, ${bb}, 0.04)`,
    "--accent-primary":        hex,
    "--accent-primary-light":  light,
    "--accent-primary-dark":   dark,
  };

  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

// ── Context ───────────────────────────────────────────────────────────────────
const ThemeContext = createContext(null);

// ── ThemeProvider accepts role + userId ───────────────────────────────────────
// role   → 'super_admin' | 'admin' | 'dealer' | 'user' | 'default'
// userId → MongoDB _id string e.g. "507f1f77bcf86cd799439011"
// Together they create a unique storage key per individual user account
export function ThemeProvider({ children, role = "default", userId = "guest" }) {
  const saved = loadSaved(role, userId);

  const [activeHex, setActiveHex]         = useState(saved?.color_hex || DEFAULT_COLOR.hex);
  const [activeColorId, setActiveColorId] = useState(saved?.color_id  || DEFAULT_COLOR.id);
  const [isSaving, setIsSaving]           = useState(false);
  const [saveError, setSaveError]         = useState(null);

  const activeColorObj =
    PALETTE_COLORS.find(c => c.id === activeColorId) ||
    PALETTE_COLORS.find(c => c.hex.toLowerCase() === activeHex.toLowerCase()) ||
    null;

  // Sidebar/Topbar compat
  const activeColor    = activeHex;
  const activeGradient = `linear-gradient(160deg, ${activeHex} 0%, ${darkenHex(activeHex, 45)} 100%)`;
  const isGradient     = false;

  useEffect(() => {
    applyThemeVars(activeHex);
  }, [activeHex]);

  // Re-runs when EITHER role OR userId changes
  // This handles: login, logout, switching between user accounts
  useEffect(() => {
    if (!role || !userId) return;

    const localSaved = loadSaved(role, userId);

    if (localSaved?.color_hex && isValidHex(localSaved.color_hex)) {
      // ✅ Found local cache for this exact user — apply instantly
      const hex = normalizeHex(localSaved.color_hex);
      setActiveHex(hex);
      setActiveColorId(localSaved.color_id || "");
      applyThemeVars(hex);
      return;
    }

    // No local cache → fetch from backend by role + userId
    fetch(`/api/theme?role=${role}&userId=${userId}`)
      .then(r => r.json())
      .then(({ data }) => {
        if (data?.color_hex && isValidHex(data.color_hex)) {
          const hex = normalizeHex(data.color_hex);
          setActiveHex(hex);
          setActiveColorId(data.color_id || "");
          applyThemeVars(hex);
          // Cache locally for next load
          saveToStorage(role, userId, {
            color_id:  data.color_id || "",
            color_hex: hex,
          });
        }
      })
      .catch(() => {
        // Silently fall back to default on network error
      });
  }, [role, userId]);

  // ── Save palette swatch by colorId ───────────────────────────────────────────
  const saveColor = (colorId) => {
    const chosen = PALETTE_COLORS.find(c => c.id === colorId) || DEFAULT_COLOR;
    _persist(chosen.id, chosen.hex);
  };

  // ── Save arbitrary hex from color picker ──────────────────────────────────────
  const saveHex = (hex) => {
    if (!isValidHex(hex)) return;
    const normalized = normalizeHex(hex);
    const match = PALETTE_COLORS.find(
      c => c.hex.toLowerCase() === normalized.toLowerCase()
    );
    _persist(match?.id || "custom", normalized);
  };

  // ── Internal persist: localStorage + backend ──────────────────────────────────
  function _persist(colorId, hex) {
    setIsSaving(true);
    setSaveError(null);
    setActiveHex(hex);
    setActiveColorId(colorId);
    applyThemeVars(hex);

    // Key includes both role AND userId — zero overlap between users
    saveToStorage(role, userId, { color_id: colorId, color_hex: hex });

    // Send role + userId to backend so it stores per individual user
    fetch("/api/theme/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        userId,
        color_id:       colorId,
        color_hex:      hex,
        color_gradient: hex,
      }),
    })
      .catch(err => setSaveError(err))
      .finally(() => setTimeout(() => setIsSaving(false), 300));
  }

  return (
    <ThemeContext.Provider
      value={{
        activeHex,
        activeColorId,
        activeColorObj,
        activeColor,
        activeGradient,
        isGradient,
        THEME_COLORS,
        PALETTE_COLORS,
        isSaving,
        saveError,
        saveColor,
        saveHex,
        role,
        userId,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
};