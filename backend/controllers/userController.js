const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { ROLE_DEFAULT_FEATURES } = require('../constants/roles');

const rawCol = () => mongoose.connection.db.collection('User_Master');

const getNextUserId = async () => {
  const last = await User.findOne({}).sort({ user_id: -1 }).select('user_id').lean();
  return last ? (last.user_id || 0) + 1 : 1;
};

const normDev = (d) =>
  typeof d === 'string'
    ? { imei: d, assignedTo: null }
    : { imei: d.imei || String(d), assignedTo: d.assignedTo || null };

const assignDevicesInParent = (parentDevices, assignedImeis, childUserId) => {
  const updated = (parentDevices || []).map(d => {
    const n = normDev(d);
    return assignedImeis.includes(n.imei) ? { imei: n.imei, assignedTo: childUserId } : n;
  });
  const existing = updated.map(d => d.imei);
  assignedImeis.forEach(imei => {
    if (!existing.includes(imei)) updated.push({ imei, assignedTo: childUserId });
  });
  return updated;
};

const freeDevicesInParent = (parentDevices, freedImeis) =>
  (parentDevices || []).map(d => {
    const n = normDev(d);
    return freedImeis.includes(n.imei) ? { imei: n.imei, assignedTo: null } : n;
  });

const extractFormFields = (body) => {
  const maxRaw = body.maxVehicles ?? body.maxVehicleCount;
  const maxVehicles = (maxRaw !== undefined && maxRaw !== '' && maxRaw !== null)
    ? (Number(maxRaw) || null) : null;

  let status = body.status || 'Active';
  if (body.active !== undefined) status = body.active ? 'Active' : 'Inactive';

  const toDate = (v) => (v && v !== '') ? new Date(v) : null;

  const subscriptionExpiryCount =
    body.subscriptionExpiryCount !== undefined && body.subscriptionExpiryCount !== ''
      ? (Number(body.subscriptionExpiryCount) || 10)
      : 10;

  return {
    ownerName:    body.ownerName    || body.fullName || '',
    language:     body.language     || 'English',
    domain:       body.domain       || '',
    timezone:     body.timezone     || 'Asia/Calcutta',
    clientImage:  body.clientImage  || '',
    maxVehicles,
    maxVehicleCount: maxVehicles,
    status,
    active: status === 'Active',
    subscriptionStartDate:      toDate(body.subscriptionStartDate),
    subscriptionDueDate:        toDate(body.subscriptionDueDate),
    subscriptionExtendDate:     toDate(body.subscriptionExtendDate),
    subscriptionExpiryCount,
    autoExpiry:                 body.autoExpiry || 'N',
    overwriteSubscription:      body.overwriteSubscription      ?? false,
    vehicleInactiveAfterExpiry: body.vehicleInactiveAfterExpiry ?? false,
    accessRoles: Array.isArray(body.accessRoles) ? body.accessRoles : [],
  };
};

const sanitize = (userObj) => {
  const obj = typeof userObj.toObject === 'function'
    ? userObj.toObject({ virtuals: true })
    : { ...userObj };
  delete obj.passwordHash;
  delete obj.confirmPassword;
  if (obj.availableCoins === undefined) {
    obj.availableCoins = Math.max(0, (obj.allocatedCoins || 0) - (obj.usedCoins || 0));
  }
  return obj;
};

// ── Tenant helpers ────────────────────────────────────────────────────────────
const createTenantForDealer = async (dealerUser, body) => {
  try {
    await Tenant.create({
      ownerId:         dealerUser.user_id,
      domain:          body.domain || '',
      companyName:     body.companyName || body.company || dealerUser.fullName || dealerUser.username,
      logoUrl:         body.logoUrl || '',
      primaryColor:    body.primaryColor || '#6b46c1',
      secondaryColor:  body.secondaryColor || '#9f7aea',
      active:          true,
    });
  } catch (err) {
    console.error('createTenantForDealer error:', err.message);
  }
};

const syncTenantForDealer = async (dealerUserId, body) => {
  const hasBrandingFields =
    body.companyName !== undefined || body.logoUrl !== undefined ||
    body.primaryColor !== undefined || body.secondaryColor !== undefined ||
    body.domain !== undefined;

  if (!hasBrandingFields) return;

  try {
    const update = {};
    if (body.companyName     !== undefined) update.companyName     = body.companyName;
    if (body.logoUrl         !== undefined) update.logoUrl         = body.logoUrl;
    if (body.primaryColor    !== undefined) update.primaryColor    = body.primaryColor;
    if (body.secondaryColor  !== undefined) update.secondaryColor  = body.secondaryColor;
    if (body.domain          !== undefined) update.domain          = String(body.domain).toLowerCase().trim();

    await Tenant.findOneAndUpdate(
      { ownerId: dealerUserId },
      { ownerId: dealerUserId, ...update },
      { upsert: true }
    );
  } catch (err) {
    console.error('syncTenantForDealer error:', err.message);
  }
};

// ── COIN QUOTA HELPERS ────────────────────────────────────────────────────────
const checkParentHasCoins = async (parentUserId, requestedCoins) => {
  if (!requestedCoins || requestedCoins <= 0) return { ok: true };

  const parent = await User.findOne({ user_id: parentUserId })
    .select('allocatedCoins usedCoins role username')
    .lean();

  if (!parent) return { ok: false, message: 'Parent user not found' };

  if (parent.role === 'super_admin') {
    return { ok: true, available: Infinity, parentDoc: parent };
  }

  const available = Math.max(0, (parent.allocatedCoins || 0) - (parent.usedCoins || 0));

  if (available < requestedCoins) {
    return {
      ok: false,
      message: `⚠️ Insufficient Coin Balance!\n\n"${parent.username}" has only ${available} coin(s) available.\nYou requested: ${requestedCoins} coin(s).\n\nPlease reduce the allocation or contact your administrator.`,
      available,
      requested: requestedCoins,
    };
  }

  return { ok: true, available, parentDoc: parent };
};

const deductCoinsFromParent = async (parentUserId, amount) => {
  if (!amount || amount <= 0) return;

  const parent = await User.findOne({ user_id: parentUserId }).select('role').lean();
  if (parent?.role === 'super_admin') return;

  const result = await User.updateOne(
    { user_id: parentUserId },
    { $inc: { usedCoins: amount } }
  );
  console.log(`[COIN] Deducted ${amount} coins from parent ${parentUserId}, result:`, result);
};

const returnCoinsToParent = async (parentUserId, amount) => {
  if (!amount || amount <= 0) return;

  const parent = await User.findOne({ user_id: parentUserId }).select('role').lean();
  if (parent?.role === 'super_admin') return;

  const result = await User.updateOne(
    { user_id: parentUserId },
    { $inc: { usedCoins: -amount } }
  );
  await User.updateOne(
    { user_id: parentUserId, usedCoins: { $lt: 0 } },
    { $set: { usedCoins: 0 } }
  );
  console.log(`[COIN] Returned ${amount} coins to parent ${parentUserId}, result:`, result);
};

// ── GET /api/users/my-coins ──────────────────────────────────────────────────
const getMyCoins = async (req, res) => {
  try {
    console.log('[getMyCoins] Called by:', req.user?.username, 'uid:', req.user?.user_id);

    let allocated = req.user.allocatedCoins || 0;
    let used      = req.user.usedCoins      || 0;

    try {
      const freshUser = await User.findOne({ user_id: req.user.user_id })
        .select('allocatedCoins usedCoins')
        .lean();

      if (freshUser) {
        allocated = freshUser.allocatedCoins || 0;
        used      = freshUser.usedCoins      || 0;
        console.log('[getMyCoins] Fresh DB values:', { allocated, used });
      }
    } catch (dbErr) {
      console.warn('[getMyCoins] DB fetch failed, using req.user fallback:', dbErr.message);
    }

    const available = Math.max(0, allocated - used);

    console.log('[getMyCoins]', req.user.username, '→ allocated=' + allocated + ' used=' + used + ' available=' + available);

    res.json({
      success: true,
      coins: {
        allocated,
        used,
        available,
      },
    });
  } catch (err) {
    console.error('[getMyCoins] Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── CONTROLLERS ───────────────────────────────────────────────────────────────
const getInventoryDevices = async (req, res) => {
  try {
    const { role, _id } = req.user;
    if (!['super_admin', 'admin', 'dealer'].includes(role))
      return res.json({ success: true, devices: [] });

    const col = rawCol();
    const self = await col.findOne({ _id: new mongoose.Types.ObjectId(_id.toString()) });
    if (!self) return res.json({ success: true, devices: [] });

    const all = (self.devices || []).map(normDev);
    const unassigned = all.filter(d => !d.assignedTo);
    res.json({ success: true, devices: unassigned, total: all.length, unassigned: unassigned.length });
  } catch (err) {
    console.error('getInventoryDevices error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getUsers = async (req, res) => {
  try {
    const { role, user_id } = req.user;
    const { filterRole, filterAdminId, filterDealerId } = req.query;

    let filter = {};

    if (filterRole && role === 'super_admin') {
      if (filterRole === 'dealer' && filterAdminId) {
        filter = { role: 'dealer', adminId: Number(filterAdminId) };
      } else if (filterRole === 'user' && filterAdminId) {
        filter = { role: 'user', adminId: Number(filterAdminId) };
      } else if (filterRole === 'user' && filterDealerId) {
        filter = { role: 'user', dealerId: Number(filterDealerId) };
      } else if (filterRole === 'admin') {
        filter = { role: 'admin' };
      } else {
        filter = { role: filterRole };
      }
    } else if (filterRole && role === 'admin') {
      if (filterRole === 'dealer') filter = { role: 'dealer', adminId: user_id };
      else if (filterRole === 'user') filter = { role: 'user', adminId: user_id };
      else filter = { role: filterRole, adminId: user_id };
    } else {
      if (role === 'super_admin') filter = { role: 'admin' };
      else if (role === 'admin') filter = { role: 'dealer', adminId: user_id };
      else if (role === 'dealer') filter = { role: 'user', dealerId: user_id };
      else return res.json({ success: true, users: [], total: 0 });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 200;
    const skip = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { domain: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-passwordHash -confirmPassword')
      .sort({ user_id: 1 })
      .skip(skip)
      .limit(limit);

    const usersWithCoins = users.map(u => {
      const obj = u.toObject({ virtuals: true });
      if (obj.availableCoins === undefined) {
        obj.availableCoins = Math.max(0, (obj.allocatedCoins || 0) - (obj.usedCoins || 0));
      }
      return obj;
    });

    res.json({ success: true, users: usersWithCoins, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getUsers error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash -confirmPassword');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── CREATE USER ───────────────────────────────────────────────────────────────
const createUser = async (req, res) => {
  try {
    const creator = req.user;
    const {
      username, password, fullName,
      email, phone, company, address,
      allowedFeatures, assignedDevices = [],
      role: requestedRole,
    } = req.body;

    const ROLE_CHAIN = { super_admin: 'admin', admin: 'dealer', dealer: 'user' };

    let targetRole;

    if (creator.role === 'super_admin' && requestedRole && ['admin', 'dealer', 'user'].includes(requestedRole)) {
      targetRole = requestedRole;
    } else if (creator.role === 'admin' && requestedRole === 'user') {
      targetRole = 'user';
    } else {
      targetRole = ROLE_CHAIN[creator.role];
    }

    if (!targetRole) {
      return res.status(403).json({ success: false, message: 'You cannot create users at this role level' });
    }

    if (!username || !password || !fullName) {
      return res.status(400).json({ success: false, message: 'Username, password, and full name are required' });
    }

    const existing = await User.findOne({ username: username.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: `Username "${username}" already exists` });
    }

    const coinsToAssign = req.body.allocatedCoins !== undefined && req.body.allocatedCoins !== ''
      ? Number(req.body.allocatedCoins) || 0
      : 0;

    if (creator.role !== 'super_admin' && coinsToAssign > 0) {
      const coinCheck = await checkParentHasCoins(creator.user_id, coinsToAssign);
      if (!coinCheck.ok) {
        return res.status(400).json({
          success: false,
          message: coinCheck.message,
          coinError: true,
          available: coinCheck.available,
          requested: coinCheck.requested,
        });
      }
    }

    const parentFeatures = creator.allowedFeatures || [];
    const defaultFeatures = ROLE_DEFAULT_FEATURES[targetRole] || [];
    const assignedFeatures = allowedFeatures
      ? allowedFeatures.filter(f => parentFeatures.length === 0 || parentFeatures.includes(f))
      : defaultFeatures.filter(f => parentFeatures.length === 0 || parentFeatures.includes(f));

    const form = extractFormFields(req.body);
    const nextId = await getNextUserId();
    const passwordHash = await bcrypt.hash(password, 10);

    let superAdminId, adminId, dealerId, parentId, createdBy, ownerId, ownerName;

    if (creator.role === 'super_admin') {
      superAdminId = creator.user_id;

      if (targetRole === 'admin') {
        adminId = null; dealerId = null; parentId = creator.user_id; createdBy = creator.user_id; ownerId = creator.user_id;
        ownerName = req.body.ownerName || (creator.fullName || creator.username);
      } else if (targetRole === 'dealer') {
        adminId = req.body.adminId ? Number(req.body.adminId) : null; dealerId = null;
        parentId = req.body.parentId ? Number(req.body.parentId) : adminId;
        createdBy = req.body.createdBy ? Number(req.body.createdBy) : adminId;
        ownerId = req.body.ownerId ? Number(req.body.ownerId) : adminId;
        ownerName = req.body.ownerName || '';
        if (!adminId) return res.status(400).json({ success: false, message: 'adminId is required to create a dealer' });
      } else if (targetRole === 'user') {
        adminId = req.body.adminId ? Number(req.body.adminId) : null;
        dealerId = req.body.dealerId ? Number(req.body.dealerId) : null;
        parentId = req.body.parentId ? Number(req.body.parentId) : dealerId;
        createdBy = req.body.createdBy ? Number(req.body.createdBy) : dealerId;
        ownerId = req.body.ownerId ? Number(req.body.ownerId) : dealerId;
        ownerName = req.body.ownerName || '';
        if (!adminId || !dealerId) return res.status(400).json({ success: false, message: 'adminId and dealerId are required to create a user' });
      }
    } else if (creator.role === 'admin') {
      if (targetRole === 'dealer') {
        superAdminId = creator.superAdminId || null; adminId = creator.user_id; dealerId = null;
        parentId = creator.user_id; createdBy = creator.user_id; ownerId = creator.user_id;
        ownerName = creator.fullName || creator.username;
      } else if (targetRole === 'user') {
        const selectedDealerId = req.body.dealerId ? Number(req.body.dealerId) : null;
        if (!selectedDealerId) return res.status(400).json({ success: false, message: 'Please select a Dealer for this user' });
        superAdminId = creator.superAdminId || null; adminId = creator.user_id; dealerId = selectedDealerId;
        parentId = selectedDealerId; createdBy = selectedDealerId; ownerId = selectedDealerId;
        ownerName = req.body.ownerName || '';
      }
    } else if (creator.role === 'dealer') {
      superAdminId = creator.superAdminId || null; adminId = creator.adminId || null; dealerId = creator.user_id;
      parentId = creator.user_id; createdBy = creator.user_id; ownerId = creator.user_id;
      ownerName = creator.fullName || creator.username;
    }

    const userData = {
      user_id: nextId, username: username.trim(), password, passwordHash,
      fullName, name: fullName, ownerName: ownerName || form.ownerName || fullName,
      email: email || '', phone: phone || '', company: company || '', address: address || '',
      role: targetRole, status: form.status, active: form.active,
      language: form.language, domain: form.domain, timezone: form.timezone,
      clientImage: form.clientImage, maxVehicles: form.maxVehicles, maxVehicleCount: form.maxVehicleCount,
      allowedFeatures: assignedFeatures, devices: assignedDevices, deviceCount: assignedDevices.length,
      subscriptionStartDate: form.subscriptionStartDate, subscriptionDueDate: form.subscriptionDueDate,
      subscriptionExtendDate: form.subscriptionExtendDate, subscriptionExpiryCount: form.subscriptionExpiryCount,
      autoExpiry: form.autoExpiry, overwriteSubscription: form.overwriteSubscription,
      vehicleInactiveAfterExpiry: form.vehicleInactiveAfterExpiry, accessRoles: form.accessRoles,
      superAdminId, adminId, dealerId, createdBy, parentId, ownerId,
      isSuspended: false, suspensionDate: null, suspendedBy: null, suspendedReason: '',
      parentForcedInactive: false,
      allocatedCoins: coinsToAssign,
      usedCoins: 0,
    };

    const newUser = await User.create(userData);

    if (creator.role !== 'super_admin' && coinsToAssign > 0) {
      console.log(`[COIN] Deducting ${coinsToAssign} coins from ${creator.role} ${creator.user_id} (${creator.username})`);
      await deductCoinsFromParent(creator.user_id, coinsToAssign);
    } else if (creator.role === 'super_admin') {
      console.log(`[COIN] SuperAdmin created ${targetRole} with ${coinsToAssign} coins — NO deduction (unlimited pool)`);
    }

    if (targetRole === 'dealer') {
      await createTenantForDealer(newUser, req.body);
    }

    if (assignedDevices.length > 0) {
      const col = rawCol();
      const parent = await col.findOne({ _id: new mongoose.Types.ObjectId(creator._id.toString()) });
      if (parent) {
        const updatedDevices = assignDevicesInParent(parent.devices, assignedDevices, newUser.user_id);
        const unassignedCount = updatedDevices.filter(d => !d.assignedTo).length;
        await col.updateOne({ _id: parent._id }, { $set: { devices: updatedDevices, deviceCount: unassignedCount } });
      }
    }

    // ✅ Push coin update via socket
    try {
      const { pushCoinUpdate } = require('../server');
      if (pushCoinUpdate && creator.role !== 'super_admin' && coinsToAssign > 0) {
        const parent = await User.findOne({ user_id: creator.user_id }).select('allocatedCoins usedCoins').lean();
        if (parent) {
          pushCoinUpdate(creator.user_id, parent.allocatedCoins || 0, parent.usedCoins || 0);
        }
      }
    } catch (_) {}

    res.status(201).json({ success: true, user: sanitize(newUser), message: `${targetRole} "${username}" created successfully` });
  } catch (err) {
    console.error('createUser error:', err);
    res.status(500).json({ success: false, message: `Server error: ${err.message}` });
  }
};

// ── UPDATE USER ──────────────────────────────────────────────────────────────
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { fullName, email, phone, company, address, status, allowedFeatures, password, assignedDevices } = req.body;

    if (fullName != null) { user.fullName = fullName; user.name = fullName; }
    if (email != null) user.email = email;
    if (phone != null) user.phone = phone;
    if (company != null) user.company = company;
    if (address != null) user.address = address;
    if (allowedFeatures) user.allowedFeatures = allowedFeatures;

    if (password) {
      user.password = password;
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    const previousStatus = user.status;
    let newStatus = previousStatus;

    if (status != null) {
      user.status = status;
      user.active = status === 'Active';
      newStatus = status;
    }
    if (req.body.active !== undefined && status == null) {
      user.active = Boolean(req.body.active);
      user.status = user.active ? 'Active' : 'Inactive';
      newStatus = user.status;
    }

    if (req.body.isSuspended !== undefined) {
      if (req.body.isSuspended === true) {
        user.status = 'Suspended'; user.active = false; user.isSuspended = true;
        user.suspensionDate = req.body.suspensionDate || new Date();
        user.suspendedBy = req.body.suspendedBy || null;
        user.suspendedReason = req.body.suspendedReason || '';
        newStatus = 'Suspended';
      } else {
        user.isSuspended = false; user.suspensionDate = null;
        user.suspendedBy = null; user.suspendedReason = '';
        user.status = req.body.status || 'Active';
        user.active = user.status === 'Active';
        newStatus = user.status;
      }
    }

    if (req.body.suspensionDate !== undefined) user.suspensionDate = req.body.suspensionDate;
    if (req.body.suspendedBy !== undefined) user.suspendedBy = req.body.suspendedBy;
    if (req.body.suspendedReason !== undefined) user.suspendedReason = req.body.suspendedReason;
    if (req.body.language != null) user.language = req.body.language;
    if (req.body.domain != null) user.domain = req.body.domain;
    if (req.body.timezone != null) user.timezone = req.body.timezone;
    if (req.body.clientImage != null) user.clientImage = req.body.clientImage;

    const maxRaw = req.body.maxVehicles ?? req.body.maxVehicleCount;
    if (maxRaw != null && maxRaw !== '') {
      const n = Number(maxRaw) || null;
      user.maxVehicles = n;
      user.maxVehicleCount = n;
    }

    // ── ✅ FIXED COIN UPDATE ──────────────────────────────────────────────────
    if (req.body.allocatedCoins !== undefined && req.body.allocatedCoins !== '') {
      const coinValue = Number(req.body.allocatedCoins) || 0;
      const isEditMode = req.body.isEdit === true;
      const oldAllocated = user.allocatedCoins || 0;

      console.log(`[COIN] User ${user.username} (${user.role}) update: isEdit=${isEditMode}, coinValue=${coinValue}, oldAllocated=${oldAllocated}`);

      // ✅ EDIT MODE: ADD coins to existing
      if (isEditMode && coinValue > 0) {
        const additionalCoins = coinValue;
        const newAllocated = oldAllocated + additionalCoins;

        console.log(`[COIN] EDIT MODE: Adding ${additionalCoins} to ${user.username}. Old: ${oldAllocated}, New: ${newAllocated}`);

        // ✅ Check parent has enough coins
        if (user.createdBy) {
          const parentUser = await User.findOne({ user_id: user.createdBy })
            .select('role allocatedCoins usedCoins username')
            .lean();

          const isParentSuperAdmin = parentUser?.role === 'super_admin';

          if (!isParentSuperAdmin && parentUser) {
            const parentAvailable = Math.max(0, (parentUser.allocatedCoins || 0) - (parentUser.usedCoins || 0));

            if (parentAvailable < additionalCoins) {
              return res.status(400).json({
                success: false,
                message: `⚠️ Insufficient Coin Balance!\n\n"${parentUser.username}" has only ${parentAvailable} coin(s) available.\nYou want to add: ${additionalCoins} coin(s).`,
                coinError: true,
                available: parentAvailable,
                requested: additionalCoins,
              });
            }

            // ✅ Deduct from parent
            await deductCoinsFromParent(user.createdBy, additionalCoins);
            console.log(`[COIN] Deducted ${additionalCoins} coins from parent ${parentUser.username}`);
          }
        }

        // ✅ UPDATE user's allocatedCoins
        user.allocatedCoins = newAllocated;
        console.log(`[COIN] ✅ ${user.username} allocatedCoins updated: ${oldAllocated} → ${newAllocated}`);

      } else if (!isEditMode) {
        // ✅ CREATE/OVERWRITE MODE
        const newAllocated = coinValue;
        const diff = newAllocated - oldAllocated;

        console.log(`[COIN] OVERWRITE MODE: ${oldAllocated} → ${newAllocated}, diff: ${diff}`);

        if (diff !== 0 && user.createdBy) {
          const parentUser = await User.findOne({ user_id: user.createdBy })
            .select('role allocatedCoins usedCoins username')
            .lean();

          const isParentSuperAdmin = parentUser?.role === 'super_admin';

          if (!isParentSuperAdmin && parentUser) {
            if (diff > 0) {
              const parentAvailable = Math.max(0, (parentUser.allocatedCoins || 0) - (parentUser.usedCoins || 0));
              if (parentAvailable < diff) {
                return res.status(400).json({
                  success: false,
                  message: `⚠️ Insufficient Coin Balance!\n\n"${parentUser.username}" has only ${parentAvailable} coin(s) available.\nYou requested: ${diff} coin(s).`,
                  coinError: true,
                  available: parentAvailable,
                  requested: diff,
                });
              }
              await deductCoinsFromParent(user.createdBy, diff);
            } else {
              const absDiff = Math.abs(diff);
              if ((user.usedCoins || 0) > newAllocated) {
                return res.status(400).json({
                  success: false,
                  message: `Cannot reduce coins to ${newAllocated} — user has already used ${user.usedCoins} coin(s) for their children.`,
                  coinError: true,
                });
              }
              await returnCoinsToParent(user.createdBy, absDiff);
            }
          }
        }

        if ((user.usedCoins || 0) > newAllocated) {
          return res.status(400).json({
            success: false,
            message: `Cannot set coins to ${newAllocated} — user has already used ${user.usedCoins} coin(s) for their children.`,
            coinError: true,
          });
        }

        user.allocatedCoins = newAllocated;
        console.log(`[COIN] ✅ ${user.username} allocatedCoins set to ${newAllocated}`);
      }
    }

    const toDate = (v) => (v !== undefined && v !== null && v !== '') ? new Date(v) : null;

    if (req.body.subscriptionStartDate !== undefined) user.subscriptionStartDate = toDate(req.body.subscriptionStartDate);
    if (req.body.subscriptionDueDate !== undefined) user.subscriptionDueDate = toDate(req.body.subscriptionDueDate);
    if (req.body.subscriptionExtendDate !== undefined) user.subscriptionExtendDate = toDate(req.body.subscriptionExtendDate);
    if (req.body.subscriptionExpiryCount !== undefined && req.body.subscriptionExpiryCount !== '')
      user.subscriptionExpiryCount = Number(req.body.subscriptionExpiryCount) || 10;
    if (req.body.autoExpiry !== undefined) user.autoExpiry = req.body.autoExpiry || 'N';
    if (req.body.overwriteSubscription !== undefined) user.overwriteSubscription = Boolean(req.body.overwriteSubscription);
    if (req.body.vehicleInactiveAfterExpiry !== undefined) user.vehicleInactiveAfterExpiry = Boolean(req.body.vehicleInactiveAfterExpiry);
    if (Array.isArray(req.body.accessRoles)) user.accessRoles = req.body.accessRoles;

    if (assignedDevices !== undefined) {
      const prevImeis = (user.devices || []).map(d => typeof d === 'string' ? d : d.imei).filter(Boolean);
      const newImeis = (assignedDevices || []).map(d => typeof d === 'string' ? d : d.imei).filter(Boolean);
      const removed = prevImeis.filter(i => !newImeis.includes(i));
      const added = newImeis.filter(i => !prevImeis.includes(i));
      if (removed.length > 0 || added.length > 0) {
        const col = rawCol();
        const parent = await col.findOne({ user_id: user.createdBy });
        if (parent) {
          let upd = (parent.devices || []).map(normDev);
          upd = upd.map(d => removed.includes(d.imei) ? { imei: d.imei, assignedTo: null } : d);
          upd = assignDevicesInParent(upd, added, user.user_id);
          await col.updateOne({ _id: parent._id }, { $set: { devices: upd, deviceCount: upd.filter(d => !d.assignedTo).length } });
        }
      }
      user.devices = newImeis;
      user.deviceCount = newImeis.length;
    }

    await user.save();

    if (user.role === 'dealer') {
      await syncTenantForDealer(user.user_id, req.body);
    }

    const statusChanged = previousStatus !== newStatus;
    if (statusChanged && ['admin', 'dealer', 'super_admin'].includes(user.role)) {
      const isNowActive = newStatus === 'Active';
      try {
        await cascadeStatusToDescendants(user.user_id, user.role, isNowActive);
      } catch (cascadeErr) {
        console.error('Cascade error (non-fatal):', cascadeErr);
      }
    }

    // ✅ After successful update, push coin update via socket
    try {
      const { pushCoinUpdate } = require('../server');
      if (pushCoinUpdate) {
        const updatedUser = await User.findOne({ user_id: user.user_id }).select('allocatedCoins usedCoins').lean();
        if (updatedUser) {
          pushCoinUpdate(user.user_id, updatedUser.allocatedCoins || 0, updatedUser.usedCoins || 0);
        }
      }
    } catch (_) {}

    res.json({ success: true, user: sanitize(user), message: 'User updated successfully' });
  } catch (err) {
    console.error('updateUser error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE USER ───────────────────────────────────────────────────────────────
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const userImeis = (user.devices || []).map(d => typeof d === 'string' ? d : d.imei).filter(Boolean);
    if (userImeis.length > 0) {
      const col = rawCol();
      const parent = await col.findOne({ user_id: user.createdBy });
      if (parent) {
        const upd = freeDevicesInParent(parent.devices, userImeis);
        await col.updateOne({ _id: parent._id }, { $set: { devices: upd, deviceCount: upd.filter(d => !d.assignedTo).length } });
      }
    }

    if (user.allocatedCoins > 0 && user.createdBy) {
      const parentUser = await User.findOne({ user_id: user.createdBy }).select('role').lean();
      const isParentSuperAdmin = parentUser?.role === 'super_admin';
      if (!isParentSuperAdmin) {
        console.log(`[COIN] Returning ${user.allocatedCoins} coins to parent ${user.createdBy} on delete`);
        await returnCoinsToParent(user.createdBy, user.allocatedCoins);
      } else {
        console.log(`[COIN] Parent is SuperAdmin — NO return needed (unlimited pool)`);
      }
    }

    if (user.role === 'dealer') {
      try {
        await Tenant.findOneAndUpdate({ ownerId: user.user_id }, { active: false });
      } catch (tErr) {
        console.error('Tenant deactivate error (non-fatal):', tErr.message);
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: `"${user.username}" deleted — ${userImeis.length} device(s) returned` });
  } catch (err) {
    console.error('deleteUser error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const { role, user_id } = req.user;
    let stats = {};

    if (role === 'super_admin') {
      const col = rawCol();
      const self = await col.findOne({ role: 'super_admin' });
      const all = (self?.devices || []).map(normDev);
      const [totalAdmins, totalDealers, totalUsers, activeUsers] = await Promise.all([
        User.countDocuments({ role: 'admin' }),
        User.countDocuments({ role: 'dealer' }),
        User.countDocuments({ role: 'user' }),
        User.countDocuments({ status: 'Active' }),
      ]);
      const assignedCount = all.filter(d => d.assignedTo).length;
      stats = {
        totalAdmins, totalDealers, totalUsers, activeUsers,
        totalDevices: all.length, assignedDevices: assignedCount,
        freeDevices: all.length - assignedCount,
      };
    } else if (role === 'admin') {
      const [totalDealers, totalUsers] = await Promise.all([
        User.countDocuments({ role: 'dealer', adminId: user_id }),
        User.countDocuments({ role: 'user', adminId: user_id }),
      ]);
      stats = { totalDealers, totalUsers, totalVehicles: req.user.deviceCount || 0 };
    } else if (role === 'dealer') {
      const totalUsers = await User.countDocuments({ role: 'user', dealerId: user_id });
      stats = { totalUsers, totalVehicles: req.user.deviceCount || 0 };
    } else {
      stats = { totalVehicles: req.user.deviceCount || 0 };
    }

    res.json({ success: true, stats });
  } catch (err) {
    console.error('getDashboardStats error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── Cascade helpers ───────────────────────────────────────────────────────────
const getAllDescendantIds = async (userId, role) => {
  const descendants = [];

  const collect = async (ids, currentRole) => {
    if (!ids.length) return;

    if (currentRole === 'super_admin' || currentRole === 'admin') {
      const children = await User.find({ parentId: { $in: ids } }).select('user_id role').lean();
      const childIds = children.map(c => c.user_id);
      descendants.push(...childIds);
      const adminIds  = children.filter(c => c.role === 'admin').map(c => c.user_id);
      const dealerIds = children.filter(c => c.role === 'dealer').map(c => c.user_id);
      const userIds   = children.filter(c => c.role === 'user').map(c => c.user_id);
      await collect(adminIds, 'admin');
      await collect(dealerIds, 'dealer');
      descendants.push(...userIds);
      return;
    }

    if (currentRole === 'dealer') {
      const children = await User.find({ dealerId: { $in: ids }, role: 'user' }).select('user_id role').lean();
      const childIds = children.map(c => c.user_id);
      descendants.push(...childIds);
    }
  };

  await collect([userId], role);
  return [...new Set(descendants)];
};

const cascadeStatusToDescendants = async (parentUserId, parentRole, isActive) => {
  const descendantIds = await getAllDescendantIds(parentUserId, parentRole);
  if (!descendantIds.length) return;

  if (!isActive) {
    await User.updateMany(
      { user_id: { $in: descendantIds } },
      [
        {
          $set: {
            parentForcedInactive: true,
            status: { $cond: [{ $eq: ['$status', 'Active'] }, 'Inactive', '$status'] },
            active: { $cond: [{ $eq: ['$status', 'Active'] }, false, '$active'] },
          }
        }
      ]
    );
  } else {
    await User.updateMany(
      { user_id: { $in: descendantIds }, parentForcedInactive: true },
      { $set: { status: 'Active', active: true, parentForcedInactive: false } }
    );
  }
};

module.exports = {
  getUsers, getUserById, createUser, updateUser, deleteUser,
  getDashboardStats, getInventoryDevices, getMyCoins,
};