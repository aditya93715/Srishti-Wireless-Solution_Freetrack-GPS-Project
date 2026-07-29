// controllers/deviceController.js
//
// UPDATE LOGIC SUMMARY (updateDevice):
//
//   IMEI change:
//     - Checks for IMEI conflict in Device_Master
//     - Updates IMEI in dealer's User_Master.devices[] (via dealerId)
//     - Updates IMEI in assignedToUserId's User_Master.devices[] (if different from dealerId)
//       e.g. after a vehicle was assigned, assignedToUserId = end-user, not dealer
//     - Sets IMEI_No in Device_Master
//
//   Client (dealer) reassignment:
//     - Pulls old IMEI from old dealer's User_Master.devices[]
//     - Pushes new IMEI into new dealer's User_Master.devices[]
//     - Updates Device_Master: client (username), dealerId, hierarchy fields
//     - Does NOT change user_id / vehicle assignment fields
//     - dealerId is the stable "which dealer owns this device" field
//     - assignedToUserId tracks current ownership snapshot (dealer at creation,
//       end-user after vehicle assign) — updated on dealer reassign to new dealer
//       only if no vehicle currently assigned (user_id is null)
//
//   All other fields (sim_card, simOperator, device_name, servicePort, booleans,
//   secondarySimCard, secondarySimOperator, sensors) updated directly.
//
//   attachClientStatus:
//     - ALWAYS resolves dealer from dealerId field (stable)
//     - Never uses assignedToUserId for the Device table Dealer column
//     - assignedToUserId only changes on vehicle assign/unassign
//
const mongoose = require('mongoose');
const Device   = require('../models/Device');
const User     = require('../models/User');
const Protocol = require('../models/Protocol');

// ── VehicleLatestStatus — for cleanup on device/vehicle delete ────────────────
const VehicleLatestStatus = require('../models/VehicleLatestStatus');

// Native driver — bypasses Mongoose schema field stripping for User_Master
const col = () => mongoose.connection.db.collection('User_Master');

// ─────────────────────────────────────────────────────────────────────────────
// COIN HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if user has enough available coins
 */
const checkUserHasCoins = async (userId, requiredCoins = 1) => {
  if (!userId) return { ok: false, message: 'User ID is required' };
  if (requiredCoins <= 0) return { ok: true, available: Infinity };

  const user = await User.findOne({ user_id: userId })
    .select('allocatedCoins usedCoins role username')
    .lean();

  if (!user) return { ok: false, message: 'User not found' };

  // SuperAdmin has unlimited coins
  if (user.role === 'super_admin') {
    return { ok: true, available: Infinity };
  }

  const available = Math.max(0, (user.allocatedCoins || 0) - (user.usedCoins || 0));

  if (available < requiredCoins) {
    return {
      ok: false,
      message: `⚠️ Insufficient Coin Balance!\n\n"${user.username}" has only ${available} coin(s) available.\nYou need ${requiredCoins} coin(s).\n\nPlease contact your administrator to allocate more coins.`,
      available,
      required: requiredCoins,
    };
  }

  return { ok: true, available, user };
};

/**
 * Deduct coins from user's usedCoins
 */
const deductCoinsFromUser = async (userId, amount = 1) => {
  if (!amount || amount <= 0) return;

  const user = await User.findOne({ user_id: userId }).select('role').lean();
  if (user?.role === 'super_admin') return; // SuperAdmin has unlimited

  await User.updateOne(
    { user_id: userId },
    { $inc: { usedCoins: amount } }
  );
  console.log(`[COIN] Deducted ${amount} coin(s) from user ${userId}`);
};

/**
 * Return coins to user (on delete/rollback)
 */
const returnCoinsToUser = async (userId, amount = 1) => {
  if (!amount || amount <= 0) return;

  const user = await User.findOne({ user_id: userId }).select('role').lean();
  if (user?.role === 'super_admin') return;

  await User.updateOne(
    { user_id: userId },
    { $inc: { usedCoins: -amount } }
  );
  // Ensure usedCoins doesn't go negative
  await User.updateOne(
    { user_id: userId, usedCoins: { $lt: 0 } },
    { $set: { usedCoins: 0 } }
  );
  console.log(`[COIN] Returned ${amount} coin(s) to user ${userId}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const nowString = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const cleanSensor = (s, i) => ({
  sensor_id:         s.sensor_id         || String(i + 1),
  name:              s.name              || '',
  sensorType:        s.sensorType        || '',
  connectedTo:       s.connectedTo       || '',
  formula:           s.formula           || '',
  value:             s.value             || '',
  inverse:           Boolean(s.inverse),
  rs232:             Boolean(s.rs232),
  showOnDashboard:   Boolean(s.showOnDashboard),
  type:              s.type              || '',
  unitOfMeasurement: s.unitOfMeasurement || '',
  ifSensor1Text:     s.ifSensor1Text     || '',
  ifSensor0Text:     s.ifSensor0Text     || '',
  calibrationRows:   Array.isArray(s.calibrationRows) ? s.calibrationRows : [],
});

// ─────────────────────────────────────────────────────────────────────────────
// attachClientStatus
//
// ALWAYS resolves the dealer from `dealerId` — never from `assignedToUserId`.
// `dealerId` is set at device creation and only changes on explicit dealer
// reassignment via updateDevice. It does NOT change when a vehicle/user is
// assigned (that only updates user_id and assignedToUserId).
//
// Fallback: if no dealerId (super_admin created device directly for admin),
// show the admin as the client.
// ─────────────────────────────────────────────────────────────────────────────
const attachClientStatus = async (devices) => {
  if (!devices?.length) return devices;

  const dealerIds = [...new Set(devices.map(d => d.dealerId).filter(Boolean))];
  const adminIds  = [...new Set(devices.map(d => d.adminId).filter(Boolean))];
  const allIds    = [...new Set([...dealerIds, ...adminIds])];

  const users = await User.find({ user_id: { $in: allIds } })
    .select('user_id username fullName status active role')
    .lean();

  const map = {};
  users.forEach(u => { map[u.user_id] = u; });

  return devices.map(d => {
    const dealerUser   = d.dealerId ? (map[d.dealerId] || null) : null;
    const adminUser    = d.adminId  ? (map[d.adminId]  || null) : null;
    const resolvedUser = dealerUser || adminUser || null;

    return {
      ...d,
      client:         resolvedUser?.username || d.client || '',
      clientName:     resolvedUser?.fullName || '',
      clientStatus:   resolvedUser?.status   || 'Active',
      clientActive:   resolvedUser?.active   !== false,
      dealerUsername: dealerUser?.username   || '',
      dealerName:     dealerUser?.fullName   || '',
      dealerActive:   dealerUser?.active     !== false,
    };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE saveDevice — creates Device_Master doc + pushes to User_Master
// WITH COIN DEDUCTION
// ─────────────────────────────────────────────────────────────────────────────
const saveDevice = async ({ imei, targetUser, creatorUser, creatorRole, fields = {}, deductCoin = true }) => {
  const usersCol  = col();
  const cleanIMEI = String(imei).trim();

  if (!cleanIMEI) return { skipped: true, reason: 'Empty IMEI provided' };

  // Duplicate check in Device_Master
  const existing = await Device.findOne({ IMEI_No: cleanIMEI }).lean();
  if (existing) return { skipped: true, reason: `IMEI "${cleanIMEI}" already exists in Device_Master` };

  // Duplicate check in target User_Master
  const targetDoc = await usersCol.findOne({ user_id: targetUser.user_id });
  const alreadyIn = (targetDoc?.devices || []).some(d =>
    (typeof d === 'string' ? d : d?.IMEI_No) === cleanIMEI
  );

  if (alreadyIn) {
    const deviceCheck = await Device.findOne({ IMEI_No: cleanIMEI }).lean();
    if (!deviceCheck) {
      // Ghost IMEI in User_Master — clean up
      console.warn(`[saveDevice] Ghost IMEI "${cleanIMEI}" in User_Master but not Device_Master — cleaning`);
      await usersCol.updateOne(
        { user_id: targetUser.user_id },
        { $pull: { devices: { IMEI_No: cleanIMEI } }, $inc: { deviceCount: -1 } }
      );
    } else {
      return { skipped: true, reason: `IMEI "${cleanIMEI}" already in this account` };
    }
  }

  // ── COIN CHECK ──────────────────────────────────────────────────────────────
  // Only deduct if not SuperAdmin and deductCoin is true
  let coinDeducted = false;
  if (deductCoin && creatorUser.role !== 'super_admin') {
    const coinCheck = await checkUserHasCoins(creatorUser.user_id, 1);
    if (!coinCheck.ok) {
      return { skipped: true, reason: coinCheck.message, coinError: true };
    }
    // Deduct coin BEFORE saving
    await deductCoinsFromUser(creatorUser.user_id, 1);
    coinDeducted = true;
    console.log(`[COIN] Deducted 1 coin from ${creatorUser.username} (${creatorUser.user_id}) for device ${cleanIMEI}`);
  }
  // ────────────────────────────────────────────────────────────────────────────

  // ── Hierarchy resolution ───────────────────────────────────────────────────
  let adminId  = null;
  let dealerId = null;

  if      (creatorRole === 'super_admin') { adminId = targetUser.user_id;  dealerId = null; }
  else if (creatorRole === 'admin')       { adminId = creatorUser.user_id; dealerId = targetUser.user_id; }
  else if (creatorRole === 'dealer')      { adminId = creatorUser.adminId || null; dealerId = creatorUser.user_id; }

  // Push device into target User_Master
  await usersCol.updateOne(
    { user_id: targetUser.user_id },
    { $push: { devices: { IMEI_No: cleanIMEI, assignedTo: null } }, $inc: { deviceCount: 1 } }
  );

  const deviceData = {
    IMEI_No:     cleanIMEI,
    device_name: fields.device_name || fields.deviceType || '',

    sim_card:             fields.sim_card             || '',
    simOperator:          fields.simOperator          || '',
    secondarySimCard:     fields.secondarySimCard     || '',
    secondarySimOperator: fields.secondarySimOperator || '',

    client: targetUser.username || '',

    adminId,
    dealerId,
    user_id: null,

    createdBy:     creatorUser.user_id,
    createdByRole: creatorRole,
    createdByName: creatorUser.fullName || creatorUser.username || '',

    assignedToUserId: targetUser.user_id,
    assignedToName:   targetUser.fullName || targetUser.username || '',
    assignedToRole:   targetUser.role || (creatorRole === 'admin' ? 'dealer' : creatorRole),
    assignedAt:       new Date(),

    status:  'active',
    assigned: true,
    active:   true,
    ignitionWirePlus:         Boolean(fields.ignitionWirePlus),
    ignitionWireNotConnected: Boolean(fields.ignitionWireNotConnected),
    acWirePlus:               Boolean(fields.acWirePlus),
    attendance:               Boolean(fields.attendance),
    timezoneSetting:          Boolean(fields.timezoneSetting),

    sensors:      Array.isArray(fields.sensors) ? fields.sensors.map(cleanSensor) : [],
    importedFrom: fields.importedFrom || '',
    importedAt:   fields.importedAt   || null,
  };

  const device = new Device(deviceData);

  try {
    await device.save();
  } catch (saveErr) {
    // Rollback coin deduction on save failure
    if (coinDeducted) {
      await returnCoinsToUser(creatorUser.user_id, 1);
      console.log(`[COIN] Rolled back 1 coin to ${creatorUser.username} due to save failure`);
    }
    // Rollback User_Master push
    console.error(`[saveDevice] device.save() failed for IMEI "${cleanIMEI}" — rolling back User_Master`);
    await usersCol.updateOne(
      { user_id: targetUser.user_id },
      { $pull: { devices: { IMEI_No: cleanIMEI } }, $inc: { deviceCount: -1 } }
    );
    throw saveErr;
  }

  console.log(`[saveDevice] OK device_id=${device.device_id} IMEI_No=${cleanIMEI} by ${creatorRole} -> user_id=${targetUser.user_id} (${targetUser.username})`);
  return { device, skipped: false, coinDeducted };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/devices/protocol-master
// ─────────────────────────────────────────────────────────────────────────────
const getProtocolMaster = async (req, res) => {
  try {
    const doc = await Protocol.findOne({}).lean();
    res.json({
      success: true,
      data: {
        sim_operator:  Array.isArray(doc?.sim_operator)  ? doc.sim_operator  : [],
        protocol_type: Array.isArray(doc?.protocol_type) ? doc.protocol_type : [],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/devices/clients
// ─────────────────────────────────────────────────────────────────────────────
const getClientOptions = async (req, res) => {
  try {
    const role   = req.query.role   || '';
    const userId = parseInt(req.query.userId) || null;
    if (!userId) return res.json({ success: true, clients: [] });

    let filter = {};
    if      (role === 'super_admin') filter = { role: 'admin',  createdBy: userId };
    else if (role === 'admin')       filter = { role: 'dealer', adminId:   userId };
    else return res.json({ success: true, clients: [] });

    const users = await User.find(filter)
      .select('user_id username fullName name status active')
      .sort({ user_id: 1 }).lean();

    res.json({
      success: true,
      clients: users.map(u => ({
        user_id:  u.user_id,
        username: u.username,
        label:    u.fullName || u.name || u.username,
        value:    u.username,
        status:   u.status || 'Active',
        active:   u.active !== false,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/devices/users-under-dealer
// ─────────────────────────────────────────────────────────────────────────────
const getUsersUnderDealer = async (req, res) => {
  try {
    const dealerId = parseInt(req.query.dealerId) || null;
    if (!dealerId) return res.json({ success: true, users: [] });
    const users = await User.find({ role: 'user', createdBy: dealerId })
      .select('user_id username fullName name email status active')
      .sort({ user_id: 1 }).lean();
    res.json({
      success: true,
      users: users.map(u => ({
        _id: u._id, user_id: u.user_id, username: u.username,
        fullName: u.fullName || u.name || u.username,
        email: u.email || '', status: u.status || 'Active', active: u.active !== false,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/devices
// ─────────────────────────────────────────────────────────────────────────────
const getDevices = async (req, res) => {
  try {
    const role   = req.query.role   || '';
    const userId = parseInt(req.query.userId) || null;
    const page   = parseInt(req.query.page)   || 1;
    const limit  = parseInt(req.query.limit)  || 500;
    const skip   = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const statusFilter = req.query.status || '';

    if (!userId || !role) return res.json({ success: true, devices: [], total: 0 });

    let query = {};
    if (role === 'super_admin') {
      const admins = await User.find({ role: 'admin', createdBy: userId }).select('user_id').lean();
      const ids    = admins.map(a => a.user_id);
      if (!ids.length) return res.json({ success: true, devices: [], total: 0, page, pages: 1 });
      query = { adminId: { $in: ids } };
    } else if (role === 'admin') {
      query = { adminId: userId };
    } else if (role === 'dealer') {
      query = { dealerId: userId };
    } else {
      return res.json({ success: true, devices: [], total: 0 });
    }

    let devices = await Device.find(query).lean();

    if (search) {
      const q = search.toLowerCase();
      devices = devices.filter(d =>
        (d.IMEI_No         || '').toLowerCase().includes(q) ||
        (d.device_id       || '').toLowerCase().includes(q) ||
        (d.sim_card        || '').toLowerCase().includes(q) ||
        (d.device_name     || '').toLowerCase().includes(q) ||
        (d.assignedToName  || '').toLowerCase().includes(q) ||
        (d.client          || '').toLowerCase().includes(q)
      );
    }

    devices = await attachClientStatus(devices);

    if (statusFilter === 'active')   devices = devices.filter(d => d.clientActive !== false);
    if (statusFilter === 'inactive') devices = devices.filter(d => d.clientActive === false);
    devices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = devices.length;
    res.json({
      success: true,
      devices: devices.slice(skip, skip + limit),
      total, page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[getDevices]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/devices/:id
// ─────────────────────────────────────────────────────────────────────────────
const getDeviceById = async (req, res) => {
  try {
    const { id } = req.params;
    let device = await Device.findOne({ IMEI_No: id }).lean();
    if (!device) device = await Device.findOne({ device_id: id }).lean();
    if (!device) device = await Device.findById(id).lean();
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
    const [enriched] = await attachClientStatus([device]);
    res.json({ success: true, device: enriched });
  } catch (err) {
    console.error('[getDeviceById]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/devices — single device create/assign
// WITH COIN DEDUCTION
// ─────────────────────────────────────────────────────────────────────────────
const createDevice = async (req, res) => {
  try {
    const creatorUserId = parseInt(req.body.creatorUserId) || null;
    const creatorRole   = req.body.creatorRole             || '';
    if (!creatorUserId) return res.status(400).json({ success: false, message: 'creatorUserId is required' });

    const usersCol   = col();
    const creatorDoc = await usersCol.findOne({ user_id: creatorUserId });
    if (!creatorDoc) return res.status(400).json({ success: false, message: 'Creator not found' });

    const imei        = (req.body.IMEI_No || req.body.imei || '').trim();
    const simOperator = req.body.simOperator || '';
    const device_name = req.body.device_name || req.body.deviceType || '';

    if (!imei)        return res.status(400).json({ success: false, message: 'IMEI No is required' });
    if (!simOperator) return res.status(400).json({ success: false, message: 'SIM Operator is required' });
    if (!device_name) return res.status(400).json({ success: false, message: 'Device Name is required' });

    let targetUser;
    if (creatorRole === 'dealer') {
      targetUser = await User.findOne({ user_id: creatorUserId }).lean();
    } else {
      const client = req.body.client;
      if (!client) return res.status(400).json({ success: false, message: 'Target client selection is required' });
      targetUser = await User.findOne({ username: client }).lean();
      if (!targetUser) return res.status(400).json({ success: false, message: `Client "${client}" not found` });
    }

    // Check if deductCoin flag is passed (default true for new devices)
    const deductCoin = req.body.deductCoin !== false;

    const { device, skipped, reason, coinDeducted } = await saveDevice({
      imei, targetUser, creatorUser: creatorDoc, creatorRole,
      deductCoin,
      fields: {
        sim_card:             req.body.sim_card             || '',
        simOperator:          req.body.simOperator          || '',
        secondarySimCard:     req.body.secondarySimCard     || '',
        secondarySimOperator: req.body.secondarySimOperator || '',
        device_name,
        ignitionWirePlus:         Boolean(req.body.ignitionWirePlus),
        ignitionWireNotConnected: Boolean(req.body.ignitionWireNotConnected),
        acWirePlus:               Boolean(req.body.acWirePlus),
        attendance:               Boolean(req.body.attendance),
        timezoneSetting:          Boolean(req.body.timezoneSetting),
        sensors: Array.isArray(req.body.sensors) ? req.body.sensors : [],
      },
    });

    if (skipped) {
      // If coin was deducted but save failed, return it
      if (coinDeducted) {
        await returnCoinsToUser(creatorUserId, 1);
      }
      // Check if it's a coin error
      if (reason.includes('Insufficient Coin')) {
        return res.status(400).json({ 
          success: false, 
          message: reason,
          coinError: true,
        });
      }
      return res.status(400).json({ success: false, message: reason });
    }

    const [enriched] = await attachClientStatus([device.toObject()]);
    
    // Trigger coin update event for frontend
    // (We can't directly trigger from backend, but frontend will refresh on next poll)
    
    res.status(201).json({
      success: true,
      device: enriched,
      coinDeducted,
      message: creatorRole === 'dealer'
        ? `Device "${imei}" added to your account ${coinDeducted ? '(1 coin deducted)' : ''}`
        : `Device "${imei}" assigned to "${targetUser.fullName || targetUser.username}" ${coinDeducted ? '(1 coin deducted)' : ''}`,
    });
  } catch (err) {
    console.error('[createDevice]', err.message);
    if (err.code === 11000) {
      if (err.keyPattern?.IMEI_No) return res.status(400).json({ success: false, message: 'IMEI No already exists in Device_Master' });
      if (err.keyPattern?.device_id) return res.status(400).json({ success: false, message: 'Device ID collision, please retry' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/devices/assign-multiple
// WITH COIN DEDUCTION FOR EACH DEVICE
// ─────────────────────────────────────────────────────────────────────────────
const assignMultipleDevices = async (req, res) => {
  try {
    const creatorUserId = parseInt(req.body.creatorUserId) || null;
    const creatorRole   = req.body.creatorRole             || '';
    const imeis         = Array.isArray(req.body.imeis) ? req.body.imeis.filter(Boolean) : [];

    if (!creatorUserId) return res.status(400).json({ success: false, message: 'creatorUserId is required' });
    if (!imeis.length)  return res.status(400).json({ success: false, message: 'No IMEIs provided' });

    const usersCol   = col();
    const creatorDoc = await usersCol.findOne({ user_id: creatorUserId });
    if (!creatorDoc) return res.status(400).json({ success: false, message: 'Creator not found' });

    let targetUser;
    if (creatorRole === 'dealer') {
      targetUser = await User.findOne({ user_id: creatorUserId }).lean();
    } else {
      const client = req.body.client;
      if (!client) return res.status(400).json({ success: false, message: 'Client selection is required' });
      targetUser = await User.findOne({ username: client }).lean();
      if (!targetUser) return res.status(400).json({ success: false, message: `Client "${client}" not found` });
    }

    // ── Check if user has enough coins for ALL devices ──────────────────────
    const deductCoin = req.body.deductCoin !== false;
    let totalCoinsDeducted = 0;

    if (deductCoin && creatorRole !== 'super_admin') {
      const coinCheck = await checkUserHasCoins(creatorUserId, imeis.length);
      if (!coinCheck.ok) {
        return res.status(400).json({
          success: false,
          message: coinCheck.message,
          coinError: true,
          available: coinCheck.available,
          required: coinCheck.required,
        });
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    const results = { created: [], skipped: [], errors: [] };

    for (const rawIMEI of imeis) {
      const imei = String(rawIMEI).trim();
      if (!imei) continue;
      try {
        const { device, skipped, reason, coinDeducted } = await saveDevice({
          imei, targetUser, creatorUser: creatorDoc, creatorRole,
          deductCoin,
          fields: {
            sim_card:     req.body.sim_card    || '',
            simOperator:  req.body.simOperator || '',
            device_name:  req.body.device_name || req.body.deviceType || '',
            sensors:      Array.isArray(req.body.sensors) ? req.body.sensors : [],
          },
        });
        if (skipped) {
          results.skipped.push({ imei, reason });
        } else {
          results.created.push({ imei, device_id: device.device_id, IMEI_No: device.IMEI_No });
          if (coinDeducted) totalCoinsDeducted++;
        }
      } catch (err) {
        results.errors.push({ imei, reason: err.message });
      }
    }

    res.status(201).json({
      success: true,
      message: `${results.created.length} assigned, ${results.skipped.length} skipped, ${results.errors.length} errors${totalCoinsDeducted > 0 ? ` (${totalCoinsDeducted} coins deducted)` : ''}`,
      results,
      totalCoinsDeducted,
    });
  } catch (err) {
    console.error('[assignMultipleDevices]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/devices/assign-to-user
// WITH COIN DEDUCTION — assigning device to end-user costs 1 coin
// ─────────────────────────────────────────────────────────────────────────────
const assignDeviceToUser = async (req, res) => {
  try {
    const dealerId     = parseInt(req.body.dealerId)     || null;
    const targetUserId = parseInt(req.body.targetUserId) || null;
    const imei         = (req.body.IMEI_No || req.body.imei || '').trim();

    if (!dealerId)     return res.status(400).json({ success: false, message: 'dealerId is required' });
    if (!targetUserId) return res.status(400).json({ success: false, message: 'targetUserId is required' });
    if (!imei)         return res.status(400).json({ success: false, message: 'IMEI No is required' });

    const usersCol  = col();
    const dealerDoc = await usersCol.findOne({ user_id: dealerId });
    if (!dealerDoc) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const targetUser = await User.findOne({ user_id: targetUserId }).lean();
    if (!targetUser) return res.status(404).json({ success: false, message: 'Target user not found' });

    const dealerHasIt = (dealerDoc.devices || []).some(d =>
      (typeof d === 'string' ? d : d?.IMEI_No) === imei
    );
    if (!dealerHasIt) return res.status(403).json({ success: false, message: `IMEI "${imei}" is not in your account` });

    const deviceDoc = await Device.findOne({ IMEI_No: imei }).lean();
    if (!deviceDoc) return res.status(404).json({ success: false, message: `Device_Master record not found for IMEI "${imei}"` });

    if (deviceDoc.user_id && deviceDoc.user_id !== dealerId) {
      return res.status(400).json({ success: false, message: `IMEI "${imei}" is already assigned to a user` });
    }

    // ── COIN CHECK: Assigning device to end-user costs 1 coin ────────────────
    // Only if dealer is not SuperAdmin
    const dealerUser = await User.findOne({ user_id: dealerId }).select('role').lean();
    if (dealerUser?.role !== 'super_admin') {
      const coinCheck = await checkUserHasCoins(dealerId, 1);
      if (!coinCheck.ok) {
        return res.status(400).json({
          success: false,
          message: coinCheck.message,
          coinError: true,
          available: coinCheck.available,
        });
      }
      // Deduct coin
      await deductCoinsFromUser(dealerId, 1);
      console.log(`[COIN] Deducted 1 coin from dealer ${dealerId} for assigning device ${imei} to user ${targetUserId}`);
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Update Device_Master
    await Device.updateOne({ IMEI_No: imei }, {
      $set: {
        user_id:          targetUserId,
        assignedToUserId: targetUserId,
        assignedToName:   targetUser.fullName || targetUser.username || '',
        assignedToRole:   'user',
        assignedAt:       new Date(),
      },
    });

    await usersCol.updateOne(
      { user_id: dealerId, 'devices.IMEI_No': imei },
      { $set: { 'devices.$.assignedTo': targetUserId } }
    );

    const userDoc   = await usersCol.findOne({ user_id: targetUserId });
    const userHasIt = (userDoc?.devices || []).some(d =>
      (typeof d === 'string' ? d : d?.IMEI_No) === imei
    );
    if (!userHasIt) {
      await usersCol.updateOne(
        { user_id: targetUserId },
        { $push: { devices: { IMEI_No: imei, assignedTo: null } }, $inc: { deviceCount: 1 } }
      );
    }

    const updatedDevice = await Device.findOne({ IMEI_No: imei }).lean();
    const [enriched] = await attachClientStatus([updatedDevice]);
    console.log(`[assignDeviceToUser] OK IMEI_No=${imei} -> user_id=${targetUserId} | dealerId unchanged=${deviceDoc.dealerId}`);
    res.json({ 
      success: true, 
      device: enriched, 
      message: `Device "${imei}" assigned to user "${targetUser.username}" (1 coin deducted)` 
    });
  } catch (err) {
    console.error('[assignDeviceToUser]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/devices/:id  ← FULL EDIT HANDLER
// ─────────────────────────────────────────────────────────────────────────────
const updateDevice = async (req, res) => {
  try {
    const { id } = req.params;

    let device = await Device.findOne({ IMEI_No: id }).lean();
    if (!device) device = await Device.findOne({ device_id: id }).lean();
    if (!device) device = await Device.findById(id).lean();
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const usersCol     = col();
    const updateFields = {};

    // ── 1. Standard editable fields ───────────────────────────────────────────
    const editableFields = [
      'sim_card', 'simOperator', 'secondarySimCard', 'secondarySimOperator',
      'device_name', 'status', 'ignitionWirePlus', 'ignitionWireNotConnected',
      'acWirePlus', 'attendance', 'timezoneSetting',
    ];
    editableFields.forEach(f => {
      if (req.body[f] !== undefined) updateFields[f] = req.body[f];
    });

    // ── 2. IMEI change ─────────────────────────────────────────────────────────
    const newIMEI      = (req.body.IMEI_No || req.body.imei || '').trim();
    const oldIMEI      = device.IMEI_No;
    const imeiChanged  = newIMEI && newIMEI !== oldIMEI;

    if (imeiChanged) {
      const imeiConflict = await Device.findOne({ IMEI_No: newIMEI }).lean();
      if (imeiConflict) {
        return res.status(400).json({ success: false, message: `IMEI "${newIMEI}" already exists in Device_Master` });
      }

      if (device.dealerId) {
        const dealerUpdateResult = await usersCol.updateOne(
          { user_id: device.dealerId, 'devices.IMEI_No': oldIMEI },
          { $set: { 'devices.$.IMEI_No': newIMEI } }
        );
        console.log(`[updateDevice] Dealer User_Master IMEI update: matched=${dealerUpdateResult.matchedCount} modified=${dealerUpdateResult.modifiedCount}`);
      }

      if (device.assignedToUserId && device.assignedToUserId !== device.dealerId) {
        const userUpdateResult = await usersCol.updateOne(
          { user_id: device.assignedToUserId, 'devices.IMEI_No': oldIMEI },
          { $set: { 'devices.$.IMEI_No': newIMEI } }
        );
        console.log(`[updateDevice] AssignedTo User_Master IMEI update: matched=${userUpdateResult.matchedCount} modified=${userUpdateResult.modifiedCount}`);
      }

      if (device.adminId && !device.dealerId && device.adminId !== device.assignedToUserId) {
        await usersCol.updateOne(
          { user_id: device.adminId, 'devices.IMEI_No': oldIMEI },
          { $set: { 'devices.$.IMEI_No': newIMEI } }
        );
      }

      await VehicleLatestStatus.updateOne(
        { imei: oldIMEI },
        { $set: { imei: newIMEI } }
      ).catch(e => console.error('[updateDevice] VLS IMEI update failed:', e.message));

      updateFields.IMEI_No = newIMEI;
      console.log(`[updateDevice] IMEI changing: ${oldIMEI} → ${newIMEI}`);
    }

    // ── 3. Sensors ─────────────────────────────────────────────────────────────
    if (Array.isArray(req.body.sensors)) {
      updateFields.sensors = req.body.sensors.map(cleanSensor);
    }

    // ── 4. Client (dealer) reassignment ────────────────────────────────────────
    if (req.body.client !== undefined) {
      const newClientUsername = (req.body.client || '').trim();
      const currentUsername   = device.client || '';

      if (newClientUsername && newClientUsername !== currentUsername) {
        const newTarget = await User.findOne({ username: newClientUsername }).lean();
        if (!newTarget) {
          return res.status(400).json({ success: false, message: `Client "${newClientUsername}" not found` });
        }

        const currentIMEI = updateFields.IMEI_No || oldIMEI;

        if (device.dealerId) {
          const pullResult = await usersCol.updateOne(
            { user_id: device.dealerId },
            { $pull: { devices: { IMEI_No: oldIMEI } }, $inc: { deviceCount: -1 } }
          );
          console.log(`[updateDevice] Pulled IMEI ${oldIMEI} from old dealerId=${device.dealerId}: modified=${pullResult.modifiedCount}`);
        }

        await usersCol.updateOne(
          { user_id: newTarget.user_id },
          { $push: { devices: { IMEI_No: currentIMEI, assignedTo: null } }, $inc: { deviceCount: 1 } }
        );
        console.log(`[updateDevice] Pushed IMEI ${currentIMEI} to new dealerId=${newTarget.user_id} (${newTarget.username})`);

        updateFields.client  = newTarget.username;
        updateFields.dealerId = newTarget.user_id;

        const creatorRole = req.body.creatorRole || device.createdByRole || '';
        if (creatorRole === 'admin' || device.createdByRole === 'admin') {
          updateFields.adminId  = device.adminId || device.createdBy;
          updateFields.dealerId = newTarget.user_id;
        } else if (creatorRole === 'super_admin' || device.createdByRole === 'super_admin') {
          updateFields.adminId  = newTarget.user_id;
          updateFields.dealerId = null;
        }

        if (!device.user_id) {
          updateFields.assignedToUserId = newTarget.user_id;
          updateFields.assignedToName   = newTarget.fullName || newTarget.username;
          updateFields.assignedToRole   = newTarget.role || 'dealer';
          updateFields.assignedAt       = new Date();
        }
      }
    }

    // ── 5. Apply all updates to Device_Master ─────────────────────────────────
    const updated = await Device.findOneAndUpdate(
      { IMEI_No: oldIMEI },
      { $set: updateFields },
      { new: true, lean: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: 'Device not found after update' });

    const [enriched] = await attachClientStatus([updated]);
    console.log(`[updateDevice] OK IMEI_No=${updated.IMEI_No} device_id=${updated.device_id}`);
    res.json({ success: true, device: enriched, message: 'Device updated successfully' });

  } catch (err) {
    console.error('[updateDevice]', err.message, err.stack);
    if (err.code === 11000 && err.keyPattern?.IMEI_No) {
      return res.status(400).json({ success: false, message: 'IMEI No already exists' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/devices/:id
//
// ✅ FIX: Ab VehicleLatestStatus se bhi orphan document delete hoga
//         Jab device delete ho toh VLS mein uska record nahi rehna chahiye
//         ✅ Coin bhi wapas karo jab device delete ho
// ─────────────────────────────────────────────────────────────────────────────
const deleteDevice = async (req, res) => {
  try {
    const { id } = req.params;

    let device = await Device.findOne({ IMEI_No: id }).lean();
    if (!device) device = await Device.findOne({ device_id: id }).lean();
    if (!device) device = await Device.findById(id).lean();
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const usersCol  = col();
    const imei      = device.IMEI_No;

    // ── COIN RETURN: Device delete ho toh coin wapas karo ────────────────────
    // Check if this device was created by someone (not SuperAdmin)
    if (device.createdBy) {
      const creator = await User.findOne({ user_id: device.createdBy }).select('role').lean();
      if (creator?.role !== 'super_admin') {
        await returnCoinsToUser(device.createdBy, 1);
        console.log(`[COIN] Returned 1 coin to ${device.createdBy} for deleting device ${imei}`);
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    // ── 1. Remove from dealer's User_Master ───────────────────────────────────
    if (device.dealerId) {
      await usersCol.updateOne(
        { user_id: device.dealerId },
        { $pull: { devices: { IMEI_No: imei } }, $inc: { deviceCount: -1 } }
      );
    }

    // ── 2. Remove from admin's User_Master if assigned directly ─────────────
    if (device.adminId && !device.dealerId) {
      await usersCol.updateOne(
        { user_id: device.adminId },
        { $pull: { devices: { IMEI_No: imei } }, $inc: { deviceCount: -1 } }
      );
    }

    // ── 3. Remove from end-user's array if a vehicle was assigned ────────────
    if (device.user_id && device.user_id !== device.dealerId && device.user_id !== device.adminId) {
      await usersCol.updateOne(
        { user_id: device.user_id },
        { $pull: { devices: { IMEI_No: imei } }, $inc: { deviceCount: -1 } }
      );
    }

    // ── 4. VehicleLatestStatus cleanup ───────────────────────────────────────
    const vlsResult = await VehicleLatestStatus.deleteOne({ imei });
    if (vlsResult.deletedCount > 0) {
      console.log(`[deleteDevice] VLS orphan cleaned for IMEI: ${imei}`);
    }

    // ── 5. Device_Master se delete karo ──────────────────────────────────────
    await Device.deleteOne({ IMEI_No: imei });

    console.log(`[deleteDevice] OK IMEI_No=${imei} deleted from Device_Master + VLS`);
    res.json({ success: true, message: `Device "${imei}" deleted (1 coin returned)` });
  } catch (err) {
    console.error('[deleteDevice]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/devices/:id/sensors
// ─────────────────────────────────────────────────────────────────────────────
const updateDeviceSensors = async (req, res) => {
  try {
    const { id } = req.params;

    let device = await Device.findOne({ IMEI_No: id }).lean();
    if (!device) device = await Device.findOne({ device_id: id }).lean();
    if (!device) device = await Device.findById(id).lean();
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const cleaned = (req.body.sensors || []).map(cleanSensor);
    await Device.updateOne({ IMEI_No: device.IMEI_No }, { $set: { sensors: cleaned } });
    res.json({ success: true, sensors: cleaned, message: `${cleaned.length} sensor(s) saved` });
  } catch (err) {
    console.error('[updateDeviceSensors]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/devices/import-excel
// WITH COIN DEDUCTION FOR EACH DEVICE
// ─────────────────────────────────────────────────────────────────────────────
const importDevicesFromExcel = async (req, res) => {
  try {
    const creatorUserId = parseInt(req.body.creatorUserId) || null;
    const creatorRole   = req.body.creatorRole             || '';
    const rows          = req.body.devices                 || [];
    const fileName      = req.body.fileName                || 'import.xlsx';

    if (!rows.length) return res.status(400).json({ success: false, message: 'No rows found' });

    const usersCol   = col();
    const creatorDoc = await usersCol.findOne({ user_id: creatorUserId });
    if (!creatorDoc) return res.status(400).json({ success: false, message: 'Creator not found' });

    // ── Check if user has enough coins for ALL devices ──────────────────────
    const deductCoin = req.body.deductCoin !== false;
    let totalCoinsDeducted = 0;

    if (deductCoin && creatorRole !== 'super_admin') {
      const coinCheck = await checkUserHasCoins(creatorUserId, rows.length);
      if (!coinCheck.ok) {
        return res.status(400).json({
          success: false,
          message: coinCheck.message,
          coinError: true,
          available: coinCheck.available,
          required: coinCheck.required,
        });
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      const imei = (row.IMEI_No || row.imei || row.IMEI || '').toString().trim();
      if (!imei) { results.errors.push({ reason: 'Missing IMEI No', row }); continue; }

      let targetUser;
      if (creatorRole === 'dealer') {
        targetUser = await User.findOne({ user_id: creatorUserId }).lean();
      } else {
        const client = row.client || row.Client || '';
        if (!client) { results.errors.push({ reason: 'Missing client', imei }); continue; }
        targetUser = await User.findOne({ username: client }).lean();
        if (!targetUser) { results.errors.push({ reason: `Client "${client}" not found`, imei }); continue; }
      }

      try {
        const { skipped, coinDeducted } = await saveDevice({
          imei, targetUser, creatorUser: creatorDoc, creatorRole,
          deductCoin,
          fields: {
            sim_card:     row.sim_card     || row.simCard      || '',
            simOperator:  row.simOperator  || row.sim_operator || '',
            device_name:  row.device_name  || row.deviceType   || row.device_type || '',
            sensors:      [],
            importedFrom: fileName,
            importedAt:   new Date(),
          },
        });
        if (skipped) {
          results.skipped++;
        } else {
          results.created++;
          if (coinDeducted) totalCoinsDeducted++;
        }
      } catch (e) {
        results.errors.push({ imei, reason: e.message });
      }
    }

    res.json({
      success: true,
      message: `Import: ${results.created} created, ${results.skipped} skipped, ${results.errors.length} errors${totalCoinsDeducted > 0 ? ` (${totalCoinsDeducted} coins deducted)` : ''}`,
      results,
      totalCoinsDeducted,
    });
  } catch (err) {
    console.error('[importDevicesFromExcel]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getProtocolMaster,
  getClientOptions,
  getUsersUnderDealer,
  getDevices,
  getDeviceById,
  createDevice,
  updateDevice,
  updateDeviceSensors,
  deleteDevice,
  importDevicesFromExcel,
  assignMultipleDevices,
  assignDeviceToUser,
};