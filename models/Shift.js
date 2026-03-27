const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  scheduledEndTime: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  totalSales: {
    type: Number,
    default: 0
  },
  totalCash: {
    type: Number,
    default: 0
  },
  totalUpi: {
    type: Number,
    default: 0
  },
  fuelSold: {
    petrol: { type: Number, default: 0 },
    diesel: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('Shift', shiftSchema);
