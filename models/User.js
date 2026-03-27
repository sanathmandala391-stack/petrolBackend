const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['manager', 'operator'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  currentShift: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    default: null
  },
  totalFuelSold: {
    type: Number,
    default: 0
  },
  totalCashCollected: {
    type: Number,
    default: 0
  },
  totalUpiCollected: {
    type: Number,
    default: 0
  },
  totalEntries: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
