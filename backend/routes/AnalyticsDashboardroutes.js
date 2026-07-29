'use strict';

const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');

// ── Models ────────────────────────────────────────────────────────────────────
let User, DeviceMaster, DeviceInfo;
try { User         = mongoose.model('User');         } catch { User         = require('../models/User');         }
try { DeviceMaster = mongoose.model('DeviceMaster'); } catch { DeviceMaster = require('../models/DeviceMaster'); }
try { DeviceInfo   = mongoose.model('DeviceInfo');   } catch { DeviceInfo   = require('../models/DeviceInfo');   }

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_DATE_RANGE_DAYS = Infinity;
const MAX_PACKET_LIMIT    = Infinity;
const GRAPH_MAX_RECORDS   = 0; 
const OVERSPEED_KMPH      = 60;
const MOVING_THRESHOLD    = 1.5;
const MIN_PAUSE_MS        = 15 * 60 * 1000;
const MIN_TRIP_MS         = 10 * 1000;
const INACTIVE_MS         = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE INDEXES — server start pe ek baar (background, non-blocking)
// ─────────────────────────────────────────────────────────────────────────────
async function ensureIndexes() {
  try {
    // Device_Info — packet-log aur graph-data ke liye critical compound indexes
    await DeviceInfo.collection.createIndex(
      { imei: 1, timestamp_ms: 1 },
      { background: true, name: 'idx_imei_tsMs' }
    );
    await DeviceInfo.collection.createIndex(
      { imei: 1, gps_datetime_utc: 1 },
      { background: true, name: 'idx_imei_gpsDt' }
    );
    await DeviceInfo.collection.createIndex(
      { imei: 1, server_received_at: 1 },
      { background: true, name: 'idx_imei_srvRcv' }
    );
    await DeviceInfo.collection.createIndex(
      { imei: 1, createdAt: 1 },
      { background: true, name: 'idx_imei_createdAt' }
    );

    // Device_Master — hierarchy queries ke liye
    await DeviceMaster.collection.createIndex(
      { user_id: 1, active: 1 },
      { background: true, name: 'idx_userId_active' }
    );
    await DeviceMaster.collection.createIndex(
      { dealerId: 1, active: 1 },
      { background: true, name: 'idx_dealerId_active' }
    );
    await DeviceMaster.collection.createIndex(
      { adminId: 1, active: 1 },
      { background: true, name: 'idx_adminId_active' }
    );

    // User_Master — cascade dropdown queries ke liye
    await User.collection.createIndex(
      { role: 1, adminId: 1 },
      { background: true, name: 'idx_role_adminId' }
    );
    await User.collection.createIndex(
      { role: 1, dealerId: 1 },
      { background: true, name: 'idx_role_dealerId' }
    );

    console.log('[analytics] ✓ All indexes ensured');
  } catch (e) {
    console.warn('[analytics] Index ensure warning (non-fatal):', e.message);
  }
}
ensureIndexes();

// ─────────────────────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────
async function auth(req, res, next) {
  try {
    if (req.user) return next();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) { req.user = null; return next(); }
    const jwt     = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user      = await User.findById(decoded.userId || decoded.id || decoded._id).lean();
    next();
  } catch {
    req.user = null;
    next();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** User ka role normalize karo */
function getRole(user) {
  return (user?.role || '').toLowerCase().replace(/[_\s]/g, '');
}

/** User ka numeric ID nikalo — multiple field fallback */
function numericId(user) {
  if (!user) return null;
  for (const f of ['user_id', 'uid', 'numericId', 'id']) {
    const v = user[f];
    const n = Number(v);
    if (isFinite(n) && n > 0) return n;
  }
  return null;
}

/** User ka display name */
function displayName(user, fallback = 'Unknown') {
  if (!user) return fallback;
  return user.username || user.fullName || user.name || fallback;
}

/** Date parse + validate */
function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Date range validate karo */
function validateRange(start, end) {
  const s = parseDate(start), e = parseDate(end);
  if (!s || !e) return { err: 'startDate aur endDate required hain' };
  let sMs = s.getTime(), eMs = e.getTime();
  if (eMs < sMs) { const tmp = sMs; sMs = eMs; eMs = tmp; } // auto-swap
  const days = (eMs - sMs) / 86400000;
// No date range limit — unlimited
  return { sMs, eMs };
}

/** Speed extract karo — multiple field names support */
function getSpeed(r) {
  const v = r.speed_kmph ?? r.speed ?? r.speed_raw ?? r.spd ?? r.Speed ?? 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : Math.min(n, 300);
}

/** Ignition extract karo */
function getIgnition(r) {
  const v = r.ignition ?? r.ignitionStatus ?? r.ign ?? 0;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number')  return v === 1;
  if (typeof v === 'string')  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'on';
  return false;
}

/**
 * Best timestamp (ms) extract karo
 * Priority: timestamp_ms → gps_datetime_utc → server_received_at → createdAt
 */
function getBestTs(r) {
  if (!r) return null;

  // 1. timestamp_ms — DB mein number ya $numberLong dono handle karo
  const raw = r.timestamp_ms;
  if (raw != null) {
    // Mongoose $numberLong objects ko Number mein convert karo
    const n = typeof raw === 'object' ? Number(raw.$numberLong ?? raw) : Number(raw);
    if (isFinite(n)) {
      if (n > 1_000_000_000_000 && n < 4_102_444_800_000) return n;        // Unix ms
      if (n > 1_000_000_000     && n < 4_102_444_800)     return n * 1000; // Unix seconds
    }
  }

  // 2. Date type fields — priority order
  const DATE_FIELDS = [
    'gps_datetime_utc',
    'timestamp_utc',
    'server_received_at',
    'timestamp',
    'createdAt',
    'updatedAt',
    'deviceTime',
    'gpsTime',
    'recordTime',
    'last_heartbeat',
  ];

  for (const f of DATE_FIELDS) {
    const v = r[f];
    if (!v) continue;

    // Date object
    if (v instanceof Date) {
      const y = v.getFullYear();
      if (!isNaN(v.getTime()) && y >= 2020 && y <= 2035) return v.getTime();
      continue;
    }

    // Number (seconds or ms)
    if (typeof v === 'number' && isFinite(v)) {
      if (v > 1_000_000_000_000 && v < 4_102_444_800_000) return v;
      if (v > 1_000_000_000     && v < 4_102_444_800)     return v * 1000;
      continue;
    }

    // String parse
    if (typeof v === 'string' && v.length > 0) {
      const d = new Date(v);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2035) return d.getTime();
    }
  }

  return null;
}

/** Lat/Lon extract karo */
function getLatLon(r) {
  const lat = parseFloat(r.lat ?? r.latitude  ?? 0);
  const lon = parseFloat(r.lon ?? r.longitude ?? r.lng ?? 0);
  return {
    lat: isNaN(lat) ? null : lat,
    lon: isNaN(lon) ? null : lon,
  };
}

/** Haversine distance km */
function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R   = 6371;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** ms → "Xh Ym" */
function msToDur(ms) {
  if (!ms || ms <= 0) return '0h 0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

/** Timestamp → "X ago" */
function timeAgo(ts) {
  if (!ts) return '--';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'Just now';
}

// ─────────────────────────────────────────────────────────────────────────────
// BEST DATE FIELD FINDER
// imei ke liye parallel count karke sabse populated field choose karo
// ─────────────────────────────────────────────────────────────────────────────
async function findBestField(imei, sMs, eMs) {
  const sDate = new Date(sMs);
  const eDate = new Date(eMs);

  const candidates = [
    // timestamp_ms — number comparison (agar DB mein number type hai)
    {
      field: 'timestamp_ms',
      q:     { imei, timestamp_ms: { $gte: sMs, $lte: eMs } },
    },
    // GPS time — actual device time, sabse reliable
    {
      field: 'gps_datetime_utc',
      q:     { imei, gps_datetime_utc: { $gte: sDate, $lte: eDate } },
    },
    // Server received time — fallback
    {
      field: 'server_received_at',
      q:     { imei, server_received_at: { $gte: sDate, $lte: eDate } },
    },
    // Mongoose timestamps — last resort
    {
      field: 'createdAt',
      q:     { imei, createdAt: { $gte: sDate, $lte: eDate } },
    },
    // Generic timestamp field
    {
      field: 'timestamp',
      q:     { imei, timestamp: { $gte: sDate, $lte: eDate } },
    },
  ];

  // Parallel count — sabhi fields ek saath check karo
  const results = await Promise.all(
    candidates.map(async c => {
      try {
        const count = await DeviceInfo.countDocuments(c.q).maxTimeMS(5000);
        return { ...c, count };
      } catch (e) {
        console.warn(`[findBestField] field=${c.field} failed:`, e.message);
        return { ...c, count: 0 };
      }
    })
  );

  // Sabse zyada data wala field choose karo
  const best = results.reduce((a, b) => (b.count > a.count ? b : a), results[0]);

  console.log(
    `[findBestField] IMEI=${imei} results:`,
    results.map(r => `${r.field}=${r.count}`).join(' | ')
  );

  return best.count > 0 ? best : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMEI RESOLVER — vehicleId (MongoDB _id) se IMEI nikalo
// ─────────────────────────────────────────────────────────────────────────────
async function resolveImei(vehicleId) {
  if (!vehicleId) return null;
  let device = null;
  if (mongoose.Types.ObjectId.isValid(vehicleId)) {
    device = await DeviceMaster.findById(vehicleId).select('IMEI_No').lean();
  }
  if (!device) {
    device = await DeviceMaster.findOne({ vehicle_no: vehicleId, active: true }).select('IMEI_No').lean();
  }
  return device?.IMEI_No ? String(device.IMEI_No).trim() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIP CALCULATOR — records se trips, distance, duration calculate karo
// ─────────────────────────────────────────────────────────────────────────────
function calculateTrips(records) {
  if (!records || records.length < 2) return { trips: 0, distKm: 0, durationMs: 0 };

  const sorted = records
    .map(r => ({ ts: getBestTs(r), spd: getSpeed(r), ign: getIgnition(r), pos: getLatLon(r) }))
    .filter(r => r.ts !== null)
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length < 2) return { trips: 0, distKm: 0, durationMs: 0 };

  let trips = 0, distKm = 0, durationMs = 0;
  let inTrip = false, tripStart = null, tripLastMov = null;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], curr = sorted[i];
    const gap  = curr.ts - prev.ts;
    const moving = curr.spd > MOVING_THRESHOLD || curr.ign && curr.spd > 0;

    // Distance accumulate
    if (prev.pos.lat && prev.pos.lon && curr.pos.lat && curr.pos.lon && gap < 120000) {
      const d = haversineKm(prev.pos.lat, prev.pos.lon, curr.pos.lat, curr.pos.lon);
      if (d < 50) distKm += d;
    }

    // Trip detection
    if (moving && !inTrip) {
      inTrip = true; trips++; tripStart = curr.ts; tripLastMov = curr.ts;
    } else if (moving && inTrip) {
      tripLastMov = curr.ts;
    } else if (!moving && inTrip && tripLastMov) {
      if (curr.ts - tripLastMov >= MIN_PAUSE_MS) {
        const dur = tripLastMov - tripStart;
        if (dur >= MIN_TRIP_MS) durationMs += dur;
        inTrip = false; tripStart = null; tripLastMov = null;
      }
    }
  }
  if (inTrip && tripStart && tripLastMov) {
    const dur = tripLastMov - tripStart;
    if (dur >= MIN_TRIP_MS) durationMs += dur;
  }

  return { trips, distKm: parseFloat(distKm.toFixed(2)), durationMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS DERIVER — latest DeviceInfo record se vehicle status
// ─────────────────────────────────────────────────────────────────────────────
function deriveStatus(info) {
  if (!info) return 'Inactive';
  const ts  = getBestTs(info);
  const spd = getSpeed(info);
  const ign = getIgnition(info);
  if (!ts || Date.now() - ts > INACTIVE_MS) return 'Inactive';
  if (ign && spd > MOVING_THRESHOLD) return 'Moving';
  if (spd > MOVING_THRESHOLD)        return 'Moving';
  if (ign && spd === 0)              return 'Idle';
  return 'Stopped';
}

// ─────────────────────────────────────────────────────────────────────────────
// REVERSE GEOCODE — Nominatim (server-side, cached)
// ─────────────────────────────────────────────────────────────────────────────
const _geoCache = new Map();

async function reverseGeocode(lat, lon) {
  if (!lat || !lon) return null;
  const key = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  if (_geoCache.has(key)) return _geoCache.get(key);
  try {
    const https = require('https');
    const url   = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
    const body  = await new Promise((ok, fail) => {
      const rq = https.get(
        url,
        { headers: { 'User-Agent': 'FleetAnalytics/2.0', 'Accept-Language': 'en' }, timeout: 5000 },
        r => { let d = ''; r.on('data', c => (d += c)); r.on('end', () => ok(d)); }
      );
      rq.on('error', fail);
      rq.on('timeout', () => { rq.destroy(); fail(new Error('timeout')); });
    });
    const json  = JSON.parse(body);
    const a     = json.address || {};
    const parts = [a.road, a.suburb || a.village || a.neighbourhood, a.city || a.county, a.state].filter(Boolean);
    const addr  = parts.join(', ') || json.display_name || null;
    if (addr) {
      if (_geoCache.size > 5000) _geoCache.delete(_geoCache.keys().next().value);
      _geoCache.set(key, addr);
    }
    return addr;
  } catch {
    return null;
  }
}

// =============================================================================
// ROUTES
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// GET /admins
// SuperAdmin ke liye — sabhi admins list
// Query: User_Master where role='admin'
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admins', auth, async (req, res) => {
  try {
    const me = req.user;
    if (getRole(me) !== 'superadmin')
      return res.status(403).json({ success: false, message: 'Access denied' });

    const admins = await User
      .find({ role: { $regex: /^admin$/i } })
      .select('_id username fullName name user_id uid')
      .sort({ username: 1 })
      .lean();

    const data = admins
      .map(u => ({
        _id:      String(u._id),
        name:     displayName(u),
        rawValue: numericId(u), // numeric user_id — downstream me adminId ke roop me jayega
      }))
      .filter(u => u.rawValue !== null);

    res.json({ success: true, data });
  } catch (e) {
    console.error('[/admins]', e.message);
    res.status(500).json({ success: false, message: e.message, data: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /dealers?adminId=<numericUserId>
// Admin ke under sabhi dealers
// Query: User_Master where role='dealer' AND adminId=<numericId>
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dealers', auth, async (req, res) => {
  try {
    const me   = req.user;
    const role = getRole(me);

    let adminNumId = null;

    if (role === 'superadmin') {
      adminNumId = parseInt(req.query.adminId);
      if (!adminNumId || isNaN(adminNumId))
        return res.json({ success: true, data: [] });
    } else if (role === 'admin') {
      // Logged-in admin ka apna numeric ID
      adminNumId = numericId(me);
      if (!adminNumId)
        return res.status(400).json({ success: false, message: 'Admin numeric ID not found in profile' });
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Direct indexed query — no regex, no name matching
    const dealers = await User
      .find({
        role:    { $regex: /^dealer$/i },
        adminId: adminNumId,
      })
      .select('_id username fullName name user_id uid dealerId')
      .sort({ username: 1 })
      .lean();

    const data = dealers
      .map(u => ({
        _id:      String(u._id),
        name:     displayName(u),
        rawValue: numericId(u), // numeric user_id of dealer — frontend me selDealer ke roop me store hoga
      }))
      .filter(u => u.rawValue !== null);

    res.json({ success: true, data });
  } catch (e) {
    console.error('[/dealers]', e.message);
    res.status(500).json({ success: false, message: e.message, data: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /users?dealerId=<numericUserId>
// Dealer ke under sabhi users
// Query: User_Master where role='user' AND dealerId=<numericId>
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', auth, async (req, res) => {
  try {
    const me   = req.user;
    const role = getRole(me);

    let dealerNumId = null;

    if (role === 'superadmin' || role === 'admin') {
      dealerNumId = parseInt(req.query.dealerId);
      if (!dealerNumId || isNaN(dealerNumId))
        return res.json({ success: true, data: [] });
    } else if (role === 'dealer') {
      // Logged-in dealer ka apna numeric ID
      dealerNumId = numericId(me);
      if (!dealerNumId)
        return res.status(400).json({ success: false, message: 'Dealer numeric ID not found in profile' });
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Direct indexed query
    const users = await User
      .find({
        role:     { $regex: /^user$/i },
        dealerId: dealerNumId,
      })
      .select('_id username fullName name user_id uid')
      .sort({ username: 1 })
      .lean();

    const data = users
      .map(u => ({
        _id:      String(u._id),
        name:     displayName(u),
        rawValue: numericId(u), // numeric user_id — frontend me selUser ke roop me store hoga
      }))
      .filter(u => u.rawValue !== null);

    res.json({ success: true, data });
  } catch (e) {
    console.error('[/users]', e.message);
    res.status(500).json({ success: false, message: e.message, data: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /vehicles?userId=<numericUserId>
// User ke sabhi vehicles
// Query: Device_Master where user_id=<numericId> AND active=true
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vehicles', auth, async (req, res) => {
  try {
    const me   = req.user;
    const role = getRole(me);

    let userNumId = null;

    if (role === 'user') {
      // Logged-in user ka apna ID
      userNumId = numericId(me);
    } else {
      userNumId = parseInt(req.query.userId);
    }

    if (!userNumId || isNaN(userNumId))
      return res.json({ success: true, data: [] });

    // Direct indexed query — Device_Master.user_id
    const vehicles = await DeviceMaster
      .find({ user_id: userNumId, active: true })
      .select('_id IMEI_No vehicle_no vehicle_type branch')
      .sort({ vehicle_no: 1 })
      .lean();

    const data = vehicles.map(v => ({
      _id:          String(v._id),
      imei:         v.IMEI_No,
      vehicleNumber: v.vehicle_no || v.IMEI_No || 'Unknown',
      vehicleType:  v.vehicle_type || 'car',
      branch:       v.branch || null,
    }));

    res.json({ success: true, data });
  } catch (e) {
    console.error('[/vehicles]', e.message);
    res.status(500).json({ success: false, message: e.message, data: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /packet-log
// Query params: vehicleId, startDate, endDate, page, limit
//
// FAST PATH:
//   vehicleId → IMEI (1 query) → compound index lookup → 5 fields only
//   Response: compact keys { t, s, ign, lat, lon, d, cum }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/packet-log', auth, async (req, res) => {
  try {
    const { vehicleId } = req.query;
    if (!vehicleId)
      return res.status(400).json({ success: false, message: 'vehicleId required hai', data: [] });

    // Date range validate
    const range = validateRange(req.query.startDate, req.query.endDate);
    if (range.err)
      return res.status(400).json({ success: false, message: range.err, data: [] });
    const { sMs, eMs } = range;

    // Pagination
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10000);
    const skip  = (page - 1) * limit;

    // Step 1: vehicleId → IMEI
    const imei = await resolveImei(vehicleId);
    if (!imei)
      return res.status(404).json({ success: false, message: 'Vehicle nahi mila ya access nahi hai', data: [] });

    console.log(`[packet-log] IMEI=${imei} page=${page} limit=${limit} ${new Date(sMs).toISOString()} → ${new Date(eMs).toISOString()}`);

    // Step 2: Best date field find karo (parallel)
    const best = await findBestField(imei, sMs, eMs);
    if (!best || best.count === 0) {
      return res.json({
        success: true, data: [], totalRaw: 0,
        page, totalPages: 0, hasMore: false, field: null,
        message: 'Is date range mein koi packet nahi mila',
      });
    }

    const totalRaw   = best.count;
    const totalPages = Math.ceil(totalRaw / limit);
    const sortField  = best.field;

    console.log(`[packet-log] field=${best.field} totalRaw=${totalRaw} totalPages=${totalPages}`);

    // Step 3: Sirf 5 zaruri fields fetch karo — baki sab skip
    const PROJECTION = {
      _id:               0,
      // Timestamp fields (best field + fallbacks)
      timestamp_ms:      1,
      gps_datetime_utc:  1,
      server_received_at:1,
      createdAt:         1,
      // Speed
      speed_kmph:        1,
      speed:             1,
      spd:               1,
      Speed:             1,
      // Ignition
      ignition:          1,
      // Location
      lat:               1,
      lon:               1,
      latitude:          1,
      longitude:         1,
    };

    const rawRows = await DeviceInfo
      .find(best.q)
      .select(PROJECTION)
      .sort({ [sortField]: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Step 4: Transform + cumulative distance calculate
    let cumDist = 0;
    let prevLat = null, prevLon = null, prevTs = null;

    const data = rawRows
      .filter(r => {
        const t = getBestTs(r);
        return t !== null && t >= sMs && t <= eMs;
      })
      .map(r => {
        const t   = getBestTs(r);
        const pos = getLatLon(r);
        const s   = getSpeed(r);
        const ign = getIgnition(r);

        // Delta distance calculate
        let distFromPrev = 0;
        if (prevLat && prevLon && pos.lat && pos.lon && prevTs && t) {
          const gapMs = t - prevTs;
          // Max 2 ghante gap — teleport avoid karo
          if (gapMs > 0 && gapMs < 7_200_000) {
            const d = haversineKm(prevLat, prevLon, pos.lat, pos.lon);
            if (d < 50) { // 50km jump filter
              distFromPrev = d;
              cumDist     += d;
            }
          }
        }
        prevLat = pos.lat; prevLon = pos.lon; prevTs = t;

        return {
          t:   t,                                         // timestamp ms
          s:   parseFloat(s.toFixed(1)),                  // speed km/h
          ign: ign,                                       // ignition boolean
          lat: pos.lat ? parseFloat(pos.lat.toFixed(5)) : null,
          lon: pos.lon ? parseFloat(pos.lon.toFixed(5)) : null,
          d:   parseFloat(distFromPrev.toFixed(4)),       // delta distance km
          cum: parseFloat(cumDist.toFixed(4)),            // cumulative distance km
        };
      });

    res.json({
      success:    true,
      data,
      totalRaw,
      page,
      totalPages,
      hasMore:    page < totalPages,
      field:      best.field,
      count:      data.length,
    });

  } catch (e) {
    console.error('[GET /packet-log]', e);
    res.status(500).json({ success: false, message: e.message, data: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /graph-data
// Query params: vehicleId, startDate, endDate
//
// Returns: [[timestamp_ms, speed_kmph], ...] — sirf 2 values per point
// Graph ke liye ultra-lightweight response
// ─────────────────────────────────────────────────────────────────────────────
router.get('/graph-data', auth, async (req, res) => {
  try {
    const { vehicleId } = req.query;
    if (!vehicleId)
      return res.status(400).json({ success: false, message: 'vehicleId required hai', data: [] });

    // Date range validate + auto-swap if reversed
    const range = validateRange(req.query.startDate, req.query.endDate);
    if (range.err)
      return res.status(400).json({ success: false, message: range.err, data: [] });
    const { sMs, eMs } = range;

    // Step 1: vehicleId (MongoDB _id) → IMEI_No
    const imei = await resolveImei(vehicleId);
    if (!imei)
      return res.status(404).json({ success: false, message: 'Vehicle nahi mila ya IMEI missing hai', data: [] });

    console.log(`[graph-data] IMEI=${imei} | ${new Date(sMs).toISOString()} → ${new Date(eMs).toISOString()}`);

    // Step 2: Best date field find karo (parallel count — fastest field jo data de)
    const best = await findBestField(imei, sMs, eMs);
    if (!best || best.count === 0) {
      console.log(`[graph-data] No data found for IMEI=${imei}`);
      return res.json({ success: true, data: [], total: 0, field: null });
    }

    console.log(`[graph-data] field=${best.field} | totalRecords=${best.count}`);

    // Step 3: Sirf 2 zaruri fields — timestamp + speed (minimum payload, maximum speed)
    // NO LIMIT — jitna bhi data ho, lakh ho ya crore, sara fetch karo
    const rows = await DeviceInfo
      .find(best.q)
      .select({
        _id:                0,   // skip _id — unnecessary bytes
        // Timestamp fields (best field + fallbacks for getBestTs)
        timestamp_ms:       1,
        gps_datetime_utc:   1,
        server_received_at: 1,
        createdAt:          1,
        // Speed fields
        speed_kmph:         1,
        speed:              1,
        spd:                1,
        Speed:              1,
      })
      .sort({ [best.field]: 1 })
      // .limit() — intentionally removed, no cap on data
      .lean();

    // Step 4: Transform to [[timestamp_ms, speed]] — frontend SpeedTimelineCard ka format
    const data = [];
    for (const r of rows) {
      const t = getBestTs(r);
      if (t === null || t < sMs || t > eMs) continue; // range ke bahar skip
      const s = parseFloat(getSpeed(r).toFixed(1));
      data.push([t, s]);
    }

    // Already sorted by DB, but ensure — frontend graph sahi order me draw kare
    // (agar multiple date fields mix ho toh sort zaroori hai)
    if (best.field !== 'timestamp_ms') {
      data.sort((a, b) => a[0] - b[0]);
    }

    console.log(`[graph-data] dbRows=${rows.length} | validPoints=${data.length} | field=${best.field}`);
    return res.json({ success: true, data, total: data.length, field: best.field });

  } catch (e) {
    console.error('[GET /graph-data] Error:', e.message);
    res.status(500).json({ success: false, message: e.message, data: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /kpis
// Query params: vehicleId, startDate, endDate
// Vehicle ke overall stats: trips, distance, duration
// ─────────────────────────────────────────────────────────────────────────────
router.get('/kpis', auth, async (req, res) => {
  try {
    const { vehicleId } = req.query;
    if (!vehicleId)
      return res.status(400).json({ success: false, message: 'vehicleId required hai' });

    const range = validateRange(req.query.startDate, req.query.endDate);
    if (range.err)
      return res.status(400).json({ success: false, message: range.err });
    const { sMs, eMs } = range;

    const imei = await resolveImei(vehicleId);
    if (!imei)
      return res.status(404).json({ success: false, message: 'Vehicle nahi mila' });

    const best = await findBestField(imei, sMs, eMs);
    if (!best || best.count === 0) {
      return res.json({
        success: true,
        data: { totalTrips: 0, totalDistance: 0, totalDuration: '0h 0m', avgSpeed: 0, maxSpeed: 0, overspeedCount: 0 },
      });
    }

    // Trip calculation ke liye records fetch
    const records = await DeviceInfo
      .find(best.q)
      .select({
        _id:               0,
        timestamp_ms:      1,
        gps_datetime_utc:  1,
        server_received_at:1,
        createdAt:         1,
        speed_kmph:        1,
        speed:             1,
        spd:               1,
        ignition:          1,
        lat:               1,
        lon:               1,
        latitude:          1,
        longitude:         1,
      })
      .sort({ [best.field]: 1 })
      .lean();

    const { trips, distKm, durationMs } = calculateTrips(records);

    // Max speed + overspeed count
    let maxSpd = 0, overCount = 0;
    const validRecords = records.filter(r => {
      const t = getBestTs(r);
      return t && t >= sMs && t <= eMs;
    });
    for (const r of validRecords) {
      const s = getSpeed(r);
      if (s > maxSpd) maxSpd = s;
      if (s > OVERSPEED_KMPH) overCount++;
    }

    // Avg speed (moving records only)
    const movingRecords = validRecords.filter(r => getSpeed(r) > MOVING_THRESHOLD);
    const avgSpd = movingRecords.length > 0
      ? movingRecords.reduce((sum, r) => sum + getSpeed(r), 0) / movingRecords.length
      : 0;

    res.json({
      success: true,
      data: {
        totalTrips:     trips,
        totalDistance:  parseFloat(distKm.toFixed(1)),
        totalDuration:  msToDur(durationMs),
        durationMinutes:Math.round(durationMs / 60000),
        avgSpeed:       parseFloat(avgSpd.toFixed(1)),
        maxSpeed:       parseFloat(maxSpd.toFixed(1)),
        overspeedCount: overCount,
        totalPackets:   validRecords.length,
      },
    });

  } catch (e) {
    console.error('[GET /kpis]', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /table
// Query params: vehicleId, startDate, endDate
// Vehicle ka summary row for table display
// ─────────────────────────────────────────────────────────────────────────────
router.get('/table', auth, async (req, res) => {
  try {
    const { vehicleId } = req.query;
    if (!vehicleId)
      return res.status(400).json({ success: false, message: 'vehicleId required hai', data: [] });

    const range = validateRange(req.query.startDate, req.query.endDate);
    if (range.err)
      return res.status(400).json({ success: false, message: range.err, data: [] });
    const { sMs, eMs } = range;

    // Vehicle info
    let vehicle = null;
    if (mongoose.Types.ObjectId.isValid(vehicleId)) {
      vehicle = await DeviceMaster.findById(vehicleId).lean();
    }
    if (!vehicle)
      return res.json({ success: true, data: [] });

    const imei = vehicle.IMEI_No ? String(vehicle.IMEI_No).trim() : null;
    if (!imei)
      return res.json({ success: true, data: [] });

    // Latest info for live status
    const latestInfo = await DeviceInfo
      .findOne({ imei })
      .sort({ server_received_at: -1, createdAt: -1 })
      .select({ speed_kmph:1, speed:1, ignition:1, timestamp_ms:1, gps_datetime_utc:1, server_received_at:1, createdAt:1, lat:1, lon:1 })
      .lean();

    const lastTs     = latestInfo ? getBestTs(latestInfo) : null;
    const status     = deriveStatus(latestInfo);

    // Trip data for date range
    const best = await findBestField(imei, sMs, eMs);
    let trips = 0, distKm = 0, durationMs = 0;

    if (best && best.count > 0) {
      const records = await DeviceInfo
        .find(best.q)
        .select({ _id:0, timestamp_ms:1, gps_datetime_utc:1, server_received_at:1, createdAt:1, speed_kmph:1, speed:1, spd:1, ignition:1, lat:1, lon:1, latitude:1, longitude:1 })
        .sort({ [best.field]: 1 })
        .lean();
      const result = calculateTrips(records);
      trips = result.trips; distKm = result.distKm; durationMs = result.durationMs;
    }

    res.json({
      success: true,
      data: [{
        _id:            String(vehicle._id),
        vehicleNumber:  vehicle.vehicle_no || imei,
        vehicleType:    vehicle.vehicle_type || 'car',
        imei,
        status,
        state: status === 'Moving' ? 'running' : status === 'Idle' ? 'idle' : status === 'Stopped' ? 'stopped' : 'inactive',
        trips,
        distance:       parseFloat(distKm.toFixed(1)),
        duration:       msToDur(durationMs),
        lastUpdated:    lastTs ? new Date(lastTs).toISOString() : null,
        lastUpdatedAgo: timeAgo(lastTs),
        branch:         vehicle.branch || null,
        driverName:     vehicle.driver_name || null,
        address:        latestInfo?.address || null,
      }],
    });

  } catch (e) {
    console.error('[GET /table]', e);
    res.status(500).json({ success: false, message: e.message, data: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /reverse-geocode
// Query params: lat, lng
// Server-side Nominatim call with caching
// ─────────────────────────────────────────────────────────────────────────────
router.get('/reverse-geocode', auth, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng || req.query.lon);
    if (isNaN(lat) || isNaN(lng))
      return res.status(400).json({ success: false, address: null, message: 'lat aur lng required hain' });

    const address = await reverseGeocode(lat, lng);
    res.json({ success: true, address: address || null });
  } catch (e) {
    res.status(500).json({ success: false, address: null, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /vehicle-live
// Query params: vehicleId
// Latest single record — live status ke liye (profile card)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vehicle-live', auth, async (req, res) => {
  try {
    const { vehicleId } = req.query;
    if (!vehicleId)
      return res.status(400).json({ success: false, message: 'vehicleId required hai' });

    const imei = await resolveImei(vehicleId);
    if (!imei)
      return res.status(404).json({ success: false, message: 'Vehicle nahi mila' });

    // Latest record
    const info = await DeviceInfo
      .findOne({ imei })
      .sort({ server_received_at: -1, timestamp_ms: -1, createdAt: -1 })
      .select({
        _id:                    0,
        speed_kmph:             1, speed:        1, spd: 1,
        ignition:               1,
        lat:                    1, lon:          1, latitude: 1, longitude: 1,
        satellites:             1,
        gsm_strength:           1,
        main_input_v:           1,
        battery_level_percent:  1,
        internal_batt_v:        1,
        gps_fix:                1,
        address:                1,
        timestamp_ms:           1,
        gps_datetime_utc:       1,
        server_received_at:     1,
        createdAt:              1,
      })
      .lean();

    if (!info)
      return res.json({ success: true, data: null });

    const pos = getLatLon(info);
    const spd = getSpeed(info);
    const ign = getIgnition(info);
    const ts  = getBestTs(info);
    const sta = deriveStatus(info);

    // Vehicle master info
    const vehicle = await DeviceMaster
      .findById(vehicleId)
      .select('vehicle_no vehicle_type branch driver_name locked')
      .lean();

    res.json({
      success: true,
      data: {
        state:        sta === 'Moving' ? (spd > OVERSPEED_KMPH ? 'overspeed' : 'running') : sta.toLowerCase(),
        spd,
        ignition:     ign,
        lat:          pos.lat,
        lon:          pos.lon,
        satellites:   info.satellites || 0,
        gsm:          info.gsm_strength || 0,
        battery:      info.battery_level_percent || info.internal_batt_v || 0,
        extPower:     info.main_input_v || 0,
        fixType:      info.gps_fix === '1' ? 'GPS Fix' : 'No Fix',
        address:      info.address || null,
        lastTs:       ts,
        vehicleType:  vehicle?.vehicle_type || 'car',
        vehicleNumber:vehicle?.vehicle_no || '',
        branch:       vehicle?.branch || null,
        driver:       vehicle?.driver_name || null,
        locked:       vehicle?.locked || false,
      },
    });

  } catch (e) {
    console.error('[GET /vehicle-live]', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;