const SystemConfig = require('../models/SystemConfig');

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

const verifyLocation = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;
    const testMode = process.env.TEST_MODE === 'true';

    // Get stored bunk location
    const bunkLocation = await SystemConfig.findOne({ key: 'bunk_location' });

    // If no location stored yet, this is the first manager login
    if (!bunkLocation) {
      // Store this location as the bunk location
      if (latitude && longitude) {
        await SystemConfig.create({
          key: 'bunk_location',
          value: { latitude, longitude },
          description: 'Petrol bunk GPS coordinates (set on first manager login)'
        });
        console.log('Bunk location set:', { latitude, longitude });
      }
      req.locationVerified = true;
      return next();
    }

    // If TEST_MODE is enabled, skip location verification
    if (testMode) {
      console.log('TEST_MODE: Location verification skipped');
      req.locationVerified = true;
      return next();
    }

    // Verify user is within allowed radius
    if (!latitude || !longitude) {
      return res.status(400).json({ 
        message: 'Location required for login',
        requiresLocation: true 
      });
    }

    const storedLat = bunkLocation.value.latitude;
    const storedLon = bunkLocation.value.longitude;
    const distance = calculateDistance(latitude, longitude, storedLat, storedLon);
    const allowedRadius = parseInt(process.env.LOCATION_RADIUS_METERS) || 200;

    if (distance > allowedRadius) {
      return res.status(403).json({
        message: `You must be within ${allowedRadius}m of the petrol bunk to login. Current distance: ${Math.round(distance)}m`,
        distance: Math.round(distance),
        allowedRadius
      });
    }

    req.locationVerified = true;
    req.userLocation = { latitude, longitude };
    next();
  } catch (error) {
    console.error('Location verification error:', error);
    next(error);
  }
};

module.exports = { verifyLocation, calculateDistance };
