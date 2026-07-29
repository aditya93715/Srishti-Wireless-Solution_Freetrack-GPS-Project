import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../../context/ThemeContext";

// ── Utilities ─────────────────────────────────────────────────────────────────
function getLuminance(hex) {
  const h = hex.replace("#", "").padEnd(6, "0");
  const num = parseInt(h, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function textOnColor(hex) {
  return getLuminance(hex) > 0.45 ? "#111827" : "#FFFFFF";
}

function isValidHex(hex) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

// ── Color Swatch ──────────────────────────────────────────────────────────────
function ColorSwatch({ color, isSelected, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={`${color.name} · ${color.hex.toUpperCase()} · ${color.group}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        aspectRatio: "1",
        borderRadius: 3,
        background: color.hex,
        border: isSelected
          ? "2.5px solid #fff"
          : hovered
          ? "2px solid rgba(255,255,255,0.6)"
          : "2px solid transparent",
        cursor: "pointer",
        position: "relative",
        outline: isSelected ? `3px solid ${color.hex}` : "none",
        outlineOffset: 1,
        transition: "transform 0.13s ease, box-shadow 0.13s ease",
        transform: hovered || isSelected ? "scale(1.08)" : "scale(1)",
        flexShrink: 0,
        boxShadow: isSelected
          ? `0 0 0 2px #fff, 0 0 0 4px ${color.hex}, 0 4px 12px rgba(0,0,0,0.2)`
          : hovered
          ? "0 4px 14px rgba(0,0,0,0.22)"
          : "0 1px 3px rgba(0,0,0,0.14)",
        padding: 0,
      }}
    >
      {isSelected && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: textOnColor(color.hex),
            fontSize: 11,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          ✓
        </span>
      )}
    </button>
  );
}

// ── Hex / Color Picker ────────────────────────────────────────────────────────
function HexPicker({ activeHex, onApply }) {
  const [inputVal, setInputVal] = useState(activeHex);
  const [error, setError] = useState(false);
  const nativeRef = useRef(null);

  useEffect(() => { setInputVal(activeHex); }, [activeHex]);

  const tryApply = (val) => {
    let v = val.trim();
    if (!v.startsWith("#")) v = "#" + v;
    setInputVal(v);
    if (isValidHex(v)) {
      setError(false);
      onApply(v);
    } else {
      setError(v.length > 1);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        onClick={() => nativeRef.current?.click()}
        title="Open color picker"
        style={{
          position: "relative",
          width: 30,
          height: 30,
          borderRadius: 3,
          background: isValidHex(inputVal) ? inputVal : "#ccc",
          border: "1.5px solid rgba(0,0,0,0.15)",
          cursor: "pointer",
          overflow: "hidden",
          flexShrink: 0,
          boxShadow: "0 1px 4px rgba(0,0,0,0.13)",
        }}
      >
        <input
          ref={nativeRef}
          type="color"
          value={isValidHex(inputVal) ? inputVal : "#1A56DB"}
          onChange={(e) => { setInputVal(e.target.value); onApply(e.target.value); }}
          style={{
            position: "absolute", inset: 0, opacity: 0,
            width: "100%", height: "100%", cursor: "pointer", border: "none", padding: 0,
          }}
        />
      </div>
      <input
        type="text"
        value={inputVal}
        onChange={(e) => tryApply(e.target.value)}
        placeholder="#1A56DB"
        maxLength={7}
        spellCheck={false}
        style={{
          width: 88,
          height: 30,
          borderRadius: 3,
          border: error ? "1.5px solid #EF4444" : "1.5px solid #D1D5DB",
          background: "#F9FAFB",
          padding: "0 8px",
          fontSize: 12,
          fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace",
          color: error ? "#EF4444" : "#111827",
          outline: "none",
          letterSpacing: "0.04em",
          transition: "border-color 0.15s",
        }}
      />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ThemeSetting() {
  const {
    activeHex,
    activeColorId,
    PALETTE_COLORS,
    isSaving,
    saveError,
    saveColor,
    saveHex,
  } = useTheme();

  const [selectedHex, setSelectedHex] = useState(activeHex || "#06314b");
  const [selectedId, setSelectedId]   = useState(activeColorId || "c_default");
  const [savedFlash, setSavedFlash]   = useState(false);

  useEffect(() => {
    if (activeHex) setSelectedHex(activeHex);
    if (activeColorId) setSelectedId(activeColorId);
  }, [activeHex, activeColorId]);

  const flash = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const handleSwatchClick = (color) => {
    if (isSaving) return;
    setSelectedHex(color.hex);
    setSelectedId(color.id);
    saveColor(color.id);
    flash();
  };

  const handleHexApply = (hex) => {
    if (!isValidHex(hex)) return;
    setSelectedHex(hex);
    const match = PALETTE_COLORS.find(c => c.hex.toLowerCase() === hex.toLowerCase());
    setSelectedId(match?.id || "custom");
    saveHex(hex);
    flash();
  };

  const selectedObj = PALETTE_COLORS.find(c => c.id === selectedId);
  const groups = [...new Set(PALETTE_COLORS.map(c => c.group))];

  return (
    // ── Zero outer padding — fills entire content area edge to edge ──
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "100vh",
        background: "#ffffff",
        fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
        padding: 0,
        margin: 0,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── SINGLE CONTAINER — no border, no radius, flush to all edges ── */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 0,
          border: "none",
          boxShadow: "none",
          overflow: "hidden",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header row ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: "1px solid #E5E7EB",
            background: "#FAFAFA",
            gap: 12,
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          <h1 style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#111827",
            letterSpacing: "-0.4px",
            lineHeight: 1.2,
            margin: 0,
          }}>
            Theme Settings
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, whiteSpace: "nowrap" }}>
              Custom hex
            </span>
            <HexPicker activeHex={selectedHex} onApply={handleHexApply} />
          </div>
        </div>

        {/* ── Group legend ── */}
        <div
          style={{
            padding: "7px 20px",
            background: "#F9FAFB",
            borderBottom: "1px solid #E5E7EB",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          {groups.map((g) => {
            const sample = PALETTE_COLORS.find(c => c.group === g);
            return (
              <div key={g} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: sample?.hex || "#ccc",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 500 }}>{g}</span>
              </div>
            );
          })}
        </div>

        {/* ── Color Grid — 10 per row, small boxes, generous gap ── */}
       {/* ── Color Grid — even smaller boxes (28px) ── */}
      {/* ── Color Grid — slightly larger boxes, proportional gaps ── */}
      <div style={{
      padding: "18px 20px",  
        flex: 1,
      }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, minmax(0, 90px))",
          gap: "13px 15px",
          justifyContent: "space-between", /* ← distributes extra space evenly */
        }}
      >
        {PALETTE_COLORS.map((color) => (
          <ColorSwatch
            key={color.id}
            color={color}
            isSelected={
              selectedId === color.id ||
              selectedHex.toLowerCase() === color.hex.toLowerCase()
            }
            onClick={() => handleSwatchClick(color)}
          />
        ))}
      </div>
    </div>
      </div>

      {/* ── Error Banner ── */}
      {saveError && (
        <div style={{
          background: "#FEF2F2",
          borderTop: "1px solid #FECACA",
          padding: "9px 20px",
          fontSize: 11,
          color: "#DC2626",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}>
          <span>⚠</span> {saveError.message || "Failed to save theme. Please try again."}
        </div>
      )}
    </div>
  );
}