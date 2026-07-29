import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBranding } from '../context/BrandingContext';
import Icon from './Icon';
import { getMyCoinsApi } from '../api/auth';

const PAGE_TITLES = {
  dashboard: 'Dashboard', 'advance-dashboard': 'Advance Dashboard',
  'analytics-dashboard': 'Analytics Dashboard', admins: 'Admin Management',
  dealers: 'Dealer Management', users: 'User Management', vehicles: 'Vehicles',
  devices: 'Devices', drivers: 'Drivers', 'live-tracking': 'Live Tracking',
  playback: 'Playback', geofence: 'Geofence', alerts: 'Alerts',
  maintenance: 'Maintenance', fuel: 'Fuel Monitoring', reports: 'Reports',
  'distance-report': 'Distance Report', distance: 'Distance Report',
  'driver-assignment': 'Driver Assignment Report', expense: 'Expense Report',
  'geofence-report': 'Geofence Report', 'idle-summary': 'Idle Summary Report',
  ride: 'Ride Report', sensor: 'Sensor Report',
  'speed-vs-distance': 'Speed vs Distance', status: 'Status Report',
  'stoppage-summary': 'Stoppage Summary Report', 'travel-summary': 'Travel Summary Report',
  'vehicle-log': 'Vehicle Log Report', billing: 'Billing', plans: 'Subscription Plans',
  settings: 'System Settings', 'theme-setting': 'Theme Settings', profile: 'Profile',
  'vehicle-detail': 'Vehicle Detail', 'driver-detail': 'Driver Detail',
  'device-inventory': 'Device Inventory', 'raise-ticket': 'Raise Ticket',
  'answer-tickets': 'Answer Tickets', 'access-management': 'Access Management',
};

const formatReportTitle = s =>
  s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Report';

const getPageTitle = pathname => {
  const segs = pathname.split('/').filter(Boolean);
  if (!segs.length) return 'Dashboard';
  const last = segs[segs.length - 1];
  const parent = segs[segs.length - 2];
  if (parent === 'reports' || last.includes('report'))
    return PAGE_TITLES[last] || formatReportTitle(last);
  return PAGE_TITLES[last] ||
    last.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const useRealTimeClock = () => {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    setT(new Date());
    const id = setInterval(() => setT(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  return t;
};

const useWindowWidth = () => {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
};

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const getToken = () => {
  const keys = ['fleet_token', 'token', 'authToken', 'jwt', 'accessToken', 'auth_token', 'jwtToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v && JWT_PATTERN.test(v)) return v;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const v = localStorage.getItem(localStorage.key(i));
    if (v && JWT_PATTERN.test(v)) return v;
  }
  return null;
};

const syncProfileImageToStorage = (fileUrl) => {
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const u = JSON.parse(raw);
      u.profile_image = fileUrl;
      localStorage.setItem('user', JSON.stringify(u));
    }
  } catch (_) {}
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED FLIPPING COIN — Dono faces par ₹ symbol
// ─────────────────────────────────────────────────────────────────────────────
const FlippingCoin = ({ size = 28, autoLoop = true, loopInterval = 3500 }) => {
  const bodyRef      = useRef(null);
  const timerRef     = useRef([]);
  const runningRef   = useRef(false);
  const isFlippedRef = useRef(false);

  const addTimer = (fn, ms) => { const id = setTimeout(fn, ms); timerRef.current.push(id); return id; };
  const clearAll = () => { timerRef.current.forEach(clearTimeout); timerRef.current = []; };

  const runFlip = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    const body = bodyRef.current;
    if (!body) { runningRef.current = false; return; }
    isFlippedRef.current = !isFlippedRef.current;
    body.style.transition = 'transform 0.55s cubic-bezier(0.4,0,0.6,1)';
    body.style.transform  = isFlippedRef.current ? 'rotateY(180deg)' : 'rotateY(0deg)';
    addTimer(() => { runningRef.current = false; if (autoLoop) addTimer(runFlip, loopInterval); }, 600);
  }, [autoLoop, loopInterval]);

  useEffect(() => { if (autoLoop) addTimer(runFlip, 600); return clearAll; }, [runFlip, autoLoop]);

  const innerSize = Math.round(size * 0.72);
  const shineW    = Math.round(size * 0.22);
  const shineH    = Math.round(size * 0.09);
  const shineTop  = Math.round(size * 0.12);
  const shineLeft = Math.round(size * 0.18);

  const rupeeIcon = (
    <span style={{ fontSize: size * 0.38, fontWeight: 900, color: '#3b1a00', fontFamily: 'system-ui,sans-serif', userSelect: 'none', lineHeight: 1 }}>₹</span>
  );

  const faceInner = (withShine = true) => (
    <div style={{
      width: innerSize, height: innerSize, borderRadius: '50%',
      background: 'radial-gradient(circle at 38% 32%, #fff6a0 0%, #ffd700 36%, #b8860b 78%, #7a5000 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      boxShadow: `inset 0 ${size*0.03}px ${size*0.07}px rgba(255,255,180,0.65), inset 0 -${size*0.03}px ${size*0.07}px rgba(80,40,0,0.55)`,
    }}>
      {withShine && <div style={{ position:'absolute', top:shineTop, left:shineLeft, width:shineW, height:shineH, background:'rgba(255,255,255,0.48)', borderRadius:'50%', transform:'rotate(-25deg)', pointerEvents:'none' }}/>}
      {rupeeIcon}
    </div>
  );

  return (
    <div style={{ width: size, height: size, perspective: size * 3.2, flexShrink: 0 }}>
      <div ref={bodyRef} style={{ width: size, height: size, transformStyle: 'preserve-3d', position: 'relative', willChange: 'transform', transform: 'rotateY(0deg)' }}>
        <div style={{ position:'absolute', inset:0, borderRadius:'50%', backfaceVisibility:'hidden', background:'conic-gradient(#b8860b 0deg,#ffd700 30deg,#daa520 60deg,#ffe066 90deg,#b8860b 120deg,#ffd700 150deg,#daa520 180deg,#ffe066 210deg,#b8860b 240deg,#ffd700 270deg,#daa520 300deg,#ffe066 330deg,#b8860b 360deg)', border:`${Math.max(1.5,size*0.035)}px solid #b8860b`, boxShadow:`inset 0 ${size*0.04}px ${size*0.11}px rgba(255,255,200,0.55),inset 0 -${size*0.04}px ${size*0.11}px rgba(100,60,0,0.45),0 ${size*0.08}px ${size*0.3}px rgba(180,130,0,0.4)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {faceInner(true)}
        </div>
        <div style={{ position:'absolute', inset:0, borderRadius:'50%', backfaceVisibility:'hidden', background:'conic-gradient(#daa520 0deg,#b8860b 30deg,#ffe066 60deg,#b8860b 90deg,#daa520 120deg,#b8860b 150deg,#ffe066 180deg,#b8860b 210deg,#daa520 240deg,#b8860b 270deg,#ffe066 300deg,#b8860b 330deg,#daa520 360deg)', border:`${Math.max(1.5,size*0.035)}px solid #b8860b`, boxShadow:`inset 0 ${size*0.04}px ${size*0.11}px rgba(255,255,200,0.45),inset 0 -${size*0.04}px ${size*0.11}px rgba(100,60,0,0.38)`, display:'flex', alignItems:'center', justifyContent:'center', transform:'rotateY(180deg)' }}>
          <div style={{ width:innerSize, height:innerSize, borderRadius:'50%', background:'radial-gradient(circle at 38% 32%, #fff6a0 0%, #ffd700 36%, #b8860b 78%, #7a5000 100%)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`inset 0 ${size*0.03}px ${size*0.07}px rgba(255,255,180,0.65),inset 0 -${size*0.03}px ${size*0.07}px rgba(80,40,0,0.55)` }}>
            {rupeeIcon}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COIN WIDGET
// ─────────────────────────────────────────────────────────────────────────────
const CoinWidget = ({ onOpen, userRole }) => {
  if (!userRole || (userRole !== 'admin' && userRole !== 'dealer')) return null;
  
  return (
    <>
      <style>{`.cw-btn{width:38px;height:38px;border-radius:8px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.28);display:flex;align-items:center;justify-content:center;cursor:pointer;outline:none;padding:0;transition:background 0.18s,border-color 0.18s,box-shadow 0.18s,transform 0.12s;box-shadow:0 2px 8px rgba(0,0,0,0.18)}.cw-btn:hover{background:rgba(255,255,255,0.22);border-color:rgba(255,255,255,0.55);box-shadow:0 4px 14px rgba(0,0,0,0.28);transform:translateY(-1px)}.cw-btn:active{transform:scale(0.95)}`}</style>
      <button className="cw-btn" onClick={onOpen} title="View coin balance">
        <FlippingCoin size={28} autoLoop loopInterval={3500} />
      </button>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COIN MODAL
// ─────────────────────────────────────────────────────────────────────────────
const CoinModal = ({ open, onClose, onRefresh, fetching, loading, coinData }) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', handler); };
  }, [open, onClose]);

  if (!open) return null;

  const allocated = coinData?.allocated ?? 0;
  const used      = coinData?.used      ?? 0;
  const available = coinData?.available ?? 0;
  const total     = allocated;

  const usedPct  = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const availPct = total > 0 ? Math.min(100, Math.round((available / total) * 100)) : 0;
  const barColor = usedPct > 80 ? 'linear-gradient(90deg,#dc2626,#f87171)' : usedPct > 50 ? 'linear-gradient(90deg,#d97706,#fbbf24)' : 'linear-gradient(90deg,#059669,#34d399)';

  const ModalCoin = () => {
    const bodyRef = useRef(null); const timerRef = useRef([]); const runningRef = useRef(false); const isFlippedRef = useRef(false);
    const addTimer = (fn, ms) => { const id = setTimeout(fn, ms); timerRef.current.push(id); return id; };
    const clearAll = () => { timerRef.current.forEach(clearTimeout); timerRef.current = []; };
    const runFlip = useCallback(() => {
      if (runningRef.current) return; runningRef.current = true;
      const body = bodyRef.current; if (!body) { runningRef.current = false; return; }
      isFlippedRef.current = !isFlippedRef.current;
      body.style.transition = 'transform 0.55s cubic-bezier(0.4,0,0.6,1)';
      body.style.transform = isFlippedRef.current ? 'rotateY(180deg)' : 'rotateY(0deg)';
      addTimer(() => { runningRef.current = false; addTimer(runFlip, 2800); }, 600);
    }, []);
    useEffect(() => { addTimer(runFlip, 600); return clearAll; }, [runFlip]);
    const sz = 72; const inner = Math.round(sz*0.72);
    const face = () => (
      <div style={{ width:inner, height:inner, borderRadius:'50%', background:'radial-gradient(circle at 38% 32%, #fff6a0 0%, #ffd700 36%, #b8860b 78%, #7a5000 100%)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', boxShadow:`inset 0 ${sz*0.03}px ${sz*0.07}px rgba(255,255,180,0.65),inset 0 -${sz*0.03}px ${sz*0.07}px rgba(80,40,0,0.55)` }}>
        <div style={{ position:'absolute', top:Math.round(sz*0.12), left:Math.round(sz*0.18), width:Math.round(sz*0.22), height:Math.round(sz*0.09), background:'rgba(255,255,255,0.48)', borderRadius:'50%', transform:'rotate(-25deg)' }}/>
        <span style={{ fontSize:sz*0.38, fontWeight:900, color:'#3b1a00', fontFamily:'system-ui,sans-serif', userSelect:'none', lineHeight:1 }}>₹</span>
      </div>
    );
    return (
      <div style={{ width:sz, height:sz, perspective:sz*3.2, flexShrink:0 }}>
        <div ref={bodyRef} style={{ width:sz, height:sz, transformStyle:'preserve-3d', position:'relative', willChange:'transform', transform:'rotateY(0deg)' }}>
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', backfaceVisibility:'hidden', background:'conic-gradient(#b8860b 0deg,#ffd700 30deg,#daa520 60deg,#ffe066 90deg,#b8860b 120deg,#ffd700 150deg,#daa520 180deg,#ffe066 210deg,#b8860b 240deg,#ffd700 270deg,#daa520 300deg,#ffe066 330deg,#b8860b 360deg)', border:`${Math.max(1.5,sz*0.035)}px solid #b8860b`, display:'flex', alignItems:'center', justifyContent:'center' }}>{face()}</div>
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', backfaceVisibility:'hidden', background:'conic-gradient(#daa520 0deg,#b8860b 30deg,#ffe066 60deg,#b8860b 90deg,#daa520 120deg,#b8860b 150deg,#ffe066 180deg,#b8860b 210deg,#daa520 240deg,#b8860b 270deg,#ffe066 300deg,#b8860b 330deg,#daa520 360deg)', border:`${Math.max(1.5,sz*0.035)}px solid #b8860b`, display:'flex', alignItems:'center', justifyContent:'center', transform:'rotateY(180deg)' }}>{face()}</div>
        </div>
      </div>
    );
  };

  // ✅ Agar loading hai toh spinner show karo
  if (loading) {
    return ReactDOM.createPortal(
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:2147483640, background:'rgba(2,6,23,0.65)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ background:'#fff', padding:'40px', borderRadius:12, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ width:40, height:40, border:'4px solid #e2e8f0', borderTopColor:'#4338ca', borderRadius:'50%', animation:'__spin 0.7s linear infinite', margin:'0 auto' }}/>
          <p style={{ marginTop:16, color:'#64748b', fontSize:14, fontWeight:600, textAlign:'center' }}>Loading coins...</p>
        </div>
      </div>,
      document.body
    );
  }

  return ReactDOM.createPortal(
    <>
      <style>{`@keyframes __bdIn{from{opacity:0}to{opacity:1}}@keyframes __cdIn{from{opacity:0;transform:translate(-50%,-46%) scale(0.88)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes __spin{to{transform:rotate(360deg)}}@keyframes __shimmer{0%{transform:translateX(-100%) skewX(-15deg)}100%{transform:translateX(260%) skewX(-15deg)}}.__cm2-stat{flex:1;border-radius:3px;padding:12px 8px 10px;display:flex;flex-direction:column;align-items:center;gap:5px;transition:transform 0.16s,box-shadow 0.16s;cursor:default}.__cm2-stat:hover{transform:translateY(-2px);box-shadow:0 4px 14px rgba(0,0,0,0.07)}.__cm2-stat-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center}.__cm2-ref-btn{width:100%;padding:11px 0;border-radius:3px;border:none;cursor:pointer;font-size:13px;font-weight:700;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;box-shadow:0 4px 16px rgba(99,102,241,0.38);display:flex;align-items:center;justify-content:center;gap:8px;transition:transform 0.14s,box-shadow 0.14s,opacity 0.14s;position:relative;overflow:hidden}.__cm2-ref-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.12),transparent);pointer-events:none}.__cm2-ref-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 7px 22px rgba(99,102,241,0.48)}.__cm2-ref-btn:active:not(:disabled){transform:scale(0.98)}.__cm2-ref-btn:disabled{opacity:0.65;cursor:wait}.__cm2-close{position:absolute;top:12px;right:12px;width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(255,255,255,0.7);font-size:12px;font-weight:700;z-index:2;transition:background 0.15s,border-color 0.15s,color 0.15s}.__cm2-close:hover{background:rgba(239,68,68,0.28);border-color:rgba(239,68,68,0.55);color:#fff}.__cm2-spin{width:13px;height:13px;border:2px solid rgba(255,255,255,0.25);border-top-color:#fff;border-radius:50%;animation:__spin 0.7s linear infinite}`}</style>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:2147483640, background:'rgba(2,6,23,0.65)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', animation:'__bdIn 0.18s ease' }}/>
      <div onClick={e=>e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:2147483647, width:340, maxWidth:'calc(100vw - 24px)', background:'#fff', borderRadius:3, boxShadow:'0 32px 80px rgba(0,0,0,0.28),0 0 0 1px rgba(0,0,0,0.05)', overflow:'hidden', animation:'__cdIn 0.28s cubic-bezier(0.34,1.56,0.64,1)', fontFamily:"system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
        <div style={{ position:'relative', background:'linear-gradient(145deg,#1e1b4b 0%,#312e81 45%,#4338ca 100%)', padding:'26px 20px 22px', display:'flex', flexDirection:'column', alignItems:'center', gap:14, overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)', animation:'__shimmer 3.5s ease-in-out infinite', pointerEvents:'none' }}/>
          <button className="__cm2-close" onClick={onClose} aria-label="Close">✕</button>
          <div style={{ position:'relative', zIndex:1 }}>
            <ModalCoin/>
            <div style={{ position:'absolute', bottom:-8, left:'50%', transform:'translateX(-50%)', width:56, height:10, background:'rgba(251,191,36,0.28)', borderRadius:'50%', filter:'blur(6px)', pointerEvents:'none' }}/>
          </div>
          <div style={{ textAlign:'center', position:'relative', zIndex:1 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.5)', letterSpacing:'0.12em', textTransform:'uppercase' }}>Coin Wallet</div>
            <div style={{ marginTop:5 }}>
              <span style={{ fontSize:34, fontWeight:900, color:'#fff', lineHeight:1, letterSpacing:-1 }}>{available.toLocaleString()}</span>
              <span style={{ fontSize:13, fontWeight:500, color:'rgba(255,255,255,0.45)', marginLeft:5 }}>coins</span>
            </div>
          </div>
        </div>
        <div style={{ padding:'18px 20px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', gap:10 }}>
            <div className="__cm2-stat" style={{ background:'#f0fdf4', border:'1.5px solid #bbf7d0' }}>
              <div className="__cm2-stat-icon" style={{ background:'rgba(22,163,74,0.12)' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round"/><polyline points="22 4 12 14.01 9 11.01" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <span style={{ fontSize:18, fontWeight:800, color:'#15803d', lineHeight:1, letterSpacing:-0.5 }}>{available.toLocaleString()}</span>
              <span style={{ fontSize:8.5, fontWeight:700, color:'#16a34a', letterSpacing:'0.08em', textTransform:'uppercase' }}>Available</span>
            </div>
            <div className="__cm2-stat" style={{ background:'#fff7ed', border:'1.5px solid #fed7aa' }}>
              <div className="__cm2-stat-icon" style={{ background:'rgba(217,119,6,0.12)' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#d97706" strokeWidth="2.2"/><path d="M12 6v6l4 2" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round"/></svg></div>
              <span style={{ fontSize:18, fontWeight:800, color:'#b45309', lineHeight:1, letterSpacing:-0.5 }}>{used.toLocaleString()}</span>
              <span style={{ fontSize:8.5, fontWeight:700, color:'#d97706', letterSpacing:'0.08em', textTransform:'uppercase' }}>Used</span>
            </div>
            <div className="__cm2-stat" style={{ background:'#f5f3ff', border:'1.5px solid #ddd6fe' }}>
              <div className="__cm2-stat-icon" style={{ background:'rgba(124,58,237,0.12)' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <span style={{ fontSize:18, fontWeight:800, color:'#6d28d9', lineHeight:1, letterSpacing:-0.5 }}>{total.toLocaleString()}</span>
              <span style={{ fontSize:8.5, fontWeight:700, color:'#7c3aed', letterSpacing:'0.08em', textTransform:'uppercase' }}>Total</span>
            </div>
          </div>
          {total > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:11, fontWeight:600, color:'#64748b' }}>Coin Usage</span>
                <span style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>{usedPct}% used</span>
              </div>
              <div style={{ width:'100%', height:7, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                <div style={{ width:`${usedPct}%`, height:'100%', borderRadius:99, background:barColor, transition:'width 0.6s cubic-bezier(0.34,1.56,0.64,1)' }}/>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:'#10b981', flexShrink:0 }}/>
                <span style={{ fontSize:10, color:'#94a3b8' }}><span style={{ fontWeight:700, color:'#475569' }}>{availPct}%</span> available</span>
                <div style={{ width:1, height:10, background:'#e2e8f0', margin:'0 2px' }}/>
                <div style={{ width:8, height:8, borderRadius:'50%', background:usedPct>80?'#ef4444':usedPct>50?'#f59e0b':'#10b981', flexShrink:0 }}/>
                <span style={{ fontSize:10, color:'#94a3b8' }}><span style={{ fontWeight:700, color:'#475569' }}>{usedPct}%</span> used</span>
              </div>
            </div>
          )}
          <button className="__cm2-ref-btn" onClick={onRefresh} disabled={fetching}>
            {fetching
              ? <><div className="__cm2-spin"/><span>Refreshing</span></>
              : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h.582M20 20v-5h-.581M4.582 9a8 8 0 0115.356 2M19.418 15a8 8 0 01-15.356-2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg><span>Refresh from Database</span></>
            }
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COIN CONTAINER — Database se real-time fetch with proper handling
// ─────────────────────────────────────────────────────────────────────────────
const CoinContainer = ({ userRole = null }) => {
  const { user, refreshCoins, socket: socketRef } = useAuth();

  const [fetching,  setFetching]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [coinData,  setCoinData]  = useState({
    allocated: 0,
    used: 0,
    available: 0,
  });

  // ✅ Database se real-time coin data fetch kare
  const fetchCoinsFromDB = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setFetching(true);
    
    try {
      console.log('[CoinContainer] 📡 Fetching coins from database...');
      console.log('[CoinContainer] 🔑 Token exists?', !!localStorage.getItem('fleet_token'));
      
      // ✅ Direct fetch with proper error handling
      const token = localStorage.getItem('fleet_token');
      const response = await fetch('/api/users/my-coins', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
      
      console.log('[CoinContainer] 📦 Response status:', response.status);
      
      const data = await response.json();
      console.log('[CoinContainer] 📦 Response data:', data);
      
      if (data.success && data.coins) {
        const { allocated, used, available } = data.coins;
        console.log('[CoinContainer] ✅ Database response coins:', { allocated, used, available });
        
        const newData = {
          allocated: allocated || 0,
          used: used || 0,
          available: available || 0,
        };
        
        setCoinData(newData);
        
        // ✅ Local storage bhi update karo
        const stored = localStorage.getItem('fleet_user');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            parsed.allocatedCoins = allocated || 0;
            parsed.usedCoins = used || 0;
            parsed.availableCoins = available || 0;
            localStorage.setItem('fleet_user', JSON.stringify(parsed));
            console.log('[CoinContainer] 💾 Updated localStorage');
          } catch (_) {}
        }
        
        // AuthContext bhi update karo
        if (refreshCoins) {
          await refreshCoins();
        }
        
        return newData;
      } else {
        console.warn('[CoinContainer] ⚠️ No coins data in response:', data);
        const defaultData = { allocated: 0, used: 0, available: 0 };
        setCoinData(defaultData);
        return defaultData;
      }
    } catch (error) {
      console.error('[CoinContainer] ❌ Failed to fetch coins:', error);
      console.error('[CoinContainer] ❌ Error details:', error.message);
      const defaultData = { allocated: 0, used: 0, available: 0 };
      setCoinData(defaultData);
      return defaultData;
    } finally {
      setFetching(false);
      if (showLoading) setLoading(false);
    }
  }, [refreshCoins]);

  // ✅ Modal open hone par
  const handleOpenModal = useCallback(async () => {
    console.log('[CoinContainer] 🔓 Opening coin modal...');
    
    setModalOpen(true);
    setLoading(true);
    
    // ✅ Database se fetch karo
    await fetchCoinsFromDB(false);
    
    setLoading(false);
    
    console.log('[CoinContainer] 📊 Final coin data:', coinData);
    
    // ✅ Socket se bhi refresh
    if (socketRef?.current?.connected) {
      console.log('[CoinContainer] 📡 Emitting coin:refresh via socket');
      socketRef.current.emit('coin:refresh');
    }
  }, [fetchCoinsFromDB, socketRef, coinData]);

  const handleCloseModal = () => {
    setModalOpen(false);
    setLoading(false);
  };

  const handleRefresh = async () => {
    console.log('[CoinContainer] 🔄 Manual refresh clicked');
    await fetchCoinsFromDB(true);
    
    if (socketRef?.current?.connected) {
      socketRef.current.emit('coin:refresh');
    }
  };

  // ✅ Socket events
  useEffect(() => {
    if (!socketRef?.current) return;

    const socket = socketRef.current;

    const handleCoinUpdate = ({ available, used, allocated }) => {
      console.log(`[CoinContainer] 📨 Socket coin:update: allocated=${allocated}, used=${used}, available=${available}`);
      
      if (modalOpen) {
        setCoinData({
          allocated: allocated || 0,
          used: used || 0,
          available: available || 0,
        });
      }
    };

    socket.on('coin:update', handleCoinUpdate);

    return () => {
      socket.off('coin:update', handleCoinUpdate);
    };
  }, [socketRef, modalOpen]);

  // ✅ Initial data load — user se le lo
  useEffect(() => {
    if (user) {
      const allocated = user.allocatedCoins || 0;
      const used = user.usedCoins || 0;
      const available = user.availableCoins ?? Math.max(0, allocated - used);
      
      setCoinData({
        allocated,
        used,
        available,
      });
      
      console.log('[CoinContainer] 📊 Initial coin data from user:', { allocated, used, available });
    }
  }, [user]);

  return (
    <>
      <CoinWidget 
        onOpen={handleOpenModal} 
        userRole={userRole} 
      />
      <CoinModal
        open={modalOpen}
        onClose={handleCloseModal}
        onRefresh={handleRefresh}
        fetching={fetching}
        loading={loading}
        coinData={coinData}
      />
    </>
  );
};

// ── MAIN TOPBAR ───────────────────────────────────────────────────────────────
const Topbar = ({ onMenuToggle }) => {
  const { user, updateProfileImage } = useAuth();
  const { activeColor, activeGradient, isGradient } = useTheme();
  const { profileImageUrl } = useBranding();
  const location    = useLocation();
  const currentTime = useRealTimeClock();
  const windowWidth = useWindowWidth();

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  const pageTitle   = getPageTitle(location.pathname);
  const segments    = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = segments.slice(0, -1).map(s =>
    s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  );

  const topbarBg = isGradient ? activeGradient : activeColor;
  const WHITE    = '#ffffff';
  const WHITE_70 = 'rgba(255,255,255,0.70)';
  const WHITE_40 = 'rgba(255,255,255,0.40)';
  const WHITE_15 = 'rgba(255,255,255,0.15)';
  const WHITE_10 = 'rgba(255,255,255,0.10)';
  const DIVIDER  = 'rgba(255,255,255,0.22)';

  const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = currentTime.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });

  const [uploadedUrl,  setUploadedUrl]  = useState('');
  const [uploadingPic, setUploadingPic] = useState(false);
  const [picError,     setPicError]     = useState('');
  const fileInputRef = useRef(null);

  const avatarSrc = uploadedUrl || user?.profile_image || profileImageUrl || '';
  const handleAvatarClick = () => { if (!uploadingPic) fileInputRef.current?.click(); };

  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPic(true); setPicError('');
    try {
      const token = getToken();
      if (!token) { setPicError('Please login first'); return; }
      const formData = new FormData();
      formData.append('targetUserId',   String(user?.user_id ?? ''));
      formData.append('targetUsername', user?.username || '');
      formData.append('profileImage',   file);
      const response = await fetch('/api/profile/upload', { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:formData });
      if (!response.ok) { const text = await response.text(); throw new Error(`Server error (${response.status}): ${text||'Unknown error'}`); }
      const data = await response.json();
      if (data.success) {
        setUploadedUrl(data.fileUrl);
        if (updateProfileImage) updateProfileImage(data.fileUrl);
        syncProfileImageToStorage(data.fileUrl);
        setPicError('');
        window.dispatchEvent(new Event('user-updated'));
      } else setPicError(data.message || 'Upload failed');
    } catch (err) { setPicError('Upload error: ' + err.message); }
    finally { setUploadingPic(false); if (e.target) e.target.value = ''; if (picError) setTimeout(() => setPicError(''), 3000); }
  };

  const iconBtnBase = {
    background:WHITE_10, border:`1px solid ${WHITE_40}`, color:WHITE,
    width:isMobile?30:34, height:isMobile?30:34, borderRadius:8,
    display:'flex', alignItems:'center', justifyContent:'center',
    cursor:'pointer', position:'relative', transition:'all 150ms ease', flexShrink:0,
  };
  const handleBtnEnter = e => { e.currentTarget.style.background=WHITE_15; e.currentTarget.style.borderColor=WHITE_70; };
  const handleBtnLeave = e => { e.currentTarget.style.background=WHITE_10; e.currentTarget.style.borderColor=WHITE_40; };
  const handleRefresh  = e => {
    const svg = e.currentTarget.querySelector('svg');
    if (svg) { svg.style.transition='transform 500ms ease'; svg.style.transform='rotate(360deg)'; setTimeout(()=>window.location.reload(),520); }
    else window.location.reload();
  };

  const userRole = user?.role || null;

  // Silent reload
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin' && user.role !== 'dealer') return;

    const stored = localStorage.getItem('fleet_user');
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      const allocated = parsed.allocatedCoins || 0;
      const used = parsed.usedCoins || 0;
      const available = parsed.availableCoins ?? Math.max(0, allocated - used);

      console.log('[Topbar] Silent reload check:', { allocated, used, available });

      if ((allocated > 0 && available === 0) || available > 0) {
        if (!sessionStorage.getItem('coin_silent_reload_done')) {
          sessionStorage.setItem('coin_silent_reload_done', 'true');
          console.log('[Topbar] 🔄 Silent reload in 50ms...');
          setTimeout(() => {
            window.location.replace(window.location.href);
          }, 50);
        }
      } else {
        sessionStorage.removeItem('coin_silent_reload_done');
      }
    } catch (_) {}
  }, [user]);

  return (
    <header style={{ height:isMobile?'52px':'var(--topbar-height,60px)', background:topbarBg, display:'flex', alignItems:'center', padding:isMobile?'0 10px':isTablet?'0 14px':'0 20px', gap:isMobile?8:12, flexShrink:0, position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 12px rgba(0,0,0,0.18)', transition:'background 0.4s ease' }}>

      {isGradient && <div style={{ position:'absolute', inset:0, pointerEvents:'none', borderRadius:'inherit', background:'linear-gradient(135deg,rgba(255,255,255,0.10) 0%,transparent 60%)' }}/>}

      <button onClick={onMenuToggle} style={iconBtnBase} onMouseEnter={handleBtnEnter} onMouseLeave={handleBtnLeave} aria-label="Toggle sidebar">
        <svg width={isMobile?16:18} height={isMobile?16:18} viewBox="0 0 24 24" fill="none" style={{ display:'block' }}>
          <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </button>

      <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0, overflow:'hidden' }}>
        <div style={{ width:3, height:18, background:WHITE, flexShrink:0, borderRadius:2, opacity:0.85 }}/>
        <span style={{ fontSize:isMobile?10:12, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:WHITE, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:isMobile?'130px':isTablet?'200px':'none' }}>{pageTitle}</span>
        {!isMobile && breadcrumbs.length > 0 && (
          <><span style={{ color:WHITE_40, fontSize:10, flexShrink:0 }}>◆</span>
          <span style={{ fontSize:10, color:WHITE_70, fontFamily:'var(--font-mono,monospace)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{breadcrumbs.join(' / ')}</span></>
        )}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:isMobile?6:10, flexShrink:0 }}>

        {!isMobile && !isTablet && (
          <>
            <div style={{ textAlign:'right', display:'flex', flexDirection:'column', gap:1 }}>
              <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:12, color:WHITE, lineHeight:1, fontWeight:600 }}>{timeStr}</div>
              <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:WHITE_70, lineHeight:1 }}>{dateStr}</div>
            </div>
            <div style={{ width:1, height:24, background:DIVIDER }}/>
          </>
        )}

        {!isMobile && (
          <>
            <button onClick={handleRefresh} title="Refresh page" style={iconBtnBase} onMouseEnter={handleBtnEnter} onMouseLeave={handleBtnLeave}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ display:'block' }}>
                <path d="M4 4v5h.582M20 20v-5h-.581M4.582 9a8 8 0 0115.356 2M19.418 15a8 8 0 01-15.356-2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div style={{ width:1, height:24, background:DIVIDER }}/>
          </>
        )}

        <CoinContainer userRole={userRole} />

        {userRole && (userRole === 'admin' || userRole === 'dealer') && (
          <div style={{ width:1, height:24, background:DIVIDER }}/>
        )}

        <button style={iconBtnBase} onMouseEnter={handleBtnEnter} onMouseLeave={handleBtnLeave} aria-label="Notifications">
          <Icon name="bell" size={isMobile?14:15} color={WHITE}/>
          <span style={{ position:'absolute', top:6, right:6, width:7, height:7, background:WHITE, borderRadius:'50%', boxShadow:`0 0 0 2px ${topbarBg}` }}/>
        </button>

        <div style={{ width:1, height:24, background:DIVIDER }}/>

        <div style={{ display:'flex', alignItems:'center', gap:isMobile?0:9, position:'relative' }}>
          <input type="file" ref={fileInputRef} accept="image/*" onChange={handleProfilePicChange} style={{ display:'none' }}/>
          <div onClick={handleAvatarClick} title="Click to change profile photo" style={{ width:isMobile?30:34, height:isMobile?30:34, background:WHITE, border:`2px solid ${WHITE_70}`, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono,monospace)', fontSize:isMobile?11:13, fontWeight:800, color:activeColor, flexShrink:0, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.15)', cursor:uploadingPic?'wait':'pointer', position:'relative' }}>
            {uploadingPic
              ? <div style={{ width:14, height:14, border:'2px solid rgba(0,0,0,0.15)', borderTopColor:activeColor, borderRadius:'50%', animation:'topbarSpin .7s linear infinite' }}/>
              : avatarSrc
              ? <img src={avatarSrc} alt="Profile" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>{e.target.style.display='none';}}/>
              : (user?.fullName||user?.username||'U')[0].toUpperCase()
            }
          </div>
          {picError && <div style={{ position:'absolute', top:'110%', right:0, background:'#dc2626', color:'#fff', fontSize:10, padding:'4px 8px', borderRadius:3, whiteSpace:'nowrap', boxShadow:'0 4px 12px rgba(0,0,0,0.25)', zIndex:200 }}>{picError}</div>}
          {!isMobile && (
            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
              <div style={{ fontSize:isTablet?10:11, fontWeight:700, color:WHITE, lineHeight:1, whiteSpace:'nowrap' }}>{user?.fullName||user?.username}</div>
              <div style={{ fontSize:9, color:WHITE_70, letterSpacing:'0.07em', textTransform:'uppercase', lineHeight:1, whiteSpace:'nowrap' }}>{user?.role?.replace('_',' ')}</div>
            </div>
          )}
        </div>

      </div>
      <style>{`@keyframes topbarSpin{to{transform:rotate(360deg)}}`}</style>
    </header>
  );
};

export default Topbar;