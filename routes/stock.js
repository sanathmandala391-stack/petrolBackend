const express = require('express');
const FuelStock = require('../models/FuelStock');
const { auth, managerOnly } = require('../middleware/auth');

const router = express.Router();

// Get all fuel stocks
router.get('/', auth, async (req, res) => {
  try {
    const stocks = await FuelStock.find();
    res.json(stocks);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update stock (refill) - Manager only
router.post('/refill', auth, managerOnly, async (req, res) => {
  try {
    const { fuelType, amount } = req.body;

    const stock = await FuelStock.findOne({ fuelType });
    if (!stock) {
      return res.status(404).json({ message: 'Fuel type not found' });
    }

    const newStock = stock.currentStock + amount;
    if (newStock > stock.capacity) {
      return res.status(400).json({ 
        message: `Cannot exceed tank capacity of ${stock.capacity}L` 
      });
    }

    stock.currentStock = newStock;
    stock.lastRefillDate = new Date();
    stock.lastRefillAmount = amount;
    await stock.save();

    // Emit stock update
    const io = req.app.get('io');
    if (io) {
      io.emit('stock_update', {
        fuelType,
        currentStock: stock.currentStock,
        capacity: stock.capacity
      });
    }

    res.json({ 
      message: 'Stock refilled successfully', 
      stock 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update price - Manager only
router.put('/price', auth, managerOnly, async (req, res) => {
  try {
    const { fuelType, pricePerLiter } = req.body;

    const stock = await FuelStock.findOneAndUpdate(
      { fuelType },
      { pricePerLiter },
      { new: true }
    );

    if (!stock) {
      return res.status(404).json({ message: 'Fuel type not found' });
    }

    // Emit price update
    const io = req.app.get('io');
    if (io) {
      io.emit('price_update', {
        fuelType,
        pricePerLiter
      });
    }

    res.json({ message: 'Price updated successfully', stock });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Initialize stock (first setup)
router.post('/initialize', auth, managerOnly, async (req, res) => {
  try {
    const { stocks } = req.body;

    // ✅ VALIDATION
    if (!Array.isArray(stocks)) {
      return res.status(400).json({
        message: 'stocks must be an array'
      });
    }

    const results = [];

    for (const stockData of stocks) {
      const stock = await FuelStock.findOneAndUpdate(
        { fuelType: stockData.fuelType },
        stockData,
        { upsert: true, new: true }
      );
      results.push(stock);
    }

    res.json({
      message: 'Stocks initialized',
      stocks: results
    });

  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
