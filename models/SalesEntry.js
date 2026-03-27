const mongoose = require('mongoose');

const salesEntrySchema = new mongoose.Schema({
  operator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shift: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    required: true
  },
  fuelType: {
    type: String,
    enum: ['petrol', 'diesel'],
    required: true
  },
  pumpNumber: {
    type: Number,
    required: true
  },
  openingMeter: {
    type: Number,
    required: true
  },
  closingMeter: {
    type: Number,
    required: true
  },
  litersSold: {
    type: Number,
    required: true
  },
  pricePerLiter: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  cashAmount: {
    type: Number,
    required: true,
    default: 0
  },
  upiAmount: {
    type: Number,
    required: true,
    default: 0
  },
  entryTime: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('SalesEntry', salesEntrySchema);
