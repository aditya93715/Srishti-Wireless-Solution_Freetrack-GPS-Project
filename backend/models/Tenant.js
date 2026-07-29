const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
  {
    ownerId: { type: Number, required: true, unique: true },
    domain: { type: String, default: '', lowercase: true, trim: true },
    companyName: { type: String, required: true },
    logoUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#6b46c1' },
    secondaryColor: { type: String, default: '#9f7aea' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tenant', tenantSchema);