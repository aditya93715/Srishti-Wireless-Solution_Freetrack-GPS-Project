// backend/routes/deviceRoutes.js
//
// ⚠️  ROUTE ORDER IS CRITICAL — named routes MUST come before /:id wildcards.
//     "clients" etc. would match as ObjectId if /:id is first.

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/deviceController');

// ── 1. Static named routes (MUST be before /:id) ──────────────────────────────
router.get('/protocol-master',    ctrl.getProtocolMaster);
router.get('/clients',            ctrl.getClientOptions);
router.get('/users-under-dealer', ctrl.getUsersUnderDealer);
router.post('/import-excel',      ctrl.importDevicesFromExcel);
router.post('/assign-multiple',   ctrl.assignMultipleDevices);
router.post('/assign-to-user',    ctrl.assignDeviceToUser);

// ── 2. Collection routes ───────────────────────────────────────────────────────
router.get('/',  ctrl.getDevices);
router.post('/', ctrl.createDevice);

// ── 3. Sub-resource BEFORE wildcard ───────────────────────────────────────────
router.put('/:id/sensors', ctrl.updateDeviceSensors);

// ── 4. Wildcard /:id routes LAST ──────────────────────────────────────────────
router.get('/:id',    ctrl.getDeviceById);
router.put('/:id',    ctrl.updateDevice);
router.delete('/:id', ctrl.deleteDevice);

module.exports = router;