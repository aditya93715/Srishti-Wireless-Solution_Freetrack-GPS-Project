'use strict';

const mongoose = require('mongoose');

const deviceInfoSchema = new mongoose.Schema({
  // ── raw packet fields (actual DB fields) ──
  imei:               { type: String },
  vts_unit_id:        String,
  raw:                String,
  protocol:           String,
  Protocol_type:      String,
  header:             String,
  source:             String,
  server_received_at: { type: Date, default: Date.now },
  parsed:             Boolean,
  msg_id:             Number,
  txn:                String,
  cmd_key:            String,
  cmd_val:            String,

  // ── GPS fields ──
  gps_fix:          String,   // "0" = No Fix, "1" = Fix
  gps_datetime_utc: Date,     // ← last heartbeat
  lat:              Number,   // ← latitude
  lon:              Number,   // ← longitude
  speed_kmph:       Number,   // ← speed
  heading_deg:      Number,
  satellites:       Number,   // ← satellite count (e.g. 5)
  altitude_m:       Number,

  // ── Device status ──
  ignition:        { type: Number, default: 0 },  // 0 or 1
  power_cut:       Number,
  status_flags:    Number,
  main_input_v:    Number,   // ← external voltage (e.g. 11.26V)
  odo_m:           Number,   // ← odometer (metres)
  gsm_strength:    Number,   // ← GSM signal (0–31)
  gsm_creg:        Number,
  err_code:        String,
  server_state:    Number,
  internal_batt_v: Number,
  analog_v:        Number,
  gpi:             String,

  // ── Aux channels ──
  aux1: String,
  aux2: String,
  aux3: String,
  aux4: String,

  // ── Hardware info ──
  hw:      String,
  sw:      String,
  offline: Number,
  fields:  [String],

  // ── old schema fields (backwards compat) ──
  device_id:     { type: mongoose.Schema.Types.Mixed, ref: 'DeviceMaster' },
  latitude:      Number,
  longitude:     Number,
  speed:         Number,
  odometer:      Number,
  address:       String,
  full_address:  String,
  short_address: String,
  poi:           String,
  last_heartbeat: Date,
  overspeed:        { type: Boolean, default: false },
  emergency_status: { type: Boolean, default: false },
  ac_status:        { type: Boolean, default: false },
  battery_level:    Number,
  gsm_signal:       Number,
  gps_status:       { type: Boolean, default: false },
  parking_duration: Number,
  soc:              { type: Number, default: 0 },
  external_voltage: Number,
  is_detailed:      { type: Boolean, default: false },

  // ── vehicle_type snapshot (denormalized for fast queries) ──
  // Populated from DeviceMaster.vehicle_type when packet is stored
  vehicle_type: {
    type: String,
    enum: ['car', 'truck', 'bus', 'bike', 'tractor', 'auto', 'van', 'pickup', 'tanker', 'JCB'],
    default: 'car',
  },

}, {
  timestamps: true,
  strict: false,  // strict:false = extra fields allowed
});

// ── Indexes (no duplicates - all indexes defined only here) ──────────────────
deviceInfoSchema.index({ device_id: 1, server_received_at: -1 });
deviceInfoSchema.index({ imei: 1, server_received_at: -1 });
deviceInfoSchema.index({ lat: 1, lon: 1 });
deviceInfoSchema.index({ server_received_at: -1 });
deviceInfoSchema.index({ gps_datetime_utc: -1 });
deviceInfoSchema.index({ last_heartbeat: -1 });
deviceInfoSchema.index({ overspeed: 1, emergency_status: 1 });
// ── vehicle_type index for type-based filtering ──
deviceInfoSchema.index({ vehicle_type: 1 });

module.exports = mongoose.model('DeviceInfo', deviceInfoSchema, 'Device_Info');