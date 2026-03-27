const express = require('express');
const Shift = require('../models/Shift');
const User = require('../models/User');
const { auth, managerOnly } = require('../middleware/auth');

const router = express.Router();

// Get current user's active shift
router.get('/current', auth, async (req, res) => {
  try {
    const shift = await Shift.findOne({
      user: req.user._id,
      isActive: true
    });

    if (!shift) {
      return res.status(404).json({ message: 'No active shift' });
    }

    res.json(shift);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all active shifts (Manager only)
router.get('/active', auth, managerOnly, async (req, res) => {
  try {
    const shifts = await Shift.find({ isActive: true })
      .populate('user', 'name email');
    
    res.json(shifts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// End shift manually
router.post('/end', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user.currentShift) {
      return res.status(400).json({ message: 'No active shift to end' });
    }

    const shift = await Shift.findById(user.currentShift);
    if (shift) {
      shift.isActive = false;
      shift.endTime = new Date();
      await shift.save();
    }

    user.currentShift = null;
    await user.save();

    res.json({ message: 'Shift ended successfully', shift });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get shift history
router.get('/history', auth, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    
    const query = {};

    if (startDate && endDate) {
      query.startTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (req.user.role !== 'manager') {
      query.user = req.user._id;
    } else if (userId) {
      query.user = userId;
    }

    const shifts = await Shift.find(query)
      .populate('user', 'name email')
      .sort({ startTime: -1 })
      .limit(50);

    res.json(shifts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
