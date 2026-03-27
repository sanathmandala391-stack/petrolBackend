const express = require('express');
const SalesEntry = require('../models/SalesEntry');
const FuelStock = require('../models/FuelStock');
const User = require('../models/User');
const Shift = require('../models/Shift');
const Attendance = require('../models/Attendance');
const { auth, managerOnly } = require('../middleware/auth');

const router = express.Router();

// Manager dashboard data
router.get('/manager', auth, managerOnly, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Today's sales
    const todaySales = await SalesEntry.aggregate([
      { $match: { entryTime: { $gte: today, $lt: tomorrow } } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          totalCash: { $sum: '$cashAmount' },
          totalUpi: { $sum: '$upiAmount' },
          totalLiters: { $sum: '$litersSold' },
          petrolSold: {
            $sum: { $cond: [{ $eq: ['$fuelType', 'petrol'] }, '$litersSold', 0] }
          },
          dieselSold: {
            $sum: { $cond: [{ $eq: ['$fuelType', 'diesel'] }, '$litersSold', 0] }
          },
          entryCount: { $sum: 1 }
        }
      }
    ]);

    // Monthly sales
    const monthlySales = await SalesEntry.aggregate([
      { $match: { entryTime: { $gte: startOfMonth, $lt: tomorrow } } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          totalCash: { $sum: '$cashAmount' },
          totalUpi: { $sum: '$upiAmount' },
          totalLiters: { $sum: '$litersSold' }
        }
      }
    ]);

    // Active operators
    const activeShifts = await Shift.find({ isActive: true })
      .populate('user', 'name email');

    // Fuel stocks
    const stocks = await FuelStock.find();

    // Today's attendance
    const attendance = await Attendance.find({
      date: { $gte: today, $lt: tomorrow }
    }).populate('user', 'name');

    const operators = await User.find({ role: 'operator' });

    res.json({
      today: todaySales[0] || {
        totalAmount: 0,
        totalCash: 0,
        totalUpi: 0,
        totalLiters: 0,
        petrolSold: 0,
        dieselSold: 0,
        entryCount: 0
      },
      monthly: monthlySales[0] || {
        totalAmount: 0,
        totalCash: 0,
        totalUpi: 0,
        totalLiters: 0
      },
      activeOperators: activeShifts.map(s => ({
        id: s.user._id,
        name: s.user.name,
        shiftStart: s.startTime,
        scheduledEnd: s.scheduledEndTime,
        totalSales: s.totalSales
      })),
      stocks: stocks.map(s => ({
        fuelType: s.fuelType,
        currentStock: s.currentStock,
        capacity: s.capacity,
        pricePerLiter: s.pricePerLiter,
        isLow: s.currentStock <= s.lowStockThreshold,
        percentage: Math.round((s.currentStock / s.capacity) * 100)
      })),
      attendance: {
        total: operators.length,
        present: attendance.filter(a => a.status === 'present').length,
        halfDay: attendance.filter(a => a.status === 'half-day').length,
        absent: operators.length - attendance.length
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Operator dashboard data
router.get('/operator', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('currentShift');
    let activeShift = user.currentShift;

    // If currentShift pointer is missing, still resume active shift
    if (!activeShift) {
      activeShift = await Shift.findOne({ user: req.user._id, isActive: true }).sort({ startTime: -1 });
      if (activeShift) {
        user.currentShift = activeShift._id;
        await user.save();
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's sales for this operator
    const todaySales = await SalesEntry.aggregate([
      { 
        $match: { 
          operator: req.user._id,
          entryTime: { $gte: today, $lt: tomorrow } 
        } 
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          totalCash: { $sum: '$cashAmount' },
          totalUpi: { $sum: '$upiAmount' },
          totalLiters: { $sum: '$litersSold' },
          entryCount: { $sum: 1 }
        }
      }
    ]);

    // Fuel stocks (for prices)
    const stocks = await FuelStock.find();

    res.json({
      user: {
        name: user.name,
        totalFuelSold: user.totalFuelSold,
        totalCashCollected: user.totalCashCollected,
        totalUpiCollected: user.totalUpiCollected,
        totalEntries: user.totalEntries
      },
      currentShift: activeShift ? {
        startTime: activeShift.startTime,
        scheduledEndTime: activeShift.scheduledEndTime,
        totalSales: activeShift.totalSales,
        totalCash: activeShift.totalCash,
        totalUpi: activeShift.totalUpi,
        fuelSold: activeShift.fuelSold
      } : null,
      today: todaySales[0] || {
        totalAmount: 0,
        totalCash: 0,
        totalUpi: 0,
        totalLiters: 0,
        entryCount: 0
      },
      fuelPrices: stocks.reduce((acc, s) => {
        acc[s.fuelType] = s.pricePerLiter;
        return acc;
      }, {})
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Operator performance (Manager only)
router.get('/operator-performance', auth, managerOnly, async (req, res) => {
  try {
    const operators = await User.find({ role: 'operator' })
      .select('name email totalFuelSold totalCashCollected totalUpiCollected totalEntries')
      .sort({ totalFuelSold: -1 });

    res.json(operators);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
