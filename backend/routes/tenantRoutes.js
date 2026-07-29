
const express = require('express');
const router  = express.Router();
const Tenant  = require('../models/Tenant');
const { protect } = require('../middleware/auth');

const DEFAULT_BRANDING = {
  companyName:     'SRISHTI WIRELESS SOLUTION',
  logoUrl:         '',
  profileImageUrl: '',
  faviconUrl:      '',
  primaryColor:    '#6b46c1',
  secondaryColor:  '#9f7aea',
  isGradient:      false,
  gradient:        '',
  tagline:         'Fleet Management',
  supportEmail:    '',
  supportPhone:    '',
  isDefault:       true,
};

// ── GET /api/tenant/branding ───────────────────────────────────────────────
// Public — domain se branding fetch karo (login screen ke liye)
router.get('/branding', async (req, res) => {
  try {
    const tenantHeader = req.headers['x-tenant-domain'] || '';
    const host         = req.headers['x-forwarded-host'] || req.headers.host || '';
    const domain       = (tenantHeader || host).split(':')[0].toLowerCase().trim();

    const tenant = await Tenant.findOne({ domain, active: true }).lean();
    if (!tenant) {
      return res.json({ success: true, branding: { ...DEFAULT_BRANDING, domain } });
    }
    res.json({ success: true, branding: { ...tenant, isDefault: false } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/tenant/my-branding ────────────────────────────────────────────
// Protected — logged-in user apni branding dekhe
// FIXED: dealer apni khud ki branding dekhega (user_id se), admin ki nahi
router.get('/my-branding', protect, async (req, res) => {
  try {
    const u = req.user;
    let ownerId = null;

    if (u.role === 'admin') {
      // Admin apni branding
      ownerId = u.user_id;
    } else if (u.role === 'dealer') {
      // Dealer apni khud ki branding (pehle adminId tha — WRONG tha)
      ownerId = u.user_id;
    } else if (u.role === 'user') {
      // User ke liye uske dealer ki branding
      ownerId = u.dealerId || u.adminId;
    }

    if (!ownerId) {
      return res.json({ success: true, branding: DEFAULT_BRANDING });
    }

    const tenant = await Tenant.findOne({ ownerId, active: true }).lean();
    res.json({
      success: true,
      branding: tenant ? { ...tenant, isDefault: false } : DEFAULT_BRANDING,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/tenant/branding/:ownerId ─────────────────────────────────────
// Upsert — create ya update tenant branding
router.post('/branding/:ownerId', protect, async (req, res) => {
  try {
    const ownerId = Number(req.params.ownerId);
    if (!ownerId) return res.status(400).json({ success: false, message: 'Valid ownerId required' });

    const { domain, ...data } = req.body;
    const tenant = await Tenant.findOneAndUpdate(
      { ownerId },
      {
        ownerId,
        ...(domain !== undefined && { domain: String(domain).toLowerCase().trim() }),
        ...data,
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, tenant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/tenant/all ─────────────────────────────────────────────────────
// Saare tenants (super_admin ke liye)
router.get('/all', protect, async (req, res) => {
  try {
    const tenants = await Tenant.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, tenants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/tenant/by-owner/:ownerId ──────────────────────────────────────
// Ek specific dealer/admin ka tenant fetch karo (edit form ke liye)
router.get('/by-owner/:ownerId', protect, async (req, res) => {
  try {
    const ownerId = Number(req.params.ownerId);
    if (!ownerId) return res.status(400).json({ success: false, message: 'Valid ownerId required' });

    const tenant = await Tenant.findOne({ ownerId }).lean();
    if (!tenant) return res.json({ success: true, tenant: null });
    res.json({ success: true, tenant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/tenant/by-owner/:ownerId ──────────────────────────────────────
// Direct update by ownerId (edit form save ke liye)
router.put('/by-owner/:ownerId', protect, async (req, res) => {
  try {
    const ownerId = Number(req.params.ownerId);
    if (!ownerId) return res.status(400).json({ success: false, message: 'Valid ownerId required' });

    const { domain, companyName, logoUrl, primaryColor, secondaryColor, active } = req.body;

    const updateData = { ownerId };
    if (companyName    !== undefined) updateData.companyName    = companyName;
    if (logoUrl        !== undefined) updateData.logoUrl        = logoUrl;
    if (primaryColor   !== undefined) updateData.primaryColor   = primaryColor;
    if (secondaryColor !== undefined) updateData.secondaryColor = secondaryColor;
    if (active         !== undefined) updateData.active         = active;
    if (domain         !== undefined) updateData.domain         = String(domain).toLowerCase().trim();

    const tenant = await Tenant.findOneAndUpdate(
      { ownerId },
      updateData,
      { upsert: true, new: true }
    );
    res.json({ success: true, tenant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
