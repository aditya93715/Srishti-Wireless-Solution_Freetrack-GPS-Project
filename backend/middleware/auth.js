const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ── Shared select fields ──────────────────────────────────────────────────────
const USER_SELECT_FIELDS =
  'user_id username fullName name role status active ' +
  'superAdminId adminId dealerId ' +
  'devices deviceCount allowedFeatures profile_image ' +
  'allocatedCoins usedCoins';

// ── protect ───────────────────────────────────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized — no token' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Not authorized — invalid token' });
    }

    const user = await User
      .findById(decoded.id)
      .select(USER_SELECT_FIELDS)
      .lean();

    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authorized — user not found' });
    }

    if (!user.active || user.status === 'Inactive') {
      return res.status(401).json({ success: false, message: 'Account is inactive' });
    }

    const allocatedCoins = user.allocatedCoins || 0;
    const usedCoins      = user.usedCoins      || 0;
    const availableCoins = Math.max(0, allocatedCoins - usedCoins);

    req.user = {
      _id:             user._id,
      user_id:         user.user_id,
      username:        user.username,
      fullName:        user.fullName || user.name || user.username,
      role:            user.role,
      status:          user.status,
      active:          user.active,
      superAdminId:    user.superAdminId    ?? null,
      adminId:         user.adminId         ?? null,
      dealerId:        user.dealerId        ?? null,
      devices:         user.devices         || [],
      deviceCount:     user.deviceCount     || 0,
      allowedFeatures: user.allowedFeatures || [],
      profile_image:   user.profile_image   || '',
      allocatedCoins,
      usedCoins,
      availableCoins,
    };

    console.log(
      `[protect] ✓ ${req.user.role}(${req.user.username}) ` +
      `uid=${req.user.user_id} ` +
      `SA=${req.user.superAdminId} A=${req.user.adminId} D=${req.user.dealerId} ` +
      `Coins=${availableCoins}/${allocatedCoins} ` +
      `→ ${req.method} ${req.originalUrl}`
    );

    next();
  } catch (err) {
    console.error('[protect] Error:', err.message);
    res.status(401).json({ success: false, message: 'Not authorized' });
  }
};

// ── authorize ─────────────────────────────────────────────────────────────────
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Role "${req.user.role}" is not allowed to access this resource`,
    });
  }
  next();
};

// ── socketAuth ────────────────────────────────────────────────────────────────
const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      console.log(`[Socket Auth] No token from ${socket.id} — rejecting`);
      return next(new Error('Authentication error: No token'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.log(`[Socket Auth] Invalid token from ${socket.id} — rejecting`);
      return next(new Error('Authentication error: Invalid token'));
    }

    const user = await User
      .findById(decoded.id)
      .select(USER_SELECT_FIELDS)
      .lean();

    if (!user) {
      console.log(`[Socket Auth] User not found for ${socket.id} — rejecting`);
      return next(new Error('Authentication error: User not found'));
    }

    if (!user.active || user.status === 'Inactive') {
      console.log(`[Socket Auth] Inactive user ${user.username} — rejecting`);
      return next(new Error('Authentication error: Account inactive'));
    }

    const allocatedCoins = user.allocatedCoins || 0;
    const usedCoins      = user.usedCoins      || 0;
    const availableCoins = Math.max(0, allocatedCoins - usedCoins);

    socket.user = {
      _id:             user._id,
      user_id:         user.user_id,
      username:        user.username,
      fullName:        user.fullName || user.name || user.username,
      role:            user.role,
      status:          user.status,
      active:          user.active,
      superAdminId:    user.superAdminId    ?? null,
      adminId:         user.adminId         ?? null,
      dealerId:        user.dealerId        ?? null,
      devices:         user.devices         || [],
      deviceCount:     user.deviceCount     || 0,
      allowedFeatures: user.allowedFeatures || [],
      profile_image:   user.profile_image   || '',
      allocatedCoins,
      usedCoins,
      availableCoins,
    };

    console.log(
      `[Socket Auth] ✓ ${socket.user.role}(${socket.user.username}) ` +
      `uid=${socket.user.user_id} ` +
      `SA=${socket.user.superAdminId} A=${socket.user.adminId} D=${socket.user.dealerId} ` +
      `Coins=${availableCoins}/${allocatedCoins} ` +
      `→ connected [${socket.id}]`
    );

    next();
  } catch (err) {
    console.error('[Socket Auth] Error:', err.message);
    next(new Error('Authentication error: Server error'));
  }
};

module.exports = { protect, authorize, socketAuth };