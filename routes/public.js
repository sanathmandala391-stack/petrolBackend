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
const SystemConfig = require('../models/SystemConfig');
const FuelStock = require('../models/FuelStock');

const router = express.Router();

// GET BUNK DETAILS
router.get('/bunk', async (req, res) => {
  try {
    const bunkLocation = await SystemConfig.findOne({ key: 'bunk_location' });

    const fallbackLat = Number(process.env.DEFAULT_LATITUDE);
    const fallbackLng = Number(process.env.DEFAULT_LONGITUDE);

    const fallbackLocation =
      !isNaN(fallbackLat) && !isNaN(fallbackLng)
        ? { latitude: fallbackLat, longitude: fallbackLng }
        : null;

    const location = fallbackLocation || bunkLocation?.value || null;

    res.json({
      name: process.env.BUNK_NAME || 'Petrol Bunk',
      phone: process.env.BUNK_PHONE || null,
      address: process.env.BUNK_ADDRESS || null,
      location
    });
  } catch (error) {
    console.error('BUNK ERROR:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

// GET FUEL PRICES
router.get('/prices', async (req, res) => {
  try {
    const stocks = await FuelStock.find().lean();

    if (!stocks || stocks.length === 0) {
      return res.json({
        petrol: 0,
        diesel: 0,
        message: 'Stock not initialized'
      });
    }

    const prices = {};
    stocks.forEach((s) => {
      prices[s.fuelType] = s.pricePerLiter || 0;
    });

    res.json({
      petrol: prices.petrol || 0,
      diesel: prices.diesel || 0,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('PRICE ERROR:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;