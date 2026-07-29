require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const multer       = require('multer');
const XLSX         = require('xlsx');
const connectDB    = require('./config/db');
const http         = require('http');
const { Server }   = require('socket.io');
const mongoose     = require('mongoose');
const axios        = require('axios');
const jwt          = require('jsonwebtoken');
const { execSync } = require('child_process');
const path         = require('path');

mongoose.set('strictQuery', true);

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════════════════
const PORT                        = process.env.PORT || 5001;
const GOOGLE_MAPS_API_KEY         = process.env.GOOGLE_MAPS_API_KEY;
const GPS_POLL_MS                 = parseInt(process.env.GPS_POLL_MS          || '5000',   10);
const ADDRESS_CACHE_TTL           = parseInt(process.env.ADDRESS_CACHE_TTL    || '3600000', 10);
const OVERSPEED_THRESHOLD         = parseInt(process.env.OVERSPEED_THRESHOLD  || '80',     10);
const UNREACHABLE_TIMEOUT_MINUTES = parseInt(process.env.UNREACHABLE_TIMEOUT_MINUTES || '60', 10);
const SOCKET_PING_TIMEOUT         = parseInt(process.env.SOCKET_PING_TIMEOUT  || '60000',  10);
const SOCKET_PING_INTERVAL        = parseInt(process.env.SOCKET_PING_INTERVAL || '25000',  10);
const GEOCODE_RATE_LIMIT_MS       = parseInt(process.env.GEOCODE_RATE_LIMIT_MS || '200',   10);
const GEOCODE_BATCH_SIZE          = parseInt(process.env.GEOCODE_BATCH_SIZE    || '10',    10);

const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://localhost:4173',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ];

// ══════════════════════════════════════════════════════════════════════════════
// EXPRESS APP
// ══════════════════════════════════════════════════════════════════════════════
const app = express();

const corsOptions = {
  origin: CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

const parseExcelUpload = (req, res, next) => {
  if (req.body && Array.isArray(req.body.devices)) return next();
  if (req.file) {
    try {
      const wb          = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws          = wb.Sheets[wb.SheetNames[0]];
      req.body.devices  = XLSX.utils.sheet_to_json(ws, { defval: '' });
      req.body.fileName = req.file.originalname;
    } catch {
      return res.status(400).json({ success: false, message: 'Could not parse Excel file' });
    }
  }
  next();
};

const deviceCtrl = require('./controllers/deviceController');

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/authRoutes'));
app.use('/api/tenant',    require('./routes/tenantRoutes'));
app.use('/api/users',     require('./routes/userRoutes'));
app.use('/api/upload',    require('./routes/uploadRoutes'));
app.use('/api/profile',   require('./routes/profileRoutes'));
app.use('/api/vehicles',  require('./routes/vehicleRoutes'));
app.use('/api/dashboard', require('./routes/Dashboardroutes'));
app.use('/api/dashboard', require('./routes/chatRoutes'));
app.use('/api/analytics', require('./routes/AnalyticsDashboardroutes'));

// ── STATIC FILES SERVING ────────────────────────────────────────────────────
app.use('/Company_Logo', express.static(path.join(__dirname, 'dist/Company_Logo')));
app.use('/Profile',      express.static(path.join(__dirname, 'dist/Profile')));
app.use('/uploads',      express.static(path.join(__dirname, 'uploads')));

app.get('/api/devices/protocol-master', deviceCtrl.getProtocolMaster);
app.get('/api/devices/clients',         deviceCtrl.getClientOptions);
app.post('/api/devices/import-excel',   upload.single('file'), parseExcelUpload, deviceCtrl.importDevicesFromExcel);
app.get('/api/devices',                 deviceCtrl.getDevices);
app.post('/api/devices',                deviceCtrl.createDevice);
app.put('/api/devices/:id/sensors',     deviceCtrl.updateDeviceSensors);
app.get('/api/devices/:id',             deviceCtrl.getDeviceById);
app.put('/api/devices/:id',             deviceCtrl.updateDevice);
app.delete('/api/devices/:id',          deviceCtrl.deleteDevice);

app.get('/api/health', (req, res) => {
  res.json({
    success:   true,
    message:   'Fleet Dashboard API running',
    timestamp: new Date(),
    db:        mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    sockets:   connectedSockets.size,
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ══════════════════════════════════════════════════════════════════════════════
// ADDRESS CACHE
// ══════════════════════════════════════════════════════════════════════════════
const addressCache     = new Map();
const geocodeQueue     = [];
let isProcessingQueue  = false;
let lastGeocodeRequest = 0;

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R      = 6371000;
  const toRad  = x => (x * Math.PI) / 180;
  const dLat   = toRad(lat2 - lat1);
  const dLon   = toRad(lon2 - lon1);
  const a      = Math.sin(dLat / 2) ** 2
               + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function fetchAddressFromGoogle(lat, lng, retryCount = 0) {
  if (!GOOGLE_MAPS_API_KEY) return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  try {
    const url      = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await axios.get(url, { timeout: 5000 });
    if (response.data.status === 'OK' && response.data.results?.[0]) {
      return response.data.results[0].formatted_address;
    }
    if (response.data.status === 'OVER_QUERY_LIMIT' && retryCount < 3) {
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
      return fetchAddressFromGoogle(lat, lng, retryCount + 1);
    }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch {
    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 500));
      return fetchAddressFromGoogle(lat, lng, retryCount + 1);
    }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

async function processGeocodeQueue() {
  if (isProcessingQueue || geocodeQueue.length === 0) return;
  const now           = Date.now();
  const timeSinceLast = now - lastGeocodeRequest;
  if (timeSinceLast < GEOCODE_RATE_LIMIT_MS) {
    setTimeout(processGeocodeQueue, GEOCODE_RATE_LIMIT_MS - timeSinceLast);
    return;
  }
  isProcessingQueue  = true;
  const item         = geocodeQueue.shift();
  lastGeocodeRequest = Date.now();
  try {
    const address = await fetchAddressFromGoogle(item.lat, item.lng);
    addressCache.set(item.key, { address, lat: item.lat, lng: item.lng, timestamp: Date.now() });
    if (addressCache.size > 2000) addressCache.delete(addressCache.keys().next().value);
    if (item.resolve) item.resolve(address);
  } catch {
    const fallback = `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`;
    if (item.resolve) item.resolve(fallback);
  }
  isProcessingQueue = false;
  setTimeout(processGeocodeQueue, 0);
}

async function getAddressFromCoords(lat, lng, forceFresh = false) {
  if (!lat || !lng) return '--';
  const key    = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const cached = addressCache.get(key);
  if (!forceFresh && cached) {
    const distance = calculateDistance(lat, lng, cached.lat, cached.lng);
    if (distance < 50 && (Date.now() - cached.timestamp) < ADDRESS_CACHE_TTL) return cached.address;
  }
  return new Promise(resolve => {
    geocodeQueue.push({ key, lat, lng, resolve });
    processGeocodeQueue();
    setTimeout(() => resolve(`${lat.toFixed(6)}, ${lng.toFixed(6)}`), 10000);
  });
}

async function batchGetAddresses(coordinates) {
  const results = [];
  for (let i = 0; i < coordinates.length; i += GEOCODE_BATCH_SIZE) {
    const batch        = coordinates.slice(i, i + GEOCODE_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(({ lat, lng }) => getAddressFromCoords(lat, lng)));
    results.push(...batchResults);
  }
  return results;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODELS
// ══════════════════════════════════════════════════════════════════════════════
function getModels() {
  const DeviceMaster = mongoose.models.DeviceMaster || require('./models/DeviceMaster');
  const DeviceInfo   = mongoose.models.DeviceInfo   || require('./models/DeviceInfo');
  return { DeviceMaster, DeviceInfo };
}

// ══════════════════════════════════════════════════════════════════════════════
// VehicleLatestStatus
// ══════════════════════════════════════════════════════════════════════════════
const VehicleLatestStatus = require('./models/VehicleLatestStatus');

async function upsertLatestStatus(device, info) {
  if (!device || !device.IMEI_No) return;
  try {
    const lastHB = info?.server_received_at || info?.gps_datetime_utc
                || info?.last_heartbeat    || info?.updatedAt || null;

    await VehicleLatestStatus.findOneAndUpdate(
      { imei: device.IMEI_No },
      {
        $set: {
          imei:       device.IMEI_No,
          vehicle:    device.vehicle_no  || '--',
          adminId:    device.adminId     ?? null,
          dealerId:   device.dealerId    ?? null,
          userId:     device.user_id     ?? null,
          vehicleType: device.vehicle_type || 'car',
          branch:      device.branch       || '--',
          driverName:  device.driver_name  || '--',
          locked:      device.locked       ?? false,
          simCard:     device.sim_card     || '--',
          deviceName:  device.device_name  || '--',
          assigned:    device.assigned     ?? false,
          lat:        info?.lat         ?? null,
          lng:        info?.lon         ?? null,
          speed:      info?.speed_kmph  ?? info?.speed ?? 0,
          heading:    info?.heading_deg ?? 0,
          satellites: info?.satellites  ?? 0,
          gpsFix:     info?.gps_fix     ?? '0',
          altitude:   info?.altitude_m  ?? null,
          ignition:     info?.ignition        ?? 0,
          gsmStrength:  info?.gsm_strength    ?? info?.gsm_signal ?? 0,
          mainInputV:   info?.main_input_v    ?? info?.external_voltage ?? 0,
          internalBattV: info?.internal_batt_v ?? 0,
          odoM:         info?.odo_m           ?? 0,
          overspeed:    info?.overspeed        ?? false,
          emergency:    info?.emergency_status ?? false,
          acStatus:     info?.ac_status        ?? false,
          powerCut:     info?.power_cut        ?? 0,
          soc:          info?.soc              ?? 0,
          aux1:         info?.aux1             ?? '',
          packetTime: lastHB ? new Date(lastHB) : null,
          updatedAt:  new Date(),
        },
      },
      { upsert: true, new: false }
    );
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[upsertLatestStatus] ${device.IMEI_No}:`, err.message);
    }
  }
}

async function migrateLatestStatusOnce() {
  try {
    const existing = await VehicleLatestStatus.countDocuments();
    if (existing > 0) {
      console.log(`[Migration] Vehicle_Latest_Status already has ${existing} docs — skipping`);
      return;
    }
    console.log('[Migration] Populating Vehicle_Latest_Status from existing data...');
    const { DeviceMaster, DeviceInfo } = getModels();
    const devices = await DeviceMaster.find({ active: true }).lean();
    if (!devices.length) { console.log('[Migration] No active devices found'); return; }

    const imeis    = devices.map(d => d.IMEI_No).filter(Boolean);
    const infoDocs = await DeviceInfo.aggregate([
      { $match: { imei: { $in: imeis } } },
      { $sort:  { server_received_at: -1 } },
      { $group: { _id: '$imei', info: { $first: '$$ROOT' } } },
    ]);

    const infoMap = new Map();
    infoDocs.forEach(({ _id, info }) => infoMap.set(_id, info));

    let count = 0;
    for (const device of devices) {
      const info = infoMap.get(device.IMEI_No) || null;
      await upsertLatestStatus(device, info);
      count++;
    }
    console.log(`[Migration] Done — ${count} vehicles populated in Vehicle_Latest_Status`);
  } catch (err) {
    console.error('[Migration] Error:', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
const pad     = (n, l = 2) => String(n).padStart(l, '0');
const fmtDate = d => {
  if (!d) return '--';
  const dt = new Date(d);
  if (isNaN(dt)) return '--';
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} `
       + `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

function deriveState(info) {
  if (!info) return 'unreachable';
  const lastHB = info.gps_datetime_utc || info.server_received_at || info.last_heartbeat || info.updatedAt || null;
  if (!lastHB) return 'new';
  const diffMin = (Date.now() - new Date(lastHB).getTime()) / 60000;
  if (diffMin > UNREACHABLE_TIMEOUT_MINUTES) return 'unreachable';
  const ign = info.ignition === 1 || info.ignition === true;
  const spd = info.speed_kmph ?? info.speed ?? 0;
  if (info.overspeed || spd > OVERSPEED_THRESHOLD) return 'overspeed';
  if (ign && spd > 0)   return 'running';
  if (ign && spd === 0) return 'idle';
  return 'stopped';
}

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

function extractGpsInfo(info) {
  if (!info) return { gps: false, gpsStatus: 'off', gpsSatellites: 0, gpsLabel: 'Off | 0 🛰', fixType: 'No Fix', satellites: 0, altitude: null };
  const satellites = Number(info.satellites ?? info.gpsSatellites ?? info.gps_satellites ?? 0);
  const rawFix     = String(info.gps_fix ?? '').trim();
  const gpsStatus  = info.gps_status;
  let gpsValid = false;
  if (rawFix === '1') gpsValid = true;
  else if (rawFix === '0') gpsValid = false;
  else if (typeof gpsStatus === 'boolean') gpsValid = gpsStatus;
  else if (gpsStatus === 1 || gpsStatus === '1' || gpsStatus === 'true') gpsValid = true;
  if (!gpsValid && satellites >= 4) gpsValid = true;
  if (!gpsValid && info.lat && info.lon && Number(info.lat) !== 0) gpsValid = true;
  const fixType = !gpsValid ? 'No Fix' : satellites >= 5 ? '3D Fix' : '2D Fix';
  return {
    gps: gpsValid,
    gpsStatus: gpsValid ? 'fixed' : 'nofix',
    gpsSatellites: satellites,
    gpsLabel: `${fixType} | ${satellites} 🛰`,
    fixType,
    satellites,
    altitude: info.altitude_m ?? null,
  };
}

function extractGsmInfo(info) {
  if (!info) return { gsmRaw: 0, gsmBars: 0, gsmPercent: 0, gsmLabel: 'No Signal' };
  const rawGsm = Number(info.gsm_strength ?? info.gsm_signal ?? info.gsmStrength ?? 0);
  if (rawGsm === 99 || rawGsm === 0) return { gsmRaw: rawGsm, gsmBars: 0, gsmPercent: 0, gsmLabel: 'No Signal' };
  let bars = 0;
  if (rawGsm >= 1  && rawGsm <= 7)  bars = 1;
  if (rawGsm >= 8  && rawGsm <= 14) bars = 2;
  if (rawGsm >= 15 && rawGsm <= 20) bars = 3;
  if (rawGsm >= 21)                 bars = 4;
  const percent = Math.round((rawGsm / 31) * 100);
  const labels  = ['No Signal', 'Poor', 'Fair', 'Good', 'Excellent'];
  return { gsmRaw: rawGsm, gsmBars: bars, gsmPercent: percent, gsmLabel: labels[bars] || 'No Signal' };
}

function extractBatteryInfo(info) {
  if (!info) return { btrVoltage: 0, btrPercent: 0, btrLabel: '0%', temperature: null, humidity: null };
  const aux1Data = parseAux1(info.aux1);
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
  if (voltage === 0) return { btrVoltage: 0, btrPercent: 0, btrLabel: '0%', temperature: aux1Data.temperature, humidity: aux1Data.humidity };
  let percent = 0;
  if (info.battery_level != null && Number(info.battery_level) > 5) {
    percent = Math.min(100, Math.max(0, Math.round(Number(info.battery_level))));
  } else if (voltage <= 5) {
    percent = Math.min(100, Math.max(0, Math.round(((voltage - 3.0) / (4.2 - 3.0)) * 100)));
  } else {
    percent = Math.min(100, Math.max(0, Math.round(voltage)));
  }
  return { btrVoltage: voltage, btrPercent: percent, btrLabel: `${percent}%`, temperature: aux1Data.temperature, humidity: aux1Data.humidity };
}

async function buildVehicleWithAddress(device, info, useCachedOnly = false) {
  const lat = info?.lat ?? info?.latitude ?? null;
  const lng = info?.lon ?? info?.longitude ?? null;
  let address = info?.address || '--';
  const isRealAddr = addr => {
    if (!addr || addr === '--') return false;
    if (/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(String(addr).trim())) return false;
    return true;
  };
  if (!isRealAddr(address) && lat && lng) {
    if (useCachedOnly) {
      const key    = `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
      const cached = addressCache.get(key);
      address = cached ? cached.address : `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    } else {
      address = await getAddressFromCoords(lat, lng);
    }
  }
  const lastHB = info?.server_received_at || info?.gps_datetime_utc || info?.last_heartbeat || info?.updatedAt || null;
  const ignition = info?.ignition === 1 || info?.ignition === true;
  let parkingDuration = null;
  if (lastHB && !ignition) {
    parkingDuration = Math.floor((Date.now() - new Date(lastHB).getTime()) / 60_000);
  }
  const fmtDuration = minutes => {
    if (!minutes || minutes <= 0) return '--';
    const h = Math.floor(minutes / 60), m = Math.floor(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const gpsInfo = extractGpsInfo(info);
  const gsmInfo = extractGsmInfo(info);
  const btrInfo = extractBatteryInfo(info);

  return {
    vehicle:       device.vehicle_no   || device.IMEI_No || '--',
    vehicleNo:     device.vehicle_no   || '--',
    type:          device.vehicle_type || 'car',
    state:         deriveState(info),
    lat, lng,
    spd:           info?.speed_kmph ?? info?.speed ?? 0,
    heading:       info?.heading_deg ?? 0,
    address,
    ignition,
    locked:        device.locked       ?? false,
    driver:        device.driver_name  || '--',
    branch:        device.branch       || '--',
    client:        device.client       || '--',
    transporter:   device.transporter  || '--',
    group:         device.group        || '--',
    lu:            lastHB ? fmtDate(lastHB) : '--',
    luRaw:         lastHB,
    since:         ignition ? 'Moving' : fmtDuration(parkingDuration),
    parking:       fmtDuration(parkingDuration),
    km:            info?.odo_m ? Math.round(info.odo_m / 1000) : (info?.odometer ?? 0),
    btr:           btrInfo.btrPercent,
    btrVoltage:    btrInfo.btrVoltage,
    btrLabel:      btrInfo.btrLabel,
    temperature:   btrInfo.temperature,
    humidity:      btrInfo.humidity,
    gsm:           gsmInfo.gsmBars,
    gsmRaw:        gsmInfo.gsmRaw,
    gsmPercent:    gsmInfo.gsmPercent,
    gsmLabel:      gsmInfo.gsmLabel,
    gps:           gpsInfo.gps,
    gpsStatus:     gpsInfo.gpsStatus,
    gpsSatellites: gpsInfo.gpsSatellites,
    gpsLabel:      gpsInfo.gpsLabel,
    fixType:       gpsInfo.fixType,
    satellites:    gpsInfo.satellites,
    altitude:      gpsInfo.altitude,
    ac:            info?.ac_status    ?? false,
    soc:           info?.soc          ?? 0,
    extPower:      info?.main_input_v ?? info?.external_voltage ?? 0,
    panic:         info?.emergency_status ?? false,
    powerCut:      info?.power_cut    === 1,
    iccid:         device.sim_card    || '--',
    alias:         device.device_name || device.vehicle_no || '--',
    imei:          device.IMEI_No     || '--',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// OPTIMIZED DATA FETCHING
// ══════════════════════════════════════════════════════════════════════════════
let cachedAllDevices = null;
let cachedImeiToInfo = null;
let lastCacheTime    = 0;
const CACHE_TTL_MS   = 2000;

async function fetchAllDevicesWithLatestInfo() {
  const { DeviceMaster, DeviceInfo } = getModels();
  const devices = await DeviceMaster.find(
    { active: true },
    {
      _id: 1, IMEI_No: 1, vehicle_no: 1, vehicle_type: 1,
      driver_name: 1, locked: 1, branch: 1, client: 1,
      transporter: 1, group: 1, device_name: 1, sim_card: 1,
      adminId: 1, dealerId: 1, user_id: 1,
    }
  ).lean();
  if (!devices.length) return { devices: [], imeiToInfo: new Map() };
  const imeis = devices.map(d => d.IMEI_No).filter(Boolean);
  const infoDocs = await DeviceInfo.aggregate([
    { $match: { imei: { $in: imeis } } },
    { $sort:  { server_received_at: -1 } },
    { $group: { _id: '$imei', info: { $first: '$$ROOT' } } },
  ]);
  const imeiToInfo = new Map();
  infoDocs.forEach(({ _id, info }) => imeiToInfo.set(_id, info));
  const unmatchedDevices = devices.filter(d => d.IMEI_No && !imeiToInfo.has(d.IMEI_No));
  if (unmatchedDevices.length) {
    const deviceIds = unmatchedDevices.map(d => d._id);
    const fallbackDocs = await DeviceInfo.aggregate([
      { $match: { device_id: { $in: deviceIds } } },
      { $sort:  { server_received_at: -1 } },
      { $group: { _id: '$device_id', info: { $first: '$$ROOT' } } },
    ]);
    const deviceIdToImei = {};
    unmatchedDevices.forEach(d => { deviceIdToImei[d._id.toString()] = d.IMEI_No; });
    fallbackDocs.forEach(({ _id, info }) => {
      const imei = deviceIdToImei[_id.toString()];
      if (imei) imeiToInfo.set(imei, info);
    });
  }
  return { devices, imeiToInfo };
}

async function getCachedDeviceData() {
  const now = Date.now();
  if (cachedAllDevices && (now - lastCacheTime) < CACHE_TTL_MS) {
    return { devices: cachedAllDevices, imeiToInfo: cachedImeiToInfo };
  }
  const { devices, imeiToInfo } = await fetchAllDevicesWithLatestInfo();
  cachedAllDevices = devices;
  cachedImeiToInfo = imeiToInfo;
  lastCacheTime    = now;
  return { devices, imeiToInfo };
}

function filterDevicesForUser(devices, user) {
  const { role, user_id } = user;
  switch (role) {
    case 'super_admin': return devices;
    case 'admin':       return devices.filter(d => d.adminId   === user_id);
    case 'dealer':      return devices.filter(d => d.dealerId  === user_id);
    case 'user':        return devices.filter(d => d.user_id   === user_id);
    default:            return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COIN HELPER — DB se fresh coins fetch karke socket pe emit karo
// ══════════════════════════════════════════════════════════════════════════════
async function fetchAndEmitCoins(socket) {
  try {
    const User = mongoose.models.User || require('./models/User');
    const dbUser = await User
      .findById(socket.user._id)
      .select('allocatedCoins usedCoins')
      .lean();

    if (!dbUser) return;

    const allocated = dbUser.allocatedCoins || 0;
    const used      = dbUser.usedCoins      || 0;
    const available = Math.max(0, allocated - used);

    console.log(`[coin:emit] ${socket.user.username} → available=${available} allocated=${allocated} used=${used}`);

    socket.emit('coin:update', { available, used, allocated });
  } catch (err) {
    console.error('[coin:emit] Error:', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HTTP SERVER + SOCKET.IO
// ══════════════════════════════════════════════════════════════════════════════
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports:        ['websocket', 'polling'],
  pingTimeout:       SOCKET_PING_TIMEOUT,
  pingInterval:      SOCKET_PING_INTERVAL,
  allowEIO3:         true,
  connectTimeout:    20000,
  maxHttpBufferSize: 1e6,
  upgradeTimeout:    10000,
});

const connectedSockets = new Map();

let globalBroadcastInterval = null;
let isBroadcasting          = false;

async function broadcastToAllSockets() {
  if (connectedSockets.size === 0)           return;
  if (mongoose.connection.readyState !== 1)  return;
  if (isBroadcasting)                        return;
  isBroadcasting = true;

  try {
    const { devices, imeiToInfo } = await getCachedDeviceData();
    if (!devices.length) return;

    devices.forEach(device => {
      const info = imeiToInfo.get(device.IMEI_No) || null;
      upsertLatestStatus(device, info).catch(() => {});
    });

    const userGroups = new Map();
    for (const [socketId, entry] of connectedSockets.entries()) {
      const { user } = entry;
      const userKey  = `${user.role}:${user.user_id}`;
      if (!userGroups.has(userKey)) userGroups.set(userKey, { user, socketIds: [] });
      userGroups.get(userKey).socketIds.push(socketId);
    }

    for (const [, { user, socketIds }] of userGroups.entries()) {
      try {
        const userDevices = filterDevicesForUser(devices, user);
        if (!userDevices.length) continue;
        const liveData = [];
        for (const device of userDevices) {
          const info    = imeiToInfo.get(device.IMEI_No) || null;
          const vehicle = await buildVehicleWithAddress(device, info, true);
          liveData.push(vehicle);
        }
        for (const sid of socketIds) {
          const socket = io.sockets.sockets.get(sid);
          if (socket && socket.connected) socket.emit('live:positions', liveData);
        }
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(`[Broadcast] uid=${user.user_id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Broadcast] Fatal:', err.message);
  } finally {
    isBroadcasting = false;
  }
}

function startGlobalBroadcast() {
  if (globalBroadcastInterval) return;
  globalBroadcastInterval = setInterval(broadcastToAllSockets, GPS_POLL_MS);
  console.log(`📡 Global broadcast started — interval: ${GPS_POLL_MS}ms`);
}

function stopGlobalBroadcast() {
  if (globalBroadcastInterval) {
    clearInterval(globalBroadcastInterval);
    globalBroadcastInterval = null;
    console.log('📡 Global broadcast stopped');
  }
}

// ── Socket Auth Middleware ───────────────────────────────────────────────────
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') || null;

    if (!token) return next(new Error('Authentication required'));

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return next(new Error('Invalid token'));
    }

    const User = mongoose.models.User || require('./models/User');

    const user = await User.findById(decoded.id)
      .select('user_id username role status active adminId dealerId profile_image allocatedCoins usedCoins')
      .lean();

    if (!user) return next(new Error('User not found'));
    if (!user.active) return next(new Error('Account is inactive'));
    if (user.status === 'Inactive') return next(new Error('Account is inactive'));

    const allocated = user.allocatedCoins || 0;
    const used      = user.usedCoins      || 0;

    socket.user = {
      _id:      user._id,
      user_id:  user.user_id,
      username: user.username,
      role:     user.role,
      adminId:  user.adminId  ?? null,
      dealerId: user.dealerId ?? null,
      profile_image:   user.profile_image || '',
      allocatedCoins:  allocated,
      usedCoins:       used,
      availableCoins:  Math.max(0, allocated - used),
    };

    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// ── Socket Events ────────────────────────────────────────────────────────────
io.on('connection', async socket => {
  const user = socket.user;
  if (connectedSockets.has(socket.id)) return;
  connectedSockets.set(socket.id, { user, isAlive: true });

  await socket.join(`user_${user.user_id}`);
  await socket.join(`role_${user.role}`);

  const tabsForUser = [...connectedSockets.values()].filter(s => s.user.user_id === user.user_id).length;

  console.log(
    `🔌 Connected: ${socket.id} | role=${user.role} uid=${user.user_id}` +
    ` | tabs=${tabsForUser} | total=${connectedSockets.size}`
  );

  socket.emit('connected', {
    status: 'ok', userId: user.user_id, role: user.role,
    socketId: socket.id, timestamp: new Date().toISOString(),
  });

  // ✅ LOGIN/REFRESH pe turant fresh coins DB se fetch karke emit karo
  fetchAndEmitCoins(socket);

  // ── coin:refresh — client manually refresh button dabaye toh ──────────────
  socket.on('coin:refresh', async (callback) => {
    await fetchAndEmitCoins(socket);
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });

  // ── Live positions ────────────────────────────────────────────────────────
  setImmediate(async () => {
    if (!socket.connected) return;
    try {
      const { devices, imeiToInfo } = await getCachedDeviceData();
      const userDevices = filterDevicesForUser(devices, user);
      const liveData    = [];
      for (const device of userDevices) {
        const info    = imeiToInfo.get(device.IMEI_No) || null;
        const vehicle = await buildVehicleWithAddress(device, info, true);
        liveData.push(vehicle);
      }
      if (socket.connected) socket.emit('live:positions', liveData);
    } catch (err) {
      console.error(`[Socket initial] uid=${user.user_id}:`, err.message);
    }
  });

  socket.on('subscribe:vehicle', async vehicleNo => {
    try {
      const { devices, imeiToInfo } = await getCachedDeviceData();
      const userDevices = filterDevicesForUser(devices, user);
      const device      = userDevices.find(d => d.vehicle_no === vehicleNo);
      if (!device) return socket.emit('vehicle:error', { message: 'Vehicle not found or not accessible' });
      const info        = imeiToInfo.get(device.IMEI_No) || null;
      const vehicleData = await buildVehicleWithAddress(device, info, false);
      socket.emit('vehicle:detail', vehicleData);
    } catch (err) {
      socket.emit('vehicle:error', { message: err.message });
    }
  });

  socket.on('get:address', async ({ lat, lng, forceFresh }, callback) => {
    try {
      const address = await getAddressFromCoords(lat, lng, forceFresh);
      if (typeof callback === 'function') callback({ success: true, address });
      else socket.emit('address:result', { success: true, address, lat, lng });
    } catch {
      const fallback = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (typeof callback === 'function') callback({ success: true, address: fallback });
      else socket.emit('address:result', { success: true, address: fallback, lat, lng });
    }
  });

  socket.on('get:addresses:batch', async (coordinates, callback) => {
    try {
      if (!Array.isArray(coordinates)) throw new Error('Coordinates must be an array');
      const addresses = await batchGetAddresses(coordinates);
      if (typeof callback === 'function') callback({ success: true, addresses });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  socket.on('ping', callback => {
    if (typeof callback === 'function') callback({ pong: true, timestamp: Date.now() });
  });

  socket.on('vehicle:created', data => {
    socket.to(`user_${user.user_id}`).emit('vehicle:sync', { action: 'created', ...data, timestamp: new Date().toISOString() });
    cachedAllDevices = null;
  });
  socket.on('vehicle:updated', data => {
    socket.to(`user_${user.user_id}`).emit('vehicle:sync', { action: 'updated', ...data, timestamp: new Date().toISOString() });
    cachedAllDevices = null;
  });
  socket.on('vehicle:deleted', data => {
    socket.to(`user_${user.user_id}`).emit('vehicle:sync', { action: 'deleted', ...data, timestamp: new Date().toISOString() });
    cachedAllDevices = null;
  });

  socket.on('disconnect', reason => {
    connectedSockets.delete(socket.id);
    const remaining = [...connectedSockets.values()].filter(s => s.user.user_id === user.user_id).length;
    console.log(
      `🔌 Disconnected: ${socket.id} | uid=${user.user_id}` +
      ` | reason=${reason} | tabs_remaining=${remaining} | total=${connectedSockets.size}`
    );
    if (connectedSockets.size === 0) stopGlobalBroadcast();
  });

  socket.on('error', err => console.error(`🔌 Socket error [${socket.id}]:`, err.message));

  if (connectedSockets.size === 1) startGlobalBroadcast();
});

// ══════════════════════════════════════════════════════════════════════════════
// COIN PUSH HELPER
// ══════════════════════════════════════════════════════════════════════════════
function pushCoinUpdate(userId, allocated, used) {
  const available = Math.max(0, allocated - used);
  io.to(`user_${userId}`).emit('coin:update', { available, used, allocated });
  console.log(`[pushCoinUpdate] uid=${userId} → available=${available} allocated=${allocated} used=${used}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// ADDRESS BACKGROUND REFRESH
// ══════════════════════════════════════════════════════════════════════════════
async function refreshAddressesInBackground() {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const { devices, imeiToInfo } = await fetchAllDevicesWithLatestInfo();
    for (const device of devices) {
      const info = imeiToInfo.get(device.IMEI_No);
      const lat  = info?.lat ?? null;
      const lng  = info?.lon ?? null;
      if (lat && lng) {
        await getAddressFromCoords(lat, lng, true);
        await new Promise(r => setTimeout(r, GEOCODE_RATE_LIMIT_MS));
      }
    }
    console.log(`✅ Background address refresh done — ${devices.length} devices`);
  } catch (err) {
    console.error('[Address Refresh]', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ══════════════════════════════════════════════════════════════════════════════
let addressRefreshInterval = null;

function startAddressRefresh() {
  if (addressRefreshInterval) clearInterval(addressRefreshInterval);
  addressRefreshInterval = setInterval(refreshAddressesInBackground, 30 * 60 * 1000);
}

async function startServer() {
  try {
    console.log(`🔍 Checking if port ${PORT} is free...`);
    try {
      execSync(`fuser -k ${PORT}/tcp`, { stdio: 'ignore' });
      console.log(`⚡ Cleared port ${PORT}`);
      await new Promise(r => setTimeout(r, 500));
    } catch { /* port was free */ }

    await connectDB();
    console.log('✅ MongoDB connected');

    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(PORT, () => { httpServer.removeListener('error', reject); resolve(); });
    });

    startAddressRefresh();
    setTimeout(() => migrateLatestStatusOnce(), 3000);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  🚀  Fleet Dashboard Server                                    ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Port        : ${String(PORT).padEnd(42)}║`);
    console.log(`║  Env         : ${(process.env.NODE_ENV || 'development').padEnd(42)}║`);
    console.log(`║  GPS Poll    : every ${GPS_POLL_MS / 1000}s${' '.repeat(30)}║`);
    console.log(`║  Profile     : /Profile ✅${' '.repeat(35)}║`);
    console.log(`║  Company Logo: /Company_Logo ✅${' '.repeat(29)}║`);
    console.log(`║  Maps API    : ${GOOGLE_MAPS_API_KEY ? 'Configured ✅' : 'Missing ❌'}${' '.repeat(29)}║`);
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    CORS_ORIGINS.forEach(o => console.log(`   ✅ ${o}`));
  } catch (err) {
    console.error('❌ Server startup failed:', err.message);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
  if (addressRefreshInterval) { clearInterval(addressRefreshInterval); addressRefreshInterval = null; }
});
mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
  startAddressRefresh();
  if (connectedSockets.size > 0) startGlobalBroadcast();
});
mongoose.connection.on('error', err => console.error('❌ MongoDB error:', err.message));

async function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} — shutting down...`);
  if (addressRefreshInterval) clearInterval(addressRefreshInterval);
  stopGlobalBroadcast();
  connectedSockets.clear();
  io.close(() => console.log('✅ Socket.IO closed'));
  httpServer.close(async () => {
    try { await mongoose.disconnect(); console.log('✅ MongoDB disconnected'); } catch {}
    console.log('✅ Server closed\n');
    process.exit(0);
  });
  setTimeout(() => { console.error('⚠️  Force exit'); process.exit(1); }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', reason => console.error('⚠️  Unhandled Rejection:', reason));
process.on('uncaughtException',  err    => console.error('⚠️  Uncaught Exception:',  err));

startServer();

// ✅ Export pushCoinUpdate — coin allocation controllers mein use kar sako
module.exports = { pushCoinUpdate };