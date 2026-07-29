// backend/routes/vehicleRoutes.js
//
// ⚠️  ROUTE ORDER IS CRITICAL:
//     Static routes MUST be before /:id wildcard — Express matches top-to-bottom.
//
// Mount in app.js:
//   app.use('/api/vehicles', require('./routes/vehicleRoutes'));

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/vehicleController');
const { protect, authorize } = require('../middleware/auth');

// Every vehicle route requires a valid JWT
router.use(protect);

// ── 1. HIERARCHY SELECTORS (BEFORE /:id) ──────────────────────────────────────

// GET /api/vehicles/hierarchy/admins
// → User_Master where role='admin'
router.get('/hierarchy/admins',
  authorize('super_admin'),
  ctrl.getAdmins
);

// GET /api/vehicles/hierarchy/dealers?adminId=X
// → User_Master where role='dealer' AND adminId=X
router.get('/hierarchy/dealers',
  authorize('super_admin', 'admin'),
  ctrl.getDealers
);

// GET /api/vehicles/hierarchy/users?dealerId=X
// → User_Master where role='user' AND dealerId=X
router.get('/hierarchy/users',
  authorize('super_admin', 'admin', 'dealer'),
  ctrl.getHierarchyUsers
);

// GET /api/vehicles/hierarchy/devices-by-dealer/:dealerId
// → User_Master dealer.devices[] → Device_Master by IMEI_No
// Reads dealer's devices[] array, extracts IMEI_No values,
// queries Device_Master, returns tagged (free/assigned)
router.get('/hierarchy/devices-by-dealer/:dealerId',
  authorize('super_admin', 'admin', 'dealer'),
  ctrl.getDevicesByDealer
);

// ── 2. UTILITY ROUTES (BEFORE /:id) ───────────────────────────────────────────

// GET /api/vehicles/check-no/:vehicleNo
router.get('/check-no/:vehicleNo', ctrl.checkVehicleNo);

// ── 3. COLLECTION ROUTES ──────────────────────────────────────────────────────

// GET  /api/vehicles  — list vehicles role-scoped
router.get('/', ctrl.getVehicles);

// POST /api/vehicles  — create vehicle (stamps vehicleInfo into Device_Master by IMEI_No)
router.post('/',
  authorize('super_admin', 'admin', 'dealer'),
  ctrl.createVehicle
);

// ── 4. WILDCARD /:id ROUTES LAST ──────────────────────────────────────────────

router.get('/:id',    ctrl.getVehicleById);
router.put('/:id',    authorize('super_admin', 'admin', 'dealer', 'user'), ctrl.updateVehicle);
router.delete('/:id', authorize('super_admin', 'admin', 'dealer'), ctrl.deleteVehicle);

module.exports = router;