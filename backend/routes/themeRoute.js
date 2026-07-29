const express = require('express');
const router  = express.Router();

// ── Per-user in-memory store ───────────────────────────────────────────────────
// Key format: "role_userId"  e.g. "admin_507f1f77bcf86cd799439011"
// This means:
//   - Admin A and Admin B each have their own key → zero overlap
//   - SuperAdmin, Dealer, EndUser are all fully isolated per individual
// Replace this Map with a DB model (Theme.findOne({ userId })) when ready
const themeStore = new Map();

const DEFAULT_THEME = {
  color_id:       'c00',
  color_hex:      '#1A56DB',
  color_gradient: '#1A56DB',
  domain:         '',
  view_chart:     true,
};

// ── Build the store key ───────────────────────────────────────────────────────
// Mirrors the frontend getStorageKey(role, userId) formula exactly
function buildKey(role, userId) {
  const r = role   || 'default';
  const u = userId || 'guest';
  return `${r}_${u}`;
}

// ── GET /api/theme?role=admin&userId=507f1f77bcf86cd799439011 ─────────────────
router.get('/', (req, res) => {
  try {
    const { role, userId } = req.query;

    if (!userId || userId === 'guest') {
      // No userId — return default, don't create a store entry
      return res.json({ success: true, data: { ...DEFAULT_THEME } });
    }

    const key  = buildKey(role, userId);
    const data = themeStore.get(key) || { ...DEFAULT_THEME };

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/theme/save ──────────────────────────────────────────────────────
// Body: { role, userId, color_id, color_hex, color_gradient, domain, view_chart }
router.post('/save', (req, res) => {
  try {
    const {
      role,
      userId,
      color_id,
      color_hex,
      color_gradient,
      domain,
      view_chart,
    } = req.body;

    if (!userId || userId === 'guest') {
      return res.status(400).json({
        success: false,
        message: 'userId is required to save theme',
      });
    }

    const key     = buildKey(role, userId);
    const current = themeStore.get(key) || { ...DEFAULT_THEME };

    // Merge — only update fields that were actually sent
    const updated = {
      ...current,
      ...(color_id       !== undefined && { color_id }),
      ...(color_hex      !== undefined && { color_hex }),
      ...(color_gradient !== undefined && { color_gradient }),
      ...(domain         !== undefined && { domain }),
      ...(view_chart     !== undefined && { view_chart }),
    };

    themeStore.set(key, updated);

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;