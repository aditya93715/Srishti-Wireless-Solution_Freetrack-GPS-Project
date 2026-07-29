const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');

// ── Helpers ──────────────────────────────────────────────────────────────
const buildBaseUrl = (req) => {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
};

const sanitizeUsername = (raw) => {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || 'unknown';
};

// ── Storage Configuration ──────────────────────────────────────────────
//
// IMPORTANT — folder naam kis se aata hai:
//   1) req.body.username  -> TARGET user ka username (jis admin/dealer/user
//      ke liye yeh logo hai). Frontend ko yeh field FILE se PEHLE FormData
//      mein append karna hoga, taaki multer ke parse hone tak yeh available ho.
//      Use case: Super Admin naya Admin "vinod" bana raha hai aur uska logo
//      upload kar raha hai -> folder "vinod" banega, "superadmin" nahi.
//   2) Agar req.body.username nahi mila (field missing/order galat) ->
//      fallback: req.user.username (jo upload kar raha hai, login token se).
//
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const targetUsername = req.body?.username || req.user?.username;
      const username = sanitizeUsername(targetUsername);
      const uploadPath = path.join(__dirname, '../dist/Company_Logo', username);
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    } catch (err) {
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|svg|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (mimetype && extname) return cb(null, true);
  cb(new Error('Only image files are allowed!'));
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
});

// ── POST /api/upload/logo ──────────────────────────────────────────────
// FormData order matters: append 'username' BEFORE 'logo' (file).
router.post('/logo', protect, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const targetUsername = req.body?.username || req.user?.username;
    const username = sanitizeUsername(targetUsername);
    const baseUrl = buildBaseUrl(req);

    // ✅ Production: http://chaukas.in:4492/Company_Logo/<username>/<filename>
    // ✅ Local:      http://localhost:5000/Company_Logo/<username>/<filename>
    const fileUrl = `${baseUrl}/Company_Logo/${username}/${req.file.filename}`;

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      fileUrl,
      filename: req.file.filename,
      username,
      path: req.file.path,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/upload/logo/:username/:filename ──────────────────────────
router.delete('/logo/:username/:filename', protect, async (req, res) => {
  try {
    const username = sanitizeUsername(req.params.username);
    const filename = req.params.filename;

    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }

    const filePath = path.join(__dirname, '../dist/Company_Logo', username, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;