const mongoose = require('mongoose');

const protocolSchema = new mongoose.Schema(
  {
    protocol_type: { type: [String], default: [] },
    service_port:  { type: [String], default: [] },
    sim_operator:  { type: [String], default: [] },
  },
  {
    collection: 'Protocol_Master',
    versionKey: false,
  }
);

const Protocol = mongoose.model('Protocol', protocolSchema);
module.exports = Protocol;