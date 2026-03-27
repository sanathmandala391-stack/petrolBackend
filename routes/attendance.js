const express = require('express');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { auth, managerOnly } = require('../middleware/auth');

const router = express.Router();

// Get attendance for a date range
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    
    const query = {};
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // If not manager, can only see own attendance
    if (req.user.role !== 'manager') {
      query.user = req.user._id;
    } else if (userId) {
      query.user = userId;
    }

    const attendance = await Attendance.find(query)
      .populate('user', 'name email role')
      .sort({ date: -1 });
    
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get today's attendance summary (Manager only)
router.get('/today', auth, managerOnly, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.find({
      date: { $gte: today, $lt: tomorrow }
    }).populate('user', 'name email role');

    const operators = await User.find({ role: 'operator' });
    
    const summary = {
      total: operators.length,
      present: attendance.filter(a => a.status === 'present').length,
      halfDay: attendance.filter(a => a.status === 'half-day').length,
      absent: operators.length - attendance.length,
      records: attendance
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get monthly attendance report
router.get('/monthly/:year/:month', auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const { userId } = req.query;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const query = {
      date: { $gte: startDate, $lte: endDate }
    };

    if (req.user.role !== 'manager') {
      query.user = req.user._id;
    } else if (userId) {
      query.user = userId;
    }

    const attendance = await Attendance.find(query)
      .populate('user', 'name email')
      .sort({ date: 1 });

    // Calculate summary
    const summary = {
      totalDays: endDate.getDate(),
      presentDays: attendance.filter(a => a.status === 'present').length,
      halfDays: attendance.filter(a => a.status === 'half-day').length,
      absentDays: 0,
      totalHours: attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0),
      records: attendance
    };

    summary.absentDays = summary.totalDays - summary.presentDays - summary.halfDays;

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
