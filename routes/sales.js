const express = require('express');
const SalesEntry = require('../models/SalesEntry');
const FuelStock = require('../models/FuelStock');
const Shift = require('../models/Shift');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Create sales entry
router.post('/', auth, async (req, res) => {
  try {
    const { 
      fuelType, 
      pumpNumber, 
      openingMeter, 
      closingMeter, 
      cashAmount, 
      upiAmount 
    } = req.body;

    // Validate meters
    if (closingMeter <= openingMeter) {
      return res.status(400).json({ 
        message: 'Closing meter must be greater than opening meter' 
      });
    }

    // Get user's active shift
    const user = await User.findById(req.user._id);
    if (!user.currentShift) {
      return res.status(400).json({ message: 'No active shift. Please login first.' });
    }

    // Get fuel stock and price
    const fuelStock = await FuelStock.findOne({ fuelType });
    if (!fuelStock) {
      return res.status(400).json({ message: 'Fuel type not configured' });
    }

    const litersSold = closingMeter - openingMeter;
    const totalAmount = litersSold * fuelStock.pricePerLiter;

    // Validate payment amounts
    const paymentTotal = cashAmount + upiAmount;
    if (Math.abs(paymentTotal - totalAmount) > 1) { // Allow ₹1 rounding difference
      return res.status(400).json({ 
        message: `Payment total (₹${paymentTotal}) doesn't match sale total (₹${totalAmount.toFixed(2)})` 
      });
    }

    // Check stock availability
    if (fuelStock.currentStock < litersSold) {
      return res.status(400).json({ 
        message: `Insufficient stock. Available: ${fuelStock.currentStock}L` 
      });
    }

    // Create sales entry
    const salesEntry = await SalesEntry.create({
      operator: req.user._id,
      shift: user.currentShift,
      fuelType,
      pumpNumber,
      openingMeter,
      closingMeter,
      litersSold,
      pricePerLiter: fuelStock.pricePerLiter,
      totalAmount,
      cashAmount,
      upiAmount
    });

    // Update fuel stock
    fuelStock.currentStock -= litersSold;
    await fuelStock.save();

    // Update shift totals
    const shift = await Shift.findById(user.currentShift);
    shift.totalSales += totalAmount;
    shift.totalCash += cashAmount;
    shift.totalUpi += upiAmount;
    shift.fuelSold[fuelType] += litersSold;
    await shift.save();

    // Update user stats
    user.totalFuelSold += litersSold;
    user.totalCashCollected += cashAmount;
    user.totalUpiCollected += upiAmount;
    user.totalEntries += 1;
    await user.save();

    // Get IO instance and emit update
    const io = req.app.get('io');
    if (io) {
      // Emit to all connected clients
      io.emit('sales_update', {
        entry: salesEntry,
        operator: {
          id: user._id,
          name: user.name
        },
        fuelStock: {
          fuelType,
          currentStock: fuelStock.currentStock,
          isLow: fuelStock.currentStock <= fuelStock.lowStockThreshold
        }
      });

      // Check for low stock alert
      if (fuelStock.currentStock <= fuelStock.lowStockThreshold) {
        io.emit('low_stock_alert', {
          fuelType,
          currentStock: fuelStock.currentStock,
          threshold: fuelStock.lowStockThreshold
        });
      }
    }

    res.status(201).json({
      message: 'Sales entry recorded successfully',
      entry: salesEntry,
      stockRemaining: fuelStock.currentStock
    });
  } catch (error) {
    console.error('Sales entry error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get sales entries
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, fuelType, operatorId, shiftId } = req.query;
    
    const query = {};

    if (startDate && endDate) {
      query.entryTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (fuelType) query.fuelType = fuelType;
    if (shiftId) query.shift = shiftId;

    // Non-managers can only see their own entries
    if (req.user.role !== 'manager') {
      query.operator = req.user._id;
    } else if (operatorId) {
      query.operator = operatorId;
    }

    const entries = await SalesEntry.find(query)
      .populate('operator', 'name email')
      .sort({ entryTime: -1 })
      .limit(100);

    res.json(entries);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get today's sales summary
router.get('/today', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const query = {
      entryTime: { $gte: today, $lt: tomorrow }
    };

    if (req.user.role !== 'manager') {
      query.operator = req.user._id;
    }

    const entries = await SalesEntry.find(query);

    const summary = {
      totalEntries: entries.length,
      totalLiters: entries.reduce((sum, e) => sum + e.litersSold, 0),
      totalAmount: entries.reduce((sum, e) => sum + e.totalAmount, 0),
      totalCash: entries.reduce((sum, e) => sum + e.cashAmount, 0),
      totalUpi: entries.reduce((sum, e) => sum + e.upiAmount, 0),
      petrolSold: entries.filter(e => e.fuelType === 'petrol')
        .reduce((sum, e) => sum + e.litersSold, 0),
      dieselSold: entries.filter(e => e.fuelType === 'diesel')
        .reduce((sum, e) => sum + e.litersSold, 0)
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
