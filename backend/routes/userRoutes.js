const express = require('express');
const router  = express.Router();
const {
  getUsers, getUserById, createUser, updateUser,
  deleteUser, getDashboardStats, getInventoryDevices, getMyCoins,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/my-coins', getMyCoins);  // ✅ GET /api/users/my-coins
router.get('/stats',    getDashboardStats);
router.get('/inventory-devices', authorize('super_admin','admin','dealer'), getInventoryDevices);
router.get('/',         authorize('super_admin','admin','dealer'), getUsers);
router.get('/:id',      getUserById);
router.post('/',        authorize('super_admin','admin','dealer'), createUser);
router.put('/:id',      authorize('super_admin','admin','dealer'), updateUser);
router.delete('/:id',   authorize('super_admin','admin','dealer'), deleteUser);

module.exports = router;