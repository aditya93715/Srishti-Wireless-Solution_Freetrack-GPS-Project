'use strict';

const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const axios    = require('axios');

// ── Models ────────────────────────────────────────────────────────────────────
const DeviceMaster = require('../models/DeviceMaster');
const DeviceInfo   = require('../models/Deviceinfo');   // adjust filename if needed
const User         = require('../models/User');
const VehicleLatestStatus = require('../models/VehicleLatestStatus');

// ── Auth middleware ───────────────────────────────────────────────────────────
const { protect } = require('../middleware/auth');      // adjust path if needed

// Apply auth to every route in this file
router.use(protect);

// ── Constants ─────────────────────────────────────────────────────────────────
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

const VALID_VEHICLE_TYPES = [
  'car', 'truck', 'bus', 'bike', 'tractor',
  'auto', 'van', 'pickup', 'tanker', 'JCB',
];

const DEVICE_SELECT_FIELDS = {
  _id: 1, vehicle_no: 1, IMEI_No: 1,
  vehicle_type: 1,
  driver_name: 1, locked: 1, branch: 1, client: 1,
  transporter: 1, group: 1, device_name: 1, sim_card: 1,
  adminId: 1, dealerId: 1, user_id: 1, assigned: 1,
  odometer: 1,
};

// ══════════════════════════════════════════════════════════════════════════════
// § 1  ADDRESS GEOCODING CACHE
//      Memory (Map) → Google Maps API  (24 h TTL)
//      Throttled queue — 1 request per 200 ms, back-off on OVER_QUERY_LIMIT
// ══════════════════════════════════════════════════════════════════════════════
const MEM_CACHE = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;   // 24 h
const GEO_QUEUE = [];
let   GEO_RUNNING = false;

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)}_${Number(lng).toFixed(4)}`;
}

function memGet(lat, lng) {
  const v = MEM_CACHE.get(cacheKey(lat, lng));
  if (v && Date.now() - v.ts < CACHE_TTL) return v.address;
  return null;
}

function memSet(lat, lng, address) {
  MEM_CACHE.set(cacheKey(lat, lng), { address, ts: Date.now() });
}

async function drainQueue() {
  if (GEO_RUNNING || GEO_QUEUE.length === 0) return;
  GEO_RUNNING = true;

  const { lat, lng, resolve } = GEO_QUEUE.shift();
  const cached = memGet(lat, lng);
  if (cached) {
    resolve(cached);
    GEO_RUNNING = false;
    setTimeout(drainQueue, 0);
    return;
  }

  try {
    if (!GOOGLE_MAPS_API_KEY) {
      resolve(`${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`);
      GEO_RUNNING = false;
      setTimeout(drainQueue, 0);
      return;
    }

    const resp = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params:  { latlng: `${lat},${lng}`, key: GOOGLE_MAPS_API_KEY },
      timeout: 6_000,
    });

    if (resp.data.status === 'OK' && resp.data.results?.[0]) {
      let addr = resp.data.results[0].formatted_address || '';
      if (addr.length > 160) addr = addr.substring(0, 157) + '...';
      memSet(lat, lng, addr);
      resolve(addr);

    } else if (resp.data.status === 'OVER_QUERY_LIMIT') {
      // Put item back and wait 5 s
      GEO_QUEUE.unshift({ lat, lng, resolve });
      GEO_RUNNING = false;
      setTimeout(drainQueue, 5_001);
      return;

    } else {
      resolve(`${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`);
    }

  } catch (err) {
    console.error('[Geocode]', err.message);
    resolve(`${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`);
  }

  GEO_RUNNING = false;
  setTimeout(drainQueue, 200);
}

async function getAddress(lat, lng) {
  if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) return '--';
  const cached = memGet(lat, lng);
  if (cached) return cached;
  return new Promise(resolve => {
    GEO_QUEUE.push({ lat: Number(lat), lng: Number(lng), resolve });
    drainQueue();
  });
}

// ── Background address pre-warmer (runs at startup + every 10 min) ────────────
let prewarmBusy = false;

async function prewarmAddresses() {
  if (prewarmBusy || !GOOGLE_MAPS_API_KEY) return;
  prewarmBusy = true;
  try {
    const devices  = await DeviceMaster.find({ active: true }).select('IMEI_No').lean();
    const imeis    = devices.map(d => d.IMEI_No).filter(Boolean);
    const infoDocs = await DeviceInfo.aggregate([
      { $match: { imei: { $in: imeis } } },
      { $sort:  { server_received_at: -1 } },
      { $group: { _id: '$imei', info: { $first: '$$ROOT' } } },
    ]);
    let queued = 0;
    for (const { info } of infoDocs) {
      const lat = info?.lat ?? null;
      const lng = info?.lon ?? null;
      if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) continue;
      if (memGet(lat, lng)) continue;
      GEO_QUEUE.push({
        lat: Number(lat), lng: Number(lng),
        resolve: addr => memSet(lat, lng, addr),
      });
      queued++;
    }
    drainQueue();
    console.log(`[Prewarm] Queued ${queued} geocode requests`);
  } catch (e) {
    console.error('[Prewarm Error]', e.message);
  }
  prewarmBusy = false;
}

setTimeout(() => {
  prewarmAddresses();
  setInterval(prewarmAddresses, 10 * 60 * 1000);
}, 5_001);

// ══════════════════════════════════════════════════════════════════════════════
// § 2  STATS CACHE  (30 s TTL per user)
// ══════════════════════════════════════════════════════════════════════════════
const _statsCache = new Map();
const STATS_TTL   = 30_000;

// ══════════════════════════════════════════════════════════════════════════════
// § 3  PURE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const pad = (n, l = 2) => String(n).padStart(l, '0');

function fmtDate(d) {
  if (!d) return '--';
  const dt = new Date(d);
  if (isNaN(dt)) return '--';
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} `
       + `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function fmtDuration(minutes) {
  if (!minutes || minutes <= 0) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isRealAddress(addr) {
  if (!addr || addr === '--') return false;
  if (/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(String(addr).trim())) return false;
  if (String(addr).toLowerCase().includes('geocoding failed')) return false;
  if (String(addr).toLowerCase().includes('unable to resolve')) return false;
  return true;
}

function normalizeVehicleType(raw) {
  if (!raw) return 'car';
  const lower = String(raw).toLowerCase().trim();
  const map = {
    car:     ['car', 'sedan', 'hatchback', 'suv', 'muv', 'jeep', 'vehicle'],
    truck:   ['truck', 'lorry', 'heavy', 'ht', 'hvt'],
    bus:     ['bus', 'minibus', 'coach', 'schoolbus', 'school bus'],
    bike:    ['bike', 'motorcycle', 'scooter', 'two-wheeler', 'twowheeler', 'tw', '2w'],
    tractor: ['tractor', 'agri', 'agriculture', 'farm'],
    auto:    ['auto', 'autorickshaw', 'auto rickshaw', 'three-wheeler', 'threewheeler', '3w', 'e-rickshaw', 'erickshaw'],
    van:     ['van', 'mini van', 'minivan', 'cargo van', 'tempo'],
    pickup:  ['pickup', 'pick up', 'pick-up', 'utility', 'pu'],
    tanker:  ['tanker', 'tank', 'water tanker', 'fuel tanker', 'milk tanker'],
    JCB:     ['jcb', 'excavator', 'digger', 'bulldozer', 'crane', 'construction'],
  };
  for (const [type, aliases] of Object.entries(map)) {
    if (aliases.some(a => lower === a || lower.includes(a))) return type;
  }
  if (VALID_VEHICLE_TYPES.includes(raw)) return raw;
  return 'car';
}

// ══════════════════════════════════════════════════════════════════════════════
// § 4  SENSOR EXTRACTORS
// ══════════════════════════════════════════════════════════════════════════════

// ── AUX1 string parser — "field|battery|...|temp|humidity" ───────────────────
function parseAux1(aux1) {
  const result = { battery: null, temperature: null, humidity: null };
  if (!aux1 || typeof aux1 !== 'string' || aux1.trim() === '' || aux1.startsWith('|')) return result;
  try {
    const parts = aux1.split('|');
    if (parts.length >= 2) {
      const batt = parseFloat(parts[1]);
      if (!isNaN(batt)) result.battery = Math.min(100, Math.max(0, Math.round(batt)));
    }
    if (parts.length >= 4) {
      const temp = parseFloat(parts[3]);
      if (!isNaN(temp)) result.temperature = parseFloat(temp.toFixed(2));
    }
    if (parts.length >= 5) {
      const hum = parseFloat(parts[4]);
      if (!isNaN(hum)) result.humidity = Math.min(100, Math.max(0, Math.round(hum)));
    }
  } catch {}
  return result;
}

// ── GPS ───────────────────────────────────────────────────────────────────────
function extractGpsInfo(info) {
  if (!info) {
    return { gps: false, gpsStatus: 'off', gpsSatellites: 0, gpsLabel: 'Off | 0 🛰', fixType: 'No Fix', satellites: 0, altitude: null };
  }
  const satellites = Number(info.satellites ?? info.gpsSatellites ?? info.gps_satellites ?? 0);
  const rawFix     = String(info.gps_fix ?? '').trim();
  const gpsStatus  = info.gps_status;

  let gpsValid = false;
  if (rawFix === '1')                                                      gpsValid = true;
  else if (rawFix === '0')                                                 gpsValid = false;
  else if (typeof gpsStatus === 'boolean')                                 gpsValid = gpsStatus;
  else if (gpsStatus === 1 || gpsStatus === '1' || gpsStatus === 'true')  gpsValid = true;
  if (!gpsValid && satellites >= 4)                                        gpsValid = true;
  if (!gpsValid && info.lat && info.lon && Number(info.lat) !== 0)        gpsValid = true;

  let fixType;
  if (!gpsValid)            fixType = 'No Fix';
  else if (satellites >= 5) fixType = '3D Fix';
  else                      fixType = '2D Fix';

  return {
    gps:           gpsValid,
    gpsStatus:     gpsValid ? 'fixed' : 'nofix',
    gpsSatellites: satellites,
    gpsLabel:      `${fixType} | ${satellites} 🛰`,
    fixType,
    satellites,
    altitude:      info.altitude_m ?? null,
  };
}

// ── GSM signal ────────────────────────────────────────────────────────────────
function extractGsmInfo(info) {
  if (!info) return { gsmRaw: 0, gsmBars: 0, gsmPercent: 0, gsmLabel: 'No Signal' };
  const rawGsm = Number(info.gsm_strength ?? info.gsm_signal ?? info.gsmStrength ?? 0);
  if (rawGsm === 99 || rawGsm === 0) {
    return { gsmRaw: rawGsm, gsmBars: 0, gsmPercent: 0, gsmLabel: 'No Signal' };
  }
  let bars = 0;
  if (rawGsm >= 1  && rawGsm <= 7)  bars = 1;
  if (rawGsm >= 8  && rawGsm <= 14) bars = 2;
  if (rawGsm >= 15 && rawGsm <= 20) bars = 3;
  if (rawGsm >= 21)                  bars = 4;
  const percent = Math.round((rawGsm / 31) * 100);
  const labels  = ['No Signal', 'Poor', 'Fair', 'Good', 'Excellent'];
  return { gsmRaw: rawGsm, gsmBars: bars, gsmPercent: percent, gsmLabel: labels[bars] || 'No Signal' };
}

// ── Battery ───────────────────────────────────────────────────────────────────
function extractBatteryInfo(info) {
  if (!info) return { btrVoltage: 0, btrPercent: 0, btrLabel: '0%', temperature: null, humidity: null };
  const aux1Data = parseAux1(info.aux1);

  // Prefer AUX1 battery reading (most accurate for internal battery %)
  if (aux1Data.battery !== null) {
    return {
      btrVoltage:  Number(info.internal_batt_v ?? 0),
      btrPercent:  aux1Data.battery,
      btrLabel:    `${aux1Data.battery}%`,
      temperature: aux1Data.temperature,
      humidity:    aux1Data.humidity,
    };
  }

  const voltage = Number(info.internal_batt_v ?? info.battery_level ?? 0);
  if (voltage === 0) {
    return { btrVoltage: 0, btrPercent: 0, btrLabel: '0%', temperature: aux1Data.temperature, humidity: aux1Data.humidity };
  }

  let percent = 0;
  if (info.battery_level != null && Number(info.battery_level) > 5) {
    percent = Math.min(100, Math.max(0, Math.round(Number(info.battery_level))));
  } else if (voltage <= 5) {
    // Li-Ion cell voltage → %
    percent = Math.min(100, Math.max(0, Math.round(((voltage - 3.0) / (4.2 - 3.0)) * 100)));
  } else {
    percent = Math.min(100, Math.max(0, Math.round(voltage)));
  }

  return {
    btrVoltage:  voltage,
    btrPercent:  percent,
    btrLabel:    `${percent}%`,
    temperature: aux1Data.temperature,
    humidity:    aux1Data.humidity,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// § 5  STATE CALCULATOR
//      Thresholds: >5 min no heartbeat → unreachable (more lenient than old 60 min)
//      Both old route files merged — we use the stricter/more correct version:
//        • >60 min  → unreachable
//        • no heartbeat ever → 'new'
// ══════════════════════════════════════════════════════════════════════════════
function calculateState(info) {
  if (!info) return 'unreachable';

  const lastHB = info.server_received_at
    || info.gps_datetime_utc
    || info.last_heartbeat
    || info.updatedAt
    || null;

  if (!lastHB) return 'new';

  const diffMin = (Date.now() - new Date(lastHB).getTime()) / 60_000;
  if (diffMin > 60) return 'unreachable';

  const ignition = info.ignition === 1 || info.ignition === true;
  const spd      = info.speed_kmph ?? info.speed ?? 0;

  if (info.overspeed || spd > 80) return 'overspeed';
  if (ignition && spd > 0)        return 'running';
  if (ignition && spd === 0)      return 'idle';
  return 'stopped';
}

// ══════════════════════════════════════════════════════════════════════════════
// § 6  VEHICLE BUILDER
//      Single source of truth — used by /vehicles, /map, /vehicle/:vehicleNo
// ══════════════════════════════════════════════════════════════════════════════
function buildVehicle(device, info) {
  const state    = calculateState(info);
  const lastHB   = info?.server_received_at || info?.gps_datetime_utc || info?.last_heartbeat || info?.updatedAt || null;
  const lat      = info?.lat ?? null;
  const lng      = info?.lon ?? null;
  const spd      = info?.speed_kmph ?? info?.speed ?? 0;
  const ignition = info?.ignition === 1 || info?.ignition === true;

  const vehicleType = normalizeVehicleType(device.vehicle_type);

  let parkingDuration = null;
  if (lastHB && !ignition) {
    parkingDuration = Math.floor((Date.now() - new Date(lastHB).getTime()) / 60_000);
  }

  // Address: prefer stored real address, then memory cache, then coordinate string
  let address = '--';
  if (isRealAddress(info?.address)) {
    address = info.address;
    if (lat != null && lng != null) memSet(lat, lng, address);
  } else if (lat != null && lng != null) {
    const cached = memGet(lat, lng);
    address = cached || `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }

  const sinceMinutes = lastHB
    ? Math.floor((Date.now() - new Date(lastHB).getTime()) / 60_000)
    : 9999;

  const gpsInfo  = extractGpsInfo(info);
  const gsmInfo  = extractGsmInfo(info);
  const btrInfo  = extractBatteryInfo(info);
  const extPower = Number(info?.main_input_v ?? info?.external_voltage ?? 0);

  return {
    // ── Identity ──────────────────────────────────────────────────────────────
    _id:           device._id,
    vehicleId:     device._id.toString(),
    vehicle:       device.vehicle_no   || device.IMEI_No || '--',
    vehicleNo:     device.vehicle_no   || '--',
    type:          vehicleType,
    vehicleType:   vehicleType,
    state,
    branch:        device.branch       || '--',

    // ── Location ──────────────────────────────────────────────────────────────
    lat,
    lng,
    heading:       info?.heading_deg   ?? 0,
    address,
    poi:           info?.poi           || 'N/A',
    altitude:      gpsInfo.altitude,

    // ── Timestamps ────────────────────────────────────────────────────────────
    lu:            fmtDate(lastHB),
    luRaw:         lastHB,
    since:         ignition ? 'Moving' : fmtDuration(parkingDuration),
    sinceMin:      sinceMinutes,
    parking:       fmtDuration(parkingDuration),

    // ── Motion ────────────────────────────────────────────────────────────────
    spd,
    km: info?.odo_m != null
      ? Math.round(info.odo_m / 1000)
      : (device.odometer ?? 0),

    // ── Battery ───────────────────────────────────────────────────────────────
    btr:           btrInfo.btrPercent,
    btrVoltage:    btrInfo.btrVoltage,
    btrLabel:      btrInfo.btrLabel,
    temperature:   btrInfo.temperature,
    humidity:      btrInfo.humidity,

    // ── GSM ───────────────────────────────────────────────────────────────────
    gsm:           gsmInfo.gsmBars,
    gsmRaw:        gsmInfo.gsmRaw,
    gsmPercent:    gsmInfo.gsmPercent,
    gsmLabel:      gsmInfo.gsmLabel,

    // ── GPS ───────────────────────────────────────────────────────────────────
    gps:           gpsInfo.gps,
    gpsStatus:     gpsInfo.gpsStatus,
    gpsSatellites: gpsInfo.gpsSatellites,
    gpsLabel:      gpsInfo.gpsLabel,
    fixType:       gpsInfo.fixType,
    satellites:    gpsInfo.satellites,

    // ── Power & accessories ───────────────────────────────────────────────────
    extPower,
    ignition,
    ac:            info?.ac_status        ?? false,
    locked:        device.locked          ?? false,
    soc:           info?.soc              ?? 0,
    powerCut:      info?.power_cut        === 1,

    // ── Alerts ────────────────────────────────────────────────────────────────
    panic:         info?.emergency_status ?? false,
    overspeed:     info?.overspeed        ?? false,

    // ── Device / driver ───────────────────────────────────────────────────────
    iccid:         device.sim_card        || '--',
    driver:        device.driver_name     || '--',
    deviceName:    device.device_name     || '--',
    imei:          device.IMEI_No         || '--',
    IMEI:          device.IMEI_No         || '--',
    protocol:      info?.protocol         || '--',

    // ── Assignment ────────────────────────────────────────────────────────────
    assigned:      device.assigned        ?? false,
    client:        device.client          || '--',
    transporter:   device.transporter     || '--',
    group:         device.group           || '--',
    alias:         device.device_name     || device.vehicle_no || '--',

    // ── Role refs ─────────────────────────────────────────────────────────────
    adminId:       device.adminId         ?? null,
    dealerId:      device.dealerId        ?? null,
    userId:        device.user_id         ?? null,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// § 7  ROLE-BASED QUERY BUILDER
// ══════════════════════════════════════════════════════════════════════════════
async function buildRoleFilter(reqUser) {
  const { role, user_id } = reqUser;
  switch (role) {
    case 'super_admin': return {};
    case 'admin':       return { adminId:  user_id };
    case 'dealer':      return { dealerId: user_id };
    case 'user':        return { user_id:  user_id };
    default:
      console.warn(`[buildRoleFilter] Unknown role: ${role}`);
      return { _id: null };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 8  DEVICEINFO FETCHER
//      Resolves latest DeviceInfo for an array of DeviceMaster docs.
//      Tries imei field first (new schema), falls back to device_id (old schema).
// ══════════════════════════════════════════════════════════════════════════════
async function fetchInfoMap(devices) {
  if (!devices.length) return new Map();

  const imeis = devices.map(d => d.IMEI_No).filter(Boolean);

  if (!imeis.length) {
    // Pure old-schema fallback: match by device_id
    const ids      = devices.map(d => d._id);
    const docs     = await DeviceInfo.aggregate([
      {
        $match: {
          $or: [
            { device_id: { $in: ids } },
            { device_id: { $in: ids.map(id => id.toString()) } },
          ],
        },
      },
      { $sort:  { server_received_at: -1 } },
      { $group: { _id: '$device_id', doc: { $first: '$$ROOT' } } },
    ]);
    const map          = new Map();
    const idToImei     = {};
    devices.forEach(d => { idToImei[d._id.toString()] = d.IMEI_No; });
    docs.forEach(({ _id, doc }) => {
      const imei = idToImei[_id.toString()];
      if (imei) map.set(imei, doc);
      map.set(_id.toString(), doc);
    });
    return map;
  }

  // Primary: match by imei (new schema)
  const docs = await DeviceInfo.aggregate([
    { $match: { imei: { $in: imeis } } },
    { $sort:  { server_received_at: -1 } },
    { $group: { _id: '$imei', doc: { $first: '$$ROOT' } } },
  ]);

  const imeiMap = new Map();
  docs.forEach(({ _id, doc }) => imeiMap.set(_id, doc));

  // Fallback for devices whose IMEI wasn't matched (old schema)
  const unmatchedDevices = devices.filter(d => d.IMEI_No && !imeiMap.has(d.IMEI_No));
  if (unmatchedDevices.length > 0) {
    const ids          = unmatchedDevices.map(d => d._id);
    const fallbackDocs = await DeviceInfo.aggregate([
      {
        $match: {
          $or: [
            { device_id: { $in: ids } },
            { device_id: { $in: ids.map(id => id.toString()) } },
          ],
        },
      },
      { $sort:  { server_received_at: -1 } },
      { $group: { _id: '$device_id', doc: { $first: '$$ROOT' } } },
    ]);
    const idToImei = {};
    unmatchedDevices.forEach(d => { idToImei[d._id.toString()] = d.IMEI_No; });
    fallbackDocs.forEach(({ _id, doc }) => {
      const imei = idToImei[_id.toString()];
      if (imei) imeiMap.set(imei, doc);
    });
  }

  console.log(`[fetchInfoMap] ${imeis.length} IMEIs → ${imeiMap.size} info docs found`);
  return imeiMap;
}

// ══════════════════════════════════════════════════════════════════════════════
// § 9  STATS HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function computeStats(list) {
  return {
    all:         list.length,
    running:     list.filter(v => v.state === 'running').length,
    stopped:     list.filter(v => v.state === 'stopped').length,
    overspeed:   list.filter(v => v.state === 'overspeed').length,
    idle:        list.filter(v => v.state === 'idle').length,
    unreachable: list.filter(v => v.state === 'unreachable').length,
    new:         list.filter(v => v.state === 'new').length,
    inactive:    list.filter(v => v.state === 'inactive').length,
  };
}

async function getStatsFresh(reqUser) {
  const key    = `${reqUser.role}_${reqUser.user_id}`;
  const cached = _statsCache.get(key);
  if (cached && Date.now() - cached.ts < STATS_TTL) return cached.stats;

  const roleFilter = await buildRoleFilter(reqUser);
  const devices    = await DeviceMaster.find({ active: true, ...roleFilter })
    .select('_id IMEI_No')
    .lean();
  const infoMap    = await fetchInfoMap(devices);

  const states = devices.map(d => {
    const info = infoMap.get(d.IMEI_No) || infoMap.get(d._id.toString()) || null;
    return calculateState(info);
  });

  const stats = {
    all:         devices.length,
    running:     states.filter(s => s === 'running').length,
    stopped:     states.filter(s => s === 'stopped').length,
    overspeed:   states.filter(s => s === 'overspeed').length,
    idle:        states.filter(s => s === 'idle').length,
    unreachable: states.filter(s => s === 'unreachable').length,
    new:         states.filter(s => s === 'new').length,
    inactive:    states.filter(s => s === 'inactive').length,
  };

  _statsCache.set(key, { stats, ts: Date.now() });
  return stats;
}

// Helper: resolve user_id from numeric string or ObjectId
async function resolveUserId(id) {
  if (!id) return null;
  const numId = Number(id);
  if (!isNaN(numId) && String(numId) === String(id)) return numId;
  if (mongoose.Types.ObjectId.isValid(id) && String(id).length === 24) {
    const user = await User.findById(id).lean();
    if (user?.user_id) return user.user_id;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// § 10  ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// GET /filters/admins
// Only super_admin can see admin list
// ─────────────────────────────────────────────────────────────────────────────
router.get('/filters/admins', async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.json({ success: true, admins: [], total: 0 });
    }

    const admins = await User.find({
      active: { $ne: false },
      $or: [{ role: 'admin' }, { userRole: 'admin' }, { user_type: 'admin' }],
    })
      .select('user_id username fullName name company phone email status role userRole')
      .lean();

    const formatted = admins.map(a => ({
      user_id:  a.user_id,
      label:    a.fullName || a.name || a.username || `Admin #${a.user_id}`,
      username: a.username || '',
      company:  a.company  || '',
      phone:    a.phone    || '',
      email:    a.email    || '',
      status:   a.status   || 'Active',
    }));

    console.log(`[filters/admins] super_admin → ${formatted.length} admins`);
    return res.json({ success: true, admins: formatted, total: formatted.length });
  } catch (err) {
    console.error('[filters/admins]', err);
    return res.status(500).json({ success: false, message: err.message, admins: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /filters/dealers?adminId=123
// super_admin and admin can see dealers
// ─────────────────────────────────────────────────────────────────────────────
router.get('/filters/dealers', async (req, res) => {
  try {
    const { role, user_id } = req.user;
    const { adminId }       = req.query;

    if (role !== 'super_admin' && role !== 'admin') {
      return res.json({ success: true, dealers: [], total: 0 });
    }

    const dealerRoleConditions = [
      { role: 'dealer' }, { userRole: 'dealer' }, { user_type: 'dealer' },
    ];
    let query = { active: { $ne: false } };

    if (role === 'super_admin') {
      const numAdminId = Number(adminId);
      if (adminId && adminId !== '' && adminId !== 'all' && !isNaN(numAdminId)) {
        query.$and = [
          { $or: dealerRoleConditions },
          { $or: [
            { adminId:   numAdminId },
            { createdBy: numAdminId },
            { parentId:  numAdminId },
            { admin_id:  numAdminId },
          ]},
        ];
      } else {
        query.$or = dealerRoleConditions;
      }
    } else {
      // admin — sees only their own dealers
      query.$and = [
        { $or: dealerRoleConditions },
        { $or: [
          { adminId:   user_id },
          { createdBy: user_id },
          { parentId:  user_id },
          { admin_id:  user_id },
        ]},
      ];
    }

    const dealers = await User.find(query)
      .select('user_id username fullName name company phone email status role userRole adminId createdBy parentId')
      .lean();

    const formatted = dealers.map(d => ({
      user_id:  d.user_id,
      label:    d.fullName || d.name || d.username || `Dealer #${d.user_id}`,
      username: d.username || '',
      company:  d.company  || '',
      phone:    d.phone    || '',
      email:    d.email    || '',
      status:   d.status   || 'Active',
    }));

    console.log(`[filters/dealers] role=${role} adminId=${adminId} → ${formatted.length} dealers`);
    return res.json({ success: true, dealers: formatted, total: formatted.length });
  } catch (err) {
    console.error('[filters/dealers]', err);
    return res.status(500).json({ success: false, message: err.message, dealers: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /filters/users?dealerId=123&adminId=456
// super_admin, admin, dealer can see users
// ─────────────────────────────────────────────────────────────────────────────
router.get('/filters/users', async (req, res) => {
  try {
    const { role, user_id }   = req.user;
    const { dealerId, adminId } = req.query;

    if (!['super_admin', 'admin', 'dealer'].includes(role)) {
      return res.json({ success: true, users: [], total: 0 });
    }

    const userRoleConditions = [
      { role: 'user' }, { userRole: 'user' }, { user_type: 'user' },
    ];
    let query = { active: { $ne: false } };

    if (role === 'super_admin') {
      const numDealerId = Number(dealerId);
      const numAdminId  = Number(adminId);

      if (dealerId && dealerId !== '' && dealerId !== 'all' && !isNaN(numDealerId)) {
        query.$or = [
          { dealerId:  numDealerId },
          { createdBy: numDealerId },
          { parentId:  numDealerId },
          { dealer_id: numDealerId },
        ];
      } else if (adminId && adminId !== '' && adminId !== 'all' && !isNaN(numAdminId)) {
        query.$or = [
          { adminId:   numAdminId },
          { createdBy: numAdminId },
          { parentId:  numAdminId },
        ];
      } else {
        query.$or = userRoleConditions;
      }

    } else if (role === 'admin') {
      const numDealerId = Number(dealerId);
      if (dealerId && dealerId !== '' && dealerId !== 'all' && !isNaN(numDealerId)) {
        // Verify dealer belongs to this admin
        const dealerExists = await User.findOne({
          user_id: numDealerId,
          $or: [
            {
              $and: [
                { $or: [{ role: 'dealer' }, { userRole: 'dealer' }] },
                { $or: [{ adminId: user_id }, { createdBy: user_id }, { parentId: user_id }] },
              ],
            },
          ],
        }).lean();
        if (!dealerExists) return res.json({ success: true, users: [], total: 0 });

        query.$or = [
          { dealerId:  numDealerId },
          { createdBy: numDealerId },
          { parentId:  numDealerId },
        ];
      } else {
        query.$or = [
          { adminId:   user_id },
          { createdBy: user_id },
          { parentId:  user_id },
        ];
      }

    } else if (role === 'dealer') {
      query.$or = [
        { dealerId:  user_id },
        { createdBy: user_id },
        { parentId:  user_id },
        { dealer_id: user_id },
      ];
    }

    const users = await User.find(query)
      .select('user_id username fullName name company phone email status role userRole')
      .lean();

    const formatted = users.map(u => ({
      user_id:  u.user_id,
      label:    u.fullName || u.name || u.username || `User #${u.user_id}`,
      username: u.username || '',
      company:  u.company  || '',
      phone:    u.phone    || '',
      email:    u.email    || '',
      status:   u.status   || 'Active',
      role:     u.role     || u.userRole || 'user',
    }));

    console.log(`[filters/users] role=${role} dealerId=${dealerId} adminId=${adminId} → ${formatted.length} users`);
    return res.json({ success: true, users: formatted, total: formatted.length });
  } catch (err) {
    console.error('[filters/users]', err);
    return res.status(500).json({ success: false, message: err.message, users: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /filters/options
// Distinct values for client / transporter / group / branch / vehicleType
// ─────────────────────────────────────────────────────────────────────────────
router.get('/filters/options', async (req, res) => {
  try {
    const roleFilter = await buildRoleFilter(req.user);
    const base       = { active: true, ...roleFilter };
    const clean      = arr => arr.filter(v => v && String(v).trim() !== '' && v !== 'all').sort();

    const [clients, transporters, groups, branches, vehicleTypes] = await Promise.all([
      DeviceMaster.distinct('client',       { ...base, client:       { $nin: [null, ''] } }),
      DeviceMaster.distinct('transporter',  { ...base, transporter:  { $nin: [null, ''] } }),
      DeviceMaster.distinct('group',        { ...base, group:        { $nin: [null, ''] } }),
      DeviceMaster.distinct('branch',       { ...base, branch:       { $nin: [null, ''] } }),
      DeviceMaster.distinct('vehicle_type', { ...base, vehicle_type: { $nin: [null, ''] } }),
    ]);

    return res.json({
      success:      true,
      clients:      clean(clients),
      transporters: clean(transporters),
      groups:       clean(groups),
      branches:     clean(branches),
      vehicleTypes: clean(vehicleTypes).filter(t => VALID_VEHICLE_TYPES.includes(t)),
    });
  } catch (err) {
    console.error('[filters/options]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /vehicles
// Main vehicle list — used by both Dashboard (table) and AdvanceDashboard (cards)
// Query params: search, lockStatus, client, transporter, group, since,
//               vehicleType, dealerId, userId, adminId, state, page, limit
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vehicles', protect, async (req, res) => {
  try {
    const {
      search, lockStatus, client, transporter, group,
      since, vehicleType,
      dealerId, userId,
      adminId,   // filter modal se
    } = req.query;
 
    const { role, user_id } = req.user;
 
    // ── STEP 1: Role-based base filter — direct keys se ───────────────────
    // Koi DB join nahi, koi aggregation nahi
    // VehicleLatestStatus mein pehle se adminId/dealerId/userId stored hai
    const baseFilter = {};
 
    switch (role) {
      case 'super_admin':
        // Agar filter modal se adminId aaya ho
        if (adminId && adminId !== '' && adminId !== 'all') {
          baseFilter.adminId = Number(adminId);
        }
        break;
      case 'admin':
        baseFilter.adminId = user_id;
        break;
      case 'dealer':
        baseFilter.dealerId = user_id;
        break;
      case 'user':
        baseFilter.userId = user_id;
        break;
      default:
        return res.json({ success: true, data: [], stats: { all:0, running:0, stopped:0, overspeed:0, idle:0, unreachable:0, new:0, inactive:0 }, total: 0, timestamp: new Date().toISOString() });
    }
 
    // ── STEP 2: Extra filters from query params ───────────────────────────
    if (dealerId && dealerId !== 'all' && dealerId !== '') {
      baseFilter.dealerId = Number(dealerId);
    }
    if (userId && userId !== 'all' && userId !== '') {
      baseFilter.userId = Number(userId);
    }
    if (lockStatus === 'locked')   baseFilter.locked = true;
    if (lockStatus === 'unlocked') baseFilter.locked = false;
    if (vehicleType && vehicleType !== 'all' && VALID_VEHICLE_TYPES.includes(vehicleType)) {
      baseFilter.vehicleType = vehicleType;
    }
    if (search && search.trim()) {
      const re = new RegExp(search.trim(), 'i');
      baseFilter.$or = [
        { vehicle:    re },
        { driverName: re },
        { deviceName: re },
        { imei:       re },
        { simCard:    re },
      ];
    }
 
    // ── STEP 3: Direct find() — NO aggregation, NO sort on huge collection ─
    const latestDocs = await VehicleLatestStatus.find(baseFilter).lean();
 
    if (!latestDocs.length) {
      return res.json({
        success: true, data: [],
        stats: { all:0, running:0, stopped:0, overspeed:0, idle:0, unreachable:0, new:0, inactive:0 },
        total: 0, timestamp: new Date().toISOString(),
      });
    }
 
    // ── STEP 4: Build vehicle list from VehicleLatestStatus docs ──────────
    // Koi extra DB call nahi — sab data pehle se stored hai
    const now = Date.now();
 
    const vehicleList = latestDocs.map(doc => {
      // State recalculate karo (real-time accuracy ke liye)
      const lastHB    = doc.packetTime || doc.updatedAt || null;
      const diffMin   = lastHB ? (now - new Date(lastHB).getTime()) / 60_000 : 9999;
      const ignition  = doc.ignition === 1 || doc.ignition === true;
      const spd       = doc.speed || 0;
 
      let state = doc.state || 'unreachable';
      // Real-time state recalc (timeout check)
      if (!lastHB)                      state = 'new';
      else if (diffMin > 60)            state = 'unreachable';
      else if (doc.overspeed || spd > 80) state = 'overspeed';
      else if (ignition && spd > 0)     state = 'running';
      else if (ignition && spd === 0)   state = 'idle';
      else                              state = 'stopped';
 
      // Parking duration
      let parkingDuration = null;
      if (lastHB && !ignition) parkingDuration = Math.floor(diffMin);
      const fmtDuration = m => {
        if (!m || m <= 0) return '--';
        const h = Math.floor(m / 60), mn = Math.floor(m % 60);
        return h > 0 ? `${h}h ${mn}m` : `${mn}m`;
      };
 
      // Address — stored hai, cache se nikalo
      let address = doc.address || '--';
      if ((!address || address === '--') && doc.lat && doc.lng) {
        const cached = memGet(doc.lat, doc.lng);
        address = cached || `${Number(doc.lat).toFixed(6)}, ${Number(doc.lng).toFixed(6)}`;
      }
 
      // GPS info
      const satellites  = doc.satellites || 0;
      const rawFix      = doc.gpsFix || '0';
      let gpsValid      = rawFix === '1' || satellites >= 4 || (doc.lat && Number(doc.lat) !== 0);
      const fixType     = !gpsValid ? 'No Fix' : satellites >= 5 ? '3D Fix' : '2D Fix';
 
      // GSM info
      const rawGsm = doc.gsmStrength || 0;
      let gsmBars  = 0;
      if (rawGsm >= 1  && rawGsm <= 7)  gsmBars = 1;
      if (rawGsm >= 8  && rawGsm <= 14) gsmBars = 2;
      if (rawGsm >= 15 && rawGsm <= 20) gsmBars = 3;
      if (rawGsm >= 21)                 gsmBars = 4;
      const gsmPercent = rawGsm > 0 && rawGsm !== 99 ? Math.round((rawGsm / 31) * 100) : 0;
 
      // Battery — aux1 se ya direct
      const aux1Data   = parseAux1(doc.aux1 || '');
      const btrPercent = aux1Data.battery !== null
        ? aux1Data.battery
        : Math.min(100, Math.max(0, Math.round(doc.internalBattV || 0)));
 
      // Last update format
      const luFormatted = lastHB ? fmtDate(new Date(lastHB)) : '--';
      const sinceMinutes = lastHB ? Math.floor(diffMin) : 9999;
 
      return {
        // Identity
        vehicle:     doc.vehicle     || '--',
        vehicleNo:   doc.vehicle     || '--',
        type:        normalizeVehicleType(doc.vehicleType),
        vehicleType: normalizeVehicleType(doc.vehicleType),
        imei:        doc.imei        || '--',
        IMEI:        doc.imei        || '--',
        iccid:       doc.simCard     || '--',
 
        // State & location
        state,
        lat:         doc.lat         ?? null,
        lng:         doc.lng         ?? null,
        spd,
        heading:     doc.heading     || 0,
        address,
        poi:         doc.poi         || 'N/A',
 
        // Time fields
        lu:          luFormatted,
        luRaw:       lastHB,
        since:       ignition ? 'Moving' : fmtDuration(parkingDuration),
        sinceMin:    sinceMinutes,
        parking:     fmtDuration(parkingDuration),
 
        // Vehicle info
        branch:      doc.branch      || '--',
        driver:      doc.driverName  || '--',
        deviceName:  doc.deviceName  || '--',
        locked:      doc.locked      ?? false,
        assigned:    doc.assigned    ?? false,
        km:          doc.odoM ? Math.round(doc.odoM / 1000) : 0,
 
        // Battery
        btr:         btrPercent,
        btrVoltage:  doc.internalBattV || 0,
        btrLabel:    `${btrPercent}%`,
        temperature: aux1Data.temperature,
        humidity:    aux1Data.humidity,
 
        // GSM
        gsm:         gsmBars,
        gsmRaw:      rawGsm,
        gsmPercent,
        gsmLabel:    ['No Signal','Poor','Fair','Good','Excellent'][gsmBars] || 'No Signal',
 
        // GPS
        gps:           gpsValid,
        gpsStatus:     gpsValid ? 'fixed' : 'nofix',
        gpsSatellites: satellites,
        gpsLabel:      `${fixType} | ${satellites} 🛰`,
        fixType,
        satellites,
        altitude:      doc.altitude ?? null,
 
        // Other sensors
        extPower:    doc.mainInputV  || 0,
        ac:          doc.acStatus    ?? false,
        soc:         doc.soc         ?? 0,
        ignition,
        panic:       doc.emergency   ?? false,
        powerCut:    doc.powerCut    === 1,
        overspeed:   doc.overspeed   ?? false,
 
        // Hierarchy
        adminId:     doc.adminId     ?? null,
        dealerId:    doc.dealerId    ?? null,
        userId:      doc.userId      ?? null,
      };
    });
 
    // ── STEP 5: Since filter ──────────────────────────────────────────────
    let finalList = vehicleList;
    if (since && parseInt(since) > 0) {
      finalList = vehicleList.filter(v => v.sinceMin <= parseInt(since) * 60);
    }
 
    // ── STEP 6: Stats compute ─────────────────────────────────────────────
    const stats = {
      all:         finalList.length,
      running:     finalList.filter(v => v.state === 'running').length,
      stopped:     finalList.filter(v => v.state === 'stopped').length,
      overspeed:   finalList.filter(v => v.state === 'overspeed').length,
      idle:        finalList.filter(v => v.state === 'idle').length,
      unreachable: finalList.filter(v => v.state === 'unreachable').length,
      new:         finalList.filter(v => v.state === 'new').length,
      inactive:    finalList.filter(v => v.state === 'inactive').length,
    };
 
    // ── STEP 7: Background address update (without blocking response) ─────
    finalList.forEach(v => {
      if ((!v.address || v.address === '--' || /^-?\d/.test(v.address)) && v.lat && v.lng) {
        getAddress(v.lat, v.lng).then(addr => {
          if (addr && addr !== '--' && !/^-?\d+\.?\d*,/.test(addr)) {
            memSet(v.lat, v.lng, addr);
            // VehicleLatestStatus mein bhi update karo
            VehicleLatestStatus.updateOne(
              { imei: v.imei },
              { $set: { address: addr } }
            ).catch(() => {});
          }
        }).catch(() => {});
      }
    });
 
    return res.json({
      success: true,
      data:    finalList,
      stats,
      total:   finalList.length,
      timestamp: new Date().toISOString(),
    });
 
  } catch (err) {
    console.error('[dashboard/vehicles]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
 


// ─────────────────────────────────────────────────────────────────────────────
// GET /map
// Lightweight map payload — only vehicles with valid coordinates
// ─────────────────────────────────────────────────────────────────────────────
router.get('/map', async (req, res) => {
  try {
    const { client, transporter, group, dealerId, userId, adminId, state } = req.query;

    const roleFilter  = await buildRoleFilter(req.user);
    const masterQuery = { active: true, ...roleFilter };

    if (adminId  && adminId  !== 'all' && adminId  !== '') { const n = Number(adminId);  if (!isNaN(n)) masterQuery.adminId  = n; }
    if (dealerId && dealerId !== 'all' && dealerId !== '') { const n = Number(dealerId); if (!isNaN(n)) masterQuery.dealerId = n; }
    if (userId   && userId   !== 'all' && userId   !== '') { const n = Number(userId);   if (!isNaN(n)) masterQuery.user_id  = n; }

    if (client      && client      !== 'all') { const n = await resolveUserId(client);      masterQuery.client      = n || client; }
    if (transporter && transporter !== 'all') { const n = await resolveUserId(transporter); masterQuery.transporter = n || transporter; }
    if (group       && group       !== 'all') masterQuery.group = group;

    const devices = await DeviceMaster.find(masterQuery, DEVICE_SELECT_FIELDS).lean();
    if (!devices.length) {
      return res.json({ success: true, data: [], count: 0, timestamp: new Date().toISOString() });
    }

    const imeis = devices.map(d => d.IMEI_No).filter(Boolean);

    // Only fetch info docs that have coordinates (map only needs positioned vehicles)
    const latestInfos = await DeviceInfo.aggregate([
      {
        $match: {
          imei: { $in: imeis },
          lat:  { $exists: true, $ne: null },
          lon:  { $exists: true, $ne: null },
        },
      },
      { $sort:  { server_received_at: -1 } },
      { $group: { _id: '$imei', doc: { $first: '$$ROOT' } } },
    ]);

    const infoMap = new Map();
    latestInfos.forEach(({ _id, doc }) => infoMap.set(_id, doc));

    // Old-schema fallback for unmatched devices
    const unmatchedDevices = devices.filter(d => d.IMEI_No && !infoMap.has(d.IMEI_No));
    if (unmatchedDevices.length) {
      const ids = unmatchedDevices.map(d => d._id);
      const fallback = await DeviceInfo.aggregate([
        {
          $match: {
            $or: [
              { device_id: { $in: ids } },
              { device_id: { $in: ids.map(id => id.toString()) } },
            ],
            lat: { $exists: true, $ne: null },
            lon: { $exists: true, $ne: null },
          },
        },
        { $sort:  { server_received_at: -1 } },
        { $group: { _id: '$device_id', doc: { $first: '$$ROOT' } } },
      ]);
      const idToImei = {};
      unmatchedDevices.forEach(d => { idToImei[d._id.toString()] = d.IMEI_No; });
      fallback.forEach(({ _id, doc }) => {
        const imei = idToImei[_id.toString()];
        if (imei) infoMap.set(imei, doc);
      });
    }

    let mapData = devices
      .filter(d => d.IMEI_No && infoMap.has(d.IMEI_No))
      .map(d => buildVehicle(d, infoMap.get(d.IMEI_No)))
      .filter(v => v.lat != null && v.lng != null);

    if (state && state !== 'all') {
      mapData = mapData.filter(v => v.state === state);
    }

    return res.json({
      success:   true,
      data:      mapData,
      count:     mapData.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[dashboard/map]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /stats
// Cached per-user stats (30 s TTL)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStatsFresh(req.user);
    return res.json({ success: true, stats, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[dashboard/stats]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /vehicle/:vehicleNo
// Full detail + 24 h history for a single vehicle
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vehicle/:vehicleNo', async (req, res) => {
  try {
    const roleFilter = await buildRoleFilter(req.user);

    const device = await DeviceMaster.findOne({
      vehicle_no: req.params.vehicleNo,
      active:     true,
      ...roleFilter,
    }).lean();

    if (!device) {
      return res.status(404).json({ success: false, error: 'Vehicle not found or not accessible' });
    }

    // Latest DeviceInfo — try by IMEI first, then by ObjectId
    let info = null;
    if (device.IMEI_No) {
      info = await DeviceInfo.findOne({ imei: device.IMEI_No })
        .sort({ server_received_at: -1 }).lean();
    }
    if (!info) {
      info = await DeviceInfo.findOne({
        $or: [{ device_id: device._id }, { device_id: device._id.toString() }],
      }).sort({ server_received_at: -1 }).lean();
    }

    let vehicle = buildVehicle(device, info || null);

    // Resolve address if not already real
    if (!isRealAddress(vehicle.address) && vehicle.lat && vehicle.lng) {
      const addr = await getAddress(vehicle.lat, vehicle.lng);
      if (isRealAddress(addr)) vehicle.address = addr;
    }

    // 24 h history
    const since24h     = new Date(Date.now() - 86_400_000);
    const historyQuery = device.IMEI_No
      ? { imei: device.IMEI_No }
      : { $or: [{ device_id: device._id }, { device_id: device._id.toString() }] };

    const historyDocs = await DeviceInfo.find({
      ...historyQuery,
      server_received_at: { $gte: since24h },
    }).sort({ server_received_at: -1 }).limit(100).lean();

    vehicle.history = historyDocs.map(h => {
      const hGps = extractGpsInfo(h);
      const hGsm = extractGsmInfo(h);
      const hBtr = extractBatteryInfo(h);
      return {
        time:          fmtDate(h.server_received_at || h.gps_datetime_utc),
        speed:         h.speed_kmph ?? h.speed ?? 0,
        lat:           h.lat,
        lng:           h.lon,
        heading:       h.heading_deg ?? 0,
        ignition:      h.ignition === 1 || h.ignition === true,
        address:       h.address || '--',
        gps:           hGps.gps,
        gpsStatus:     hGps.gpsStatus,
        gpsLabel:      hGps.gpsLabel,
        gpsSatellites: hGps.gpsSatellites,
        fixType:       hGps.fixType,
        altitude:      h.altitude_m ?? null,
        gsm:           hGsm.gsmBars,
        gsmRaw:        hGsm.gsmRaw,
        gsmLabel:      hGsm.gsmLabel,
        btr:           hBtr.btrPercent,
        temperature:   hBtr.temperature,
        humidity:      hBtr.humidity,
      };
    });

    return res.json({ success: true, data: vehicle });
  } catch (err) {
    console.error('[dashboard/vehicle/:vehicleNo]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /address/:lat/:lng
// Reverse-geocode a coordinate — used by frontend address cache
// ─────────────────────────────────────────────────────────────────────────────
router.get('/address/:lat/:lng', async (req, res) => {
  try {
    const lat = parseFloat(req.params.lat);
    const lng = parseFloat(req.params.lng);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }
    const address = await getAddress(lat, lng);
    return res.json({ success: true, address });
  } catch (err) {
    console.error('[dashboard/address]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /update-address
// Save a resolved address back to the DeviceInfo record
// Body: { deviceId?, lat, lng }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/update-address', async (req, res) => {
  try {
    const { deviceId, lat, lng } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat/lng required' });
    }
    const address = await getAddress(lat, lng);
    if (deviceId) {
      const device = await DeviceMaster.findById(deviceId).select('IMEI_No').lean();
      if (device?.IMEI_No) {
        await DeviceInfo.updateOne(
          { imei: device.IMEI_No },
          { $set: { address } },
          { upsert: false }
        );
      }
    }
    return res.json({ success: true, address });
  } catch (err) {
    console.error('[dashboard/update-address]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /vehicle/:vehicleNo/command
// lock / unlock a vehicle — role-scoped
// Body: { command: 'lock' | 'unlock' }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/vehicle/:vehicleNo/command', async (req, res) => {
  try {
    const { vehicleNo } = req.params;
    const { command }   = req.body;
    const roleFilter    = await buildRoleFilter(req.user);

    const device = await DeviceMaster.findOne({
      vehicle_no: vehicleNo,
      active:     true,
      ...roleFilter,
    });

    if (!device) {
      return res.status(404).json({ success: false, error: 'Vehicle not found or not accessible' });
    }

    if (command === 'lock')   device.locked = true;
    if (command === 'unlock') device.locked = false;
    await device.save();

    // Invalidate stats cache for this user
    _statsCache.delete(`${req.user.role}_${req.user.user_id}`);

    return res.json({
      success: true,
      message: `Command '${command}' sent to ${vehicleNo}`,
      data: {
        vehicleNo,
        command,
        locked:    device.locked,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[dashboard/command]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
module.exports = router;

// Named exports — useful if other files (socket handler, cron jobs) need them
module.exports.buildRoleFilter      = buildRoleFilter;
module.exports.buildVehicle         = buildVehicle;
module.exports.fetchInfoMap         = fetchInfoMap;
module.exports.calculateState       = calculateState;
module.exports.extractBatteryInfo   = extractBatteryInfo;
module.exports.extractGsmInfo       = extractGsmInfo;
module.exports.extractGpsInfo       = extractGpsInfo;
module.exports.parseAux1            = parseAux1;
module.exports.normalizeVehicleType = normalizeVehicleType;
module.exports.getAddress           = getAddress;
module.exports.memGet               = memGet;
module.exports.memSet               = memSet;