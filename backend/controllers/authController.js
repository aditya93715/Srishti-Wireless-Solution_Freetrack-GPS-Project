const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User   = require('../models/User');
const { ROLE_DASHBOARD_PATHS } = require('../constants/roles');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`\n[LOGIN] Attempt → username: "${username}"`);

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    // ✅ lean() nahi — full Mongoose document lo taaki virtuals kaam karein
    // allocatedCoins aur usedCoins explicitly select karo
    const user = await User.findOne({ username: username.trim() });

    if (!user) {
      console.log(`[LOGIN] FAILED — user "${username}" not found`);
      return res.status(401).json({
        success: false,
        message: `User "${username}" not found`,
      });
    }

    console.log(
      `[LOGIN] Found: ${user.username} | role: ${user.role} | status: ${user.status}`
    );

    // ── Password check ──────────────────────────────────────────────────────
    let isMatch = user.password && user.password === password;
    if (!isMatch && user.passwordHash && user.passwordHash.length > 10) {
      isMatch = await bcrypt.compare(password, user.passwordHash);
    }

    if (!isMatch) {
      console.log(`[LOGIN] FAILED — wrong password for "${username}"`);
      return res.status(401).json({
        success: false,
        message: 'Incorrect password',
      });
    }

    // ── Account status check ──────────────────────────────────────────────
    if (user.status === 'Inactive' || user.active === false) {
      console.log(`[LOGIN] BLOCKED — "${username}" is Inactive`);
      return res.status(403).json({
        success: false,
        code:    'ACCOUNT_INACTIVE',
        message: 'Your account is inactive. Please contact your Administrator to reactivate it.',
      });
    }

    if (user.status === 'Suspended' || user.isSuspended === true) {
      console.log(`[LOGIN] BLOCKED — "${username}" is Suspended`);
      return res.status(403).json({
        success: false,
        code:    'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Please contact your Administrator.',
        reason:  user.suspendedReason || '',
      });
    }

    // ── Issue token ────────────────────────────────────────────────────────
    const token         = generateToken(user._id);
    const dashboardPath = ROLE_DASHBOARD_PATHS[user.role] || '/superadmin/dashboard';

    // ✅ DIRECT DB SE LO — user document se seedha fields nikalo
    // lean() nahi use kiya isliye virtual 'availableCoins' bhi milega
    const allocatedCoins = user.allocatedCoins  || 0;
    const usedCoins      = user.usedCoins       || 0;
    const availableCoins = Math.max(0, allocatedCoins - usedCoins); // virtual backup

    console.log(
      `[LOGIN] SUCCESS → ${user.username} (${user.role}) ` +
      `SA=${user.superAdminId ?? null} A=${user.adminId ?? null} D=${user.dealerId ?? null} ` +
      `Coins: available=${availableCoins} allocated=${allocatedCoins} used=${usedCoins} ` +
      `→ ${dashboardPath}\n`
    );

    // ── Response payload ───────────────────────────────────────────────────
    res.json({
      success: true,
      token,
      dashboardPath,
      user: {
        _id:             user._id,
        user_id:         user.user_id,
        username:        user.username,
        fullName:        user.fullName || user.name || user.username,
        email:           user.email    || '',
        phone:           user.phone    || '',
        role:            user.role,
        status:          user.status   || 'Active',
        allowedFeatures: user.allowedFeatures || [],
        deviceCount:     user.deviceCount || 0,
        devices:         user.devices  || [],
        profile_image:   user.profile_image || '',
        company:         user.company  || '',
        domain:          user.domain   || '',
        superAdminId:    user.superAdminId ?? null,
        adminId:         user.adminId      ?? null,
        dealerId:        user.dealerId     ?? null,
        // ✅ Coin fields — SEEDHA DB DOCUMENT SE
        allocatedCoins,
        usedCoins,
        availableCoins,
      },
    });
  } catch (error) {
    console.error('[LOGIN] Server error:', error.message);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    // ✅ lean() nahi — virtuals chahiye (availableCoins)
    // req.user mein coins already hain protect middleware se
    // But fresh DB se lo taaki stale nahi ho
    const user = await User.findById(req.user._id).select('-password -passwordHash');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // ✅ toObject({ virtuals: true }) — availableCoins virtual include hoga
    const userObj = user.toObject({ virtuals: true });

    // Explicit compute bhi karo as backup
    userObj.allocatedCoins  = userObj.allocatedCoins  || 0;
    userObj.usedCoins       = userObj.usedCoins       || 0;
    userObj.availableCoins  = Math.max(0, userObj.allocatedCoins - userObj.usedCoins);

    console.log(
      `[getMe] ${user.username} (${user.role}) ` +
      `Coins: available=${userObj.availableCoins} allocated=${userObj.allocatedCoins} used=${userObj.usedCoins}`
    );

    res.json({ success: true, user: userObj });
  } catch (error) {
    console.error('[getMe] Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
const logout = (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};

module.exports = { login, getMe, logout };