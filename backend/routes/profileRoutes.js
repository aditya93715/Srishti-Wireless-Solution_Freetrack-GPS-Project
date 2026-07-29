const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const User = require('../models/User');

const buildBaseUrl = (req) => {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
};

const sanitizeUsername = (raw) =>
  String(raw || '').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const username = sanitizeUsername(req.body?.targetUsername || req.user?.username);
      const uploadPath = path.join(__dirname, '../dist/Profile', username);
      if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) { cb(err, null); }
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ok = /jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase())
          && /jpeg|jpg|png|gif|webp/.test(file.mimetype);
  ok ? cb(null, true) : cb(new Error('Only image files are allowed!'));
};

const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 }, fileFilter });

router.post('/upload', protect, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const targetUserId   = Number(req.body?.targetUserId) || req.user.user_id;
    const targetUsername = sanitizeUsername(req.body?.targetUsername || req.user?.username);
    const fileUrl = `${buildBaseUrl(req)}/Profile/${targetUsername}/${req.file.filename}`;

    const existing = await User.findOne({ user_id: targetUserId }).select('profile_image').lean();
    if (existing?.profile_image) {
      try {
        const old = path.join(__dirname, '../dist', decodeURIComponent(new URL(existing.profile_image).pathname));
        if (fs.existsSync(old)) fs.unlinkSync(old);
      } catch (_) {}
    }

    await User.findOneAndUpdate({ user_id: targetUserId }, { profile_image: fileUrl });
    res.json({ success: true, message: 'Profile image updated successfully', fileUrl });
  } catch (err) {
    console.error('Profile upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;