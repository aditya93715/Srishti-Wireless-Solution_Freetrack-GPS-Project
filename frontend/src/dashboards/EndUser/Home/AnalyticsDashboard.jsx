import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { useTheme } from "../../../context/ThemeContext";

const THEME_GREEN  = "#10b981";
const THEME_BLUE   = "#3b82f6";
const THEME        = "#3d1a6e";

const STATE_COLOR = {
  running:     '#16a34a',
  stopped:     '#dc2626',
  overspeed:   '#ea580c',
  idle:        '#ca8a04',
  unreachable: '#7c3aed',
  new:         '#0891b2',
  inactive:    '#64748b',
};

const safeNum = (v, fb = 0) => { const n = Number(v); return isNaN(n) ? fb : n; };

const VEHICLE_IMAGES = {
  car:     new URL('../../../assets/car.png',     import.meta.url).href,
  truck:   new URL('../../../assets/truck.png',   import.meta.url).href,
  bus:     new URL('../../../assets/bus.png',     import.meta.url).href,
  bike:    new URL('../../../assets/bike.png',    import.meta.url).href,
  tractor: new URL('../../../assets/tractor.png', import.meta.url).href,
  auto:    new URL('../../../assets/auto.png',    import.meta.url).href,
  van:     new URL('../../../assets/van.png',     import.meta.url).href,
  pickup:  new URL('../../../assets/pickup.png',  import.meta.url).href,
  tanker:  new URL('../../../assets/tanker.png',  import.meta.url).href,
  jcb:     new URL('../../../assets/jcb.png',     import.meta.url).href,
};

function getVehicleImage(type) { return VEHICLE_IMAGES[String(type || '').toLowerCase()] || VEHICLE_IMAGES.car; }

function defaultGlobalDateRange() {
  const end   = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

// ══════════════════════════════════════════════════════════════════
// ULTRA FAST GEOCODER
// Strategy:
//   1. 0.01° coarse grid (~1km) — ek area ke sab packets same address
//   2. 0.001° medium grid (~100m) — thoda aur precise
//   3. Max 10 concurrent Nominatim calls
//   4. In-flight dedup — same key ke liye ek hi request
// ══════════════════════════════════════════════════════════════════
const _geocodeCache   = {};   // "lat4,lng4" -> address
const _coarseCache    = {};   // "lat2,lng2" -> address  (~1km grid)
const _mediumCache    = {};   // "lat3,lng3" -> address  (~100m grid)
const _inflight       = new Map(); // key -> Promise

function fineKey(lat, lng)   { return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`; }
function mediumKey(lat, lng) { return `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`; }
function coarseKey(lat, lng) { return `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`; }

// Check all cache levels
function getCachedAddress(lat, lng) {
  if (!lat || !lng) return null;
  return _geocodeCache[fineKey(lat, lng)]
      || _mediumCache[mediumKey(lat, lng)]
      || _coarseCache[coarseKey(lat, lng)]
      || null;
}

// Store in all cache levels
function setCachedAddress(lat, lng, addr) {
  _geocodeCache[fineKey(lat, lng)]   = addr;
  _mediumCache[mediumKey(lat, lng)]  = addr;
  _coarseCache[coarseKey(lat, lng)]  = addr;
}

// Concurrency limiter — max 10 at once
const _geoSem = {
  running: 0, MAX: 10, queue: [],
  async acquire() {
    if (this.running < this.MAX) { this.running++; return; }
    await new Promise(r => this.queue.push(r));
    this.running++;
  },
  release() {
    this.running = Math.max(0, this.running - 1);
    if (this.queue.length) this.queue.shift()();
  },
};

async function reverseGeocode(lat, lng, apiBase, getToken) {
  if (!lat || !lng) return null;

  // 1. Multi-level cache check
  const cached = getCachedAddress(lat, lng);
  if (cached) return cached;

  // 2. Inflight dedup — coarse key se group karo
  const ck = coarseKey(lat, lng);
  if (_inflight.has(ck)) return _inflight.get(ck);

  // 3. New request
  const p = (async () => {
    await _geoSem.acquire();
    try {
      // Try backend first (faster if local)
      try {
        const token = getToken?.();
        const res = await fetch(
          `${apiBase}/analytics/reverse-geocode?lat=${lat}&lng=${lng}`,
          {
            headers: { Authorization: token ? `Bearer ${token}` : '' },
            signal: AbortSignal.timeout(4000),
          }
        );
        if (res.ok) {
          const d = await res.json();
          if (d.success && d.address && d.address.length > 8) {
            setCachedAddress(lat, lng, d.address);
            return d.address;
          }
        }
      } catch {}

      // Fallback: Nominatim directly
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=0`,
          {
            headers: { 'Accept-Language': 'en', 'User-Agent': 'FleetAnalytics/1.0' },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (res.ok) {
          const d = await res.json();
          if (d?.display_name && d.display_name.length > 8) {
            setCachedAddress(lat, lng, d.display_name);
            return d.display_name;
          }
        }
      } catch {}

      return null;
    } finally {
      _geoSem.release();
      _inflight.delete(ck);
    }
  })();

  _inflight.set(ck, p);
  return p;
}

// Bulk preloader — unique coarse cells nikalo aur sab ek saath fire karo
async function batchPreloadGeocode(rows, apiBase, getToken, onProgress) {
  // Unique coarse cells — ~1km grid mein group karo
  const cellMap = new Map(); // coarseKey -> {lat, lng}
  rows.forEach(r => {
    if (!r.lat || !r.lon) return;
    if (getCachedAddress(r.lat, r.lon)) return; // already cached
    const ck = coarseKey(r.lat, r.lon);
    if (!cellMap.has(ck)) cellMap.set(ck, { lat: r.lat, lng: r.lon });
  });

  const cells = [...cellMap.values()];
  if (!cells.length) { onProgress?.(100); return; }

  let done = 0;
  const total = cells.length;

  // Sab ek saath queue mein — semaphore MAX:10 throttle karega
  await Promise.all(cells.map(async ({ lat, lng }) => {
    await reverseGeocode(lat, lng, apiBase, getToken);
    done++;
    onProgress?.(Math.round((done / total) * 100));
  }));
}

async function fetchGraphData(apiBase, vehicleId, startDate, endDate, getToken, signal) {
  const url = new URL(`${apiBase}/analytics/graph-data`);
  url.searchParams.set('vehicleId', vehicleId);
  url.searchParams.set('startDate', startDate instanceof Date ? startDate.toISOString() : startDate);
  url.searchParams.set('endDate',   endDate   instanceof Date ? endDate.toISOString()   : endDate);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization:  getToken() ? `Bearer ${getToken()}` : '',
      'Content-Type': 'application/json',
    },
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

const PL_PAGE_SIZE = 10000;

async function fetchPacketPage(apiBase, vehicleId, startISO, endISO, page, getToken, signal) {
  const sMs = new Date(startISO).getTime();
  const eMs = new Date(endISO).getTime();
  const finalStart = sMs <= eMs ? startISO : endISO;
  const finalEnd   = sMs <= eMs ? endISO   : startISO;

  const url = new URL(`${apiBase}/analytics/packet-log`);
  url.searchParams.set('vehicleId', vehicleId);
  url.searchParams.set('startDate', finalStart);
  url.searchParams.set('endDate',   finalEnd);
  url.searchParams.set('page',      page);
  url.searchParams.set('limit',     10000);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization:  getToken() ? `Bearer ${getToken()}` : '',
      'Content-Type': 'application/json',
    },
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Icon components ──────────────────────────────────────────────────────────
const BatteryIcon = memo(({ pct = 0 }) => {
  const p = Math.min(100, Math.max(0, safeNum(pct)));
  const color = p > 60 ? '#16a34a' : p > 30 ? '#f59e0b' : '#ef4444';
  const fillW = Math.round((p / 100) * 42);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:3 }}>
      <div style={{ width:50, height:22, borderRadius:4, border:`2px solid ${color}`, background:'#f1f5f9', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${fillW}px`, background:`linear-gradient(90deg,${color}cc,${color})`, borderRadius:'3px 0 0 3px', transition:'width 0.4s ease' }} />
        <div style={{ position:'absolute', top:2, left:2, right:2, height:4, background:'rgba(255,255,255,0.4)', borderRadius:2 }} />
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff', fontFamily:'monospace', textShadow:`0 0 3px ${color},0 1px 2px rgba(0,0,0,0.5)`, zIndex:2 }}>{p}%</div>
      </div>
      <div style={{ width:4, height:10, background:color, borderRadius:'0 2px 2px 0', flexShrink:0 }} />
    </div>
  );
});

const GsmSignalIcon = memo(({ raw = 0 }) => {
  const rawVal = Number(raw) || 0;
  let bars = 0;
  if (rawVal > 0 && rawVal !== 99) {
    if (rawVal<=6) bars=1; else if (rawVal<=12) bars=2; else if (rawVal<=18) bars=3; else if (rawVal<=25) bars=4; else bars=5;
  }
  const palettes = ['#94a3b8','#ef4444','#f97316','#f59e0b','#84cc16','#16a34a'];
  const color = palettes[bars];
  const barHeights = [6,10,14,18,22];
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
      <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:24 }}>
        {barHeights.map((h,idx) => <div key={idx} style={{ width:6, height:`${h}px`, borderRadius:'3px 3px 0 0', background:idx<bars?color:'#e2e8f0', border:`1px solid ${idx<bars?color:'#d1d5db'}` }} />)}
      </div>
      <span style={{ fontSize:9, fontWeight:800, color, fontFamily:'monospace', background:color+'15', padding:'1px 5px', borderRadius:3, border:`1px solid ${color}30` }}>{rawVal}/31</span>
    </div>
  );
});

const GpsSatIcon = memo(({ satellites = 0, fixType = 'No Fix' }) => {
  const sats = Number(satellites) || 0;
  const hasfix = fixType !== 'No Fix' && sats >= 3;
  const color = hasfix ? (sats>=6?'#16a34a':sats>=4?'#f59e0b':'#f97316') : '#ef4444';
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
      <svg width="22" height="28" viewBox="0 0 24 28" fill="none">
        <path d="M12 2C7.58 2 4 5.58 4 10c0 6.27 8 16 8 16s8-9.73 8-16c0-4.42-3.58-8-8-8z" fill={color} opacity="0.9" />
        <circle cx="12" cy="10" r="3.5" fill="white" opacity="0.95" />
        <ellipse cx="12" cy="27" rx="4" ry="1.2" fill={color} opacity="0.25" />
      </svg>
      <span style={{ fontSize:9, fontWeight:800, color, fontFamily:'monospace', background:color+'15', padding:'1px 5px', borderRadius:3, border:`1px solid ${color}30` }}>{sats} sats</span>
    </div>
  );
});

const SpeedGauge = memo(({ speed = 0 }) => {
  const spd = Number(speed)||0, maxSpd=120, SIZE=68, cx=SIZE/2, cy=SIZE/2+2, R=22;
  const toRad = a => (a*Math.PI)/180;
  const START_ANGLE=210, SWEEP=240;
  const polarToXY = (angleDeg,radius) => ({ x:cx+radius*Math.cos(toRad(angleDeg)), y:cy+radius*Math.sin(toRad(angleDeg)) });
  const describeArc = (startDeg,sweepDeg,r) => {
    const endDeg=startDeg+sweepDeg, s=polarToXY(startDeg,r), e=polarToXY(endDeg,r), large=sweepDeg>180?1:0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };
  const fraction=Math.min(spd/maxSpd,1), needleAngleDeg=START_ANGLE+fraction*SWEEP;
  const needleTip=polarToXY(needleAngleDeg,R-4), needleBase1=polarToXY(needleAngleDeg+90,3), needleBase2=polarToXY(needleAngleDeg-90,3);
  const needleColor=spd>60?'#dc2626':spd>0?'#16a34a':'#94a3b8';
  const segments=[{from:0,sweep:48,color:'#22c55e'},{from:48,sweep:48,color:'#84cc16'},{from:96,sweep:48,color:'#f59e0b'},{from:144,sweep:48,color:'#f97316'},{from:192,sweep:48,color:'#ef4444'}];
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" style={{ display:'block' }}>
      <path d={describeArc(START_ANGLE,SWEEP,R)} stroke="#e2e8f0" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      {segments.map((seg,i)=><path key={i} d={describeArc(START_ANGLE+seg.from,seg.sweep,R)} stroke={seg.color} strokeWidth="4.5" fill="none" />)}
      {spd>0&&<path d={describeArc(START_ANGLE,fraction*SWEEP,R)} stroke={needleColor} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.3" />}
      <polygon points={`${needleTip.x.toFixed(2)},${needleTip.y.toFixed(2)} ${needleBase1.x.toFixed(2)},${needleBase1.y.toFixed(2)} ${needleBase2.x.toFixed(2)},${needleBase2.y.toFixed(2)}`} fill={needleColor} />
      <circle cx={cx} cy={cy} r="4.5" fill={needleColor}/><circle cx={cx} cy={cy} r="2.5" fill="#fff"/>
      <text x={cx} y={cy+13} textAnchor="middle" fontSize="9.5" fontWeight="900" fill={needleColor} fontFamily="monospace">{spd}</text>
      <text x={cx} y={cy+22} textAnchor="middle" fontSize="7" fontWeight="600" fill="#94a3b8" fontFamily="monospace">km/h</text>
    </svg>
  );
});

const AcFanIcon = memo(({ on = false }) => {
  const color=on?'#0891b2':'#94a3b8', bg=on?'#e0f2fe':'#f1f5f9', border=on?'#bae6fd':'#e2e8f0';
  return (
    <div style={{ width:36, height:36, borderRadius:'50%', background:bg, border:`2px solid ${border}`, display:'flex', alignItems:'center', justifyContent:'center', animation:on?'acSpin 1.2s linear infinite':'none', boxShadow:on?`0 0 10px ${color}50`:'none' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="2.5" fill={color}/>
        <path d="M12 9.5 C10 6.5 7 5.5 8 3.5 C9 1.5 13 3.5 12 9.5Z" fill={color} opacity="0.9"/>
        <path d="M14.2 13 C17 12.5 19 14 18.5 16 C18 18 14.5 17 14.2 13Z" fill={color} opacity="0.9"/>
        <path d="M9.8 13 C7 14.5 4.5 13.5 4.5 11.5 C4.5 9.5 8 9.5 9.8 13Z" fill={color} opacity="0.9"/>
      </svg>
    </div>
  );
});

const IconLock = ({ size=18, locked=true }) => { const c=locked?'#7c3aed':'#16a34a'; return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/>{locked?<path d="M7 11V7a5 5 0 0 1 10 0v4"/>:<path d="M7 11V7a5 5 0 0 1 9.9-1"/>}</svg>; };
const IconPower = ({ size=17, color='#16a34a' }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;

// ── Professional SVG fleet icon ───────────────────────────────────────────────
const FleetTruckIcon = () => (
  <svg width="120" height="72" viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="14" width="74" height="38" rx="4" fill="#e8e0f7" stroke={THEME} strokeWidth="2"/>
    <path d="M76 28 L76 52 L112 52 L112 36 L98 14 L76 14 Z" fill="#d4c8f5" stroke={THEME} strokeWidth="2"/>
    <path d="M98 18 L113 34 L93 34 L93 18 Z" fill="#bfdbfe" stroke={THEME} strokeWidth="1.5" opacity="0.9"/>
    <rect x="108" y="10" width="4" height="14" rx="2" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
    <circle cx="110" cy="8" r="3" fill="#e2e8f0" opacity="0.7"/>
    <circle cx="113" cy="5" r="2" fill="#e2e8f0" opacity="0.5"/>
    <line x1="93" y1="34" x2="93" y2="52" stroke={THEME} strokeWidth="1.5" strokeDasharray="2 2"/>
    <rect x="96" y="42" width="6" height="2" rx="1" fill={THEME} opacity="0.5"/>
    <line x1="26" y1="14" x2="26" y2="52" stroke={THEME} strokeWidth="1" strokeDasharray="2 2" opacity="0.3"/>
    <line x1="51" y1="14" x2="51" y2="52" stroke={THEME} strokeWidth="1" strokeDasharray="2 2" opacity="0.3"/>
    <rect x="10" y="24" width="56" height="18" rx="2" fill="none" stroke={THEME} strokeWidth="1" opacity="0.2"/>
    <circle cx="98" cy="54" r="9" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5"/>
    <circle cx="98" cy="54" r="5" fill="#334155"/>
    <circle cx="98" cy="54" r="2" fill="#64748b"/>
    <circle cx="22" cy="54" r="9" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5"/>
    <circle cx="22" cy="54" r="5" fill="#334155"/>
    <circle cx="22" cy="54" r="2" fill="#64748b"/>
    <circle cx="44" cy="54" r="9" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5"/>
    <circle cx="44" cy="54" r="5" fill="#334155"/>
    <circle cx="44" cy="54" r="2" fill="#64748b"/>
    <rect x="111" y="38" width="5" height="7" rx="1.5" fill="#fef08a" stroke="#fbbf24" strokeWidth="1"/>
    <rect x="2" y="20" width="4" height="8" rx="1" fill="#fca5a5" stroke="#ef4444" strokeWidth="1"/>
    <rect x="2" y="38" width="4" height="8" rx="1" fill="#fca5a5" stroke="#ef4444" strokeWidth="1"/>
    <ellipse cx="60" cy="66" rx="54" ry="4" fill={THEME} opacity="0.07"/>
  </svg>
);

const CardLoader = memo(({ themeColor = THEME, message = 'Fetching data…' }) => (
  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', minHeight:220, gap:14 }}>
    <div style={{ width:40, height:40, border:`3.5px solid ${themeColor}20`, borderTop:`3.5px solid ${themeColor}`, borderRadius:'50%', animation:'spin 0.75s linear infinite' }} />
    <span style={{ fontSize:12, fontWeight:600, color:themeColor, letterSpacing:'0.02em' }}>{message}</span>
  </div>
));

// ── Instruction placeholder shown inside containers before selection ───────────
const ContainerPlaceholder = memo(({ icon, title, subtitle, themeColor = THEME }) => (
  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, gap:14, padding:'32px 24px', textAlign:'center', minHeight:160 }}>
    <div style={{ width:52, height:52, borderRadius:'50%', background:`${themeColor}0e`, border:`2px dashed ${themeColor}30`, display:'flex', alignItems:'center', justifyContent:'center' }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:6 }}>{title}</div>
      <div style={{ fontSize:11, fontWeight:500, color:'#94a3b8', lineHeight:1.7, maxWidth:280 }}>{subtitle}</div>
    </div>
  </div>
));

// ─────────────────────────────────────────────────────────────────────────────
// VehicleProfileCard
// ─────────────────────────────────────────────────────────────────────────────
const VehicleProfileCard = memo(({ vehicleData, vehicleNumber, resolvedAddress, themeColor = THEME }) => {
  const v = vehicleData || {};
  const isEmpty = !vehicleData;

  const state    = v.state || 'inactive';
  const col      = STATE_COLOR[state] || themeColor;
  const spd      = safeNum(v.spd || v.speed, 0);
  const btr      = safeNum(v.btr || v.battery, 0);
  const ignOn    = state === 'running' || state === 'overspeed' || !!v.ignition;
  const vType    = String(v.vehicleType || v.type || 'car').toLowerCase();
  const isMoving = state === 'running' || state === 'overspeed';
  const ac       = v.ac === true || v.ac === 1 || v.ac === '1' || v.ac === 'true' || v.ac === 'on';
  const hasAc    = v.ac !== undefined && v.ac !== null;
  const hasTemp  = v.temperature != null;
  const hasHumid = v.humidity != null;
  const ep       = safeNum(v.extPower, 0);
  const gsmRaw   = safeNum(v.gsmRaw || v.gsm, 0);
  const sats     = safeNum(v.gpsSatellites || v.satellites, 0);
  const fixType  = v.fixType || 'No Fix';
  const driver   = v.driver && v.driver !== '--' ? v.driver : null;
  const poi      = v.poi || null;
  const address  = resolvedAddress || v.address || v.lastAddress || null;
  const branch   = v.branch || null;
  const displayName = vehicleNumber || v.vehicle || v.vehicleNumber || 'N/A';
  const tempColor = hasTemp ? (Number(v.temperature) > 35 ? '#dc2626' : '#0891b2') : '#d1d5db';

  // ── Skeleton cell for empty state ─────────────────────────────────────────
  const SkeletonCell = ({ wide = false }) => (
    <div style={{
      background:'#f8fafc',
      border:'1px solid rgba(0,0,0,0.05)',
      borderRadius:4,
      padding:'8px 5px',
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      gap:6,
      minHeight:70,
      boxSizing:'border-box',
      ...(wide ? { gridColumn:'span 2' } : {}),
    }}>
      <div style={{ width:28, height:28, borderRadius:'50%', background:'#e2e8f0' }} />
      <div style={{ width:36, height:7, borderRadius:3, background:'#e2e8f0' }} />
    </div>
  );

  const dataCells = isEmpty ? [] : [
    { key:'speed',   label:'Speed',      node:<SpeedGauge speed={spd} />,       bg:'rgba(22,163,74,0.06)',  border:'rgba(22,163,74,0.18)' },
    { key:'gsm',     label:'GSM Signal', node:<GsmSignalIcon raw={gsmRaw} />,    bg:'rgba(8,145,178,0.06)', border:'rgba(8,145,178,0.18)' },
    { key:'battery', label:'Battery',    node:<BatteryIcon pct={btr} />,         bg:'rgba(245,158,11,0.06)',border:'rgba(245,158,11,0.18)' },
    { key:'gps',     label:'GPS Sats',   node:<GpsSatIcon satellites={sats} fixType={fixType} />, bg:'rgba(124,58,237,0.06)', border:'rgba(124,58,237,0.18)' },
    {
      key:'ac', label:'AC',
      node:(<><AcFanIcon on={hasAc?ac:false}/><span style={{fontSize:10,fontWeight:800,color:hasAc?(ac?'#0891b2':'#94a3b8'):'#d1d5db',fontFamily:'monospace',marginTop:3}}>{hasAc?(ac?'ON':'OFF'):'--'}</span></>),
      bg:hasAc?(ac?'rgba(8,145,178,0.06)':'rgba(148,163,184,0.04)'):'#f8fafc',
      border:hasAc?(ac?'rgba(8,145,178,0.18)':'rgba(148,163,184,0.12)'):'rgba(0,0,0,0.04)',
    },
    {
      key:'temp', label:'Temperature',
      node:(<>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tempColor} strokeWidth="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
        <span style={{fontSize:10,fontWeight:800,fontFamily:'monospace',marginTop:3,color:tempColor}}>{hasTemp?`${v.temperature}°C`:'--'}</span>
      </>),
      bg:hasTemp?(Number(v.temperature)>35?'rgba(220,38,38,0.06)':'rgba(8,145,178,0.06)'):'#f8fafc',
      border:hasTemp?(Number(v.temperature)>35?'rgba(220,38,38,0.18)':'rgba(8,145,178,0.18)'):'rgba(0,0,0,0.04)',
    },
    {
      key:'humid', label:'Humidity',
      node:(<>
        <svg width="18" height="22" viewBox="0 0 18 22" fill="none"><path d="M9 1.5 Q15 8 15 14 A6 6 0 0 1 3 14 Q3 8 9 1.5Z" fill={hasHumid?'#0891b2':'#d1d5db'} opacity="0.85"/></svg>
        <span style={{fontSize:10,fontWeight:800,color:hasHumid?'#0891b2':'#d1d5db',fontFamily:'monospace',marginTop:3}}>{hasHumid?`${v.humidity}%`:'--'}</span>
      </>),
      bg:hasHumid?'rgba(8,145,178,0.06)':'#f8fafc',
      border:hasHumid?'rgba(8,145,178,0.18)':'rgba(0,0,0,0.04)',
    },
    {
      key:'lock', label:'Door Lock',
      node:(<><IconLock size={20} locked={v.locked}/><span style={{fontSize:10,fontWeight:800,marginTop:3,color:v.locked?'#7c3aed':'#16a34a'}}>{v.locked?'Locked':'Open'}</span></>),
      bg:v.locked?'rgba(124,58,237,0.06)':'rgba(22,163,74,0.06)',
      border:v.locked?'rgba(124,58,237,0.18)':'rgba(22,163,74,0.18)',
    },
    {
      key:'extpower', label:'Ext. Power',
      node:(<><IconPower size={19} color={ep>0?(ep>12?'#16a34a':'#ca8a04'):'#d1d5db'}/><span style={{fontSize:10,fontWeight:800,fontFamily:'monospace',marginTop:3,color:ep>0?(ep>12?'#16a34a':'#ca8a04'):'#d1d5db'}}>{ep>0?`${ep.toFixed(1)}V`:'--'}</span></>),
      bg:ep>0?(ep>12?'rgba(22,163,74,0.06)':'rgba(202,138,4,0.06)'):'#f8fafc',
      border:ep>0?(ep>12?'rgba(22,163,74,0.18)':'rgba(202,138,4,0.18)'):'rgba(0,0,0,0.04)',
    },
    ...(driver?[{
      key:'driver', label:'Driver',
      node:(
        <div style={{display:'flex',alignItems:'center',gap:6,width:'100%',justifyContent:'center'}}>
          <div style={{width:26,height:26,borderRadius:'50%',background:`${themeColor}20`,border:`1.5px solid ${themeColor}40`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{fontSize:12,fontWeight:800,color:themeColor}}>{driver.charAt(0).toUpperCase()}</span>
          </div>
          <span style={{fontSize:12,fontWeight:700,color:'#374151'}}>{driver}</span>
          {poi&&(
            <div style={{display:'flex',alignItems:'center',gap:3,marginLeft:6}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style={{fontSize:10,color:'#64748b',maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{poi}</span>
            </div>
          )}
        </div>
      ),
      bg:`${themeColor}08`, border:`${themeColor}20`, wide:true,
    }]:[]),
  ];

  const totalCells = isEmpty ? 9 : dataCells.length;
  const gridRows   = Math.ceil(totalCells / 3);

  return (
    <div style={{ background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'var(--r)', overflow:'hidden', boxShadow:'var(--shadow-sm)', animation:'fadeUp 0.35s ease 0.15s both', display:'flex', flexDirection:'column' }}>
      {/* ── Header ── */}
      <div style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border-soft)', padding:'9px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {isEmpty ? (
            <>
              <div style={{ width:90, height:13, borderRadius:3, background:'#e2e8f0' }} />
              <div style={{ width:52, height:13, borderRadius:3, background:'#f1f5f9' }} />
            </>
          ) : (
            <>
              <span style={{ fontSize:13, fontWeight:900, color:'#0f172a', fontFamily:'DM Mono, monospace', letterSpacing:'-0.2px', marginLeft:4 }}>{displayName}</span>
              <span style={{ fontSize:8, fontWeight:800, color:'#fff', background:col, padding:'2px 7px', borderRadius:3, textTransform:'uppercase', letterSpacing:'0.05em' }}>{state}</span>
              <span style={{ fontSize:8, fontWeight:800, textTransform:'capitalize', color:'#fff', background:'#334155', padding:'2px 7px', borderRadius:3 }}>{vType}</span>
              {branch&&<span style={{ fontSize:8, fontWeight:600, color:'#64748b', background:'#f1f5f9', border:'1px solid #e2e8f0', padding:'2px 7px', borderRadius:3 }}>{branch}</span>}
            </>
          )}
        </div>
        {!isEmpty && (
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:3, background:ignOn?'#dcfce7':'#fee2e2', border:`1px solid ${ignOn?'#86efac':'#fca5a5'}` }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:ignOn?'#16a34a':'#dc2626', boxShadow:ignOn?'0 0 4px #16a34a80':'none' }} />
              <span style={{ fontSize:8, fontWeight:800, color:ignOn?'#15803d':'#991b1b' }}>{ignOn?'IGN ON':'IGN OFF'}</span>
            </div>
            {isMoving&&(
              <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, color:col }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:col, animation:'liveRing 1.5s ease-in-out infinite' }} />
                LIVE
              </div>
            )}
          </div>
        )}
        {isEmpty && (
          <div style={{ width:70, height:22, borderRadius:3, background:'#f1f5f9', border:'1px solid #e2e8f0' }} />
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ display:'flex', flex:1, minHeight:0 }}>
        {/* Left - vehicle image / placeholder */}
        <div style={{ width:'50%', flexShrink:0, display:'flex', flexDirection:'column', borderRight:'1px solid var(--border-soft)', background:'#fafbfc', position:'relative', overflow:'hidden' }}>
          {!isEmpty && isMoving && (
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)', width:'80%', height:'80%', borderRadius:'50%', background:`radial-gradient(circle, ${col}18 0%, transparent 70%)`, animation:'liveRing 2s ease-in-out infinite', pointerEvents:'none' }} />
          )}
          {isEmpty ? (
            <ContainerPlaceholder
              themeColor={themeColor}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="1.5" strokeLinecap="round">
                  <rect x="1" y="3" width="15" height="13" rx="2"/>
                  <path d="M16 8h4l3 3v5h-7V8z"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/>
                  <circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
              }
              title="Vehicle Profile"
              subtitle={<>Choose <strong style={{color:'#374151'}}>Dealer → User → Vehicle</strong> from the selectors above, set your date range and click <strong style={{color:themeColor}}>Load Analytics</strong></>}
            />
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', zIndex:1, minHeight:0 }}>
              <img src={getVehicleImage(vType)} alt={vType} style={{ width:'100%', height:'100%', objectFit:'contain', objectPosition:'center', display:'block', padding:'14px 10px', filter:'drop-shadow(0 12px 28px rgba(0,0,0,0.16))' }} onError={e=>{e.currentTarget.style.display='none';}} />
            </div>
          )}
        </div>

        {/* Right - data grid / skeleton */}
        <div style={{ width:'50%', display:'flex', flexDirection:'column', padding:'10px', boxSizing:'border-box' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gridTemplateRows:`repeat(${gridRows}, 1fr)`, gap:7, flex:1 }}>
            {isEmpty
              ? Array(9).fill(0).map((_, i) => <SkeletonCell key={i} />)
              : dataCells.map((cell) => (
                  <div key={cell.key} style={{ background:cell.bg||'#f8fafc', border:`1px solid ${cell.border||'rgba(0,0,0,0.06)'}`, borderRadius:4, padding:'8px 5px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, minHeight:0, boxSizing:'border-box', ...(cell.wide?{gridColumn:'span 2'}:{}) }}>
                    {cell.node}
                    <span style={{ fontSize:8, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center', lineHeight:1.2, marginTop:2 }}>{cell.label}</span>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* ── Footer - address ── */}
      <div style={{ width:'100%', padding:'9px 16px', background:'rgba(248,250,252,0.97)', borderTop:'1px solid var(--border-soft)', display:'flex', alignItems:'center', justifyContent:'flex-start', gap:7, flexShrink:0, zIndex:2, boxSizing:'border-box' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isEmpty?'#d1d5db':'#dc2626'} strokeWidth="2" style={{ flexShrink:0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        {isEmpty ? (
          <div style={{ width:220, height:10, borderRadius:3, background:'#e2e8f0' }} />
        ) : (
          <div style={{ fontSize:12, fontWeight:600, lineHeight:1.5, color:'#374151', textAlign:'left', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
            {address||(v.lat&&v.lng?`${Number(v.lat).toFixed(5)}, ${Number(v.lng).toFixed(5)}`:'Location unavailable')}
          </div>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SpeedTimelineCard
// ─────────────────────────────────────────────────────────────────────────────
const SpeedTimelineCard = memo(({ vehicleId, themeColor = THEME, apiBase, getToken, dateRange, triggerFetch, cachedPts, onPtsCached }) => {
  const canvasRef  = useRef(null);
  const sliderRef  = useRef(null);
  const zoomRef    = useRef([0, 1]);
  const hoverXRef  = useRef(null);
  const dragState  = useRef(null);
  const rafRef     = useRef(null);
  const abortRef   = useRef(null);

  const [zoomWindow, setZoomWindow] = useState([0, 1]);
  const [pts,        setPts]        = useState(() => cachedPts || []);
  const [loading,    setLoading]    = useState(false);
  const [fetched,    setFetched]    = useState(() => !!(cachedPts && cachedPts.length > 0));
  const [fetchErr,   setFetchErr]   = useState('');

  const OVERSPEED = 60, ZERO_SPEED = 2, Y_STEP = 10, CHART_H = 420;
  const MAX_SPEED = pts.length > 0
    ? Math.ceil(pts.reduce((max, p) => p.y > max ? p.y : max, 120) / 20) * 20
    : 120;

  useEffect(() => {
    if (triggerFetch <= 0 || !vehicleId || !dateRange?.start || !dateRange?.end) return;

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setFetched(false);
    setFetchErr('');
    setPts([]);
    setZoomWindow([0, 1]);
    zoomRef.current = [0, 1];

    const startISO = dateRange.start.toISOString();
    const endISO   = dateRange.end.toISOString();

    fetchGraphData(apiBase, vehicleId, startISO, endISO, getToken, ctrl.signal)
      .then(json => {
        if (ctrl.signal.aborted) return;
        if (json.success && Array.isArray(json.data)) {
          const parsed = json.data
            .filter(p => Array.isArray(p) && p[0] != null)
            .map(([t, s]) => ({ x: Number(t), y: Math.min(Math.max(0, Number(s) || 0), MAX_SPEED) }))
            .sort((a, b) => a.x - b.x);
          setPts(parsed);
          if (onPtsCached) onPtsCached(parsed); // cache mein save karo
        } else {
          setPts([]);
        }
        setFetched(true);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setFetchErr(err.message || 'Graph fetch failed');
        setFetched(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [triggerFetch, vehicleId, dateRange?.start?.getTime(), dateRange?.end?.getTime(), apiBase, getToken]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const minT = pts.length ? pts[0].x : 0;
  const maxT = pts.length ? pts[pts.length - 1].x : 1;

  useEffect(() => { zoomRef.current = zoomWindow; }, [zoomWindow]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const PAD_L = 52, PAD_R = 20, PAD_T = 20, PAD_B = 48, cW = W - PAD_L - PAD_R, cH = H - PAD_T - PAD_B;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (!fetched || !pts.length) return;
    const [z0, z1] = zoomRef.current;
    const vMin = minT + (maxT - minT) * z0;
    const vMax = minT + (maxT - minT) * z1;
    const tRange = vMax - vMin || 1;
    const BUFFER = tRange * 0.005;
    const visPts = pts.filter(p => p.x >= vMin - BUFFER && p.x <= vMax + BUFFER);
    if (!visPts.length) return;
    const toX = t => PAD_L + ((t - vMin) / tRange) * cW;
    const toY = spd => PAD_T + cH - Math.max(0, Math.min(1, spd / MAX_SPEED)) * cH;
    ctx.fillStyle = 'rgba(16,185,129,0.025)'; ctx.fillRect(PAD_L, toY(OVERSPEED), cW, toY(0) - toY(OVERSPEED));
    ctx.fillStyle = 'rgba(234,88,12,0.035)';  ctx.fillRect(PAD_L, PAD_T, cW, toY(OVERSPEED) - PAD_T);
    for (let s = 0; s <= MAX_SPEED; s += Y_STEP) {
      const y = toY(s), isMajor = s % 20 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.03)';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + cW, y); ctx.stroke();
      if (isMajor || s % 10 === 0) {
        ctx.fillStyle = s === 0 ? '#64748b' : '#94a3b8';
        ctx.font = `${isMajor ? 'bold ' : ''}9px DM Mono, monospace`;
        ctx.textAlign = 'right'; ctx.fillText(s, PAD_L - 6, y + 3.5);
      }
    }
    ctx.save(); ctx.translate(13, PAD_T + cH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px DM Sans, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('km / h', 0, 0); ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD_L, PAD_T); ctx.lineTo(PAD_L, PAD_T + cH + 4); ctx.stroke();
    const ovY = toY(OVERSPEED);
    ctx.strokeStyle = 'rgba(234,88,12,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(PAD_L, ovY); ctx.lineTo(PAD_L + cW, ovY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(234,88,12,0.65)'; ctx.font = '8.5px DM Sans, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('60 km/h  overspeed', PAD_L + 5, ovY - 4);
    const ONE_SEC=1000,ONE_MIN=60000,ONE_HR=3600000,ONE_DAY=86400000,ONE_MON=ONE_DAY*30;
    const maxTicks = Math.max(4, Math.floor(cW / 70));
    const intervals = [ONE_SEC,2*ONE_SEC,5*ONE_SEC,10*ONE_SEC,15*ONE_SEC,30*ONE_SEC,ONE_MIN,2*ONE_MIN,5*ONE_MIN,10*ONE_MIN,15*ONE_MIN,30*ONE_MIN,ONE_HR,2*ONE_HR,3*ONE_HR,6*ONE_HR,12*ONE_HR,ONE_DAY,2*ONE_DAY,7*ONE_DAY,ONE_MON];
    const tickInterval = intervals.find(iv => Math.floor(tRange / iv) <= maxTicks) || ONE_MON;
    const firstTick = Math.ceil(vMin / tickInterval) * tickInterval;
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
    for (let t = firstTick; t <= vMax + tickInterval; t += tickInterval) {
      const x = toX(t); if (x < PAD_L - 1 || x > PAD_L + cW + 1) continue;
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + cH + 4); ctx.stroke();
      const d = new Date(t); let lbl;
      if (tickInterval < ONE_MIN) lbl = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
      else if (tickInterval < ONE_DAY) lbl = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      else lbl = d.toLocaleDateString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short' });
      ctx.fillStyle = '#94a3b8'; ctx.font = '9px DM Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(lbl, x, PAD_T + cH + 15);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD_L, PAD_T + cH); ctx.lineTo(PAD_L + cW, PAD_T + cH); ctx.stroke();
    const decimatePts = (points) => {
      if (points.length <= 2) return points;
      const buckets = new Map();
      points.forEach(p => {
        const col = Math.round(toX(p.x));
        if (!buckets.has(col)) buckets.set(col, []);
        buckets.get(col).push(p);
      });
      const result = [];
      [...buckets.keys()].sort((a, b) => a - b).forEach(col => {
        const bpts = buckets.get(col);
        if (bpts.length === 1) { result.push(bpts[0]); return; }
        result.push(bpts[0]);
        const minPt = bpts.reduce((a, b) => a.y < b.y ? a : b);
        const maxPt = bpts.reduce((a, b) => a.y > b.y ? a : b);
        if (minPt !== bpts[0] && minPt !== bpts[bpts.length-1]) result.push(minPt);
        if (maxPt !== bpts[0] && maxPt !== bpts[bpts.length-1] && maxPt !== minPt) result.push(maxPt);
        if (bpts[bpts.length-1] !== bpts[0]) result.push(bpts[bpts.length-1]);
      });
      return result.sort((a, b) => a.x - b.x);
    };
    const displayPts = decimatePts(visPts);
    const getType = spd => { if (spd <= ZERO_SPEED) return 'stopped'; if (spd > OVERSPEED) return 'over'; return 'normal'; };
    const SEG_COLORS = {
      normal:  { line: themeColor,  fill: `${themeColor}22` },
      over:    { line: '#f59e0b',   fill: 'rgba(245,158,11,0.15)' },
      stopped: { line: '#ef4444',   fill: 'rgba(239,68,68,0.12)' },
    };
    const segments = [];
    if (displayPts.length > 0) {
      let cur = { type: getType(displayPts[0].y), pts: [displayPts[0]] };
      for (let i = 1; i < displayPts.length; i++) {
        const t = getType(displayPts[i].y);
        if (t === cur.type) { cur.pts.push(displayPts[i]); }
        else { cur.pts.push(displayPts[i]); segments.push(cur); cur = { type: t, pts: [displayPts[i-1], displayPts[i]] }; }
      }
      segments.push(cur);
    }
    segments.forEach(seg => {
      if (!seg.pts.length) return;
      const col = SEG_COLORS[seg.type];
      ctx.beginPath();
      if (seg.pts.length === 1) {
        const x = toX(seg.pts[0].x), y = toY(seg.pts[0].y);
        ctx.rect(x - 1, y, 2, PAD_T + cH - y);
      } else {
        seg.pts.forEach((p, i) => { const x = toX(p.x), y = toY(p.y); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.lineTo(toX(seg.pts[seg.pts.length-1].x), PAD_T + cH);
        ctx.lineTo(toX(seg.pts[0].x), PAD_T + cH); ctx.closePath();
      }
      ctx.fillStyle = col.fill; ctx.fill();
    });
    segments.forEach(seg => {
      const col = SEG_COLORS[seg.type], lineW = seg.type === 'normal' ? 2 : 2.2;
      if (seg.pts.length === 1) {
        const x = toX(seg.pts[0].x), y = toY(seg.pts[0].y);
        ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, lineW), 0, Math.PI * 2);
        ctx.fillStyle = col.line; ctx.fill(); return;
      }
      ctx.beginPath();
      seg.pts.forEach((p, i) => { const x = toX(p.x), y = toY(p.y); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.strokeStyle = col.line; ctx.lineWidth = lineW; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    });
    const pxPerPt = cW / Math.max(visPts.length, 1);
    if (pxPerPt >= 3) {
      visPts.forEach(p => {
        if (p.y <= OVERSPEED) return;
        ctx.beginPath(); ctx.arc(toX(p.x), toY(p.y), 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b'; ctx.fill();
      });
    }
    ctx.fillStyle = 'rgba(148,163,184,0.7)'; ctx.font = '8px DM Mono, monospace'; ctx.textAlign = 'right';
    ctx.fillText(`${visPts.length.toLocaleString()} pts visible / ${pts.length.toLocaleString()} total`, PAD_L + cW - 4, PAD_T + 12);
    const hx = hoverXRef.current;
    if (hx !== null && hx >= PAD_L && hx <= PAD_L + cW) {
      let nearest = null, minDist = Infinity;
      displayPts.forEach(p => { const d = Math.abs(toX(p.x) - hx); if (d < minDist) { minDist = d; nearest = p; } });
      if (nearest && minDist < 80) {
        const nx = toX(nearest.x), ny = toY(nearest.y), typ = getType(nearest.y), dotColor = SEG_COLORS[typ].line;
        ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(nx, PAD_T); ctx.lineTo(nx, PAD_T + cH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(PAD_L, ny); ctx.lineTo(PAD_L + cW, ny); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(nx, ny, 6, 0, Math.PI * 2); ctx.fillStyle = dotColor + '30'; ctx.fill();
        ctx.beginPath(); ctx.arc(nx, ny, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fillStyle = dotColor; ctx.fill();
        const d = new Date(nearest.x);
        const timeStr = d.toLocaleTimeString('en-IN', { timeZone:'Asia/Kolkata', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
        const dateStr = d.toLocaleDateString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric' });
        const spdTxt = nearest.y <= ZERO_SPEED ? 'Stopped (0 km/h)' : `${nearest.y.toFixed(1)} km/h`;
        const stLabel = typ === 'stopped' ? ' Stopped' : typ === 'over' ? ' Overspeed' : ' Normal';
        ctx.font = '10px DM Mono, monospace';
        const tw = Math.max(ctx.measureText(`${dateStr}  ${timeStr}`).width, ctx.measureText(spdTxt).width, ctx.measureText(stLabel).width);
        const bw = tw + 20, bh = 62;
        let bx = nx + 12, by = Math.max(PAD_T + 4, ny - bh / 2);
        if (bx + bw > PAD_L + cW) bx = nx - bw - 12;
        if (by + bh > PAD_T + cH) by = PAD_T + cH - bh;
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        if (ctx.roundRect) ctx.roundRect(bx+2, by+2, bw, bh, 5); else ctx.rect(bx+2, by+2, bw, bh); ctx.fill();
        ctx.fillStyle = 'rgba(15,23,42,0.94)';
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 5); else ctx.rect(bx, by, bw, bh); ctx.fill();
        ctx.fillStyle = dotColor; ctx.fillRect(bx, by + 4, 3, bh - 8);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8'; ctx.font = '9px DM Mono, monospace'; ctx.fillText(dateStr, bx+10, by+14);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText(timeStr, bx+10, by+25);
        ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 11px DM Mono, monospace'; ctx.fillText(spdTxt, bx+10, by+40);
        ctx.fillStyle = dotColor; ctx.font = '9px DM Sans, sans-serif'; ctx.fillText(stLabel, bx+10, by+54);
      }
    }
  }, [pts, fetched, loading, themeColor, zoomWindow, minT, maxT]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => { scheduleDraw(); }, [scheduleDraw]);

  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleDraw());
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(), PAD_L = 52, PAD_R = 20, cW = rect.width - PAD_L - PAD_R;
    const mxRel = e.clientX - rect.left - PAD_L, pivot = Math.max(0, Math.min(1, mxRel / cW));
    const delta = e.deltaY > 0 ? 1.18 : 0.84;
    setZoomWindow(([z0, z1]) => {
      const w = z1 - z0, newW = Math.max(0.000001, Math.min(1, w * delta));
      const anchor = z0 + w * pivot, newZ0 = Math.max(0, anchor - newW * pivot), newZ1 = Math.min(1, newZ0 + newW);
      return [newZ0, newZ1 > newZ0 + 0.000001 ? newZ1 : newZ0 + 0.000001];
    });
  }, []);

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleChartMouseDown = useCallback((e) => {
    if (e.button !== 0) return; e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragState.current = { type:'chartPan', startX:e.clientX, startZoom:[...zoomRef.current], width:rect.width-52-20 };
  }, []);

  const handleChartMouseMove = useCallback((e) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    hoverXRef.current = e.clientX - rect.left;
    if (dragState.current?.type === 'chartPan') {
      const dx = (e.clientX - dragState.current.startX) / dragState.current.width;
      const [z0, z1] = dragState.current.startZoom, w = z1 - z0;
      const newZ0 = Math.max(0, Math.min(1 - w, z0 - dx)), next = [newZ0, newZ0 + w];
      setZoomWindow(next); zoomRef.current = next;
    } else { scheduleDraw(); }
  }, [scheduleDraw]);

  const handleChartMouseUp    = useCallback(() => { dragState.current = null; }, []);
  const handleChartMouseLeave = useCallback(() => { hoverXRef.current = null; dragState.current = null; scheduleDraw(); }, [scheduleDraw]);

  const getSliderRatio = e => {
    const rect = sliderRef.current?.getBoundingClientRect(); if (!rect) return 0;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
  };
  const onSliderDown = (e, part) => { e.preventDefault(); e.stopPropagation(); dragState.current = { type:part, startX:getSliderRatio(e), startZoom:[...zoomRef.current] }; };

  useEffect(() => {
    const onMove = e => {
      const ds = dragState.current; if (!ds || ds.type === 'chartPan') return;
      const x = getSliderRatio(e), dx = x - ds.startX;
      let [s, en] = ds.startZoom; const MIN_W = 0.000001;
      if (ds.type === 'left')  s  = Math.max(0, Math.min(en - MIN_W, s + dx));
      if (ds.type === 'right') en = Math.min(1, Math.max(s + MIN_W, en + dx));
      if (ds.type === 'pan')   { const w = en - s; s = Math.max(0, Math.min(1 - w, s + dx)); en = s + w; }
      const next = [s, en]; setZoomWindow(next); zoomRef.current = next;
    };
    const onUp = () => { if (dragState.current?.type !== 'chartPan') dragState.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  const [z0, z1] = zoomWindow;
  const visMinT = minT + (maxT - minT) * z0, visMaxT = minT + (maxT - minT) * z1;
  const zoomPct = Math.max(0.001, (z1 - z0) * 100);
  const zoomLabel = zoomPct < 0.1 ? zoomPct.toFixed(3) + '%' : zoomPct < 1 ? zoomPct.toFixed(2) + '%' : Math.round(zoomPct) + '%';
  const fmtTs = ms => {
    const d = new Date(ms), range = visMaxT - visMinT;
    if (range < 60000) return d.toLocaleString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    return d.toLocaleString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
  };

  // No vehicle selected — show placeholder with full card structure
  const showNoVehicle = !vehicleId && triggerFetch === 0;

  return (
    <div style={{ background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'var(--r)', boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column', overflow:'hidden', animation:'fadeUp 0.35s ease 0.15s both', width:'100%' }}>
      {/* ── Header ── */}
      <div style={{ padding:'10px 16px', background:'var(--surface-2)', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>Speed vs Time Graph</span>
          {loading && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:10, height:10, border:`2px solid ${themeColor}30`, borderTopColor:themeColor, borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
              <span style={{ fontSize:10, fontWeight:700, color:themeColor }}>Loading graph…</span>
            </div>
          )}
          {fetched && pts.length > 0 && !loading && (
            <span style={{ fontSize:10, fontWeight:700, color:themeColor, background:themeColor+'12', border:`1px solid ${themeColor}25`, padding:'1px 7px', borderRadius:3 }}>
              {pts.length.toLocaleString()} data points
            </span>
          )}
        </div>
        {fetched && pts.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:5, marginLeft:'auto' }}>
            {[{label:'Normal',color:themeColor},{label:'Overspeed',color:'#f59e0b'},{label:'Stopped',color:'#ef4444'}].map(({color,label})=>(
              <span key={label} style={{ display:'flex', alignItems:'center', gap:3, fontSize:9, color:'#94a3b8' }}>
                <span style={{ width:8, height:3, background:color, borderRadius:1, display:'inline-block' }} />{label}
              </span>
            ))}
            <div style={{ width:1, height:18, background:'#e2e8f0', margin:'0 4px' }} />
            <button onClick={()=>setZoomWindow(([z0,z1])=>{const c=(z0+z1)/2,w=(z1-z0)*0.5;return[Math.max(0,c-w),Math.min(1,c+w)];})} style={{ width:26,height:26,border:'1px solid #e2e8f0',borderRadius:4,background:'#fff',cursor:'pointer',fontSize:16,fontWeight:700,color:'#374151',display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
            <span style={{ fontSize:10,fontWeight:700,color:'#94a3b8',minWidth:46,textAlign:'center' }}>{zoomLabel}</span>
            <button onClick={()=>setZoomWindow(([z0,z1])=>{const c=(z0+z1)/2,w=Math.min(0.5,(z1-z0)*2);return[Math.max(0,c-w),Math.min(1,c+w)];})} style={{ width:26,height:26,border:'1px solid #e2e8f0',borderRadius:4,background:'#fff',cursor:'pointer',fontSize:16,fontWeight:700,color:'#374151',display:'flex',alignItems:'center',justifyContent:'center' }}>−</button>
            {zoomPct < 99 && <button onClick={()=>{setZoomWindow([0,1]);zoomRef.current=[0,1];}} style={{ height:26,padding:'0 8px',border:`1px solid ${themeColor}40`,borderRadius:4,background:`${themeColor}10`,cursor:'pointer',fontSize:10,fontWeight:700,color:themeColor,fontFamily:'DM Sans,sans-serif' }}>Reset</button>}
          </div>
        )}
      </div>

      {/* ── Chart area ── */}
      <div style={{ padding:'12px 14px 10px', display:'flex', flexDirection:'column', gap:8 }}>
        {loading && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:CHART_H }}>
            <CardLoader themeColor={themeColor} message="Fetching speed data…" />
          </div>
        )}

        {/* Default state — no vehicle selected OR not yet triggered */}
        {!loading && !fetched && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:CHART_H }}>
            <ContainerPlaceholder
              themeColor={themeColor}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              }
              title="Speed vs Time Graph"
              subtitle={
                vehicleId
                  ? <>Set your date range and click <strong style={{color:themeColor}}>Load Analytics</strong> to render the graph</>
                  : <>Choose <strong style={{color:'#374151'}}>Dealer → User → Vehicle</strong> from the selectors above, set your date range and click <strong style={{color:themeColor}}>Load Analytics</strong></>
              }
            />
          </div>
        )}

        {fetched && !loading && fetchErr && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:CHART_H, flexDirection:'column', gap:10, color:'#dc2626', fontSize:12, fontWeight:600 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
            {fetchErr}
          </div>
        )}
        {fetched && !loading && !fetchErr && pts.length === 0 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:CHART_H, flexDirection:'column', gap:8, color:'#94a3b8' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
            <span style={{ fontSize:13, fontWeight:600 }}>No speed data for this period</span>
          </div>
        )}
        {fetched && !loading && pts.length > 0 && (
          <>
            <div style={{ position:'relative', width:'100%', height:CHART_H, cursor:dragState.current?.type==='chartPan'?'grabbing':'crosshair', borderRadius:4, overflow:'hidden', border:'1px solid rgba(0,0,0,0.04)' }}>
              <div style={{ position:'absolute', top:6, right:8, zIndex:5, fontSize:9, color:'rgba(0,0,0,0.18)', pointerEvents:'none', fontStyle:'italic' }}>scroll to zoom · drag to pan</div>
              <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} onMouseDown={handleChartMouseDown} onMouseMove={handleChartMouseMove} onMouseUp={handleChartMouseUp} onMouseLeave={handleChartMouseLeave} role="img" aria-label="Speed timeline chart" />
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                <span style={{ fontSize:9, color:'#94a3b8', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Overview · {zoomLabel} visible · {pts.length.toLocaleString()} pts</span>
              </div>
              <div ref={sliderRef} style={{ position:'relative', height:34, background:'#f8fafc', borderRadius:5, border:'1px solid #e2e8f0', userSelect:'none', overflow:'hidden' }}>
                <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(pts.length,1)} 120`}>
                  {pts.map((p, i) => {
                    const c = p.y <= 2 ? '#ef444488' : p.y > 60 ? '#f59e0b88' : `${themeColor}88`;
                    return <rect key={i} x={i} y={120 - Math.max(p.y, 1)} width={1.5} height={Math.max(p.y, 1)} fill={c} />;
                  })}
                </svg>
                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${z0*100}%`, background:'rgba(248,250,252,0.75)', pointerEvents:'none' }} />
                <div style={{ position:'absolute', right:0, top:0, bottom:0, width:`${(1-z1)*100}%`, background:'rgba(248,250,252,0.75)', pointerEvents:'none' }} />
                <div style={{ position:'absolute', left:`${z0*100}%`, width:`${Math.max(0.5,(z1-z0)*100)}%`, top:0, bottom:0, background:`${themeColor}10`, border:`1.5px solid ${themeColor}60`, borderRadius:3, cursor:'grab', boxSizing:'border-box' }}
                  onMouseDown={e=>onSliderDown(e,'pan')} onTouchStart={e=>onSliderDown(e,'pan')} />
                <div style={{ position:'absolute', left:`calc(${z0*100}% - 5px)`, top:0, bottom:0, width:10, display:'flex', alignItems:'center', justifyContent:'center', cursor:'ew-resize', zIndex:4 }}
                  onMouseDown={e=>onSliderDown(e,'left')} onTouchStart={e=>onSliderDown(e,'left')}>
                  <div style={{ width:3, height:22, background:themeColor, borderRadius:2, opacity:0.85 }} />
                </div>
                <div style={{ position:'absolute', left:`calc(${z1*100}% - 5px)`, top:0, bottom:0, width:10, display:'flex', alignItems:'center', justifyContent:'center', cursor:'ew-resize', zIndex:4 }}
                  onMouseDown={e=>onSliderDown(e,'right')} onTouchStart={e=>onSliderDown(e,'right')}>
                  <div style={{ width:3, height:22, background:themeColor, borderRadius:2, opacity:0.85 }} />
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:3 }}>
                <span style={{ fontSize:9, color:'#64748b', fontFamily:'DM Mono, monospace' }}>{pts.length ? fmtTs(visMinT) : '--'}</span>
                <span style={{ fontSize:9, color:'#64748b', fontFamily:'DM Mono, monospace' }}>{pts.length ? fmtTs(visMaxT) : '--'}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// VirtualPacketTable
// ─────────────────────────────────────────────────────────────────────────────
const ROW_H      = 36;
const VIEWPORT_H = 390;

const VirtualPacketTable = memo(({ rows, themeColor, apiBase, getToken, onNearBottom, loadingMore }) => {
  const containerRef = useRef(null);
  const [scrollTop,  setScrollTop]  = useState(0);
  const [addresses,  setAddresses]  = useState({});
  const [, forceUpdate] = useState(0); // address update pe re-render
  const resolving    = useRef(new Set());
  const nearBottomFired = useRef(false);

  const OVERSCAN = 10;
  const visStart = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visEnd   = Math.min(rows.length, Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN);

  useEffect(() => {
    if (rows.length === 0) { setAddresses({}); resolving.current.clear(); nearBottomFired.current = false; }
  }, [rows.length === 0]);

  useEffect(() => {
    // Visible rows ke liye resolve karo
    const visibleRows = rows.slice(visStart, visEnd);
    
    visibleRows.forEach(async r => {
      if (!r.lat || !r.lon) return;
      const fk = fineKey(r.lat, r.lon);
      const ck = coarseKey(r.lat, r.lon);

      // Already state mein hai?
      if (addresses[fk]) return;

      // Cache mein already hai — turant set karo
      if (_geocodeCache[fk] || _coarseCache[ck]) {
        const addr = _geocodeCache[fk] || _coarseCache[ck];
        setAddresses(prev => prev[fk] === addr ? prev : { ...prev, [fk]: addr });
        return;
      }

      // Already resolving?
      if (resolving.current.has(fk)) return;
      resolving.current.add(fk);

      const addr = await reverseGeocode(r.lat, r.lon, apiBase, getToken);
      resolving.current.delete(fk);
      if (addr) {
        setAddresses(prev => ({ ...prev, [fk]: addr }));
      }
    });
  }, [visStart, visEnd, rows]);

  // Coarse cache change hone pe visible rows update karo
  useEffect(() => {
    const interval = setInterval(() => {
      const updates = {};
      let hasNew = false;
      // Sirf visible rows check karo
      rows.slice(visStart, visEnd).forEach(r => {
        if (!r.lat || !r.lon) return;
        const fk = fineKey(r.lat, r.lon);
        if (addresses[fk]) return; // already have it
        const addr = getCachedAddress(r.lat, r.lon);
        if (addr) { updates[fk] = addr; hasNew = true; }
      });
      if (hasNew) setAddresses(prev => ({ ...prev, ...updates }));
    }, 200);
    return () => clearInterval(interval);
  }, [visStart, visEnd, rows, addresses]);

  const getAddress = r => {
    if (!r.lat || !r.lon) return '--';
    const fk = fineKey(r.lat, r.lon);
    // State mein hai? → instant
    if (addresses[fk]) return addresses[fk];
    // Multi-level cache check
    const cached = getCachedAddress(r.lat, r.lon);
    if (cached) return cached;
    // Fallback coordinates
    return `${Number(r.lat).toFixed(5)}, ${Number(r.lon).toFixed(5)}`;
  };

  const fmtTsIST = useCallback(iso => {
    if (!iso) return '--';
    return new Date(iso).toLocaleString('en-IN', {
      timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false,
    });
  }, []);

  const handleScroll = useCallback(e => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 400 && !nearBottomFired.current && !loadingMore) {
      nearBottomFired.current = true;
      if (onNearBottom) onNearBottom();
    }
    if (distFromBottom > 800) {
      nearBottomFired.current = false;
    }
  }, [onNearBottom, loadingMore]);

  useEffect(() => {
    if (!loadingMore) nearBottomFired.current = false;
  }, [loadingMore]);

  return (
    <div ref={containerRef} onScroll={handleScroll}
      style={{ overflowY:'auto', overflowX:'auto', height:VIEWPORT_H, position:'relative' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, tableLayout:'fixed', minWidth:900 }}>
        <colgroup>
          <col style={{ width:50  }} />
          <col style={{ width:175 }} />
          <col style={{ width:88  }} />
          <col style={{ width:52  }} />
          <col style={{ width:88  }} />
          <col style={{ width:88  }} />
          <col />
        </colgroup>
        <thead style={{ position:'sticky', top:0, zIndex:2 }}>
          <tr>
            {['#', 'Time (IST)', 'Speed', 'IGN', 'Δ Dist', 'Σ Dist', 'Location / Address'].map(h => (
              <th key={h} style={{ textAlign:'left', padding:'7px 10px', background:'var(--surface-2)', fontSize:9.5, fontWeight:800, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'2px solid var(--border-soft)', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visStart > 0 && (
            <tr><td colSpan={7} style={{ height: visStart * ROW_H, padding:0, border:'none' }} /></tr>
          )}
          {rows.slice(visStart, visEnd).map((row, rel) => {
            const absIdx    = visStart + rel;
            const speed     = Number(row.s || 0);
            const isOver    = speed > 60;
            const isStopped = speed <= 1.5;
            const rowBg     = isOver ? '#fff9f0' : isStopped ? '#fff5f5' : absIdx % 2 === 0 ? '#fafafa' : '#fff';
            const spdColor  = isOver ? '#dc2626' : !isStopped ? '#16a34a' : '#94a3b8';
            const addrText  = getAddress(row);
            const addrKey     = row.lat && row.lon ? fineKey(row.lat, row.lon) : null;
            const cachedNow   = addrKey ? getCachedAddress(row.lat, row.lon) : null;
            const isResolving = addrKey && !addresses[addrKey] && !cachedNow;
            return (
              <tr key={absIdx} style={{ borderBottom:'1px solid #f0f0f4', background:rowBg, height:ROW_H }}>
                <td style={{ padding:'0 10px', color:'#94a3b8', fontSize:9.5, fontWeight:600, userSelect:'none' }}>{(absIdx + 1).toLocaleString()}</td>
                <td style={{ padding:'0 10px', fontFamily:'monospace', fontSize:10, whiteSpace:'nowrap', color:'#374151' }}>
                  {row.t ? fmtTsIST(new Date(row.t).toISOString()) : '--'}
                </td>
                <td style={{ padding:'0 10px', whiteSpace:'nowrap' }}>
                  <span style={{ fontSize:11, fontWeight:800, color:spdColor, fontFamily:'monospace' }}>{speed.toFixed(1)}</span>
                  <span style={{ fontSize:8, fontWeight:600, color:'#94a3b8', marginLeft:2 }}>km/h</span>
                  {isOver && <span style={{ fontSize:9, marginLeft:5, color:'#ea580c', fontWeight:800 }}>⚠</span>}
                </td>
                <td style={{ padding:'0 10px' }}>
                  <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:3, background:row.ign?'#dcfce7':'#f1f5f9', color:row.ign?'#15803d':'#94a3b8', border:`1px solid ${row.ign?'#86efac':'#e2e8f0'}` }}>
                    {row.ign ? 'ON' : 'OFF'}
                  </span>
                </td>
                <td style={{ padding:'0 10px', fontFamily:'monospace', fontSize:10, color:'#374151' }}>
                  +{Number(row.d || 0).toFixed(3)} km
                </td>
                <td style={{ padding:'0 10px', fontFamily:'monospace', fontSize:10, fontWeight:700, color:THEME_GREEN }}>
                  {Number(row.cum || 0).toFixed(3)} km
                </td>
                <td style={{ padding:'0 10px', fontSize:10, color:isResolving?'#94a3b8':'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {isResolving ? (
                    <span style={{ display:'flex', alignItems:'center', gap:5, color:'#94a3b8' }}>
                      <span style={{ width:8, height:8, border:'1.5px solid #d1d5db', borderTopColor:themeColor, borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block', flexShrink:0 }} />
                      Resolving…
                    </span>
                  ) : addrText}
                </td>
              </tr>
            );
          })}
          {visEnd < rows.length && (
            <tr><td colSpan={7} style={{ height:(rows.length - visEnd) * ROW_H, padding:0, border:'none' }} /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PacketLogCard — always visible, shows placeholder when no vehicleId
// ─────────────────────────────────────────────────────────────────────────────
const PacketLogCard = memo(({ vehicleId, themeColor = THEME, apiBase, getToken, dateRange, triggerFetch, cachedRows, onRowsCached }) => {
  const [rows,        setRows]        = useState(() => cachedRows || []);
  const [total,       setTotal]       = useState(null);
  const [curPage,     setCurPage]     = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [error,       setError]       = useState('');
  const [filterSpd,   setFilterSpd]   = useState('all');
  const [fetched,     setFetched]     = useState(() => !!(cachedRows && cachedRows.length > 0));

  const loadingRef      = useRef(false);
  const abortRef        = useRef(null);
  const latestTrigger   = useRef(0);
  const capturedDateRef = useRef({ start: null, end: null });

  const fetchPage = useCallback(async (pageNum, isReset, triggerKey) => {
    if (loadingRef.current) return;
    if (!vehicleId) return;

    const startISO = capturedDateRef.current?.start?.toISOString();
    const endISO   = capturedDateRef.current?.end?.toISOString();
    if (!startISO || !endISO) return;

    loadingRef.current = true;
    if (isReset) setLoading(true);

    try {
      const json = await fetchPacketPage(
        apiBase, vehicleId, startISO, endISO, pageNum, getToken,
        abortRef.current?.signal,
      );

      if (latestTrigger.current !== triggerKey) return;
      if (!json.success) throw new Error(json.message || 'Fetch failed');

      const newRows = Array.isArray(json.data) ? json.data : [];
      const more    = !!json.hasMore;

      if (isReset) {
        setRows(newRows);
        setTotal(json.totalRaw ?? null);
        setFetched(true);
        if (onRowsCached) onRowsCached(newRows);
        // Background mein preload shuru karo — UI block nahi hoga
        setTimeout(() => {
          batchPreloadGeocode(newRows, apiBase, getToken, () => {});
        }, 100);
      } else {
        setRows(prev => {
          const updated = [...prev, ...newRows];
          if (onRowsCached) onRowsCached(updated);
          // Naye rows ka bhi preload
          setTimeout(() => {
            batchPreloadGeocode(newRows, apiBase, getToken, () => {});
          }, 100);
          return updated;
        });
      }

      setCurPage(pageNum);
      setHasMore(more);
      setError('');
      loadingRef.current = false;
      if (isReset) setLoading(false);

      if (more && latestTrigger.current === triggerKey) {
        setTimeout(() => {
          if (latestTrigger.current === triggerKey && !abortRef.current?.signal?.aborted) {
            fetchPage(pageNum + 1, false, triggerKey);
          }
        }, 200);
      }

    } catch (err) {
      loadingRef.current = false;
      if (isReset) setLoading(false);
      if (err.name === 'AbortError') return;
      if (latestTrigger.current !== triggerKey) return;
      setError(err.message || 'Fetch failed');
      setFetched(true);
    }
  }, [vehicleId, apiBase, getToken]);

  useEffect(() => {
    if (triggerFetch <= 0) return;

    capturedDateRef.current = {
      start: dateRange?.start ? new Date(dateRange.start.getTime()) : null,
      end:   dateRange?.end   ? new Date(dateRange.end.getTime())   : null,
    };

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    latestTrigger.current = triggerFetch;
    loadingRef.current = false;

    setRows([]);
    setTotal(null);
    setCurPage(0);
    setHasMore(false);
    setError('');
    setFilterSpd('all');
    setFetched(false);

    fetchPage(1, true, triggerFetch);
  }, [triggerFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNearBottom = useCallback(() => {
    if (!loadingRef.current && hasMore) {
      fetchPage(curPage + 1, false, latestTrigger.current);
    }
  }, [curPage, hasMore, fetchPage]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const displayRows = useMemo(() => {
    if (filterSpd === 'moving')  return rows.filter(r => r.s > 1.5);
    if (filterSpd === 'stopped') return rows.filter(r => r.s <= 1.5);
    if (filterSpd === 'over')    return rows.filter(r => r.s > 60);
    return rows;
  }, [rows, filterSpd]);

const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

 const exportCSV = useCallback(async () => {
    if (!displayRows.length || exporting) return;

    setExporting(true);
    setExportProgress(10);

    const fmtTs = ms => {
      if (!ms) return '--';
      return new Date(ms).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
        year: 'numeric', hour: '2-digit', minute: '2-digit',
        second: '2-digit', hour12: false,
      });
    };

    // Table mein jo already resolve hua hai woh cache mein hai
    // getCachedAddress directly use karo — koi API call nahi
    const getAddr = r => {
      if (!r.lat || !r.lon) return '--';
      const cached = getCachedAddress(r.lat, r.lon);
      if (cached) return cached;
      // Cache mein nahi toh coordinates dikhao
      return `${Number(r.lat).toFixed(5)}, ${Number(r.lon).toFixed(5)}`;
    };

    setExportProgress(40);

    // SheetJS load karo
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');

    setExportProgress(70);

    const wsData = [
      ['Timestamp (IST)', 'Speed (km/h)', 'Ignition', 'Δ Dist (km)', 'Σ Dist (km)', 'Address'],
      ...displayRows.map(r => [
        fmtTs(r.t),
        Number(r.s || 0).toFixed(2),
        r.ign ? 'ON' : 'OFF',
        Number(r.d || 0).toFixed(4),
        Number(r.cum || 0).toFixed(4),
        getAddr(r),
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 24 },
      { wch: 13 },
      { wch: 10 },
      { wch: 13 },
      { wch: 13 },
      { wch: 65 },
    ];

    ['A1','B1','C1','D1','E1','F1'].forEach(cell => {
      if (ws[cell]) {
        ws[cell].s = {
          font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill:      { fgColor: { rgb: '3d1a6e' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
    });

    for (let i = 2; i <= displayRows.length + 1; i++) {
      ['A','B','C','D','E','F'].forEach(col => {
        const cell = `${col}${i}`;
        if (ws[cell]) {
          ws[cell].s = {
            fill: { fgColor: { rgb: i % 2 === 0 ? 'F8F6FF' : 'FFFFFF' } },
            alignment: col === 'F'
              ? { wrapText: true }
              : { horizontal: col === 'A' ? 'left' : 'center' },
          };
        }
      });
    }

    setExportProgress(90);

    XLSX.utils.book_append_sheet(wb, ws, 'Packet Log');

    const fileName = `packet_log_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.xlsx`;
    XLSX.writeFile(wb, fileName);

    setExportProgress(100);
    setTimeout(() => { setExporting(false); setExportProgress(0); }, 600);

  }, [displayRows, exporting]);

  // ── Skeleton table rows for placeholder state ──────────────────────────────
  const SkeletonTable = () => (
    <div style={{ overflow:'hidden' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, tableLayout:'fixed', minWidth:900 }}>
        <colgroup>
          <col style={{ width:50  }} /><col style={{ width:175 }} /><col style={{ width:88  }} />
          <col style={{ width:52  }} /><col style={{ width:88  }} /><col style={{ width:88  }} /><col />
        </colgroup>
        <thead>
          <tr>
            {['#', 'Time (IST)', 'Speed', 'IGN', 'Δ Dist', 'Σ Dist', 'Location / Address'].map(h => (
              <th key={h} style={{ textAlign:'left', padding:'7px 10px', background:'var(--surface-2)', fontSize:9.5, fontWeight:800, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'2px solid var(--border-soft)', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array(8).fill(0).map((_, i) => (
            <tr key={i} style={{ borderBottom:'1px solid #f0f0f4', height:ROW_H, background: i % 2 === 0 ? '#fafafa' : '#fff' }}>
              <td style={{ padding:'0 10px' }}><div style={{ width:18, height:9, borderRadius:2, background:'#e2e8f0' }} /></td>
              <td style={{ padding:'0 10px' }}><div style={{ width:110, height:9, borderRadius:2, background:'#e2e8f0' }} /></td>
              <td style={{ padding:'0 10px' }}><div style={{ width:44, height:9, borderRadius:2, background:'#e2e8f0' }} /></td>
              <td style={{ padding:'0 10px' }}><div style={{ width:28, height:16, borderRadius:3, background:'#f1f5f9' }} /></td>
              <td style={{ padding:'0 10px' }}><div style={{ width:50, height:9, borderRadius:2, background:'#e2e8f0' }} /></td>
              <td style={{ padding:'0 10px' }}><div style={{ width:50, height:9, borderRadius:2, background:'#e2e8f0' }} /></td>
              <td style={{ padding:'0 10px' }}><div style={{ width:'70%', height:9, borderRadius:2, background:'#e2e8f0' }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Overlay instruction */}
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.82)', backdropFilter:'blur(2px)', zIndex:3 }}>
        <ContainerPlaceholder
          themeColor={themeColor}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          }
          title="Vehicle Logs"
          subtitle={
            vehicleId
              ? <>Set your date range and click <strong style={{color:themeColor}}>Load Analytics</strong> to fetch logs</>
              : <>Choose <strong style={{color:'#374151'}}>Dealer → User → Vehicle</strong> from the selectors above, set your date range and click <strong style={{color:themeColor}}>Load Analytics</strong></>
          }
        />
      </div>
    </div>
  );

  return (
    <div style={{ background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'var(--r)', boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column', overflow:'hidden', animation:'fadeUp 0.35s ease 0.2s both', height:'100%' }}>

      {/* ── Header ── */}
      <div style={{ padding:'10px 16px', background:'var(--surface-2)', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>Vehicle Logs</span>

          {fetched && rows.length > 0 && (
            <span style={{ fontSize:10, fontWeight:700, color:themeColor, background:themeColor+'12', border:`1px solid ${themeColor}25`, padding:'1px 7px', borderRadius:3 }}>
              {hasMore ? `${rows.length.toLocaleString()} packets (loading…)` : `${rows.length.toLocaleString()} total packets`}
            </span>
          )}

          {(loading || loadingMore) && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:10, height:10, border:`2px solid ${themeColor}30`, borderTopColor:themeColor, borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
              <span style={{ fontSize:10, fontWeight:700, color:themeColor }}>
                {loading ? 'Loading packets…' : `Loading more… (${rows.length.toLocaleString()} loaded)`}
              </span>
            </div>
          )}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {fetched && rows.length > 0 && (
            <>
              <div style={{ display:'flex', gap:3 }}>
                {[
                  { key:'all',     label:'All' },
                  { key:'moving',  label:'▶ Moving' },
                  { key:'stopped', label:'⏹ Stopped' },
                  { key:'over',    label:'⚠ Overspeed' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setFilterSpd(key)}
                    style={{ height:24, padding:'0 8px', border:`1px solid ${filterSpd===key?themeColor:'#e2e8f0'}`, borderRadius:3, background:filterSpd===key?themeColor:'#fff', color:filterSpd===key?'#fff':'#374151', fontSize:9.5, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={exportCSV} disabled={exporting}
                style={{ height:24, padding:'0 8px', border:`1px solid ${exporting ? THEME+'40' : '#e2e8f0'}`, borderRadius:3, background: exporting ? THEME+'10' : '#fff', color: exporting ? THEME : '#374151', fontSize:9.5, fontWeight:700, cursor: exporting ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', gap:4, minWidth:80, position:'relative', overflow:'hidden' }}>
                {/* Progress bar background */}
                {exporting && (
                  <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${exportProgress}%`, background: THEME+'18', transition:'width 0.3s ease', pointerEvents:'none' }}/>
                )}
                {exporting ? (
                  <>
                    <div style={{ width:8, height:8, border:`1.5px solid ${THEME}40`, borderTopColor:THEME, borderRadius:'50%', animation:'spin 0.7s linear infinite', flexShrink:0 }}/>
                    {exportProgress < 90 ? `Resolving ${exportProgress}%` : exportProgress < 100 ? 'Building…' : 'Saving…'}
                  </>
                ) : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Excel
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Body states ── */}

      {/* Default: no vehicleId or not triggered yet — show skeleton + overlay */}
      {!fetched && !loading && !error && (
        <div style={{ position:'relative', flex:1, minHeight:VIEWPORT_H + 50, overflow:'hidden' }}>
          <SkeletonTable />
        </div>
      )}

      {!fetched && loading && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', minHeight:300 }}>
          <CardLoader themeColor={themeColor} message="Fetching packets…" />
        </div>
      )}

      {error && !loading && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:140, color:'#dc2626', fontSize:12, fontWeight:600, flexDirection:'column', gap:10 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
          {error}
          <button onClick={() => fetchPage(1, true, latestTrigger.current)}
            style={{ padding:'6px 14px', borderRadius:'var(--r)', border:'1.5px solid #dc2626', background:'#fff', color:'#dc2626', cursor:'pointer', fontWeight:700, fontFamily:'inherit' }}>
            Retry
          </button>
        </div>
      )}

      {fetched && rows.length === 0 && !error && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, flexDirection:'column', gap:10 }}>
          {hasMore ? (
            <CardLoader themeColor={themeColor} message="Loading packets…" />
          ) : (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/></svg>
              <span style={{ color:'#94a3b8', fontSize:12, fontWeight:600 }}>No packets found in the selected date range</span>
            </>
          )}
        </div>
      )}

      {fetched && displayRows.length === 0 && rows.length > 0 && !loading && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:80, color:'#94a3b8', fontSize:12, fontWeight:600 }}>
          No packets match the active filter
        </div>
      )}

      {fetched && displayRows.length > 0 && (
        <VirtualPacketTable
          rows={displayRows}
          themeColor={themeColor}
          apiBase={apiBase}
          getToken={getToken}
          onNearBottom={handleNearBottom}
          loadingMore={loadingMore}
        />
      )}

      {fetched && rows.length > 0 && (
        <div style={{ padding:'7px 16px', background:'var(--surface-2)', borderTop:'1px solid var(--border-soft)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginTop:'auto' }}>
          <span style={{ fontSize:9.5, color:'#94a3b8', fontWeight:600 }}>
            Showing <strong style={{ color:'var(--text-primary)' }}>{displayRows.length.toLocaleString()}</strong>
            {filterSpd !== 'all' && ' filtered'} of <strong style={{ color:'var(--text-primary)' }}>{rows.length.toLocaleString()}</strong>
            {hasMore ? ' loaded so far…' : ' total packets'}
          </span>
          {!hasMore && rows.length > 0 && !loading && (
            <span style={{ fontSize:9, color:'#16a34a', fontWeight:700 }}>✓ All packets loaded</span>
          )}
          {hasMore && (
            <span style={{ fontSize:9, color:'#94a3b8', fontStyle:'italic', display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:7, height:7, border:`1.5px solid ${themeColor}30`, borderTopColor:themeColor, borderRadius:'50%', animation:'spin 0.7s linear infinite', display:'inline-block' }} />
              Loading packets…
            </span>
          )}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
const getCSS = (theme) => `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root {
  --bg:#f4f4f8;--surface:#ffffff;--surface-2:#fafafa;--border:#e4e4eb;--border-soft:#ededf3;
  --text-primary:#111118;--text-secondary:#52525e;--text-muted:#9999aa;
  --theme:${theme};--theme-pale:${theme}22;--green:#10b981;--blue:#3b82f6;--purple:#8b5cf6;
  --orange:#f59e0b;--red:#ef4444;
  --shadow-xs:0 1px 2px rgba(0,0,0,0.05);
  --shadow-sm:0 1px 4px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:0 4px 12px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04);--r:3px;
}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text-primary);}
.dash{display:flex;flex-direction:column;min-height:100vh;}
.topbar{
  background:var(--surface);border-bottom:1px solid var(--border);
  padding:10px 20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  position:sticky;top:0;z-index:100;box-shadow:var(--shadow-xs);
}
.tb-selectors{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1;}
.tb-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-left:auto;}
.sel-group{display:flex;flex-direction:column;gap:2px;}
.sel-label{font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;padding-left:2px;}
.sel-wrap{position:relative;height:36px;}
.sel-wrap select{height:36px;padding:0 28px 0 10px;border:1.5px solid var(--border);border-radius:var(--r);background:var(--surface-2);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:var(--text-primary);appearance:none;cursor:pointer;outline:none;min-width:130px;transition:border-color 0.15s;}
.sel-wrap select:hover,.sel-wrap select:focus{border-color:var(--theme);outline:none;box-shadow:0 0 0 2px ${theme}22;}
.sel-wrap select option{background:#fff;color:#111118;}
.sel-wrap select option:checked{background:${theme}!important;color:#fff!important;}
.sel-wrap::after{content:'';position:absolute;right:10px;top:50%;transform:translateY(-50%);border:4px solid transparent;border-top-color:var(--text-muted);pointer-events:none;}
.search-btn{height:36px;padding:0 18px;background:${theme};color:#fff;border:none;border-radius:var(--r);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;transition:filter 0.15s;white-space:nowrap;flex-shrink:0;}
.search-btn:hover:not(:disabled){filter:brightness(1.15);}
.search-btn:disabled{opacity:0.5;cursor:not-allowed;}
.body{padding:18px 20px;flex:1;display:flex;flex-direction:column;gap:14px;}
.profile-activity-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:stretch;}
.global-dt-wrap{display:flex;align-items:center;gap:6px;padding:0 10px;height:36px;border:1.5px solid var(--border);border-radius:var(--r);background:var(--surface-2);}
.global-dt-label{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;white-space:nowrap;}
.global-dt-input{border:none;background:transparent;font-size:11px;font-weight:700;color:var(--text-primary);font-family:'DM Sans',sans-serif;outline:none;cursor:pointer;}
.global-dt-input::-webkit-calendar-picker-indicator{opacity:0.45;cursor:pointer;width:10px;height:10px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
@keyframes liveRing{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.5)}}
@keyframes acSpin{to{transform:rotate(360deg);}}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.5);}50%{box-shadow:0 0 0 5px rgba(16,185,129,0);}}
.loading-state{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:12px;color:var(--theme);}
.spinner{width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--theme);border-radius:50%;animation:spin 0.7s linear infinite;}
input[type=date]::-webkit-calendar-picker-indicator{opacity:0.5;cursor:pointer;}
input[type=time]::-webkit-calendar-picker-indicator{opacity:0.5;cursor:pointer;}
@media(max-width:1100px){.profile-activity-row{grid-template-columns:1fr;}}
@media(max-width:768px){.tb-right{width:100%;}.search-btn{width:100%;justify-content:center;}}
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getToken()    { return localStorage.getItem('token') || localStorage.getItem('fleet_token') || ''; }
function getUserInfo() {
  try {
    for (const k of ['user','fleet_user','authUser']) {
      const r = localStorage.getItem(k);
      if (r) { const u = JSON.parse(r); if (u && (u.username||u.name||u.email)) return u; }
    }
  } catch {}
  return null;
}
function getRole(u) { return ((u?.role)||'').toLowerCase().replace(/[_\s]/g,''); }

// ✅ CORRECT
function buildApiBase() {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  if (/\/api\/?$/.test(raw)) return raw.replace(/\/$/, '');
  return raw.replace(/\/$/, '') + '/api';
}
const API_BASE = buildApiBase();

// ══════════════════════════════════════════════════════════════════
// ANALYTICS SINGLETON STORE — page change pe data persist karta hai
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// ANALYTICS SINGLETON STORE — sirf memory mein, refresh/logout pe clear
// ══════════════════════════════════════════════════════════════════
const _analyticsStore = {
  // Selector state
  selAdmin:  '',
  selDealer: '',
  selUser:   '',
  selVeh:    '',

  // Dropdown lists
  admins:   [],
  dealers:  [],
  users:    [],
  vehicles: [],

  // Analytics results
  kpis:         null,
  tableData:    [],
  liveVehicle:  null,
  resolvedAddr: '',
  searched:     false,
  dateRange:    null,

  // Child component caches
  speedPts:   null,   // SpeedTimelineCard points
  packetRows: [],     // PacketLogCard rows

  // Last fetched vehicle+date key — to detect change
  lastFetchKey: '',

  save(patch) { Object.assign(this, patch); },

  clear() {
    this.selAdmin=''; this.selDealer=''; this.selUser=''; this.selVeh='';
    this.admins=[]; this.dealers=[]; this.users=[]; this.vehicles=[];
    this.kpis=null; this.tableData=[]; this.liveVehicle=null;
    this.resolvedAddr=''; this.searched=false; this.dateRange=null;
    this.speedPts=null; this.packetRows=[];
    this.lastFetchKey='';
  },

  getFetchKey(vehicleId, dateRange) {
    return `${vehicleId}_${dateRange?.start?.getTime()}_${dateRange?.end?.getTime()}`;
  },

  hasValidCache(vehicleId, dateRange) {
    return (
      this.searched &&
      this.lastFetchKey === this.getFetchKey(vehicleId, dateRange) &&
      (this.kpis !== null || this.tableData.length > 0)
    );
  },
};

// Refresh pe clear karo
window.addEventListener('beforeunload', () => _analyticsStore.clear());

// ─── GlobalDateTimePicker ─────────────────────────────────────────────────────
const GlobalDateTimePicker = memo(({ dateRange, onChange }) => {
  const toDateVal = d => { if (!d) return ''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const toTimeVal = d => { if (!d) return ''; return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
  const handleFromDate = e => {
    const base = dateRange.start ? new Date(dateRange.start) : new Date();
    const parts = e.target.value.split('-'); if (parts.length !== 3) return;
    base.setFullYear(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    onChange({ start:new Date(base), end:dateRange.end });
  };
  const handleFromTime = e => {
    const base = dateRange.start ? new Date(dateRange.start) : new Date();
    const [h, m] = e.target.value.split(':');
    base.setHours(parseInt(h)||0, parseInt(m)||0, 0, 0);
    onChange({ start:new Date(base), end:dateRange.end });
  };
  const handleToDate = e => {
    const base = dateRange.end ? new Date(dateRange.end) : new Date();
    const parts = e.target.value.split('-'); if (parts.length !== 3) return;
    base.setFullYear(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    base.setHours(23, 59, 59, 999);
    onChange({ start:dateRange.start, end:new Date(base) });
  };
  const handleToTime = e => {
    const base = dateRange.end ? new Date(dateRange.end) : new Date();
    const [h, m] = e.target.value.split(':');
    base.setHours(parseInt(h)||0, parseInt(m)||0, 59, 999);
    onChange({ start:dateRange.start, end:new Date(base) });
  };
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <div className="global-dt-wrap">
        <span className="global-dt-label">From</span>
        <input type="date" value={toDateVal(dateRange.start)} onChange={handleFromDate} className="global-dt-input" style={{ width:100 }} />
        <input type="time" value={toTimeVal(dateRange.start)} onChange={handleFromTime} className="global-dt-input" style={{ width:54 }} />
      </div>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      <div className="global-dt-wrap">
        <span className="global-dt-label">To</span>
        <input type="date" value={toDateVal(dateRange.end)} min={toDateVal(dateRange.start)} onChange={handleToDate} className="global-dt-input" style={{ width:100 }} />
        <input type="time" value={toTimeVal(dateRange.end)} onChange={handleToTime} className="global-dt-input" style={{ width:54 }} />
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsDashboard — main export
// ─────────────────────────────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const themeCtx   = useTheme();
  const THEME      = themeCtx?.activeColor || '#3d1a6e';
  const userInfo   = useState(() => getUserInfo())[0];
  const role       = getRole(userInfo);
  const isSA       = role === 'superadmin';
  const isAdmin    = role === 'admin';
  const isDealer   = role === 'dealer';
  const isUser     = role === 'user';

  const [admins,   setAdmins]   = useState(() => _analyticsStore.admins);
  const [dealers,  setDealers]  = useState(() => _analyticsStore.dealers);
  const [users,    setUsers]    = useState(() => _analyticsStore.users);
  const [vehicles, setVehicles] = useState(() => _analyticsStore.vehicles);

  const [selAdmin,  setSelAdmin]  = useState(() => _analyticsStore.selAdmin);
  const [selDealer, setSelDealer] = useState(() => _analyticsStore.selDealer);
  const [selUser,   setSelUser]   = useState(() => _analyticsStore.selUser);
  const [selVeh,    setSelVeh]    = useState(() => _analyticsStore.selVeh);

  const [lAdmins,  setLAdmins]  = useState(false);
  const [lDealers, setLDealers] = useState(false);
  const [lUsers,   setLUsers]   = useState(false);
  const [lVeh,     setLVeh]     = useState(false);
  const [loading,  setLoading]  = useState(false);

  const [globalDateRange, setGlobalDateRange] = useState(
    () => _analyticsStore.dateRange || defaultGlobalDateRange()
  );
  // triggerFetch hamesha 0 se start — child components dobara fetch na kare
  const [triggerFetch, setTriggerFetch] = useState(0);

  const [kpis,      setKpis]      = useState(() => _analyticsStore.kpis);
  const [tableData, setTableData] = useState(() => _analyticsStore.tableData);
  const [searched,  setSearched]  = useState(() => _analyticsStore.searched);
  const [error,     setError]     = useState('');

  const [resolvedAddress, setResolvedAddress] = useState(() => _analyticsStore.resolvedAddr);
  const [liveVehicle,     setLiveVehicle]     = useState(() => _analyticsStore.liveVehicle);

  const abortRef        = useRef({});
  const liveIntervalRef = useRef(null);

  // Logout detect karo — token chala gaya matlab logout hua
  useEffect(() => {
    const checkLogout = () => {
      const token = localStorage.getItem('token') ||
                    localStorage.getItem('fleet_token') ||
                    sessionStorage.getItem('token');
      if (!token) _analyticsStore.clear();
    };
    window.addEventListener('storage', checkLogout);
    return () => window.removeEventListener('storage', checkLogout);
  }, []);

// ── Store sync — har state change pe save karo ─────────────────
  useEffect(() => {
    _analyticsStore.save({ selAdmin, selDealer, selUser, selVeh });
  }, [selAdmin, selDealer, selUser, selVeh]);

  useEffect(() => { _analyticsStore.save({ admins });   }, [admins]);
  useEffect(() => { _analyticsStore.save({ dealers });  }, [dealers]);
  useEffect(() => { _analyticsStore.save({ users });    }, [users]);
  useEffect(() => { _analyticsStore.save({ vehicles }); }, [vehicles]);

  useEffect(() => {
    _analyticsStore.save({ kpis, tableData, searched });
  }, [kpis, tableData, searched]);

  useEffect(() => { _analyticsStore.save({ liveVehicle });              }, [liveVehicle]);
  useEffect(() => { _analyticsStore.save({ resolvedAddr: resolvedAddress }); }, [resolvedAddress]);
  useEffect(() => { _analyticsStore.save({ dateRange: globalDateRange }); }, [globalDateRange]);

  useEffect(() => {
    if (!liveVehicle?.lat || !liveVehicle?.lng) { setResolvedAddress(''); return; }
    if (liveVehicle.address && liveVehicle.address.length > 10 && !/^\d+\.\d+,\s*\d+/.test(liveVehicle.address)) {
      setResolvedAddress(liveVehicle.address); return;
    }
    reverseGeocode(liveVehicle.lat, liveVehicle.lng, API_BASE, getToken)
      .then(addr => { if (addr) setResolvedAddress(addr); });
  }, [liveVehicle?.lat, liveVehicle?.lng]);

  const fetchLiveVehicle = useCallback(async (vehicleId, vehicleNumber) => {
    if (!vehicleId && !vehicleNumber) return;
    try {
      const res = await fetch(`${API_BASE}/dashboard/vehicles`, {
        headers: { Authorization: getToken() ? `Bearer ${getToken()}` : '', 'Content-Type':'application/json' },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && Array.isArray(data.data)) {
        const match = data.data.find(v => String(v._id) === String(vehicleId) || v.vehicle === vehicleNumber || v.vehicleNumber === vehicleNumber);
        if (match) setLiveVehicle(match);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    if (!selVeh) { setLiveVehicle(null); return; }
    const vNum = vehicles.find(v => String(v._id) === selVeh)?.vehicleNumber;
    fetchLiveVehicle(selVeh, vNum);
    liveIntervalRef.current = setInterval(() => fetchLiveVehicle(selVeh, vNum), 30000);
    return () => clearInterval(liveIntervalRef.current);
  }, [selVeh, fetchLiveVehicle, vehicles]);

  const apiCall = useCallback(async (key, ep, params = {}) => {
    if (abortRef.current[key]) abortRef.current[key].abort();
    const ctrl = new AbortController();
    abortRef.current[key] = ctrl;
    const url = new URL(`${API_BASE}/analytics${ep}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v); });
    const res = await fetch(url.toString(), {
      headers: { Authorization: getToken() ? `Bearer ${getToken()}` : '', 'Content-Type':'application/json' },
      signal: ctrl.signal,
    });
    delete abortRef.current[key];
    if (!res.ok) { const d = await res.json().catch(() => {}); throw new Error(d?.message || `HTTP ${res.status}`); }
    return res.json();
  }, []);

  // ── Cascade selectors ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSA) return;
    // Store mein already admins hain? Skip fetch
    if (_analyticsStore.admins.length > 0) { setAdmins(_analyticsStore.admins); return; }
    let alive = true; setLAdmins(true);
    apiCall('adm', '/admins').then(r => { if (alive && r.success) setAdmins(r.data || []); }).catch(() => {}).finally(() => { if (alive) setLAdmins(false); });
    return () => { alive = false; };
  }, [apiCall, isSA]);

 useEffect(() => {
    if (isDealer || isUser) return;
    const shouldFetch = isSA ? !!selAdmin : isAdmin ? true : false;
    if (!shouldFetch) { setLDealers(false); return; }

    // Pehli baar mount pe aur selAdmin same ho to cache use karo
    if (
      _analyticsStore.dealers.length > 0 &&
      _analyticsStore.selAdmin === selAdmin &&
      dealers.length === 0
    ) {
      setDealers(_analyticsStore.dealers);
      setLDealers(false);
      return;
    }

    // selAdmin change hua — fresh fetch karo, downstream reset karo
    let alive = true;
    setLDealers(true);
    if (_analyticsStore.selAdmin !== selAdmin) {
      setDealers([]); setSelDealer(''); setSelUser(''); setSelVeh('');
    }
    const p = {}; if (isSA && selAdmin) p.adminId = selAdmin;
    apiCall('dlr', '/dealers', p)
      .then(r => { if (alive && r.success) setDealers(r.data || []); })
      .catch(() => {})
      .finally(() => { if (alive) setLDealers(false); });
    return () => { alive = false; };
  }, [selAdmin, apiCall, isSA, isAdmin, isDealer, isUser]);

  useEffect(() => {
    if (isUser) return;
    const shouldFetch = isSA ? (!!selAdmin && !!selDealer) : isAdmin ? !!selDealer : isDealer ? true : false;
    if (!shouldFetch) { setLUsers(false); return; }

    // Pehli baar mount pe aur selDealer same ho to cache use karo
    if (
      _analyticsStore.users.length > 0 &&
      _analyticsStore.selDealer === selDealer &&
      users.length === 0
    ) {
      setUsers(_analyticsStore.users);
      setLUsers(false);
      return;
    }

    // selDealer change hua — fresh fetch karo
    let alive = true;
    setLUsers(true);
    if (_analyticsStore.selDealer !== selDealer) {
      setUsers([]); setSelUser(''); setSelVeh('');
    }
    const p = {};
    if (selDealer) p.dealerId = selDealer;
    apiCall('usr', '/users', p)
      .then(r => { if (alive && r.success) setUsers(r.data || []); })
      .catch(() => {})
      .finally(() => { if (alive) setLUsers(false); });
    return () => { alive = false; };
  }, [selAdmin, selDealer, apiCall, isSA, isAdmin, isDealer, isUser]);

  useEffect(() => {
    const canLoad = isUser ? true : !!selUser;
    if (!canLoad) { setVehicles([]); setLVeh(false); return; }

    // Pehli baar mount pe aur selUser same ho to cache use karo
    if (
      _analyticsStore.vehicles.length > 0 &&
      _analyticsStore.selUser === selUser &&
      vehicles.length === 0
    ) {
      setVehicles(_analyticsStore.vehicles);
      setLVeh(false);
      return;
    }

    // selUser change hua — fresh fetch karo
    let alive = true;
    setLVeh(true);
    if (_analyticsStore.selUser !== selUser) {
      setVehicles([]); setSelVeh('');
    }
    const p = {};
    if (isUser && userInfo) {
      const uid = userInfo.user_id ?? userInfo.uid ?? userInfo.id ?? null;
      if (uid) p.userId = uid;
    } else if (selUser) {
      p.userId = selUser;
    }
    apiCall('veh', '/vehicles', p)
      .then(r => { if (alive && r.success) setVehicles(r.data || []); })
      .catch(() => {})
      .finally(() => { if (alive) setLVeh(false); });
    return () => { alive = false; };
  }, [selAdmin, selDealer, selUser, apiCall, isSA, isAdmin, isDealer, isUser, userInfo]);

  const canSearch = () => {
    if (isUser)   return !!selVeh;
    if (isDealer) return !!selUser && !!selVeh;
    if (isAdmin)  return !!selDealer && !!selUser && !!selVeh;
    if (isSA)     return !!selAdmin && !!selDealer && !!selUser && !!selVeh;
    return false;
  };

  const buildParams = () => {
    const p = { startDate: globalDateRange.start.toISOString(), endDate: globalDateRange.end.toISOString() };
    if (selVeh) p.vehicleId = selVeh;
    return p;
  };

  const handleSearch = async () => {
    // Cache hit check — same vehicle + same date range
    if (_analyticsStore.hasValidCache(selVeh, globalDateRange)) {
      // Cache se restore karo — koi API call nahi
      setKpis(_analyticsStore.kpis);
      setTableData(_analyticsStore.tableData);
      setSearched(true);
      setError('');
      // triggerFetch nahi badlate — SpeedTimeline & PacketLog dobara fetch nahi karenge
      return;
    }

    // Fresh fetch
    setLoading(true);
    setSearched(true);
    setError('');

    // Child cache clear karo kyunki naya data aa raha hai
    _analyticsStore.save({ speedPts: null, packetRows: [] });

    const p = buildParams();
    try {
      const [kRes, tRes] = await Promise.allSettled([
        apiCall('kpis',  '/kpis',  p),
        apiCall('table', '/table', p),
      ]);
      if (kRes.status === 'fulfilled' && kRes.value.success) {
        setKpis(kRes.value.data);
      } else {
        setKpis(null);
      }
      if (tRes.status === 'fulfilled' && tRes.value.success) {
        setTableData(tRes.value.data || []);
      } else {
        setTableData([]);
      }

      // Fetch key save karo
      _analyticsStore.save({
        lastFetchKey: _analyticsStore.getFetchKey(selVeh, globalDateRange),
      });

      setTriggerFetch(n => n + 1);
    } catch (e) {
      if (e.name !== 'AbortError') setError(`Failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // ── Custom Select — theme-based dropdown ─────────────────────────
  const CustomSelect = ({ value, onChange, disabled, options, placeholder }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
      const handler = (e) => {
        if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selected = options.find(o => String(o.value) === String(value));

    return (
      <div ref={ref} style={{ position: 'relative', height: 36, minWidth: 130 }}>
        <div
          onClick={() => { if (!disabled) setOpen(o => !o); }}
          style={{
            height: 36,
            padding: '0 28px 0 10px',
            border: `1.5px solid ${open ? THEME : '#e4e4eb'}`,
            borderRadius: 3,
            background: disabled ? '#f4f4f8' : '#fafafa',
            fontSize: 13,
            fontWeight: 600,
            color: disabled ? '#9999aa' : '#111118',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            userSelect: 'none',
            boxShadow: open ? `0 0 0 2px ${THEME}22` : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            boxSizing: 'border-box',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selected ? selected.label : <span style={{ color: '#9999aa' }}>{placeholder}</span>}
          </span>
          <svg
            style={{
              position: 'absolute', right: 8, top: '50%',
              transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
              transition: 'transform 0.18s', flexShrink: 0, pointerEvents: 'none',
            }}
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={disabled ? '#d1d5db' : '#9999aa'} strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        {open && !disabled && (
          <div style={{
            position: 'absolute',
            top: 40,
            left: 0,
            minWidth: '100%',
            background: '#fff',
            border: `1.5px solid ${THEME}40`,
            borderRadius: 4,
            boxShadow: `0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px ${THEME}18`,
            zIndex: 9999,
            overflow: 'hidden',
            maxHeight: 240,
            overflowY: 'auto',
          }}>
            {options.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  style={{
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? '#fff' : '#111118',
                    background: isSelected ? THEME : '#fff',
                    borderBottom: idx < options.length - 1 ? '1px solid #f0f0f4' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    transition: 'background 0.1s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.background = `${THEME}15`;
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.background = '#fff';
                  }}
                >
                  {isSelected && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                      stroke="#fff" strokeWidth="3" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                  {opt.label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };


  const selectedVehicleObj = vehicles.find(v => String(v._id) === selVeh);

  const profileVehicleData = liveVehicle ? {
    ...(tableData[0] || {}),
    ...(kpis || {}),
    ...liveVehicle,
    vehicle:       selectedVehicleObj?.vehicleNumber || tableData[0]?.vehicleNumber || liveVehicle?.vehicle,
    vehicleType:   selectedVehicleObj?.vehicleType || selectedVehicleObj?.type || liveVehicle?.vehicleType || liveVehicle?.type || tableData[0]?.vehicleType || 'car',
    state:         liveVehicle?.state || tableData[0]?.state ||
                   (tableData[0]?.status === 'Moving' ? 'running' :
                    tableData[0]?.status === 'Idle' ? 'idle' :
                    tableData[0]?.status === 'Stopped' ? 'stopped' : 'inactive'),
    spd:           safeNum(liveVehicle?.spd ?? liveVehicle?.speed, 0),
    btr:           safeNum(liveVehicle?.btr ?? liveVehicle?.battery, 0),
    gsmRaw:        safeNum(liveVehicle?.gsmRaw ?? liveVehicle?.gsm, 0),
    gpsSatellites: safeNum(liveVehicle?.gpsSatellites ?? liveVehicle?.satellites, 0),
    fixType:       liveVehicle?.fixType || 'No Fix',
    ignition:      liveVehicle?.ignition,
    ac:            liveVehicle?.ac,
    temperature:   liveVehicle?.temperature ?? null,
    humidity:      liveVehicle?.humidity ?? null,
    extPower:      safeNum(liveVehicle?.extPower, 0),
    locked:        liveVehicle?.locked,
    driver:        liveVehicle?.driver || tableData[0]?.driverName || tableData[0]?.driver,
    branch:        liveVehicle?.branch || tableData[0]?.branch,
    address:       liveVehicle?.address || tableData[0]?.address || tableData[0]?.lastAddress,
    poi:           liveVehicle?.poi || tableData[0]?.poi,
    totalDistance: kpis?.totalDistance ?? null,
    totalDuration: kpis?.totalDuration ?? null,
    totalTrips:    kpis?.totalTrips ?? null,
    avgSpeed:      kpis?.avgSpeed ?? null,
  } : null;

  return (
    <div className="dash">
      <style>{getCSS(THEME)}</style>

      {/* ── TOPBAR ── */}
      <div className="topbar">
        <div className="tb-selectors">
          {isSA && (
            <div className="sel-group">
              <span className="sel-label">Admin</span>
              <CustomSelect
                  value={selAdmin}
                  onChange={v => { setSelAdmin(v); setSelDealer(''); setSelUser(''); setSelVeh(''); }}
                  disabled={lAdmins}
                  placeholder={lAdmins ? 'Loading…' : 'Select Admin'}
                  options={[
                    ...admins.map(a => ({ value: a.rawValue, label: a.name }))
                  ]}
                />
            </div>
          )}
          {(isSA || isAdmin) && (
            <div className="sel-group">
              <span className="sel-label">Dealer</span>
              <CustomSelect
                value={selDealer}
                onChange={v => { setSelDealer(v); setSelUser(''); setSelVeh(''); }}
                disabled={lDealers || (isSA && !selAdmin)}
                placeholder={lDealers ? 'Loading…' : 'Select Dealer'}
                options={[
                  ...dealers.map(d => ({ value: d.rawValue, label: d.name }))
                ]}
              />
            </div>
          )}
          {!isUser && (
            <div className="sel-group">
              <span className="sel-label">User</span>
              <CustomSelect
                  value={selUser}
                  onChange={v => { setSelUser(v); setSelVeh(''); }}
                  disabled={lUsers || (isSA && (!selAdmin || !selDealer)) || (isAdmin && !selDealer)}
                  placeholder={lUsers ? 'Loading…' : 'Select User'}
                  options={[
                    ...users.map(u => ({ value: u.rawValue, label: u.name }))
                  ]}
                />
            </div>
          )}
          <div className="sel-group">
            <span className="sel-label">Vehicle</span>
            <CustomSelect
                value={selVeh}
                onChange={v => setSelVeh(v)}
                disabled={lVeh || (!isUser && !selUser) || vehicles.length === 0}
                placeholder={lVeh ? 'Loading…' : 'Select Vehicle'}
                options={[
                  ...vehicles.map(v => ({ value: String(v._id), label: v.vehicleNumber }))
                ]}
              />
          </div>
        </div>

        <div className="tb-right">
          <GlobalDateTimePicker dateRange={globalDateRange} onChange={setGlobalDateRange} />
          <button className="search-btn" onClick={handleSearch} disabled={loading || !canSearch()}>
            {loading
              ? <><div style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>Loading…</>
              : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Load Analytics</>
            }
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="body">

        {loading && (
          <div className="loading-state">
            <div className="spinner"/>
            <span style={{fontWeight:700,fontSize:14}}>Fetching analytics…</span>
          </div>
        )}

        {!loading && error && (
          <div style={{background:'#fff5f5',border:'1px solid #fca5a5',borderRadius:'var(--r)',padding:'20px 24px',color:'#dc2626',fontWeight:700,display:'flex',alignItems:'center',gap:12}}>
            ⚠️ {error}
            <button onClick={handleSearch} style={{padding:'6px 14px',borderRadius:'var(--r)',border:'1.5px solid #dc2626',background:'#fff',color:'#dc2626',cursor:'pointer',fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>Retry</button>
          </div>
        )}

        {/* ── ALWAYS show the 3-panel layout — containers visible from page load ── */}
        {!loading && (
          <>
            {/* Profile Card + Vehicle Logs side by side */}
            <div className="profile-activity-row">
              {/* Left: Vehicle Profile Card — empty skeleton until vehicle selected & loaded */}
              <VehicleProfileCard
                vehicleData={profileVehicleData}
                vehicleNumber={selectedVehicleObj?.vehicleNumber || tableData[0]?.vehicleNumber}
                resolvedAddress={resolvedAddress}
                themeColor={THEME}
              />

              {/* Right: Packet Log — skeleton+overlay until Load Analytics clicked */}
              <PacketLogCard
                vehicleId={selVeh}
                themeColor={THEME}
                apiBase={API_BASE}
                getToken={getToken}
                dateRange={globalDateRange}
                triggerFetch={triggerFetch}
                cachedRows={_analyticsStore.packetRows || []}
                onRowsCached={rows => _analyticsStore.save({ packetRows: rows })}
              />
            </div>

            {/* Speed Graph — always visible with placeholder until Load Analytics */}
            <SpeedTimelineCard
              vehicleId={selVeh}
              themeColor={THEME}
              apiBase={API_BASE}
              getToken={getToken}
              dateRange={globalDateRange}
              triggerFetch={triggerFetch}
              cachedPts={_analyticsStore.speedPts || null}
              onPtsCached={pts => _analyticsStore.save({ speedPts: pts })}
            />
          </>
        )}
      </div>
    </div>
  );
}