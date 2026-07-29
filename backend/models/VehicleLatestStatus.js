'use strict';
const mongoose = require('mongoose');

// ══════════════════════════════════════════════════════════════════════════════
// VehicleLatestStatus — har IMEI ka sirf EK document
// Jab bhi naya GPS packet aata hai, yeh document update ho jaata hai (upsert)
// Dashboard is collection se direct find() karta hai — koi aggregation nahi
// ══════════════════════════════════════════════════════════════════════════════
const VehicleLatestStatusSchema = new mongoose.Schema(
  {
    // ── Identity keys (role-based filter ke liye) ──────────────────────────
    imei:      { type: String, required: true, unique: true, index: true },
    vehicle:   { type: String, default: '--', index: true },   // vehicle_no
    adminId:   { type: Number, default: null, index: true },
    dealerId:  { type: Number, default: null, index: true },
    userId:    { type: Number, default: null, index: true },   // user_id

    // ── Device master fields (vehicle info) ────────────────────────────────
    vehicleType:  { type: String, default: 'car' },
    branch:       { type: String, default: '--' },
    driverName:   { type: String, default: '--' },
    locked:       { type: Boolean, default: false },
    simCard:      { type: String, default: '--' },   // iccid
    deviceName:   { type: String, default: '--' },
    assigned:     { type: Boolean, default: false },

    // ── GPS fields ─────────────────────────────────────────────────────────
    lat:         { type: Number, default: null },
    lng:         { type: Number, default: null },
    speed:       { type: Number, default: 0 },        // speed_kmph
    heading:     { type: Number, default: 0 },        // heading_deg
    satellites:  { type: Number, default: 0 },
    gpsFix:      { type: String, default: '0' },      // gps_fix
    altitude:    { type: Number, default: null },

    // ── Device status ──────────────────────────────────────────────────────
    ignition:    { type: Number, default: 0 },        // 0 or 1
    gsmStrength: { type: Number, default: 0 },        // gsm_strength (0-31)
    mainInputV:  { type: Number, default: 0 },        // main_input_v (ext voltage)
    internalBattV: { type: Number, default: 0 },      // internal_batt_v
    odoM:        { type: Number, default: 0 },        // odo_m (odometer in metres)
    overspeed:   { type: Boolean, default: false },
    emergency:   { type: Boolean, default: false },   // emergency_status
    acStatus:    { type: Boolean, default: false },   // ac_status
    powerCut:    { type: Number, default: 0 },        // power_cut
    soc:         { type: Number, default: 0 },
    aux1:        { type: String, default: '' },       // aux1 string for battery/temp/hum

    // ── Derived / calculated fields ────────────────────────────────────────
    state:       { type: String, default: 'unreachable' }, // running/stopped/idle/overspeed/unreachable/new/inactive
    address:     { type: String, default: '--' },          // geocoded address (cached)
    poi:         { type: String, default: 'N/A' },

    // ── Timestamps ─────────────────────────────────────────────────────────
    packetTime:  { type: Date, default: null },   // gps_datetime_utc ya server_received_at
    updatedAt:   { type: Date, default: Date.now },
  },
  {
    collection: 'Vehicle_Latest_Status',
    timestamps: false,   // hum manually updatedAt set karte hain
    strict: false,
    versionKey: false,
  }
);

// ── Compound indexes for role-based queries ────────────────────────────────
VehicleLatestStatusSchema.index({ adminId:  1, state: 1 });
VehicleLatestStatusSchema.index({ dealerId: 1, state: 1 });
VehicleLatestStatusSchema.index({ userId:   1, state: 1 });
VehicleLatestStatusSchema.index({ updatedAt: -1 });

module.exports = mongoose.models.VehicleLatestStatus
  || mongoose.model('VehicleLatestStatus', VehicleLatestStatusSchema);