const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://farm.kwetufarm.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://api.kwetufarm.com'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/employees', require('./routes/employees'));
app.use('/api/pigs', require('./routes/pigs'));
app.use('/api/breeding', require('./routes/breeding')); // ADD BREEDING ROUTES
app.use('/api/piglet-care', require('./routes/pigletCare')); // ADD PIGLET CARE ROUTES
app.use('/api/pig-growth', require('./routes/pigGrowth')); // ADD PIG GROWTH ROUTES

app.use('/api/farm-management', require('./routes/farmManagement')); // ADD FARM MANAGEMENT ROUTES
app.use('/api/audit', require('./routes/audit')); // ADD AUDIT ROUTES

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Kwetu Farm API is running!',
    version: '1.0.0',
    status: 'healthy',
    endpoints: {
      // Employee endpoints
      employees: '/api/employees',
      employeeLogin: 'POST /api/employees/login',
      employeeRegister: 'POST /api/employees/register',
      employeeProfile: 'GET /api/employees/profile',
      
      // Pig registration endpoints
      pigs: '/api/pigs',
      pigNextIds: 'GET /api/pigs/next-ids',
      grownPigRegister: 'POST /api/pigs/grown-pig',
      litterRegister: 'POST /api/pigs/litter',
      batchCreate: 'POST /api/pigs/batch',
      availablePiglets: 'GET /api/pigs/available-piglets',
      pigStatistics: 'GET /api/pigs/statistics',
      recentRegistrations: 'GET /api/pigs/recent/:type',
      
      // Breeding management endpoints
      breeding: '/api/breeding',
      breedingGrownPigs: 'GET /api/breeding/grown-pigs',
      breedingRecords: 'GET /api/breeding/records',
      createBreedingRecord: 'POST /api/breeding/records',
      updateBreedingRecord: 'PUT /api/breeding/records/:id',
      deleteBreedingRecord: 'DELETE /api/breeding/records/:id',
      breedingStatistics: 'GET /api/breeding/statistics',
      breedingSchedule: 'GET /api/breeding/schedule',
      
      // Piglet care management endpoints
      pigletCare: '/api/piglet-care',
      pigletCareTasks: 'GET /api/piglet-care/tasks',
      pigletCareSchedule: 'GET /api/piglet-care/schedule',
      individualPiglets: 'GET /api/piglet-care/individual-piglets',
      batchCareSchedule: 'GET /api/piglet-care/batch-schedule',
      batchStatistics: 'GET /api/piglet-care/batch-statistics',
      createSchedules: 'POST /api/piglet-care/create-schedules',
      createBatchSchedules: 'POST /api/piglet-care/create-batch-schedules',
      completeTask: 'PUT /api/piglet-care/tasks/:scheduleId/complete',
      completeBatchTask: 'PUT /api/piglet-care/batch-tasks/:scheduleId/complete',
      movePiglet: 'POST /api/piglet-care/move-piglet',
      notifications: 'GET /api/piglet-care/notifications',
      markNotificationRead: 'PUT /api/piglet-care/notifications/:notificationId/read',
      
      
      
      // System endpoints
      health: 'GET /api/health'
    }
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Error:', error);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.path,
    method: req.method,
    availableRoutes: [
      'GET /',
      'GET /api/health',
      
      // Employee routes
      'POST /api/employees/register',
      'POST /api/employees/login',
      'GET /api/employees/profile',
      
      // Pig registration routes
      'GET /api/pigs/next-ids',
      'POST /api/pigs/grown-pig',
      'POST /api/pigs/litter',
      'POST /api/pigs/batch',
      'GET /api/pigs/available-piglets',
      'GET /api/pigs/statistics',
      
      // Piglet care routes
      'GET /api/piglet-care/tasks',
      'GET /api/piglet-care/schedule',
      'GET /api/piglet-care/individual-piglets',
      'GET /api/piglet-care/batch-schedule',
      'GET /api/piglet-care/batch-statistics',
      'POST /api/piglet-care/create-schedules',
      'POST /api/piglet-care/create-batch-schedules',
      'PUT /api/piglet-care/tasks/:scheduleId/complete',
      'PUT /api/piglet-care/batch-tasks/:scheduleId/complete',
      'POST /api/piglet-care/move-piglet',
      'GET /api/piglet-care/notifications',
      'PUT /api/piglet-care/notifications/:notificationId/read',
      'GET /api/pigs/recent/grown',
      'GET /api/pigs/recent/litter',
      'GET /api/pigs/recent/batch',
      'PUT /api/pigs/grown-pigs/:pigId/location',
      'PUT /api/pigs/litters/:litterId/location',
      'PUT /api/pigs/batches/:batchId/location',
      'GET /api/pigs/location-history/:pigId',
      'GET /api/pigs/location-history',
      'GET /api/pigs/farms',
      
      // Breeding management routes
      'GET /api/breeding/grown-pigs',
      'GET /api/breeding/records',
      'POST /api/breeding/records',
      'PUT /api/breeding/records/:id',
      'DELETE /api/breeding/records/:id',
      'GET /api/breeding/statistics',
      'GET /api/breeding/schedule',
      'GET /api/breeding/notifications'
    ]
  });
});

// Start server
const startServer = async () => {
  try {
    // Initialize database first
    console.log('🔄 Initializing database...');
    const dbInitialized = await initializeDatabase();
    
    if (!dbInitialized) {
      console.error('❌ Failed to initialize database. Please check your MySQL connection.');
      console.error('💡 Make sure:');
      console.error('   1. MySQL server is running');
      console.error('   2. Credentials in .env file are correct');
      console.error('   3. MySQL user has necessary permissions');
      process.exit(1);
    }

    // Start the server
    app.listen(PORT, () => {
      console.log('🎉 ================================');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Visit: http://localhost:${PORT}`);
      console.log('🔗 API Endpoints:');
      console.log(`   - Health Check: GET /api/health`);
      console.log('');
      console.log('👥 Employee Management:');
      console.log(`   - Employee Register: POST /api/employees/register`);
      console.log(`   - Employee Login: POST /api/employees/login`);
      console.log(`   - Employee Profile: GET /api/employees/profile`);
      console.log('');
      console.log('🐷 Pig Registration:');
      console.log(`   - Get Next IDs: GET /api/pigs/next-ids`);
      console.log(`   - Register Grown Pig: POST /api/pigs/grown-pig`);
      console.log(`   - Register Litter: POST /api/pigs/litter`);
      console.log(`   - Create Batch: POST /api/pigs/batch`);
      console.log(`   - Available Piglets: GET /api/pigs/available-piglets`);
      console.log(`   - Statistics: GET /api/pigs/statistics`);
      console.log(`   - Recent Registrations: GET /api/pigs/recent/{type}`);
      console.log('');
      console.log('💕 Breeding Management:');
      console.log(`   - Get Grown Pigs: GET /api/breeding/grown-pigs`);
      console.log(`   - Get Breeding Records: GET /api/breeding/records`);
      console.log(`   - Create Breeding Record: POST /api/breeding/records`);
      console.log(`   - Update Breeding Record: PUT /api/breeding/records/:id`);
      console.log(`   - Delete Breeding Record: DELETE /api/breeding/records/:id`);
      console.log(`   - Breeding Statistics: GET /api/breeding/statistics`);
      console.log(`   - Breeding Schedule: GET /api/breeding/schedule`);
      console.log('🎉 ================================');
      
      // Sample admin credentials
      console.log('👤 Sample Admin Account:');
      console.log('   Email: admin@kwetufarm.co.ke');
      console.log('   Password: admin123');
      console.log('🎉 ================================');
      
      // Usage examples
      console.log('📝 Usage Examples:');
      console.log('   - Test pig statistics: GET http://localhost:5000/api/pigs/statistics');
      console.log('   - Get next pig IDs: GET http://localhost:5000/api/pigs/next-ids');
      console.log('   - Test breeding endpoints: GET http://localhost:5000/api/breeding/grown-pigs');
      console.log('   - View all endpoints: GET http://localhost:5000/');
      console.log('🎉 ================================');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the application
startServer();