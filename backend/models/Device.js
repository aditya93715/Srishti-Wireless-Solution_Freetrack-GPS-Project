const mongoose = require('mongoose');

const SensorSchema = new mongoose.Schema({
  sensor_id:         { type: String,  default: '' },
  name:              { type: String,  default: '' },
  sensorType:        { type: String,  default: '' },
  connectedTo:       { type: String,  default: '' },
  formula:           { type: String,  default: '' },
  value:             { type: String,  default: '' },
  inverse:           { type: Boolean, default: false },
  rs232:             { type: Boolean, default: false },
  showOnDashboard:   { type: Boolean, default: false },
  type:              { type: String,  default: '' },
  unitOfMeasurement: { type: String,  default: '' },
  ifSensor1Text:     { type: String,  default: '' },
  ifSensor0Text:     { type: String,  default: '' },
  calibrationRows:   { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { _id: false });

const LastGpsSchema = new mongoose.Schema({
  lat:       { type: Number, default: null },
  lng:       { type: Number, default: null },
  speed:     { type: Number, default: 0 },
  updatedAt: { type: Date,   default: null },
}, { _id: false });

const DeviceSchema = new mongoose.Schema(
  {
    // ── PRIMARY KEY ────────────────────────────────────────────────────────────
    IMEI_No:   { type: String, required: true, unique: true, trim: true },
    device_id: { type: String, unique: true, sparse: true },  // auto-generated "1", "2", "3"...

    // ── Device hardware ────────────────────────────────────────────────────────
    sim_card:             { type: String, default: '' },  // renamed from simNumber
    simOperator:          { type: String, default: '' },
    secondarySimCard:     { type: String, default: '' },  // renamed from secondarySimNumber
    secondarySimOperator: { type: String, default: '' },
    device_name:          { type: String, default: '' },

    // ── Hierarchy IDs ──────────────────────────────────────────────────────────
    adminId:  { type: Number, default: null },
    dealerId: { type: Number, default: null },
    user_id:  { type: Number, default: null },  // ← null until vehicle assigned

    // ── Creator audit ──────────────────────────────────────────────────────────
    createdBy:     { type: Number, default: null },
    createdByRole: { type: String, default: '' },
    createdByName: { type: String, default: '' },

    // ── Assignment snapshot ────────────────────────────────────────────────────
    assignedToUserId: { type: Number, default: null },
    assignedToName:   { type: String, default: '' },
    assignedToRole:   { type: String, default: '' },
    assignedAt:       { type: Date,   default: null },

    // ── Device status flags ────────────────────────────────────────────────────
    status:                   { type: String,  default: 'active' },
    assigned:                 { type: Boolean, default: true },
    ignitionWirePlus:         { type: Boolean, default: false },
    ignitionWireNotConnected: { type: Boolean, default: false },
    acWirePlus:               { type: Boolean, default: false },
    attendance:               { type: Boolean, default: false },
    timezoneSetting:          { type: Boolean, default: false },
    active:                   { type: Boolean, default: true },

    // ── Sensors (managed by device page) ──────────────────────────────────────
    sensors:      { type: [SensorSchema], default: [] },
    lastGps:      { type: LastGpsSchema,  default: () => ({}) },
    importedFrom: { type: String, default: '' },
    importedAt:   { type: Date,   default: null },

    // ── VEHICLE FIELDS ─────────────────────────────────────────────────────────
    // Written by createVehicle, cleared by deleteVehicle.
    // All flat keys — no nesting, no arrays.
    // vehicle_no being non-empty = this device has an active vehicle assignment.
    //
    vehicle_no:        { type: String, default: '' },   // ← PRIMARY vehicle identifier (renamed from vehicleNo)
    vehicle_type:      { type: String, default: '' },   // renamed from vehicleType
    vehicleBrand:      { type: String, default: '' },
    vehicleModel:      { type: String, default: '' },
    vehicleBody:       { type: String, default: '' },
    nickname:          { type: String, default: '' },
    fuelType:          { type: String, default: '' },
    speed_limit_kph:   { type: Number, default: null }, // renamed from overspeed
    mileage:           { type: Number, default: null },
    capacity:          { type: Number, default: null },
    odometer:          { type: Number, default: null },
    durationOdometer:  { type: Number, default: null },
    ownerName:         { type: String, default: '' },
    ownedBy:           { type: String, default: '' },
    manufactureDate:   { type: Date,   default: null },
    purchaseDate:      { type: Date,   default: null },
    parkingAlarm:      { type: Boolean,default: false },
    subStart:          { type: Date,   default: null },
    subDue:            { type: Date,   default: null },
    vehicleAssignedAt: { type: Date,   default: null }, // when vehicle was linked
  },
  {
    timestamps:  true,
    collection:  'Device_Master',  // physical MongoDB collection name
    strict:      false,             // preserve any extra fields on existing docs
    versionKey:  false,
  }
);

// ── Auto-generate device_id sequentially "1", "2", "3"... ────────────────────
// FIX: Sort by _id (always monotonically increasing ObjectId) instead of
//      device_id (stored as String → lexicographic sort makes "9" > "10",
//      causing duplicate key collisions once device count reaches 10+).
DeviceSchema.pre('save', async function (next) {
  if (this.isNew && !this.device_id) {
    try {
      const last = await this.constructor
        .findOne({ device_id: { $exists: true, $ne: null } })
        .sort({ _id: -1 })          // ← sort by _id (ObjectId, always monotonic)
        .select('device_id')
        .lean();

      const lastNum = last?.device_id ? parseInt(last.device_id, 10) : 0;
      this.device_id = String(isNaN(lastNum) ? 1 : lastNum + 1);
    } catch (err) {
      return next(err);
    }
  }
  next();
});

// ════════════════════════════════════════════════════════════════════════════
// ✅ NEW: Mongoose Middleware - Automatic Cache & VLS Cleanup
// ════════════════════════════════════════════════════════════════════════════

// ── Helper function to clear cache ──────────────────────────────────────────
async function clearDeviceCache(imei) {
  try {
    // Redis cache clear
    if (global.redisClient) {
      await global.redisClient.del(`vehicle:${imei}`);
      await global.redisClient.del(`device:${imei}`);
      await global.redisClient.del('vehicles:dashboard');
      await global.redisClient.del('vehicles:all');
      await global.redisClient.del('dashboard:vehicles');
      console.log(`[Device Cache] Cleared cache for IMEI: ${imei}`);
    }
    
    // In-memory cache clear
    if (global.vehicleCache) {
      delete global.vehicleCache[imei];
    }
  } catch (err) {
    console.error('[Device Cache] Cache clear error:', err.message);
  }
}

// ── Helper function to clear VLS ────────────────────────────────────────────
async function clearVehicleLatestStatus(imei) {
  try {
    const VehicleLatestStatus = mongoose.model('VehicleLatestStatus');
    await VehicleLatestStatus.updateOne(
      { imei },
      {
        $set: {
          vehicle:  '--',
          userId:   null,
          dealerId: null,
          adminId:  null,
          assigned: false,
        },
      }
    );
    console.log(`[Device VLS] Cleared VLS for IMEI: ${imei}`);
  } catch (err) {
    console.error('[Device VLS] VLS clear error:', err.message);
  }
}

// ── ✅ PRE-DELETE Middleware: Jab bhi device delete ho ──────────────────────
DeviceSchema.pre('deleteOne', { document: false, query: true }, async function() {
  const filter = this.getFilter();
  const imei = filter.IMEI_No || filter.imei;
  
  if (imei) {
    console.log(`[Device Pre-delete] Cleaning up for IMEI: ${imei}`);
    
    // 1️⃣ Clear VLS
    await clearVehicleLatestStatus(imei);
    
    // 2️⃣ Clear Cache
    await clearDeviceCache(imei);
    
    console.log(`[Device Pre-delete] ✅ Cleanup complete for IMEI: ${imei}`);
  }
});

// ── ✅ POST-DELETE Middleware ────────────────────────────────────────────────
DeviceSchema.post('deleteOne', { document: false, query: true }, async function() {
  console.log('[Device Post-delete] Device deleted successfully');
});

// ── ✅ PRE-FIND Middleware: Always filter out inactive devices ──────────────
DeviceSchema.pre('find', function() {
  // Optional: Add default filter for active devices
  // if (!this._conditions._id && !this._conditions.IMEI_No) {
  //   this._conditions.active = true;
  // }
});

// ── ✅ PRE-UPDATE Middleware: Track changes ─────────────────────────────────
DeviceSchema.pre('updateOne', { document: false, query: true }, async function() {
  const filter = this.getFilter();
  const update = this.getUpdate();
  
  // Agar vehicle_no clear ho raha hai toh cache clear karo
  if (update?.$set?.vehicle_no === '' || update?.$set?.vehicle_no === null) {
    const imei = filter.IMEI_No || filter.imei;
    if (imei) {
      console.log(`[Device Pre-update] Vehicle cleared for IMEI: ${imei}, clearing cache`);
      await clearDeviceCache(imei);
    }
  }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
DeviceSchema.index({ IMEI_No:   1 }, { unique: true });
DeviceSchema.index({ device_id: 1 }, { unique: true, sparse: true });
DeviceSchema.index({ adminId:   1 });
DeviceSchema.index({ dealerId:  1 });
DeviceSchema.index({ user_id:   1 });
DeviceSchema.index({ createdBy: 1 });
DeviceSchema.index({ assignedToUserId: 1 });
DeviceSchema.index({ status:    1 });

// Unique vehicle_no — sparse so free devices (empty vehicle_no) don't conflict
DeviceSchema.index(
  { vehicle_no: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { vehicle_no: { $type: 'string', $gt: '' } },
    name: 'unique_vehicle_no',
  }
);

// Query indexes for vehicle listing
DeviceSchema.index({ adminId:  1, vehicle_no: 1 });
DeviceSchema.index({ dealerId: 1, vehicle_no: 1 });
DeviceSchema.index({ user_id:  1, vehicle_no: 1 });

// ── ✅ NEW: Compound index for dashboard queries ────────────────────────────
DeviceSchema.index(
  { active: 1, vehicle_no: 1 },
  { 
    partialFilterExpression: { 
      active: true,
      vehicle_no: { $type: 'string', $gt: '' } 
    },
    name: 'dashboard_active_vehicles'
  }
);

// ── ✅ NEW: Index for orphan detection ──────────────────────────────────────
DeviceSchema.index(
  { active: 1, vehicle_no: 1, user_id: 1 },
  { 
    partialFilterExpression: { 
      active: true,
      vehicle_no: { $type: 'string', $gt: '' } 
    }
  }
);

module.exports = mongoose.model('Device', DeviceSchema);