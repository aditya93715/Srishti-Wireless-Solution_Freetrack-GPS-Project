// controllers/vehicleController.js
//
// KEY FIX: Vehicle table now exposes SEPARATE dealer + user columns:
//
//   dealerUsername / dealerName  → resolved from dealerId  (stable, set at device creation)
//   userUsername   / userName    → resolved from user_id    (set when vehicle is assigned)
//
// This is separate from the Device table which also uses dealerId for its
// "Dealer" column (via attachClientStatus in deviceController).
//
// The `assignedToUserId` field tracks who currently "holds" the device in
// the hierarchy for User_Master sync — it is NOT used for display columns.

const mongoose = require('mongoose');
const Device   = require('../models/Device');
const User     = require('../models/User');

// ── VehicleLatestStatus — for cleanup on vehicle delete ───────────────────────
const VehicleLatestStatus = require('../models/VehicleLatestStatus');

const col = () => mongoose.connection.db.collection('User_Master');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Enrich vehicles with proper dealer + user info from User_Master
// ─────────────────────────────────────────────────────────────────────────────
const enrichVehiclesWithHierarchy = async (vehicles) => {
  if (!vehicles?.length) return vehicles;

  const adminIds  = [...new Set(vehicles.map(v => v.adminId).filter(Boolean))];
  const dealerIds = [...new Set(vehicles.map(v => v.dealerId).filter(Boolean))];
  const userIds   = [...new Set(vehicles.map(v => v.user_id).filter(Boolean))];
  const allIds    = [...new Set([...adminIds, ...dealerIds, ...userIds])];

  const users = await User.find({ user_id: { $in: allIds } })
    .select('user_id username fullName status active role')
    .lean();

  const userMap = {};
  users.forEach(u => { userMap[u.user_id] = u; });

  return vehicles.map(v => {
    const adminUser  = v.adminId  ? (userMap[v.adminId]  || null) : null;
    const dealerUser = v.dealerId ? (userMap[v.dealerId] || null) : null;
    const endUser    = v.user_id  ? (userMap[v.user_id]  || null) : null;

    let effectiveActive = true;
    let effectiveStatus = 'Active';

    if (adminUser?.active === false) {
      effectiveActive = false; effectiveStatus = 'Inactive';
    } else if (dealerUser?.active === false) {
      effectiveActive = false; effectiveStatus = 'Inactive';
    } else if (endUser?.active === false) {
      effectiveActive = false; effectiveStatus = 'Inactive';
    } else if (v.vstatus === 'Inactive') {
      effectiveActive = false; effectiveStatus = 'Inactive';
    }

    return {
      ...v,
      imei:           v.IMEI_No,
      dealerUsername: dealerUser?.username || '',
      dealerName:     dealerUser?.fullName || '',
      dealerActive:   dealerUser?.active   !== false,
      dealerStatus:   dealerUser?.status   || 'Active',
      userUsername:   endUser?.username || '',
      userName:       endUser?.fullName || v.ownerName || '',
      userActive:     endUser?.active   !== false,
      userStatus:     endUser?.status   || 'Active',
      clientActive:   effectiveActive,
      clientStatus:   effectiveStatus,
      effectiveStatus,
    };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
//  HIERARCHY SELECTORS
// ─────────────────────────────────────────────────────────────────────────────
const getAdmins = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin')
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const admins = await User.find({ role: 'admin' })
      .select('user_id username fullName name email status active')
      .sort({ user_id: 1 })
      .lean();

    res.json({ success: true, admins });
  } catch (err) {
    console.error('[getAdmins]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getDealers = async (req, res) => {
  try {
    const { role, user_id } = req.user;

    let adminId;
    if (role === 'super_admin') {
      adminId = Number(req.query.adminId) || null;
      if (!adminId)
        return res.status(400).json({ success: false, message: 'adminId is required' });
    } else if (role === 'admin') {
      adminId = user_id;
    } else {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const dealers = await User.find({ role: 'dealer', adminId })
      .select('user_id username fullName name email status active')
      .sort({ user_id: 1 })
      .lean();

    res.json({ success: true, dealers });
  } catch (err) {
    console.error('[getDealers]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getHierarchyUsers = async (req, res) => {
  try {
    const { role, user_id } = req.user;

    let dealerId;
    if (role === 'super_admin' || role === 'admin') {
      dealerId = Number(req.query.dealerId) || null;
      if (!dealerId)
        return res.status(400).json({ success: false, message: 'dealerId is required' });
    } else if (role === 'dealer') {
      dealerId = user_id;
    } else {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const users = await User.find({ role: 'user', dealerId })
      .select('user_id username fullName name email status active')
      .sort({ user_id: 1 })
      .lean();

    res.json({ success: true, users });
  } catch (err) {
    console.error('[getHierarchyUsers]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/vehicles/hierarchy/devices-by-dealer/:dealerId
// ─────────────────────────────────────────────────────────────────────────────
const getDevicesByDealer = async (req, res) => {
  try {
    const { role, user_id } = req.user;
    const dealerId = Number(req.params.dealerId) || null;

    if (!dealerId)
      return res.status(400).json({ success: false, message: 'dealerId is required' });

    if (role === 'dealer' && user_id !== dealerId)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const usersCol  = col();
    const dealerDoc = await usersCol.findOne({ user_id: dealerId });

    if (!dealerDoc)
      return res.status(404).json({ success: false, message: 'Dealer not found' });

    const rawDevices = dealerDoc.devices || [];
    const imeis = rawDevices
      .map(d => (typeof d === 'string' ? d : d?.IMEI_No || d?.imei || ''))
      .filter(Boolean);

    if (imeis.length === 0)
      return res.json({ success: true, devices: [] });

    const devices = await Device.find({ IMEI_No: { $in: imeis } })
      .select('IMEI_No device_id device_name deviceType sim_card user_id assignedToUserId assignedToName vehicle_no vehicle_type fuelType vehicleBrand speed_limit_kph status dealerId adminId')
      .sort({ device_id: 1 })
      .lean();

    const tagged = devices.map(d => ({
      ...d,
      imei: d.IMEI_No,
      hasVehicle: !!(d.vehicle_no),
    }));

    res.json({ success: true, devices: tagged });
  } catch (err) {
    console.error('[getDevicesByDealer]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/vehicles/check-no/:vehicleNo
// ─────────────────────────────────────────────────────────────────────────────
const checkVehicleNo = async (req, res) => {
  try {
    const vno = (req.params.vehicleNo || '').toUpperCase().trim();
    if (!vno) return res.json({ exists: false });
    const found = await Device.findOne({ vehicle_no: vno }).lean();
    res.json({ exists: !!found });
  } catch (err) {
    console.error('[checkVehicleNo]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/vehicles
// ─────────────────────────────────────────────────────────────────────────────
const getVehicles = async (req, res) => {
  try {
    const { role, user_id } = req.user;

    const filter = { vehicle_no: { $exists: true, $ne: '' } };

    if (role === 'super_admin') {
      // sees all
    } else if (role === 'admin') {
      filter.adminId = user_id;
    } else if (role === 'dealer') {
      filter.dealerId = user_id;
    } else {
      filter.user_id = user_id;
    }

    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 200;
    const skip   = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    if (search) {
      filter.$or = [
        { vehicle_no:    { $regex: search, $options: 'i' } },
        { nickname:      { $regex: search, $options: 'i' } },
        { vehicle_type:  { $regex: search, $options: 'i' } },
        { vehicleBrand:  { $regex: search, $options: 'i' } },
        { ownerName:     { $regex: search, $options: 'i' } },
        { IMEI_No:       { $regex: search, $options: 'i' } },
      ];
    }

    const total    = await Device.countDocuments(filter);
    const vehicles = await Device.find(filter)
      .sort({ vehicleAssignedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const enriched = await enrichVehiclesWithHierarchy(vehicles);
    res.json({ success: true, vehicles: enriched, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[getVehicles]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/vehicles/:id
// ─────────────────────────────────────────────────────────────────────────────
const getVehicleById = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id).lean();
    if (!device)
      return res.status(404).json({ success: false, message: 'Vehicle not found' });

    const [enriched] = await enrichVehiclesWithHierarchy([device]);
    res.json({ success: true, vehicle: enriched });
  } catch (err) {
    console.error('[getVehicleById]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/vehicles — create / assign vehicle
// ─────────────────────────────────────────────────────────────────────────────
const createVehicle = async (req, res) => {
  try {
    const {
      vehicle_no, vehicle_type, speed_limit_kph, mileage, fuel_type,
      sub_start, sub_due, nickname, odometer, duration_odometer,
      parking_alarm, owner_name, owned_by,
      vehicle_brand, vehicle_model, vehicle_body, capacity,
      manufacture_date, purchase_date,
      device_imei,
      user_id:        userId,
      dealer_id:      dealerId,
      admin_id:       adminId,
      super_admin_id: superAdminId,
    } = req.body;

    const vno         = (vehicle_no  || '').toUpperCase().trim();
    const imeiTrimmed = (device_imei || '').trim();

    if (!vno)
      return res.status(400).json({ success: false, message: 'Vehicle number is required' });
    if (!imeiTrimmed)
      return res.status(400).json({ success: false, message: 'Device IMEI is required' });
    if (!userId)
      return res.status(400).json({ success: false, message: 'user_id is required' });

    const dupCheck = await Device.findOne({ vehicle_no: vno }).lean();
    if (dupCheck)
      return res.status(400).json({ success: false, message: `Vehicle number "${vno}" already exists` });

    const usersCol = col();
    if (dealerId) {
      const dealerDoc = await usersCol.findOne({ user_id: Number(dealerId) });
      if (dealerDoc) {
        const dealerImeis = (dealerDoc.devices || [])
          .map(d => (typeof d === 'string' ? d : d?.IMEI_No || d?.imei || ''))
          .filter(Boolean);

        if (dealerImeis.length > 0 && !dealerImeis.includes(imeiTrimmed)) {
          return res.status(400).json({
            success: false,
            message: `IMEI "${imeiTrimmed}" does not belong to dealer ID "${dealerId}"`,
          });
        }
      }
    }

    const device = await Device.findOne({ IMEI_No: imeiTrimmed });
    if (!device)
      return res.status(404).json({
        success: false,
        message: `Device IMEI_No "${imeiTrimmed}" not found in Vehicle_Master`,
      });

    if (device.vehicle_no) {
      return res.status(400).json({
        success: false,
        message: `Device "${imeiTrimmed}" already has vehicle "${device.vehicle_no}" assigned`,
      });
    }

    let resolvedOwnerName = owner_name || '';
    if (!resolvedOwnerName && userId) {
      const userDoc = await User.findOne({ user_id: Number(userId) })
        .select('fullName username').lean();
      resolvedOwnerName = userDoc?.fullName || userDoc?.username || '';
    }

    const now = new Date();

    const vehicleFields = {
      vehicle_no:        vno,
      vehicle_type:      vehicle_type   || '',
      vehicleBrand:      vehicle_brand  || '',
      vehicleModel:      vehicle_model  || '',
      vehicleBody:       vehicle_body   || '',
      nickname:          nickname       || '',
      fuelType:          fuel_type      || '',
      speed_limit_kph:   Number(speed_limit_kph)    || 60,
      mileage:           Number(mileage)            || 1,
      capacity:          Number(capacity)           || 0,
      odometer:          Number(odometer)           || 0,
      durationOdometer:  Number(duration_odometer)  || 0,
      ownerName:         resolvedOwnerName,
      ownedBy:           owned_by       || '',
      manufactureDate:   manufacture_date ? new Date(manufacture_date) : null,
      purchaseDate:      purchase_date   ? new Date(purchase_date)     : null,
      parkingAlarm:      !!parking_alarm,
      subStart:          sub_start       ? new Date(sub_start)         : null,
      subDue:            sub_due         ? new Date(sub_due)           : null,
      vehicleAssignedAt: now,
      user_id:           Number(userId),
      assignedToUserId:  Number(userId),
      assignedToName:    resolvedOwnerName,
      assignedToRole:    'user',
      assignedAt:        now,
      ...(adminId && !device.adminId ? { adminId: Number(adminId) } : {}),
    };

    Object.assign(device, vehicleFields);
    await device.save();

    // Update dealer's User_Master
    await usersCol.updateOne(
      { user_id: Number(dealerId), 'devices.IMEI_No': imeiTrimmed },
      { $set: { 'devices.$.assignedTo': Number(userId) } }
    );

    // Add IMEI to user's User_Master devices array
    const userDoc = await usersCol.findOne({ user_id: Number(userId) });
    const userAlreadyHasIt = (userDoc?.devices || []).some(d =>
      (typeof d === 'string' ? d : d?.IMEI_No || d?.imei || '') === imeiTrimmed
    );

    if (!userAlreadyHasIt) {
      await usersCol.updateOne(
        { user_id: Number(userId) },
        {
          $push: { devices: { IMEI_No: imeiTrimmed, assignedBy: Number(dealerId) } },
          $inc:  { deviceCount: 1 },
        }
      );
    }

    // ── ✅ VLS mein vehicle_no aur userId update karo ─────────────────────────
    await VehicleLatestStatus.updateOne(
      { imei: imeiTrimmed },
      {
        $set: {
          vehicle:  vno,
          userId:   Number(userId),
          dealerId: device.dealerId  || null,
          adminId:  device.adminId   || null,
          assigned: true,
        },
      }
    ).catch(e => console.error('[createVehicle] VLS update failed:', e.message));

    console.log(
      `[createVehicle] vno=${vno} IMEI_No=${imeiTrimmed} ` +
      `userId=${userId} dealerId=${device.dealerId} adminId=${device.adminId}`
    );

    const [enriched] = await enrichVehiclesWithHierarchy([device.toObject()]);

    res.status(201).json({
      success: true,
      vehicle: enriched,
      message: `Vehicle "${vno}" created and linked to IMEI_No ${imeiTrimmed}`,
    });
  } catch (err) {
    console.error('[createVehicle]', err.message);
    if (err.code === 11000 || /duplicate|already exists/i.test(err.message)) {
      return res.status(400).json({ success: false, message: 'Vehicle number already exists' });
    }
    res.status(500).json({ success: false, message: `Server error: ${err.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/vehicles/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateVehicle = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device)
      return res.status(404).json({ success: false, message: 'Vehicle not found' });

    if (req.user.role === 'user' && Number(device.user_id) !== Number(req.user.user_id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit vehicles assigned to you',
      });
    }

    const {
      vehicle_no, vehicle_type, speed_limit_kph, mileage, fuel_type,
      sub_start, sub_due, nickname, odometer, duration_odometer,
      parking_alarm, owner_name, owned_by,
      vehicle_brand, vehicle_model, vehicle_body, capacity,
      manufacture_date, purchase_date,
    } = req.body;

    if (vehicle_no != null)          device.vehicle_no        = vehicle_no.toUpperCase().trim();
    if (vehicle_type != null)        device.vehicle_type      = vehicle_type;
    if (speed_limit_kph != null)     device.speed_limit_kph   = Number(speed_limit_kph) || 60;
    if (mileage != null)             device.mileage           = Number(mileage) || 1;
    if (fuel_type != null)           device.fuelType          = fuel_type;
    if (sub_start != null)           device.subStart          = new Date(sub_start);
    if (sub_due != null)             device.subDue            = new Date(sub_due);
    if (nickname != null)            device.nickname          = nickname;
    if (odometer != null)            device.odometer          = Number(odometer) || 0;
    if (duration_odometer != null)   device.durationOdometer  = Number(duration_odometer) || 0;
    if (parking_alarm != null)       device.parkingAlarm      = !!parking_alarm;
    if (owner_name != null)          device.ownerName         = owner_name;
    if (owned_by != null)            device.ownedBy           = owned_by;
    if (vehicle_brand != null)       device.vehicleBrand      = vehicle_brand;
    if (vehicle_model != null)       device.vehicleModel      = vehicle_model;
    if (vehicle_body != null)        device.vehicleBody       = vehicle_body;
    if (capacity != null)            device.capacity          = Number(capacity) || 0;
    if (manufacture_date != null)    device.manufactureDate   = new Date(manufacture_date);
    if (purchase_date != null)       device.purchaseDate      = new Date(purchase_date);

    await device.save();

    // ── ✅ VLS mein vehicle_no update karo agar badla ho ──────────────────────
    if (vehicle_no != null) {
      await VehicleLatestStatus.updateOne(
        { imei: device.IMEI_No },
        { $set: { vehicle: device.vehicle_no, vehicleType: device.vehicle_type || 'car' } }
      ).catch(e => console.error('[updateVehicle] VLS update failed:', e.message));
    }

    const [enriched] = await enrichVehiclesWithHierarchy([device.toObject()]);
    res.json({
      success: true,
      vehicle: enriched,
      message: 'Vehicle updated successfully',
    });
  } catch (err) {
    console.error('[updateVehicle]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/vehicles/:id — unassign vehicle (frees the device)
//
//  ✅ FIX: Ab VehicleLatestStatus mein vehicle fields clear honge
//          Orphan problem permanently solve — VLS record rehta hai
//          lekin vehicle_no, userId clear ho jaata hai
// ─────────────────────────────────────────────────────────────────────────────
// ✅ FIXED deleteVehicle function
const deleteVehicle = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device)
      return res.status(404).json({ success: false, message: 'Vehicle not found' });

    const vno          = device.vehicle_no   || '';
    const imei         = device.IMEI_No      || '';
    const prevUserId   = device.user_id      || device.assignedToUserId;
    const prevDealerId = device.dealerId;

    // ── 1️⃣ Clear all vehicle fields ──
    const clearFields = [
      'vehicle_no', 'vehicle_type', 'vehicleBrand', 'vehicleModel', 'vehicleBody',
      'nickname', 'fuelType', 'speed_limit_kph', 'mileage', 'capacity',
      'odometer', 'durationOdometer', 'ownerName', 'ownedBy',
      'manufactureDate', 'purchaseDate', 'parkingAlarm',
      'subStart', 'subDue', 'vehicleAssignedAt',
    ];
    clearFields.forEach(f => { device[f] = undefined; });

    // ── 2️⃣ Reset user assignment ──
    device.user_id          = null;
    device.assignedToUserId = prevDealerId || null;
    device.assignedToName   = '';
    device.assignedToRole   = prevDealerId ? 'dealer' : '';
    
    // ⭐⭐⭐ CRITICAL: Device ko inactive mark karo (dashboard se hatane ke liye)
    device.active = false;  // ← YEH ADD KARO
    
    await device.save();

    const usersCol = col();

    // ── 3️⃣ Update dealer's User_Master ──
    if (prevDealerId && imei) {
      await usersCol.updateOne(
        { user_id: Number(prevDealerId), 'devices.IMEI_No': imei },
        { $set: { 'devices.$.assignedTo': null } }
      );
    }

    // ── 4️⃣ Remove IMEI from user's devices[] ──
    if (prevUserId && imei) {
      await usersCol.updateOne(
        { user_id: Number(prevUserId) },
        {
          $pull: { devices: { IMEI_No: imei } },
          $inc:  { deviceCount: -1 },
        }
      );
    }

    // ── 5️⃣ VLS clear ──
    await VehicleLatestStatus.updateOne(
      { imei },
      {
        $set: {
          vehicle:  '--',
          userId:   null,
          assigned: false,
        },
      }
    ).catch(e => console.error('[deleteVehicle] VLS clear failed:', e.message));

    // ── 6️⃣ ⭐ Cache clear (agar Redis use kar rahe ho) ──
    try {
      if (global.redisClient) {
        await global.redisClient.del(`vehicle:${imei}`);
        await global.redisClient.del('vehicles:dashboard');
        await global.redisClient.del('vehicles:all');
        console.log(`[deleteVehicle] Cache cleared for IMEI: ${imei}`);
      }
    } catch (cacheErr) {
      console.error('[deleteVehicle] Cache clear error:', cacheErr.message);
    }

    console.log(
      `[deleteVehicle] vno=${vno} IMEI_No=${imei} freed ` +
      `→ dealer(${prevDealerId}).assignedTo=null, user(${prevUserId}).devices pulled, VLS cleared, device.active=false`
    );

    res.json({
      success: true,
      message: `Vehicle "${vno}" removed. Device IMEI_No ${imei} is now free.`,
    });
  } catch (err) {
    console.error('[deleteVehicle]', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getAdmins,
  getDealers,
  getHierarchyUsers,
  getDevicesByDealer,
  checkVehicleNo,
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
};