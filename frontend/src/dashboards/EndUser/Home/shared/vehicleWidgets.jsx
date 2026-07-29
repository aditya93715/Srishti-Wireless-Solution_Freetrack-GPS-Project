// ─────────────────────────────────────────────────────────────────────────────
// vehicleWidgets.jsx
// All small, self-contained sensor / status UI components that appear in both
// the table-dashboard rows and the advance-dashboard vehicle cards.
// Place at: frontend/src/dashboards/Admin/Home/shared/vehicleWidgets.jsx
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { safeNum }                                            from './apiHelpers.js';
import { getVehicleImage, getStateOverlay, STATE_COLOR }     from './vehicleAssets.js';
import { useAddress }                                        from './addressCache.js';

// ── Battery fill-bar ──────────────────────────────────────────────────────────
export const BatteryIcon = memo(({ pct = 0 }) => {
  const p     = Math.min(100, Math.max(0, safeNum(pct)));
  const color = p > 60 ? '#16a34a' : p > 30 ? '#f59e0b' : '#ef4444';
  const fillW = Math.round((p / 100) * 28);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <div style={{ width: 34, height: 14, borderRadius: 3, border: `1.5px solid ${color}`, background: '#f1f5f9', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fillW}px`, background: `linear-gradient(90deg,${color}cc,${color})`, borderRadius: '2px 0 0 2px', transition: 'width 0.4s ease' }} />
        <div style={{ position: 'absolute', top: 1, left: 1, right: 1, height: 3, background: 'rgba(255,255,255,0.4)', borderRadius: 2 }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#fff', fontFamily: 'monospace', textShadow: `0 0 3px ${color},0 1px 2px rgba(0,0,0,0.5)`, zIndex: 2 }}>{p}%</div>
      </div>
      <div style={{ width: 3, height: 7, background: color, borderRadius: '0 2px 2px 0', flexShrink: 0 }} />
    </div>
  );
});

// ── 5-bar GSM signal ──────────────────────────────────────────────────────────
export const GsmSignalIcon = memo(({ raw = 0 }) => {
  const rawVal = Number(raw) || 0;
  let bars = 0;
  if (rawVal > 0 && rawVal !== 99) {
    if      (rawVal <= 6)  bars = 1;
    else if (rawVal <= 12) bars = 2;
    else if (rawVal <= 18) bars = 3;
    else if (rawVal <= 25) bars = 4;
    else                   bars = 5;
  }
  const palettes   = ['#94a3b8', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#16a34a'];
  const color      = palettes[bars];
  const barHeights = [4, 6, 9, 12, 15];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 17 }}>
        {barHeights.map((h, idx) => (
          <div key={idx} style={{ width: 4, height: `${h}px`, borderRadius: '2px 2px 0 0', background: idx < bars ? color : '#e2e8f0', border: `1px solid ${idx < bars ? color : '#d1d5db'}`, boxShadow: idx < bars ? `0 0 3px ${color}50` : 'none' }} />
        ))}
      </div>
      <span style={{ fontSize: 8, fontWeight: 800, color, fontFamily: 'monospace', background: color + '15', padding: '0px 4px', borderRadius: 2, border: `1px solid ${color}30` }}>{rawVal}/31</span>
    </div>
  );
});

// ── GPS satellite pin ─────────────────────────────────────────────────────────
export const GpsSatIcon = memo(({ satellites = 0, fixType = 'No Fix' }) => {
  const sats   = Number(satellites) || 0;
  const hasfix = fixType !== 'No Fix' && sats >= 3;
  const color  = hasfix ? (sats >= 6 ? '#16a34a' : sats >= 4 ? '#f59e0b' : '#f97316') : '#ef4444';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width="16" height="20" viewBox="0 0 24 28" fill="none">
        <path d="M12 2C7.58 2 4 5.58 4 10c0 6.27 8 16 8 16s8-9.73 8-16c0-4.42-3.58-8-8-8z" fill={color} opacity="0.9" />
        <circle cx="12" cy="10" r="3.5" fill="white" opacity="0.95" />
        <ellipse cx="12" cy="27" rx="4" ry="1.2" fill={color} opacity="0.25" />
      </svg>
      <span style={{ fontSize: 8, fontWeight: 800, color, fontFamily: 'monospace', background: color + '15', padding: '0px 4px', borderRadius: 2, border: `1px solid ${color}30` }}>{sats} sats</span>
    </div>
  );
});

// ── SVG speed arc gauge ───────────────────────────────────────────────────────
export const SpeedDisplay = memo(({ speed = 0 }) => {
  const spd        = Number(speed) || 0;
  const maxSpd     = 120, SIZE = 52, cx = SIZE / 2, cy = SIZE / 2 + 2, R = 15;
  const toRad      = a => (a * Math.PI) / 180;
  const START_ANGLE = 210, SWEEP = 240;
  const polarToXY  = (deg, r) => ({ x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) });
  const describeArc = (startDeg, sweepDeg, r) => {
    const endDeg = startDeg + sweepDeg;
    const s = polarToXY(startDeg, r), e = polarToXY(endDeg, r);
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };
  const fraction       = Math.min(spd / maxSpd, 1);
  const needleAngleDeg = START_ANGLE + fraction * SWEEP;
  const needleTip      = polarToXY(needleAngleDeg, R - 3);
  const needleBase1    = polarToXY(needleAngleDeg + 90, 2.5);
  const needleBase2    = polarToXY(needleAngleDeg - 90, 2.5);
  const needleColor    = spd > 80 ? '#dc2626' : spd > 0 ? '#16a34a' : '#94a3b8';
  const segments = [
    { from: 0,   sweep: 48, color: '#22c55e' },
    { from: 48,  sweep: 48, color: '#84cc16' },
    { from: 96,  sweep: 48, color: '#f59e0b' },
    { from: 144, sweep: 48, color: '#f97316' },
    { from: 192, sweep: 48, color: '#ef4444' },
  ];
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" style={{ display: 'block' }}>
      <path d={describeArc(START_ANGLE, SWEEP, R)} stroke="#e2e8f0" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      {segments.map((seg, i) => <path key={i} d={describeArc(START_ANGLE + seg.from, seg.sweep, R)} stroke={seg.color} strokeWidth="3.5" fill="none" />)}
      {spd > 0 && <path d={describeArc(START_ANGLE, fraction * SWEEP, R)} stroke={needleColor} strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.3" />}
      <polygon points={`${needleTip.x.toFixed(2)},${needleTip.y.toFixed(2)} ${needleBase1.x.toFixed(2)},${needleBase1.y.toFixed(2)} ${needleBase2.x.toFixed(2)},${needleBase2.y.toFixed(2)}`} fill={needleColor} />
      <circle cx={cx} cy={cy} r="3.5" fill={needleColor} /><circle cx={cx} cy={cy} r="1.8" fill="#fff" />
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="7.5" fontWeight="900" fill={needleColor} fontFamily="monospace">{spd}</text>
      <text x={cx} y={cy + 17} textAnchor="middle" fontSize="5.5" fontWeight="600" fill="#94a3b8" fontFamily="monospace">km/h</text>
    </svg>
  );
});

// ── AC fan icon ───────────────────────────────────────────────────────────────
export const AcFanIcon = memo(({ on = false }) => {
  const color  = on ? '#0891b2' : '#94a3b8';
  const bg     = on ? '#e0f2fe' : '#f1f5f9';
  const border = on ? '#bae6fd' : '#e2e8f0';
  return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: bg, border: `1.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: on ? 'acSpin 1.2s linear infinite' : 'none', boxShadow: on ? `0 0 8px ${color}50` : 'none' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="2.5" fill={color} />
        <path d="M12 9.5 C10 6.5 7 5.5 8 3.5 C9 1.5 13 3.5 12 9.5Z" fill={color} opacity="0.9" />
        <path d="M14.2 13 C17 12.5 19 14 18.5 16 C18 18 14.5 17 14.2 13Z" fill={color} opacity="0.9" />
        <path d="M9.8 13 C7 14.5 4.5 13.5 4.5 11.5 C4.5 9.5 8 9.5 9.8 13Z" fill={color} opacity="0.9" />
      </svg>
    </div>
  );
});

// ── Temperature icon (snowflake ↔ arc gauge) ──────────────────────────────────
export const TempIcon = ({ value }) => {
  if (value == null) return <span style={{ color: '#94a3b8', fontSize: 11 }}>--</span>;
  const temp    = Number(value);
  const isCold  = temp < 10;
  const color   = temp > 40 ? '#dc2626' : temp > 30 ? '#ea580c' : temp > 20 ? '#f59e0b' : temp < 0 ? '#0891b2' : isCold ? '#38bdf8' : '#16a34a';
  const bgColor = temp > 40 ? '#fee2e2' : temp > 30 ? '#fff7ed' : temp > 20 ? '#fef9c3' : temp < 0 ? '#e0f2fe' : '#dcfce7';
  const SIZE = 20, cxh = SIZE / 2, cyh = SIZE / 2, Rh = SIZE / 2 - 3;
  const fraction = Math.min(Math.max((temp - 0) / (60 - 0), 0), 1);
  const toRad    = a => (a - 90) * Math.PI / 180;
  const p1 = { x: cxh + Rh * Math.cos(toRad(220)), y: cyh + Rh * Math.sin(toRad(220)) };
  const p2a = 220 + fraction * 280;
  const p2 = { x: cxh + Rh * Math.cos(toRad(p2a)), y: cyh + Rh * Math.sin(toRad(p2a)) };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {isCold ? (
        <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
          <line x1="12" y1="2" x2="12" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <line x1="5" y1="5" x2="19" y2="19" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <line x1="19" y1="5" x2="5" y2="19" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </svg>
      ) : (
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
          <path d={`M ${cxh + Rh * Math.cos(toRad(220))} ${cyh + Rh * Math.sin(toRad(220))} A ${Rh} ${Rh} 0 1 1 ${cxh + Rh * Math.cos(toRad(500))} ${cyh + Rh * Math.sin(toRad(500))}`} stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          {fraction > 0 && <path d={`M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${Rh} ${Rh} 0 ${fraction * 280 > 180 ? 1 : 0} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`} stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />}
          <circle cx={cxh} cy={cyh} r="2" fill={color} />
        </svg>
      )}
      <span style={{ fontSize: 9, fontWeight: 800, color, background: bgColor, padding: '0px 4px', borderRadius: 2, border: `1px solid ${color}30`, fontFamily: 'monospace' }}>{temp}°C</span>
    </div>
  );
};

// ── Humidity water-drop ───────────────────────────────────────────────────────
export const HumidityIcon = ({ value }) => {
  if (value == null) return <span style={{ color: '#94a3b8', fontSize: 11 }}>--</span>;
  const hum   = Math.min(100, Math.max(0, Number(value)));
  const color = hum > 80 ? '#0891b2' : hum > 60 ? '#16a34a' : '#ca8a04';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width="14" height="18" viewBox="0 0 18 24" fill="none">
        <defs><clipPath id={`drop-${hum}`}><path d="M9 1.5 Q15 8 15 14 A6 6 0 0 1 3 14 Q3 8 9 1.5Z" /></clipPath></defs>
        <path d="M9 1.5 Q15 8 15 14 A6 6 0 0 1 3 14 Q3 8 9 1.5Z" fill={color} opacity="0.12" stroke={color} strokeWidth="1.2" />
        <rect x="3" y={1.5 + (1 - hum / 100) * 12.5} width="12" height={hum / 100 * 12.5 + 8} fill={color} opacity="0.75" clipPath={`url(#drop-${hum})`} />
      </svg>
      <span style={{ fontSize: 9, fontWeight: 800, color, fontFamily: 'monospace', background: color + '18', padding: '0px 4px', borderRadius: 2, border: `1px solid ${color}30` }}>{hum}%</span>
    </div>
  );
};

// ── SoC percentage bar ────────────────────────────────────────────────────────
export const SoCBar = ({ pct = 0 }) => {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const c = p > 60 ? 'var(--theme-color)' : p > 30 ? '#ca8a04' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 32, height: 8, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', border: '1px solid #d1d5db' }}>
        <div style={{ width: `${p}%`, height: '100%', background: `linear-gradient(90deg,${c}cc,${c})`, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: c, fontWeight: 700 }}>{p}%</span>
    </div>
  );
};

// ── Side-view vehicle icon with state dot + optional blend overlay ─────────────
export const VehicleTypeIcon = ({ type = 'car', state = 'stopped', size = 48 }) => {
  const imgSrc     = getVehicleImage(type);
  const overlayClr = getStateOverlay(state);
  const dotClr     = STATE_COLOR[state] || '#64748b';
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, flexShrink: 0 }}>
      <img src={imgSrc} alt={type} width={size} height={size}
        style={{ objectFit: 'contain', display: 'block', position: 'relative', zIndex: 1 }}
        onError={e => { e.currentTarget.style.display = 'none'; }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: overlayClr, mixBlendMode: 'multiply', zIndex: 2, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 1, right: 1, width: 8, height: 8, borderRadius: '50%', background: dotClr, border: '2px solid #fff', zIndex: 3, boxShadow: `0 0 5px ${dotClr}80` }} />
    </div>
  );
};

// ── GPS status chip ───────────────────────────────────────────────────────────
export const GpsChip = ({ v }) => {
  const satCount = Number(v?.gpsSatellites ?? v?.satellites ?? v?.gps_satellites ?? 0) || 0;
  const status   = v?.gpsStatus ?? v?.gps_status ?? null;
  const gpsRaw   = v?.gps;
  const fixType  = v?.fixType ?? null;
  let gpsState = 'off';
  if (status === 'fixed' || status === 'active')           gpsState = 'fixed';
  else if (status === 'nofix' || status === 'searching')   gpsState = 'nofix';
  else if (gpsRaw === true  || gpsRaw === 1 || gpsRaw === '1' || gpsRaw === 'true')  gpsState = 'fixed';
  else if (gpsRaw === false || gpsRaw === 0 || gpsRaw === '0' || gpsRaw === 'false') gpsState = 'off';
  else if (v?.lat && v?.lng) gpsState = 'fixed';
  const cfg = {
    fixed: { label: fixType === '3D Fix' ? '3D' : fixType === '2D Fix' ? '2D' : 'Fix', bg: '#dcfce7', border: '#86efac', color: '#15803d', dot: '#16a34a' },
    nofix: { label: 'NoFix', bg: '#fef3c7', border: '#fcd34d', color: '#92400e', dot: '#f59e0b' },
    off:   { label: 'Off',   bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', dot: '#dc2626' },
  }[gpsState];
  return (
    <div title={`GPS: ${cfg.label} | ${satCount} satellites`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 3, background: cfg.bg, border: `1px solid ${cfg.border}`, cursor: 'default' }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot }} />
      <span style={{ fontSize: 9, color: cfg.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{cfg.label}</span>
    </div>
  );
};

// ── Address table cell (with lazy-resolve) ────────────────────────────────────
export const AddressCell = ({ v, style }) => {
  const { display, isCoord, loading } = useAddress(v.address, v.lat, v.lng);
  return (
    <td style={{ ...style, maxWidth: 240, lineHeight: 1.45, fontSize: 11, whiteSpace: 'normal', wordBreak: 'break-word', verticalAlign: 'top', paddingTop: 6, paddingBottom: 6 }} title={display}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
        {loading && <div style={{ width: 8, height: 8, flexShrink: 0, borderRadius: '50%', border: '1.5px solid #e2e8f0', borderTopColor: 'var(--theme-color)', animation: 'spin 1s linear infinite', marginTop: 2 }} />}
        <span style={{ color: isCoord ? '#94a3b8' : '#374151', fontStyle: isCoord ? 'italic' : 'normal' }}>{display}</span>
      </div>
    </td>
  );
};

// ── Toggle switch ─────────────────────────────────────────────────────────────
export const Toggle = ({ checked, onChange }) => (
  <div onClick={() => onChange(!checked)} style={{ width: 36, height: 20, borderRadius: 10, background: checked ? 'var(--theme-color)' : '#cbd5e1', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
    <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
  </div>
);

// ── Generic loading spinner ───────────────────────────────────────────────────
export const Spinner = ({ text = 'Loading...' }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: '60px 0' }}>
    <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTop: '3px solid var(--theme-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>{text}</span>
  </div>
);

// ── Full-screen filter-apply overlay ─────────────────────────────────────────
export const FilterLoadingOverlay = ({ visible, message = 'Applying filter…' }) => {
  if (!visible) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(2px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
      <div style={{ width: 44, height: 44, border: '4px solid #e2e8f0', borderTop: '4px solid var(--theme-color)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span style={{ color: 'var(--theme-color)', fontWeight: 700, fontSize: 14, letterSpacing: '0.02em' }}>{message}</span>
    </div>
  );
};

// ── Skeleton table row ────────────────────────────────────────────────────────
export const SkeletonRow = ({ cols }) => (
  <tr>
    {cols.map((c, i) => (
      <td key={i} style={{ padding: '8px 6px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ height: 12, background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: 3, width: i === 0 ? 20 : i === 3 ? '70%' : '50%' }} />
      </td>
    ))}
  </tr>
);