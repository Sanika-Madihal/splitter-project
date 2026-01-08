require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const responseTime = require('response-time');


// --- PROMETHEUS MONITORING SETUP ---
const promClient = require('prom-client');

const app = express();

// Create a Registry for Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// --- CUSTOM METRICS DEFINITION ---
const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5]
});

const totalRequests = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new promClient.Gauge({
    name: 'active_connections',
    help: 'Number of active connections'
});

const databaseOperations = new promClient.Counter({
    name: 'database_operations_total',
    help: 'Total number of database operations',
    labelNames: ['operation', 'collection', 'status']
});

const expenseAmount = new promClient.Histogram({
    name: 'expense_amount_inr',
    help: 'Distribution of expense amounts in INR',
    buckets: [10, 50, 100, 500, 1000, 5000, 10000]
});

const settlementAmount = new promClient.Histogram({
    name: 'settlement_amount_inr',
    help: 'Distribution of settlement amounts in INR',
    buckets: [10, 50, 100, 500, 1000, 5000, 10000]
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(totalRequests);
register.registerMetric(activeConnections);
register.registerMetric(databaseOperations);
register.registerMetric(expenseAmount);
register.registerMetric(settlementAmount);

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// // 1. Response time tracking
// app.use(responseTime((req, res, time) => {
//     const route = req.route ? req.route.path : req.path;
//     httpRequestDuration
//         .labels(req.method, route, res.statusCode)
//         .observe(time / 1000);
// }));

// // 2. Request counter and active connections
// app.use((req, res, next) => {
//     activeConnections.inc();
//     res.on('finish', () => {
//         activeConnections.dec();
//         const route = req.route ? req.route.path : req.path;
//         totalRequests.labels(req.method, route, res.statusCode).inc();
//     });
//     next();
// });

// // 3. Static Files (Restored from your previous version)
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// --- MONITORING & HEALTH ENDPOINTS ---
app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
});

app.get('/health', (req, res) => {
    const healthStatus = {
        status: 'ok',
        service: 'splitsmart-backend',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
    };
    res.status(200).json(healthStatus);
});

// --- DATABASE CONNECTION ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:splitsmart2024@mongodb:27017/splitsmart?authSource=admin';

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB');
        databaseOperations.labels('connect', 'mongodb', 'success').inc();
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        databaseOperations.labels('connect', 'mongodb', 'error').inc();
        process.exit(1); 
    });

// --- DATABASE SCHEMAS & MODELS ---
const userSchema = new mongoose.Schema({
    name: String,
    lastActive: { type: Date, default: Date.now }
});

const expenseSchema = new mongoose.Schema({
    tripId: Number,
    payer: String,
    amount: Number,
    description: String,
    participants: [String],
    date: { type: Date, default: Date.now }
});

const settlementSchema = new mongoose.Schema({
    payer: String,
    recipient: String,
    amount: Number,
    method: String,
    date: { type: Date, default: Date.now }
});

const tripSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    currency: String,
    expenses: [expenseSchema],
    createdAt: { type: Date, default: Date.now }
});

const Trip = mongoose.model('Trip', tripSchema);
const User = mongoose.model('User', userSchema);
const Expense = mongoose.model('Expense', expenseSchema);
const Settlement = mongoose.model('Settlement', settlementSchema);

// --- API ROUTES ---

// Create Trip
app.post('/api/trips', async (req, res) => {
    try {
        const { name, currency } = req.body;
        const lastTrip = await Trip.findOne().sort({ id: -1 });
        const nextId = lastTrip && lastTrip.id ? lastTrip.id + 1 : 101;

        const newTrip = new Trip({ id: nextId, name, currency, expenses: [] });
        await newTrip.save();
        
        databaseOperations.labels('create', 'trips', 'success').inc();
        res.status(201).json(newTrip);
    } catch (error) {
        databaseOperations.labels('create', 'trips', 'error').inc();
        res.status(500).json({ error: error.message });
    }
});

// Add Expense
app.post('/api/trips/:id/expenses', async (req, res) => {
    try {
        const tripId = parseInt(req.params.id);
        const { payer, amount, description, participants } = req.body;

        const trip = await Trip.findOne({ id: tripId });
        if (!trip) {
            databaseOperations.labels('read', 'trips', 'not_found').inc();
            return res.status(404).json({ error: "Trip not found" });
        }

        expenseAmount.observe(Number(amount));

        await new Expense({ tripId, payer, amount, description, participants }).save();
        trip.expenses.push({ tripId, payer, amount, description, participants });
        await trip.save();

        if (payer) {
            await User.findOneAndUpdate({ name: payer }, { name: payer }, { upsert: true });
        }

        databaseOperations.labels('create', 'expenses', 'success').inc();
        res.status(201).json({ message: "Expense saved" });
    } catch (error) {
        databaseOperations.labels('create', 'expenses', 'error').inc();
        res.status(500).json({ error: "Could not save expense" });
    }
});

// Save Settlement
app.post('/api/settlements', async (req, res) => {
    try {
        const { payer, recipient, amount, method } = req.body;

        const newSettlement = new Settlement({ payer, recipient, amount, method });
        await newSettlement.save();

        settlementAmount.observe(Number(amount));

        databaseOperations.labels('create', 'settlements', 'success').inc();
        res.status(201).json({ message: "Settlement saved" });
    } catch (error) {
        databaseOperations.labels('create', 'settlements', 'error').inc();
        res.status(500).json({ error: "Could not save settlement" });
    }
});

// Reset Database
app.post('/api/reset', async (req, res) => {
    try {
        await Trip.deleteMany({});
        await User.deleteMany({});
        await Expense.deleteMany({});
        await Settlement.deleteMany({});

        databaseOperations.labels('delete', 'all', 'success').inc();
        res.status(200).json({ message: "Database cleared successfully" });
    } catch (error) {
        databaseOperations.labels('delete', 'all', 'error').inc();
        res.status(500).json({ error: "Could not reset database" });
    }
});

// Dummy route for frontend calculation check
app.post('/api/calculate', (req, res) => res.json({ transactions: [] }));

// Serve Frontend (Restored from your previous version)
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend running on port ${PORT}`);
    console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
});