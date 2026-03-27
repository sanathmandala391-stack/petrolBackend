// const express = require('express');
// const SystemConfig = require('../models/SystemConfig');
// const FuelStock = require('../models/FuelStock');

// const router = express.Router();

// router.get('/bunk', async (req, res) => {
//   try {
//     const bunkLocation = await SystemConfig.findOne({ key: 'bunk_location' });
//     const fallbackLatitude = Number(process.env.DEFAULT_LATITUDE);
//     const fallbackLongitude = Number(process.env.DEFAULT_LONGITUDE);
//     const fallbackLocation = !Number.isNaN(fallbackLatitude) && !Number.isNaN(fallbackLongitude)
//       ? { latitude: fallbackLatitude, longitude: fallbackLongitude }
//       : null;

//     // Prefer env-configured coordinates for Home page display
//     const location = fallbackLocation || bunkLocation?.value || null;

//     // Keep DB in sync if env location is provided
//     if (fallbackLocation) {
//       await SystemConfig.findOneAndUpdate(
//         { key: 'bunk_location' },
//         {
//           key: 'bunk_location',
//           value: fallbackLocation,
//           description: 'Petrol bunk GPS coordinates'
//         },
//         { upsert: true }
//       );
//     }

//     res.json({
//       name: process.env.BUNK_NAME || 'Petrol Bunk',
//       phone: process.env.BUNK_PHONE || null,
//       address: process.env.BUNK_ADDRESS || null,
//       location
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// router.get('/prices', async (req, res) => {
//   try {
//     const stocks = await FuelStock.find().select('fuelType pricePerLiter').lean();
//     const prices = stocks.reduce((acc, s) => {
//       acc[s.fuelType] = s.pricePerLiter;
//       return acc;
//     }, {});

//     res.json({
//       petrol: prices.petrol ?? null,
//       diesel: prices.diesel ?? null,
//       updatedAt: new Date().toISOString()
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// module.exports = router;

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/db');
const setupSocket = require('./socket');

// Routes
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const attendanceRoutes = require('./routes/attendance');
const shiftsRoutes = require('./routes/shifts');
const salesRoutes = require('./routes/sales');
const stockRoutes = require('./routes/stock');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const server = http.createServer(app);

// ✅ SIMPLE CORS (no errors)
app.use(cors({
  origin: '*',   // allow all (fixes your issue)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// ✅ handle preflight
app.options('*', cors());

// Middleware
app.use(express.json());

// Connect DB
connectDB();

// ✅ Socket.IO (fix timeout)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

app.set('io', io);
setupSocket(io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("ERROR:", err);
  res.status(500).json({
    message: 'Server error',
    error: err.message
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});