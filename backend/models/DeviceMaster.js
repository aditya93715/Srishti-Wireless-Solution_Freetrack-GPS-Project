'use strict';

const mongoose = require('mongoose');

const deviceMasterSchema = new mongoose.Schema({
  // ── actual field name in DB is IMEI_No (capital) ──
  IMEI_No: {
    type:     String,
    unique:   true,
    required: true,
  },
  sim_card:             String,
  secondarySimCard:     String,
  simOperator:          String,
  secondarySimOperator: String,
  device_name:          String,
  servicePort:          String,

  // ── plain strings (not ObjectId refs) ──
  client:      { type: String },
  transporter: String,
  group:       String,
  branch:      { type: String },

  // ── vehicle info ──
  vehicle_no:   { type: String },

  // ✅ vehicle_type: 10 supported types — used to render correct icon/image
  vehicle_type: {
    type:    String,
    enum:    ['car', 'truck', 'bus', 'bike', 'tractor', 'auto', 'van', 'pickup', 'tanker', 'JCB'],
    default: 'car',
  },

  vehicleBrand: String,

  // ── driver info ──
  driver_name: String,

  // ── refs ──
  vehicle_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleMaster' },
  driver_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'DriverDetailMaster' },

  // ── flags ──
  locked:   { type: Boolean, default: false },
  active:   { type: Boolean, default: true },
  assigned: { type: Boolean, default: false },
  status:   { type: String, enum: ['active', 'inactive'], default: 'active' },

  adminId:  { type: Number },
  dealerId: { type: Number },
  user_id:  { type: Number },

  ignitionWirePlus:         Boolean,
  ignitionWireNotConnected: Boolean,
  acWirePlus:               Boolean,
  attendance:               Boolean,
  timezoneSetting:          Boolean,

  sensors:      { type: Array, default: [] },
  importedFrom: String,
  importedAt:   Date,

  assignedToUserId: { type: Number },
  assignedToName:   String,
  assignedToRole:   String,
  assignedAt:       Date,

  createdBy:     Number,
  createdByRole: String,
  createdByName: String,

}, {
  timestamps: true,
});

// ── Indexes ────────────────────────────────────────────────────────────────
deviceMasterSchema.index({ client:          1 });
deviceMasterSchema.index({ branch:          1 });
deviceMasterSchema.index({ vehicle_no:      1 });
deviceMasterSchema.index({ active:          1 });
deviceMasterSchema.index({ status:          1 });
deviceMasterSchema.index({ adminId:         1 });
deviceMasterSchema.index({ dealerId:        1 });
deviceMasterSchema.index({ user_id:         1 });
deviceMasterSchema.index({ assignedToUserId:1 });
deviceMasterSchema.index({ vehicle_type:    1 });  // ✅ index for vehicle type queries

// Compound indexes
deviceMasterSchema.index({ active: 1, client: 1, branch: 1 });
deviceMasterSchema.index({ adminId: 1, dealerId: 1 });
deviceMasterSchema.index({ assigned: 1, assignedToUserId: 1 });
deviceMasterSchema.index({ createdBy: 1, createdByRole: 1 });
deviceMasterSchema.index({ active: 1, vehicle_type: 1 });  // ✅ filter by type

// Timestamp indexes
deviceMasterSchema.index({ createdAt: -1 });
deviceMasterSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('DeviceMaster', deviceMasterSchema, 'Device_Master');