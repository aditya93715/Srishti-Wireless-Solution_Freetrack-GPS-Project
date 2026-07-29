const mongoose = require('mongoose');
const axios    = require('axios');

const DeviceMaster = mongoose.models.DeviceMaster || require('../models/DeviceMaster');
const DeviceInfo   = mongoose.models.DeviceInfo   || require('../models/DeviceInfo');
const User         = mongoose.models.User         || require('../models/User');

const OVERSPEED_THRESHOLD         = parseInt(process.env.OVERSPEED_THRESHOLD || '80', 10);
const UNREACHABLE_TIMEOUT_MINUTES = parseInt(process.env.UNREACHABLE_TIMEOUT_MINUTES || '60', 10);
const GOOGLE_MAPS_API_KEY         = process.env.GOOGLE_MAPS_API_KEY;

// ── Address cache (shared with server.js via global, or kept local) ───────────
const addressCache = global._dashAddrCache || (global._dashAddrCache = new Map());

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad    = (n, l = 2) => String(n).padStart(l, '0');

function fmtDate(d) {
  if (!d) return '--';
  const dt = new Date(d);
  if (isNaN(dt)) return '--';
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} `
       + `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function sinceStr(lastHB) {
  if (!lastHB) return '--';
  const diff = Math.floor((Date.now() - new Date(lastHB).getTime()) / 60000);
  if (diff < 1)  return 'Just now';
  const h = Math.floor(diff / 60), m = diff % 60;
  if (h === 0)   return `${m}M`;
  if (m === 0)   return `${h}H`;
  return `${h}H ${m}M`;
}

function deriveState(info) {
  if (!info) return 'unreachable';
  const lastHB  = info.gps_datetime_utc || info.server_received_at
                || info.last_heartbeat  || info.updatedAt || null;
  if (!lastHB)  return 'new';
  const diffMin = (Date.now() - new Date(lastHB).getTime()) / 60000;
  if (diffMin > UNREACHABLE_TIMEOUT_MINUTES) return 'unreachable';
  const ign = info.ignition === 1 || info.ignition === true;
  const spd = info.speed_kmph ?? info.speed ?? 0;
  if (info.overspeed || spd > OVERSPEED_THRESHOLD) return 'overspeed';
  if (ign && spd > 0)   return 'running';
  if (ign && spd === 0) return 'idle';
  return 'stopped';
}

async function getAddress(lat, lng) {
  if (!lat || !lng) return '--';
  const key    = `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
  const cached = addressCache.get(key);
  if (cached && (Date.now() - cached.ts) < 3600000) return cached.addr;

  try {
    if (!GOOGLE_MAPS_API_KEY) return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    if (data.status === 'OK' && data.results?.[0]) {
      const addr = data.results[0].formatted_address;
      addressCache.set(key, { addr, ts: Date.now() });
      return addr;
    }
  } catch {}
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}

function buildVehicle(device, info, address) {
  const lat   = info?.lat ?? info?.latitude  ?? null;
  const lng   = info?.lon ?? info?.longitude ?? null;
  const lastHB = info?.gps_datetime_utc || info?.server_received_at
               || info?.last_heartbeat  || info?.updatedAt || null;
  return {
    vehicle:  device.vehicle_no  || device.IMEI_No || '--',
    type:     device.vehicle_type || 'car',
    state:    deriveState(info),
    lat, lng,
    spd:      info?.speed_kmph ?? info?.speed ?? 0,
    address:  address || '--',
    ignition: info?.ignition === 1 || info?.ignition === true,
    locked:   device.locked      ?? false,
    driver:   device.driver_name || '--',
    branch:   device.branch      || '--',
    lu:       lastHB ? fmtDate(lastHB) : '--',
    luRaw:    lastHB,
    since:    sinceStr(lastHB),
    km:       info?.odo_m ? Math.round(info.odo_m / 1000) : (info?.odometer ?? 0),
    btr:      info?.internal_batt_v ? Math.round(info.internal_batt_v * 10) : (info?.battery_level ?? 0),
    gsm:      info?.gsm_strength ?? info?.gsm_signal ?? 0,
    gps:      (info?.gps_fix && info.gps_fix !== '0') || info?.gps_status || false,
    ac:       info?.ac_status  ?? false,
    soc:      info?.soc        ?? 0,
    extPower: info?.main_input_v ?? info?.external_voltage ?? 0,
    panic:    info?.emergency_status ?? false,
    iccid:    device.sim_card  || '--',
    alias:    device.device_name || device.vehicle_no || '--',
    client:   device.client    || '--',
    transporter: device.transporter || '--',
    group:    device.group     || '--',
    // ── hierarchy IDs (useful for debugging) ──
    adminId:  device.adminId,
    dealerId: device.dealerId,
    userId:   device.user_id,
  };
}

// ── CORE: build role-based device query ───────────────────────────────────────
function buildDeviceQuery(user) {
  const base = { active: true,     vehicle_no: { $exists: true, $ne: '' }};

  switch (user.role) {
    case 'super_admin':
      // sees everything — no extra filter
      return base;

    case 'admin':
      // sees only devices where adminId === this admin's user_id
      return { ...base, adminId: user.user_id };

    case 'dealer':
      // sees only devices where dealerId === this dealer's user_id
      return { ...base, dealerId: user.user_id };

    case 'user':
      // sees only devices assigned to themselves
      return { ...base, user_id: user.user_id };

    default:
      // unknown role — return nothing
      return { ...base, _id: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/vehicles
// ─────────────────────────────────────────────────────────────────────────────
exports.getVehicles = async (req, res) => {
  try {
    const user        = req.user;
    const deviceQuery = buildDeviceQuery(user);

    // Optional extra filters from query string
    if (req.query.client)     deviceQuery.client     = req.query.client;
    if (req.query.transporter) deviceQuery.transporter = req.query.transporter;
    if (req.query.group)      deviceQuery.group      = req.query.group;
    if (req.query.lockStatus) deviceQuery.locked     = req.query.lockStatus === 'locked';

    const devices = await DeviceMaster.find(deviceQuery, {
      _id:1, vehicle_no:1, IMEI_No:1, vehicle_type:1,
      driver_name:1, locked:1, branch:1, client:1,
      transporter:1, group:1, device_name:1, sim_card:1,
      adminId:1, dealerId:1, user_id:1,
    }).lean();

    if (!devices.length) {
      return res.json({
        success: true,
        data: [],
        stats: { all:0, running:0, stopped:0, overspeed:0, idle:0, unreachable:0, new:0, inactive:0 },
      });
    }

    const imeis        = devices.map(d => d.IMEI_No).filter(Boolean);
    const imeiToDevice = Object.fromEntries(devices.map(d => [d.IMEI_No, d]));

    // latest DeviceInfo per IMEI
    const infoDocs = await DeviceInfo.aggregate([
      { $match: { imei: { $in: imeis } } },
      { $sort:  { server_received_at: -1 } },
      { $group: { _id: '$imei', info: { $first: '$$ROOT' } } },
    ]);

    const infoMap = Object.fromEntries(infoDocs.map(d => [d._id, d.info]));

    // Filter by last-update time if requested
    let sinceMs = null;
    if (req.query.since) {
      sinceMs = Date.now() - Number(req.query.since) * 3600000;
    }

    const results = [];
    for (const device of devices) {
      const info   = infoMap[device.IMEI_No] || null;
      const lastHB = info?.gps_datetime_utc || info?.server_received_at
                   || info?.last_heartbeat  || info?.updatedAt || null;

      if (sinceMs && lastHB && new Date(lastHB).getTime() < sinceMs) continue;

      const lat  = info?.lat ?? info?.latitude  ?? null;
      const lng  = info?.lon ?? info?.longitude ?? null;
      const addr = await getAddress(lat, lng);

      results.push(buildVehicle(device, info, addr));
    }

    // Stats
    const stats = {
      all:         results.length,
      running:     results.filter(v => v.state === 'running').length,
      stopped:     results.filter(v => v.state === 'stopped').length,
      overspeed:   results.filter(v => v.state === 'overspeed').length,
      idle:        results.filter(v => v.state === 'idle').length,
      unreachable: results.filter(v => v.state === 'unreachable').length,
      new:         results.filter(v => v.state === 'new').length,
      inactive:    results.filter(v => v.state === 'inactive').length,
    };

    return res.json({ success: true, data: results, stats });
  } catch (err) {
    console.error('[dashboard/vehicles] Error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/map
// ─────────────────────────────────────────────────────────────────────────────
exports.getMap = async (req, res) => {
  try {
    const user        = req.user;
    const deviceQuery = buildDeviceQuery(user);

    const devices = await DeviceMaster.find(deviceQuery, {
      _id:1, vehicle_no:1, IMEI_No:1, vehicle_type:1,
      driver_name:1, locked:1, branch:1, client:1,
      transporter:1, group:1, device_name:1, sim_card:1,
      adminId:1, dealerId:1, user_id:1,
    }).lean();

    if (!devices.length) return res.json({ success: true, data: [] });

    const imeis        = devices.map(d => d.IMEI_No).filter(Boolean);
    const imeiToDevice = Object.fromEntries(devices.map(d => [d.IMEI_No, d]));

    const infoDocs = await DeviceInfo.aggregate([
      {
        $match: {
          imei: { $in: imeis },
          lat:  { $exists: true, $ne: null },
          lon:  { $exists: true, $ne: null },
        },
      },
      { $sort:  { server_received_at: -1 } },
      { $group: { _id: '$imei', info: { $first: '$$ROOT' } } },
    ]);

    const results = [];
    for (const { _id: imei, info } of infoDocs) {
      const device = imeiToDevice[imei];
      if (!device) continue;
      const lat  = info?.lat ?? info?.latitude  ?? null;
      const lng  = info?.lon ?? info?.longitude ?? null;
      const addr = await getAddress(lat, lng);
      results.push(buildVehicle(device, info, addr));
    }

    return res.json({ success: true, data: results });
  } catch (err) {
    console.error('[dashboard/map] Error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/filters/options
// ─────────────────────────────────────────────────────────────────────────────
exports.getFilterOptions = async (req, res) => {
  try {
    const user        = req.user;
    const deviceQuery = buildDeviceQuery(user);

    const devices = await DeviceMaster.find(deviceQuery, {
      client:1, transporter:1, group:1,
    }).lean();

    const clients      = [...new Set(devices.map(d => d.client).filter(Boolean))];
    const transporters = [...new Set(devices.map(d => d.transporter).filter(Boolean))];
    const groups       = [...new Set(devices.map(d => d.group).filter(Boolean))];

    return res.json({ success: true, clients, transporters, groups });
  } catch (err) {
    console.error('[dashboard/filters] Error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/stats
// ─────────────────────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const user        = req.user;
    const deviceQuery = buildDeviceQuery(user);

    const devices = await DeviceMaster.find(deviceQuery, { IMEI_No:1 }).lean();
    const imeis   = devices.map(d => d.IMEI_No).filter(Boolean);

    const infoDocs = await DeviceInfo.aggregate([
      { $match: { imei: { $in: imeis } } },
      { $sort:  { server_received_at: -1 } },
      { $group: { _id: '$imei', info: { $first: '$$ROOT' } } },
    ]);

    const infoMap = Object.fromEntries(infoDocs.map(d => [d._id, d.info]));

    const states = devices.map(d => deriveState(infoMap[d.IMEI_No] || null));

    return res.json({
      success: true,
      stats: {
        all:         states.length,
        running:     states.filter(s => s === 'running').length,
        stopped:     states.filter(s => s === 'stopped').length,
        overspeed:   states.filter(s => s === 'overspeed').length,
        idle:        states.filter(s => s === 'idle').length,
        unreachable: states.filter(s => s === 'unreachable').length,
        new:         states.filter(s => s === 'new').length,
        inactive:    states.filter(s => s === 'inactive').length,
      },
    });
  } catch (err) {
    console.error('[dashboard/stats] Error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};