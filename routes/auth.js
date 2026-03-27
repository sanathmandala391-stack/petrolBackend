const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Shift = require('../models/Shift');
const Attendance = require('../models/Attendance');
const { auth } = require('../middleware/auth');
const { verifyLocation } = require('../middleware/location');

const router = express.Router();

// Register user (Manager only can create operators)
router.post('/register', auth, async (req, res) => {
  try {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Only managers can register users' });
    }

    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({ name, email, password, role });
    
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login
router.post('/login',  async (req, res) => {
  try {
    const { email, password, latitude, longitude } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Start shift for operator
    const SHIFT_DURATION_MS = 8.5 * 60 * 60 * 1000; // 8 hours 30 minutes
    
    let shift = null;
    if (user.role === 'operator') {
      // Check if already has active shift
      const existingShift = await Shift.findOne({ 
        user: user._id, 
        isActive: true 
      });

      if (!existingShift) {
        const startTime = new Date();
        shift = await Shift.create({
          user: user._id,
          startTime,
          scheduledEndTime: new Date(startTime.getTime() + SHIFT_DURATION_MS)
        });

        user.currentShift = shift._id;
        await user.save();
      } else {
        shift = existingShift;
      }
    }

    // Record attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let attendance = await Attendance.findOne({ 
      user: user._id, 
      date: today 
    });

    if (!attendance) {
      attendance = await Attendance.create({
        user: user._id,
        date: today,
        loginTime: new Date(),
        location: latitude && longitude ? { latitude, longitude } : undefined,
        status: 'present'
      });
    }

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      shift: shift ? {
        id: shift._id,
        startTime: shift.startTime,
        scheduledEndTime: shift.scheduledEndTime
      } : null
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('currentShift');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Logout (end shift)
router.post('/logout', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.currentShift) {
      const shift = await Shift.findById(user.currentShift);
      if (shift && shift.isActive) {
        shift.isActive = false;
        shift.endTime = new Date();
        await shift.save();
      }
      user.currentShift = null;
      await user.save();
    }

    // Update attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({ 
      user: user._id, 
      date: today 
    });

    if (attendance && !attendance.logoutTime) {
      attendance.logoutTime = new Date();
      const hours = (attendance.logoutTime - attendance.loginTime) / (1000 * 60 * 60);
      attendance.totalHours = Math.round(hours * 100) / 100;
      
      // Determine status based on hours
      if (hours >= 3) {
        attendance.status = 'present';
      } else if (hours > 0) {
        attendance.status = 'half-day';
      }
      
      await attendance.save();
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all operators (for manager)
router.get('/operators', auth, async (req, res) => {
  try {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const operators = await User.find({ role: 'operator' })
      .select('-password')
      .populate('currentShift');
    
    res.json(operators);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Initial setup - create first manager
router.post('/setup', async (req, res) => {
  try {
    const existingManager = await User.findOne({ role: 'manager' });
    if (existingManager) {
      return res.status(400).json({ message: 'Setup already completed' });
    }

    const { name, email, password, latitude, longitude } = req.body;
    const fallbackLatitude = Number(process.env.DEFAULT_LATITUDE);
    const fallbackLongitude = Number(process.env.DEFAULT_LONGITUDE);
    const hasFallbackLocation = !Number.isNaN(fallbackLatitude) && !Number.isNaN(fallbackLongitude);
    const finalLatitude = latitude ?? (hasFallbackLocation ? fallbackLatitude : undefined);
    const finalLongitude = longitude ?? (hasFallbackLocation ? fallbackLongitude : undefined);

    const manager = await User.create({
      name,
      email,
      password,
      role: 'manager'
    });

    // Store bunk location from first manager's location
    if (typeof finalLatitude === 'number' && typeof finalLongitude === 'number') {
      const SystemConfig = require('../models/SystemConfig');
      await SystemConfig.findOneAndUpdate(
        { key: 'bunk_location' },
        {
          key: 'bunk_location',
          value: { latitude: finalLatitude, longitude: finalLongitude },
          description: 'Petrol bunk GPS coordinates'
        },
        { upsert: true }
      );
    }

    const token = jwt.sign(
      { userId: manager._id, role: manager.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.status(201).json({
      message: 'Setup completed successfully',
      token,
      user: {
        id: manager._id,
        name: manager.name,
        email: manager.email,
        role: manager.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Check if setup is needed
router.get('/check-setup', async (req, res) => {
  try {
    const manager = await User.findOne({ role: 'manager' });
    res.json({ setupRequired: !manager });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
