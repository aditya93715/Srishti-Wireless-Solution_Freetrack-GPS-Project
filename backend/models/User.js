const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    user_id:      { type: Number, required: true, unique: true },
    username:     { type: String, required: true, unique: true, trim: true },
    password:     { type: String, required: true },
    passwordHash: { type: String, default: '' },

    role: {
      type: String,
      enum: ['super_admin', 'admin', 'dealer', 'user'],
      required: true,
    },

    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Suspended'],
      default: 'Active',
    },

    suspensionDate:  { type: Date,    default: null },
    isSuspended:     { type: Boolean, default: false },
    suspendedBy:     { type: Number,  default: null },
    suspendedReason: { type: String,  default: '' },

    inactiveDate:         { type: Date,    default: null },
    parentForcedInactive: { type: Boolean, default: false },

    fullName: { type: String, default: '' },
    name:     { type: String, default: '' },
    email:    { type: String, default: '' },
    phone:    { type: String, default: '' },
    company:  { type: String, default: '' },
    address:  { type: String, default: '' },

    ownerName:       { type: String,  default: '' },
    ownerId:         { type: Number,  default: null },
    language:        { type: String,  default: 'English' },
    domain:          { type: String,  default: '' },
    maxVehicles:     { type: Number,  default: null },
    maxVehicleCount: { type: Number,  default: null },
    timezone:        { type: String,  default: 'Asia/Calcutta' },
    active:          { type: Boolean, default: true },
    confirmPassword: { type: String,  default: '' },

    // ── COIN / QUOTA SYSTEM ────────────────────────────────────────────────────
    allocatedCoins: { type: Number, default: 0 },
    usedCoins:      { type: Number, default: 0 },

    subscriptionStartDate:      { type: Date,    default: null },
    subscriptionDueDate:        { type: Date,    default: null },
    subscriptionExtendDate:     { type: Date,    default: null },
    subscriptionExpiryCount:    { type: Number,  default: 10 },
    autoExpiry:                 { type: String,  enum: ['Y', 'N'], default: 'N' },
    overwriteSubscription:      { type: Boolean, default: false },
    vehicleInactiveAfterExpiry: { type: Boolean, default: false },

    accessRoles: {
      type: [{
        roleName:  { type: String,  required: true },
        isEnabled: { type: Boolean, default: false },
      }],
      default: [],
    },

    avatarUrl:                { type: String, default: '' },
    avatar:                   { type: String, default: '' },
    profile_image:            { type: String, default: '' },
    profile_image_updated_at: { type: Date },
    profile_image_url:        { type: String, default: '' },
    clientImage:              { type: String, default: '' },

    devices:     { type: [mongoose.Schema.Types.Mixed], default: [] },
    deviceCount: { type: Number, default: 0 },

    allowedFeatures: { type: [String], default: [] },

    superAdminId: { type: Number, default: null },
    createdBy:    { type: Number, default: null },
    parentId:     { type: Number, default: null },
    adminId:      { type: Number, default: null },
    dealerId:     { type: Number, default: null },

    gstin:   { type: String, default: '' },
    website: { type: String, default: '' },
  },
  {
    strict: false,
    timestamps: true,
    collection: 'User_Master',
    versionKey: false,
  }
);

// ── Virtual: availableCoins ──────────────────────────────────────────────────
userSchema.virtual('availableCoins').get(function () {
  return Math.max(0, (this.allocatedCoins || 0) - (this.usedCoins || 0));
});

// ── Pre-save hooks ────────────────────────────────────────────────────────────
userSchema.pre('save', function (next) {
  if (this.fullName && !this.name) this.name = this.fullName;
  if (this.name && !this.fullName) this.fullName = this.name;

  if (this.maxVehicles !== null && this.maxVehicles !== undefined) {
    const n = Number(this.maxVehicles);
    this.maxVehicles = isNaN(n) ? null : n;
    this.maxVehicleCount = this.maxVehicles;
  }
  if (this.maxVehicleCount !== null && this.maxVehicleCount !== undefined) {
    const n = Number(this.maxVehicleCount);
    this.maxVehicleCount = isNaN(n) ? null : n;
    this.maxVehicles = this.maxVehicleCount;
  }

  if (this.subscriptionExpiryCount !== null && this.subscriptionExpiryCount !== undefined) {
    const n = Number(this.subscriptionExpiryCount);
    this.subscriptionExpiryCount = isNaN(n) ? 10 : n;
  }

  if (this.allocatedCoins < 0) this.allocatedCoins = 0;
  if (this.usedCoins < 0)      this.usedCoins = 0;

  if (this.isModified('devices')) {
    this.deviceCount = this.devices.length;
  }

  next();
});

userSchema.pre('save', function (next) {
  if (this.status !== 'Suspended') {
    if (this.isModified('active') && !this.isModified('status')) {
      this.status = this.active ? 'Active' : 'Inactive';
    } else if (this.isModified('status')) {
      this.active = this.status === 'Active';
    }
  }

  if (this.isModified('status')) {
    if (this.status === 'Inactive' && !this.inactiveDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      this.inactiveDate = today;
    }
    if (this.status === 'Active') {
      this.inactiveDate = null;
    }
  }

  if (this.isModified('status')) {
    if (this.status === 'Suspended') {
      this.isSuspended = true;
      if (!this.suspensionDate) this.suspensionDate = new Date();
    } else {
      this.isSuspended = false;
    }
  }

  next();
});

userSchema.methods.toJSON = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.confirmPassword;
  return obj;
};

const User = mongoose.model('User', userSchema);
module.exports = User;