const mongoose = require('mongoose');

const fuelStockSchema = new mongoose.Schema({
  fuelType: {
    type: String,
    enum: ['petrol', 'diesel'],
    required: true,
    unique: true
  },
  currentStock: {
    type: Number,
    required: true,
    default: 0
  },
  capacity: {
    type: Number,
    required: true
  },
  lowStockThreshold: {
    type: Number,
    required: true
  },
  pricePerLiter: {
    type: Number,
    required: true
  },
  lastRefillDate: {
    type: Date
  },
  lastRefillAmount: {
    type: Number
  }
}, { timestamps: true });

module.exports = mongoose.model('FuelStock', fuelStockSchema);
