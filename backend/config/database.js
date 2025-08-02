// backend/config/database.js - UPDATED to include number_died column in litters table
const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;
let promisePool = null;

// Create connection pool - UPDATED: Added SSL and port support for production
const createPool = () => {
  if (!pool) {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kwetu_farm',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

    // Add port if specified (for production databases like Aiven)
    if (process.env.DB_PORT) {
      config.port = parseInt(process.env.DB_PORT);
    }

    // Add SSL configuration if required (for production databases)
    if (process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production') {
      config.ssl = {
        rejectUnauthorized: false
      };
    }

    pool = mysql.createPool(config);
  }
  return pool;
};

// Create promise pool for middleware compatibility
const createPromisePool = () => {
  if (!promisePool) {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kwetu_farm',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      Promise: require('mysql2/promise')
    };

    // Add port if specified (for production databases like Aiven)
    if (process.env.DB_PORT) {
      config.port = parseInt(process.env.DB_PORT);
    }

    // Add SSL configuration if required (for production databases)
    if (process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production') {
      config.ssl = {
        rejectUnauthorized: false
      };
    }

    promisePool = require('mysql2').createPool(config);
  }
  return promisePool;
};

// Get database connection
const getConnection = async () => {
  const pool = createPool();
  return await pool.getConnection();
};

// Initialize database and create tables
const initializeDatabase = async () => {
  let connection;
  
  try {
    console.log('🔄 Initializing database...');
    
    // Connect to MySQL without specifying database first
    const connectionConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    };

    // Add port if specified (for production databases like Aiven)
    if (process.env.DB_PORT) {
      connectionConfig.port = parseInt(process.env.DB_PORT);
    }

    // Add SSL configuration if required (for production databases)
    if (process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production') {
      connectionConfig.ssl = {
        rejectUnauthorized: false
      };
    }

    connection = await mysql.createConnection(connectionConfig);

    console.log('✅ Connected to MySQL server');

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'kwetu_farm';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✅ Database '${dbName}' created or already exists`);

    // Use the database
    await connection.query(`USE \`${dbName}\``);

    // Create employees table
    await createEmployeesTable(connection);

    // Create farm locations table
    await createFarmLocationsTable(connection);

    // Create pig registration tables
    await createPigTables(connection);

    // Create breeding tables
    await createBreedingTables(connection);

    // Create audit tables
    await createAuditTables(connection);

    // Create sample admin account
    await createSampleAdmin(connection);

    console.log('🎉 Database initialization completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    
    // Provide specific error guidance
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 MySQL server is not running. Please start MySQL service.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Access denied. Please check your MySQL credentials in .env file.');
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 MySQL host not found. Please check DB_HOST in .env file.');
    }
    
    return false;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
};

// Create employees table
const createEmployeesTable = async (connection) => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone_number VARCHAR(10) UNIQUE NOT NULL,
      id_number VARCHAR(8) UNIQUE NOT NULL,
      employee_code VARCHAR(6) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'manager', 'employee', 'cashier', 'vet', 'waiting_approval') DEFAULT 'waiting_approval',
      status ENUM('active', 'suspended') DEFAULT 'suspended',
      department VARCHAR(100),
      position VARCHAR(100),
      hire_date DATE DEFAULT (CURDATE()),
      salary DECIMAL(10, 2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `;

  await connection.query(createTableSQL);
  console.log('✅ Employees table created or verified');

  // Create indexes
  const indexes = [
    { name: 'idx_employees_role', column: 'role' },
    { name: 'idx_employees_status', column: 'status' },
    { name: 'idx_employees_code', column: 'employee_code' },
    { name: 'idx_employees_email', column: 'email' }
  ];

  for (const index of indexes) {
    try {
      await connection.query(`CREATE INDEX IF NOT EXISTS ${index.name} ON employees(${index.column})`);
      console.log(`✅ Index '${index.name}' created or verified`);
    } catch (indexError) {
      if (indexError.code === 'ER_DUP_KEYNAME') {
        console.log(`✅ Index '${index.name}' already exists`);
      } else {
        console.log(`⚠️ Error creating index '${index.name}': ${indexError.message}`);
      }
    }
  }
};

// Create farm locations table
const createFarmLocationsTable = async (connection) => {
  const farmLocationsSQL = `
    CREATE TABLE IF NOT EXISTS farm_locations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      location_code VARCHAR(20) UNIQUE NOT NULL,
      location_name VARCHAR(100) NOT NULL,
      location_type ENUM('farm', 'store', 'facility', 'general') NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_location_code (location_code),
      INDEX idx_location_type (location_type),
      INDEX idx_is_active (is_active)
    );
  `;

  await connection.query(farmLocationsSQL);
  console.log('✅ Farm locations table created or verified');

  // Insert default farm locations if they don't exist
  const defaultLocations = [
    { code: 'farm_a', name: 'Farm A', type: 'farm', description: 'Primary pig farming location' },
    { code: 'farm_b', name: 'Farm B', type: 'farm', description: 'Secondary pig farming location' },
    { code: 'farm_c', name: 'Farm C', type: 'farm', description: 'Tertiary pig farming location' },
    { code: 'farm_d', name: 'Farm D', type: 'farm', description: 'Quaternary pig farming location' },
    { code: 'farm_e', name: 'Farm E', type: 'farm', description: 'Quinary pig farming location' },
    { code: 'farm_f', name: 'Farm F', type: 'farm', description: 'Senary pig farming location' },
    { code: 'main_store', name: 'Main Store', type: 'store', description: 'Central supply storage' },
    { code: 'pig_farm_store', name: 'Pig Farm Store', type: 'store', description: 'Pig department storage' },
    { code: 'cattle_farm_store', name: 'Cattle Farm Store', type: 'store', description: 'Cattle department storage' },
    { code: 'poultry_farm_store', name: 'Poultry Farm Store', type: 'store', description: 'Poultry department storage' },
    { code: 'pig_farm', name: 'Pig Farm', type: 'facility', description: 'Pig department operational area' },
    { code: 'cattle_farm', name: 'Cattle Farm', type: 'facility', description: 'Cattle department operational area' },
    { code: 'poultry_farm', name: 'Poultry Farm', type: 'facility', description: 'Poultry department operational area' }
  ];

  for (const location of defaultLocations) {
    try {
      await connection.query(`
        INSERT IGNORE INTO farm_locations (location_code, location_name, location_type, description)
        VALUES (?, ?, ?, ?)
      `, [location.code, location.name, location.type, location.description]);
    } catch (error) {
      // Location already exists, ignore
    }
  }
  console.log('✅ Default farm locations inserted or verified');
};

// Create pig registration tables - UPDATED with breeding_status
const createPigTables = async (connection) => {
  // Grown pigs table - UPDATED with breeding_status and age columns
  const grownPigsSQL = `
    CREATE TABLE IF NOT EXISTS grown_pigs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pig_id VARCHAR(10) UNIQUE NOT NULL,
      gender ENUM('male', 'female') NOT NULL,
      breed VARCHAR(50) NOT NULL,
      birth_date DATE NOT NULL,
      age_in_days INT DEFAULT 0,
      age_in_weeks INT DEFAULT 0,
      age_in_months INT DEFAULT 0,
      age_formatted VARCHAR(50) DEFAULT '',
      age_category ENUM('newborn', 'young', 'adolescent', 'adult', 'mature') DEFAULT 'newborn',
      weight DECIMAL(5, 2) NOT NULL,
      location ENUM('farm_a', 'farm_b', 'farm_c', 'farm_d', 'farm_e', 'farm_f') NOT NULL,
      health_status ENUM('healthy', 'average', 'bad') DEFAULT 'healthy',
      health_reason TEXT,
      number_affected INT,
      breeding_status ENUM('available', 'breeding', 'pregnant', 'farrowed', 'weaning', 'retired') DEFAULT 'available',
      current_breeding_record_id INT NULL,
      is_purchased BOOLEAN DEFAULT FALSE,
      purchase_date DATE,
      registered_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (registered_by) REFERENCES employees(id),
      INDEX idx_breeding_status (breeding_status),
      INDEX idx_gender (gender),
      INDEX idx_pig_id (pig_id),
      INDEX idx_age_category (age_category)
    );
  `;

  // Litters table - UPDATED to include number_died column and age columns
  const littersSQL = `
    CREATE TABLE IF NOT EXISTS litters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      litter_id VARCHAR(10) UNIQUE NOT NULL,
      birth_date DATE NOT NULL,
      age_in_days INT DEFAULT 0,
      age_in_weeks INT DEFAULT 0,
      age_in_months INT DEFAULT 0,
      age_formatted VARCHAR(50) DEFAULT '',
      age_category ENUM('newborn', 'young', 'adolescent', 'adult', 'mature') DEFAULT 'newborn',
      sow_id VARCHAR(50) NOT NULL,
      boar_id VARCHAR(50) NOT NULL,
      total_born INT NOT NULL,
      male_count INT NOT NULL,
      female_count INT NOT NULL,
      number_died INT DEFAULT 0,
      average_weight DECIMAL(5, 2) NOT NULL,
      piglet_status ENUM('farrowed', 'breastfeeding', 'castrated', 'weaning', 'batched') DEFAULT 'farrowed',
      location ENUM('farm_a', 'farm_b', 'farm_c', 'farm_d', 'farm_e', 'farm_f') NOT NULL,
      health_status ENUM('healthy', 'average', 'bad') DEFAULT 'healthy',
      health_reason TEXT,
      number_affected INT,
      registered_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (registered_by) REFERENCES employees(id),
      INDEX idx_age_category (age_category)
    );
  `;

  // Batches table - UPDATED with age columns
  const batchesSQL = `
    CREATE TABLE IF NOT EXISTS batches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_id VARCHAR(10) UNIQUE NOT NULL,
      formation_date DATE NOT NULL,
      average_birth_date DATE,
      age_in_days INT DEFAULT 0,
      age_in_weeks INT DEFAULT 0,
      age_in_months INT DEFAULT 0,
      age_formatted VARCHAR(50) DEFAULT '',
      age_category ENUM('newborn', 'young', 'adolescent', 'adult', 'mature') DEFAULT 'newborn',
      male_count INT NOT NULL,
      female_count INT NOT NULL,
      purpose ENUM('become_sows', 'slaughter', 'sale', 'undecided') NOT NULL,
      location ENUM('farm_a', 'farm_b', 'farm_c', 'farm_d', 'farm_e', 'farm_f') NOT NULL,
      health_status ENUM('healthy', 'average', 'bad') DEFAULT 'healthy',
      health_reason TEXT,
      number_affected INT,
      registered_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (registered_by) REFERENCES employees(id),
      INDEX idx_age_category (age_category)
    );
  `;

  // Batch piglets relationship table
  const batchPigletsSQL = `
    CREATE TABLE IF NOT EXISTS batch_piglets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_id VARCHAR(10) NOT NULL,
      piglet_id VARCHAR(20) NOT NULL,
      litter_id VARCHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES batches(batch_id),
      UNIQUE KEY unique_piglet_batch (batch_id, piglet_id)
    );
  `;

  // Manual piglets table (for manually entered piglets in batches)
  const manualPigletsSQL = `
    CREATE TABLE IF NOT EXISTS manual_piglets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      piglet_id VARCHAR(20) UNIQUE NOT NULL,
      batch_id VARCHAR(10) NOT NULL,
      gender ENUM('male', 'female') NOT NULL,
     birth_date DATE NOT NULL,
     location ENUM('farm_a', 'farm_b', 'farm_c', 'farm_d', 'farm_e', 'farm_f') NOT NULL,
     registered_by INT,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY (batch_id) REFERENCES batches(batch_id),
     FOREIGN KEY (registered_by) REFERENCES employees(id)
   );
 `;

 await connection.query(grownPigsSQL);
 console.log('✅ Grown pigs table created or verified with breeding_status');

 await connection.query(littersSQL);
 console.log('✅ Litters table created or verified');

 await connection.query(batchesSQL);
 console.log('✅ Batches table created or verified');

 await connection.query(batchPigletsSQL);
 console.log('✅ Batch piglets table created or verified');

 await connection.query(manualPigletsSQL);
 console.log('✅ Manual piglets table created or verified');

 // Check if we need to add number_died column to existing litters table
 try {
   const [columns] = await connection.query(`
     SELECT COLUMN_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'litters' 
     AND COLUMN_NAME = 'number_died'
   `);
   
   if (columns.length === 0) {
     console.log('🔄 Adding number_died column to existing litters table...');
     await connection.query(`
       ALTER TABLE litters 
       ADD COLUMN number_died INT DEFAULT 0 AFTER female_count
     `);
     console.log('✅ Added number_died column to litters table');
   }
 } catch (error) {
   console.log('ℹ️ number_died column already exists or migration not needed');
 }

 // Check if we need to add breeding_status column to existing table
 try {
   const [columns] = await connection.query(`
     SELECT COLUMN_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'grown_pigs' 
     AND COLUMN_NAME = 'breeding_status'
   `);
   
   if (columns.length === 0) {
     console.log('🔄 Adding breeding_status column to existing grown_pigs table...');
     await connection.query(`
       ALTER TABLE grown_pigs 
       ADD COLUMN breeding_status ENUM('available', 'breeding', 'pregnant', 'farrowed', 'weaning', 'retired') DEFAULT 'available' AFTER number_affected,
       ADD COLUMN current_breeding_record_id INT NULL AFTER breeding_status,
       ADD INDEX idx_breeding_status (breeding_status)
     `);
     
     // Update existing female pigs to 'available' status
     await connection.query(`
       UPDATE grown_pigs 
       SET breeding_status = 'available' 
       WHERE gender = 'female' AND breeding_status IS NULL
     `);
     
     console.log('✅ Added breeding_status column and updated existing records');
   }
 } catch (error) {
   console.log('ℹ️ breeding_status column already exists or migration not needed');
 }
};

 // Create piglet care tables
 const createPigletCareTables = async (connection) => {
   // Piglet care tasks definition table
   const pigletCareTasksSQL = `
     CREATE TABLE IF NOT EXISTS piglet_care_tasks (
       id INT AUTO_INCREMENT PRIMARY KEY,
       task_name VARCHAR(100) NOT NULL UNIQUE,
       description TEXT NOT NULL,
       min_age_days INT NOT NULL,
       max_age_days INT NOT NULL,
       is_active BOOLEAN DEFAULT TRUE,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       INDEX idx_task_name (task_name),
       INDEX idx_age_range (min_age_days, max_age_days)
     );
   `;

   // Piglet care schedule table - tracks when tasks are due for each litter
   const pigletCareScheduleSQL = `
     CREATE TABLE IF NOT EXISTS piglet_care_schedule (
       id INT AUTO_INCREMENT PRIMARY KEY,
       litter_id VARCHAR(10) NOT NULL,
       task_id INT NOT NULL,
       due_date DATE NOT NULL,
       notification_sent BOOLEAN DEFAULT FALSE,
       notification_sent_date TIMESTAMP NULL,
       status ENUM('pending', 'due', 'completed', 'overdue', 'missed') DEFAULT 'pending',
       notes TEXT,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       FOREIGN KEY (litter_id) REFERENCES litters(litter_id) ON DELETE CASCADE,
       FOREIGN KEY (task_id) REFERENCES piglet_care_tasks(id) ON DELETE CASCADE,
       UNIQUE KEY unique_litter_task (litter_id, task_id),
       INDEX idx_due_date (due_date),
       INDEX idx_status (status),
       INDEX idx_notification_sent (notification_sent)
     );
   `;

   // Piglet care completion records table - tracks when tasks are completed
   const pigletCareCompletionsSQL = `
     CREATE TABLE IF NOT EXISTS piglet_care_completions (
       id INT AUTO_INCREMENT PRIMARY KEY,
       schedule_id INT NOT NULL,
       litter_id VARCHAR(10) NOT NULL,
       task_id INT NOT NULL,
       completed_date TIMESTAMP NOT NULL,
       completed_by INT NOT NULL,
       completion_notes TEXT,
       piglets_affected INT DEFAULT 0,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (schedule_id) REFERENCES piglet_care_schedule(id) ON DELETE CASCADE,
       FOREIGN KEY (litter_id) REFERENCES litters(litter_id) ON DELETE CASCADE,
       FOREIGN KEY (task_id) REFERENCES piglet_care_tasks(id) ON DELETE CASCADE,
       FOREIGN KEY (completed_by) REFERENCES employees(id),
       INDEX idx_completed_date (completed_date),
       INDEX idx_completed_by (completed_by)
     );
   `;

   // Notifications table for piglet care reminders
   const pigletCareNotificationsSQL = `
     CREATE TABLE IF NOT EXISTS piglet_care_notifications (
       id INT AUTO_INCREMENT PRIMARY KEY,
       schedule_id INT NOT NULL,
       litter_id VARCHAR(10) NOT NULL,
       task_id INT NOT NULL,
       notification_type ENUM('due_soon', 'due_today', 'overdue') NOT NULL,
       message TEXT NOT NULL,
       is_read BOOLEAN DEFAULT FALSE,
       read_by INT NULL,
       read_at TIMESTAMP NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (schedule_id) REFERENCES piglet_care_schedule(id) ON DELETE CASCADE,
       FOREIGN KEY (litter_id) REFERENCES litters(litter_id) ON DELETE CASCADE,
       FOREIGN KEY (task_id) REFERENCES piglet_care_tasks(id) ON DELETE CASCADE,
       FOREIGN KEY (read_by) REFERENCES employees(id),
       INDEX idx_notification_type (notification_type),
       INDEX idx_is_read (is_read),
       INDEX idx_created_at (created_at)
     );
   `;

   await connection.query(pigletCareTasksSQL);
   console.log('✅ Piglet care tasks table created or verified');

   await connection.query(pigletCareScheduleSQL);
   console.log('✅ Piglet care schedule table created or verified');

   await connection.query(pigletCareCompletionsSQL);
   console.log('✅ Piglet care completions table created or verified');

   await connection.query(pigletCareNotificationsSQL);
   console.log('✅ Piglet care notifications table created or verified');

   // Insert default piglet care tasks if they don't exist
   await insertDefaultPigletCareTasks(connection);
   
   // Create pig growth tracking tables
   await createPigGrowthTables(connection);
 };

 // Create pig growth tracking tables
 const insertDefaultPigletCareTasks = async (connection) => {
   const defaultTasks = [
     {
       task_name: 'Iron Injection',
       description: 'Prevent anemia in newborn piglets by administering iron supplement',
       min_age_days: 3,
       max_age_days: 7
     },
     {
       task_name: 'Tail Docking',
       description: 'Prevent tail biting in groups by docking tails',
       min_age_days: 3,
       max_age_days: 7
     },
     {
       task_name: 'Teeth Clipping',
       description: 'Prevent injury to sow and littermates by clipping needle teeth',
       min_age_days: 1,
       max_age_days: 3
     },
     {
       task_name: 'Castration',
       description: 'Castrate male piglets for meat production',
       min_age_days: 7,
       max_age_days: 14
     },
     {
       task_name: 'Ear Notching',
       description: 'Identify piglets with ear notches for tracking',
       min_age_days: 1,
       max_age_days: 7
     },
     {
       task_name: 'Vaccination',
       description: 'Administer first round of vaccinations',
       min_age_days: 14,
       max_age_days: 21
     }
   ];

   for (const task of defaultTasks) {
     try {
       await connection.query(`
         INSERT IGNORE INTO piglet_care_tasks (task_name, description, min_age_days, max_age_days)
         VALUES (?, ?, ?, ?)
       `, [task.task_name, task.description, task.min_age_days, task.max_age_days]);
     } catch (error) {
       console.log(`ℹ️ Task ${task.task_name} already exists or error occurred: ${error.message}`);
     }
   }
   console.log('✅ Default piglet care tasks inserted or verified');
 };

 // Create pig growth tracking tables
 const createPigGrowthTables = async (connection) => {
   // Pig growth stages definition table
   const pigGrowthStagesSQL = `
     CREATE TABLE IF NOT EXISTS pig_growth_stages (
       id INT AUTO_INCREMENT PRIMARY KEY,
       stage_name VARCHAR(100) NOT NULL UNIQUE,
       min_age_days INT NOT NULL,
       max_age_days INT NOT NULL,
       target_weight_min DECIMAL(5,2) NOT NULL,
       target_weight_max DECIMAL(5,2) NOT NULL,
       description TEXT NOT NULL,
       is_active BOOLEAN DEFAULT TRUE,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       INDEX idx_age_range (min_age_days, max_age_days),
       INDEX idx_weight_range (target_weight_min, target_weight_max)
     );
   `;

   // Pig weight measurements table
   const pigWeightMeasurementsSQL = `
     CREATE TABLE IF NOT EXISTS pig_weight_measurements (
       id INT AUTO_INCREMENT PRIMARY KEY,
       pig_id VARCHAR(10) NOT NULL,
       pig_type ENUM('grown', 'litter', 'batch') NOT NULL,
       measurement_date DATE NOT NULL,
       weight_kg DECIMAL(5,2) NOT NULL,
       age_days INT NOT NULL,
       growth_stage_id INT NULL,
       notes TEXT,
       measured_by INT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (pig_id) REFERENCES grown_pigs(pig_id) ON DELETE CASCADE,
       FOREIGN KEY (growth_stage_id) REFERENCES pig_growth_stages(id),
       FOREIGN KEY (measured_by) REFERENCES employees(id),
       INDEX idx_pig_id (pig_id),
       INDEX idx_measurement_date (measurement_date),
       INDEX idx_age_days (age_days)
     );
   `;

   // Pig growth schedule table - tracks when weight measurements are due
   const pigGrowthScheduleSQL = `
     CREATE TABLE IF NOT EXISTS pig_growth_schedule (
       id INT AUTO_INCREMENT PRIMARY KEY,
       pig_id VARCHAR(10) NOT NULL,
       pig_type ENUM('grown', 'litter', 'batch') NOT NULL,
       next_measurement_date DATE NOT NULL,
       measurement_interval_days INT DEFAULT 14,
       notification_sent BOOLEAN DEFAULT FALSE,
       notification_sent_date TIMESTAMP NULL,
       status ENUM('pending', 'due', 'overdue', 'completed') DEFAULT 'pending',
       notes TEXT,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       INDEX idx_next_measurement_date (next_measurement_date),
       INDEX idx_status (status),
       INDEX idx_pig_id (pig_id)
     );
   `;

   // Pig growth notifications table
   const pigGrowthNotificationsSQL = `
     CREATE TABLE IF NOT EXISTS pig_growth_notifications (
       id INT AUTO_INCREMENT PRIMARY KEY,
       schedule_id INT NOT NULL,
       pig_id VARCHAR(10) NOT NULL,
       pig_type ENUM('grown', 'litter', 'batch') NOT NULL,
       notification_type ENUM('measurement_due', 'overdue', 'growth_milestone') NOT NULL,
       message TEXT NOT NULL,
       is_read BOOLEAN DEFAULT FALSE,
       read_by INT NULL,
       read_at TIMESTAMP NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (schedule_id) REFERENCES pig_growth_schedule(id) ON DELETE CASCADE,
       FOREIGN KEY (read_by) REFERENCES employees(id),
       INDEX idx_notification_type (notification_type),
       INDEX idx_is_read (is_read),
       INDEX idx_created_at (created_at)
     );
   `;

   await connection.query(pigGrowthStagesSQL);
   console.log('✅ Pig growth stages table created or verified');

   await connection.query(pigWeightMeasurementsSQL);
   console.log('✅ Pig weight measurements table created or verified');

   await connection.query(pigGrowthScheduleSQL);
   console.log('✅ Pig growth schedule table created or verified');

   await connection.query(pigGrowthNotificationsSQL);
   console.log('✅ Pig growth notifications table created or verified');

   // Insert default pig growth stages
   await insertDefaultPigGrowthStages(connection);
 };

 // Insert default pig growth stages
 const insertDefaultPigGrowthStages = async (connection) => {
   const defaultStages = [
     {
       stage_name: 'Newborn',
       min_age_days: 0,
       max_age_days: 7,
       target_weight_min: 1.0,
       target_weight_max: 2.5,
       description: 'Newborn piglets, nursing from sow'
     },
     {
       stage_name: 'Nursing',
       min_age_days: 8,
       max_age_days: 28,
       target_weight_min: 2.5,
       target_weight_max: 8.0,
       description: 'Nursing piglets, starting to eat solid food'
     },
     {
       stage_name: 'Weaning',
       min_age_days: 29,
       max_age_days: 42,
       target_weight_min: 8.0,
       target_weight_max: 15.0,
       description: 'Weaning period, transition to solid feed'
     },
     {
       stage_name: 'Growing',
       min_age_days: 43,
       max_age_days: 90,
       target_weight_min: 15.0,
       target_weight_max: 45.0,
       description: 'Growing phase, rapid weight gain'
     },
     {
       stage_name: 'Finishing',
       min_age_days: 91,
       max_age_days: 180,
       target_weight_min: 45.0,
       target_weight_max: 120.0,
       description: 'Finishing phase, preparing for market'
     },
     {
       stage_name: 'Breeding',
       min_age_days: 181,
       max_age_days: 365,
       target_weight_min: 120.0,
       target_weight_max: 200.0,
       description: 'Breeding stock, mature pigs'
     }
   ];

   for (const stage of defaultStages) {
     try {
       await connection.query(`
         INSERT IGNORE INTO pig_growth_stages (stage_name, min_age_days, max_age_days, target_weight_min, target_weight_max, description)
         VALUES (?, ?, ?, ?, ?, ?)
       `, [stage.stage_name, stage.min_age_days, stage.max_age_days, stage.target_weight_min, stage.target_weight_max, stage.description]);
     } catch (error) {
       console.log(`ℹ️ Growth stage ${stage.stage_name} already exists or error occurred: ${error.message}`);
     }
   }
   console.log('✅ Default pig growth stages inserted or verified');
 };

 // Create breeding tables - UPDATED with litter_size column
 const createBreedingTables = async (connection) => {
 // Breeding records table with enhanced statuses and litter_size
 const breedingRecordsSQL = `
   CREATE TABLE IF NOT EXISTS breeding_records (
     id INT AUTO_INCREMENT PRIMARY KEY,
     sow_id VARCHAR(10) NOT NULL,
     boar_id VARCHAR(10) NOT NULL,
     breeding_date DATE NOT NULL,
     expected_farrowing_date DATE NOT NULL,
     boar_source ENUM('own_farm', 'neighboring_farm', 'breeding_center', 'artificial_insemination', 'purchased_service', 'exchange_program', 'other') DEFAULT 'own_farm',
     notes TEXT,
     breeding_status ENUM('bred', 'confirmed_pregnant', 'due_soon', 'overdue', 'farrowed', 'failed') DEFAULT 'bred',
     actual_farrowing_date DATE NULL,
     litter_size INT NULL,
     number_died INT DEFAULT 0,
     total_born INT DEFAULT 0,
     registered_by INT,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     FOREIGN KEY (registered_by) REFERENCES employees(id),
     INDEX idx_sow_id (sow_id),
     INDEX idx_boar_id (boar_id),
     INDEX idx_breeding_date (breeding_date),
     INDEX idx_expected_farrowing_date (expected_farrowing_date),
     INDEX idx_breeding_status (breeding_status)
   );
 `;

 // Breeding schedule/calendar table for tracking important dates
 const breedingScheduleSQL = `
   CREATE TABLE IF NOT EXISTS breeding_schedule (
     id INT AUTO_INCREMENT PRIMARY KEY,
     breeding_record_id INT NOT NULL,
     event_type ENUM('breeding', 'pregnancy_check', 'farrowing_due', 'weaning_due') NOT NULL,
     event_date DATE NOT NULL,
     event_status ENUM('scheduled', 'completed', 'missed', 'cancelled') DEFAULT 'scheduled',
     notes TEXT,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     FOREIGN KEY (breeding_record_id) REFERENCES breeding_records(id) ON DELETE CASCADE,
     INDEX idx_event_date (event_date),
     INDEX idx_event_type (event_type),
     INDEX idx_event_status (event_status)
   );
 `;

 // Breeding performance tracking table
 const breedingPerformanceSQL = `
   CREATE TABLE IF NOT EXISTS breeding_performance (
     id INT AUTO_INCREMENT PRIMARY KEY,
     sow_id VARCHAR(10) NOT NULL,
     boar_id VARCHAR(10) NOT NULL,
     breeding_record_id INT NOT NULL,
     conception_rate DECIMAL(5,2) DEFAULT 0.00,
     litter_size INT DEFAULT 0,
     weaning_weight DECIMAL(5,2) DEFAULT 0.00,
     piglet_survival_rate DECIMAL(5,2) DEFAULT 0.00,
     farrowing_interval_days INT DEFAULT 0,
     performance_score DECIMAL(5,2) DEFAULT 0.00,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     FOREIGN KEY (breeding_record_id) REFERENCES breeding_records(id) ON DELETE CASCADE,
     INDEX idx_sow_performance (sow_id),
     INDEX idx_boar_performance (boar_id),
     INDEX idx_performance_score (performance_score)
   );
 `;

 await connection.query(breedingRecordsSQL);
 console.log('✅ Breeding records table created or verified');

 await connection.query(breedingScheduleSQL);
 console.log('✅ Breeding schedule table created or verified');

 await connection.query(breedingPerformanceSQL);
 console.log('✅ Breeding performance table created or verified');

 // Create piglet care tables
 await createPigletCareTables(connection);

 // Check if we need to add litter_size column to existing breeding_records table
 try {
   const [columns] = await connection.query(`
     SELECT COLUMN_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'breeding_records' 
     AND COLUMN_NAME = 'litter_size'
   `);
   
   if (columns.length === 0) {
     console.log('🔄 Adding litter_size column to existing breeding_records table...');
     await connection.query(`
       ALTER TABLE breeding_records 
       ADD COLUMN litter_size INT NULL AFTER actual_farrowing_date
     `);
     console.log('✅ Added litter_size column to breeding_records');
   }
 } catch (error) {
   console.log('ℹ️ litter_size column already exists or migration not needed');
 }

 // Check if we need to add number_died column to existing breeding_records table
 try {
   const [columns] = await connection.query(`
     SELECT COLUMN_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'breeding_records' 
     AND COLUMN_NAME = 'number_died'
   `);
   
   if (columns.length === 0) {
     console.log('🔄 Adding number_died column to existing breeding_records table...');
     await connection.query(`
       ALTER TABLE breeding_records 
       ADD COLUMN number_died INT DEFAULT 0 AFTER litter_size
     `);
     console.log('✅ Added number_died column to breeding_records');
   }
 } catch (error) {
   console.log('ℹ️ number_died column already exists or migration not needed');
 }

 // Check if we need to add total_born column to existing breeding_records table
 try {
   const [columns] = await connection.query(`
     SELECT COLUMN_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'breeding_records' 
     AND COLUMN_NAME = 'total_born'
   `);
   
   if (columns.length === 0) {
     console.log('🔄 Adding total_born column to existing breeding_records table...');
     await connection.query(`
       ALTER TABLE breeding_records 
       ADD COLUMN total_born INT DEFAULT 0 AFTER number_died
     `);
     console.log('✅ Added total_born column to breeding_records');
   }
 } catch (error) {
   console.log('ℹ️ total_born column already exists or migration not needed');
 }

 // Check if we need to add due_soon and overdue to existing breeding_status enum
 try {
   const [result] = await connection.query(`
     SELECT COLUMN_TYPE 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'breeding_records' 
     AND COLUMN_NAME = 'breeding_status'
   `);
   
   if (result && result.COLUMN_TYPE && !result.COLUMN_TYPE.includes('due_soon')) {
     console.log('🔄 Updating breeding_status enum to include due_soon and overdue...');
     await connection.query(`
       ALTER TABLE breeding_records 
       MODIFY COLUMN breeding_status ENUM('bred', 'confirmed_pregnant', 'due_soon', 'overdue', 'farrowed', 'failed') DEFAULT 'bred'
     `);
     console.log('✅ Updated breeding_status enum with new values');
   }
 } catch (error) {
   console.log('ℹ️ breeding_status enum already up to date or migration not needed');
 }

 // Check and add age columns to existing tables
 try {
   console.log('🔄 Checking for age columns in existing tables...');
   
   // Check grown_pigs table
   const [grownPigsColumns] = await connection.query(`
     SELECT COLUMN_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'grown_pigs' 
     AND COLUMN_NAME IN ('age_in_days', 'age_in_weeks', 'age_in_months', 'age_formatted', 'age_category')
   `);
   
   if (grownPigsColumns.length < 5) {
     console.log('🔄 Adding age columns to existing grown_pigs table...');
     const ageColumns = [
       'ADD COLUMN age_in_days INT DEFAULT 0 AFTER birth_date',
       'ADD COLUMN age_in_weeks INT DEFAULT 0 AFTER age_in_days',
       'ADD COLUMN age_in_months INT DEFAULT 0 AFTER age_in_weeks',
       'ADD COLUMN age_formatted VARCHAR(50) DEFAULT "" AFTER age_in_months',
       'ADD COLUMN age_category ENUM("newborn", "young", "adolescent", "adult", "mature") DEFAULT "newborn" AFTER age_formatted'
     ];
     
     for (const column of ageColumns) {
       try {
         await connection.query(`ALTER TABLE grown_pigs ${column}`);
       } catch (colError) {
         if (colError.code !== 'ER_DUP_FIELDNAME') {
           console.log(`⚠️ Error adding column to grown_pigs: ${colError.message}`);
         }
       }
     }
     
     // Add index for age_category
     try {
       await connection.query(`CREATE INDEX idx_age_category ON grown_pigs(age_category)`);
     } catch (indexError) {
       if (indexError.code !== 'ER_DUP_KEYNAME') {
         console.log(`⚠️ Error adding age_category index: ${indexError.message}`);
       }
     }
     
     console.log('✅ Added age columns to grown_pigs table');
   }
   
   // Check litters table
   const [littersColumns] = await connection.query(`
     SELECT COLUMN_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'litters' 
     AND COLUMN_NAME IN ('age_in_days', 'age_in_weeks', 'age_in_months', 'age_formatted', 'age_category')
   `);
   
   if (littersColumns.length < 5) {
     console.log('🔄 Adding age columns to existing litters table...');
     const ageColumns = [
       'ADD COLUMN age_in_days INT DEFAULT 0 AFTER birth_date',
       'ADD COLUMN age_in_weeks INT DEFAULT 0 AFTER age_in_days',
       'ADD COLUMN age_in_months INT DEFAULT 0 AFTER age_in_weeks',
       'ADD COLUMN age_formatted VARCHAR(50) DEFAULT "" AFTER age_in_months',
       'ADD COLUMN age_category ENUM("newborn", "young", "adolescent", "adult", "mature") DEFAULT "newborn" AFTER age_formatted'
     ];
     
     for (const column of ageColumns) {
       try {
         await connection.query(`ALTER TABLE litters ${column}`);
       } catch (colError) {
         if (colError.code !== 'ER_DUP_FIELDNAME') {
           console.log(`⚠️ Error adding column to litters: ${colError.message}`);
         }
       }
     }
     
     // Add index for age_category
     try {
       await connection.query(`CREATE INDEX idx_age_category ON litters(age_category)`);
     } catch (indexError) {
       if (indexError.code !== 'ER_DUP_KEYNAME') {
         console.log(`⚠️ Error adding age_category index: ${indexError.message}`);
       }
     }
     
     console.log('✅ Added age columns to litters table');
   }
   
   // Check batches table
   const [batchesColumns] = await connection.query(`
     SELECT COLUMN_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'batches' 
     AND COLUMN_NAME IN ('age_in_days', 'age_in_weeks', 'age_in_months', 'age_formatted', 'age_category')
   `);
   
   if (batchesColumns.length < 5) {
     console.log('🔄 Adding age columns to existing batches table...');
     const ageColumns = [
       'ADD COLUMN age_in_days INT DEFAULT 0 AFTER average_birth_date',
       'ADD COLUMN age_in_weeks INT DEFAULT 0 AFTER age_in_days',
       'ADD COLUMN age_in_months INT DEFAULT 0 AFTER age_in_weeks',
       'ADD COLUMN age_formatted VARCHAR(50) DEFAULT "" AFTER age_in_months',
       'ADD COLUMN age_category ENUM("newborn", "young", "adolescent", "adult", "mature") DEFAULT "newborn" AFTER age_formatted'
     ];
     
     for (const column of ageColumns) {
       try {
         await connection.query(`ALTER TABLE batches ${column}`);
       } catch (colError) {
         if (colError.code !== 'ER_DUP_FIELDNAME') {
           console.log(`⚠️ Error adding column to batches: ${colError.message}`);
         }
       }
     }
     
     // Add index for age_category
     try {
       await connection.query(`CREATE INDEX idx_age_category ON batches(age_category)`);
     } catch (indexError) {
       if (indexError.code !== 'ER_DUP_KEYNAME') {
         console.log(`⚠️ Error adding age_category index: ${indexError.message}`);
       }
     }
     
     console.log('✅ Added age columns to batches table');
   }
   
   console.log('✅ Age columns migration completed');
 } catch (error) {
   console.log('⚠️ Error during age columns migration:', error.message);
 }
};

// Create audit tables
const createAuditTables = async (connection) => {
  try {
    console.log('🔄 Creating audit tables...');

    // Delete Requests Table
    const deleteRequestsSQL = `
      CREATE TABLE IF NOT EXISTS delete_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_id INT NOT NULL,
        item_type VARCHAR(50) NOT NULL,
        item_id VARCHAR(100) NOT NULL,
        item_details TEXT,
        reason TEXT NOT NULL,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        processed_by INT,
        processed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (requester_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (processed_by) REFERENCES employees(id) ON DELETE SET NULL,
        INDEX idx_status (status),
        INDEX idx_item_type (item_type),
        INDEX idx_created_at (created_at)
      );
    `;

    // Edit Changes Table
    const editChangesSQL = `
      CREATE TABLE IF NOT EXISTS edit_changes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        action ENUM('create', 'update', 'delete') NOT NULL,
        changes JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE,
        INDEX idx_entity_type (entity_type),
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      );
    `;

    // Audit Activities Table
    const auditActivitiesSQL = `
      CREATE TABLE IF NOT EXISTS audit_activities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        activity_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE,
        INDEX idx_activity_type (activity_type),
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      );
    `;

    await connection.query(deleteRequestsSQL);
    console.log('✅ delete_requests table created');

    await connection.query(editChangesSQL);
    console.log('✅ edit_changes table created');

    await connection.query(auditActivitiesSQL);
    console.log('✅ audit_activities table created');

    console.log('✅ Audit tables created successfully');
  } catch (error) {
    console.error('❌ Error creating audit tables:', error);
    throw error;
  }
};

// Create sample admin account
const createSampleAdmin = async (connection) => {
 try {
   const bcrypt = require('bcrypt');
   const hashedPassword = await bcrypt.hash('admin123', 10);
   
   const adminSQL = `
     INSERT IGNORE INTO employees (
       full_name, email, phone_number, id_number, employee_code, 
       password, role, status, department, position, salary
     ) VALUES (
       'System Administrator', 'admin@kwetufarm.co.ke', '0700000000', 
       '12345678', 'ADM001', ?, 'admin', 'active', 'IT', 'System Administrator', 100000.00
     )
   `;
   
   await connection.query(adminSQL, [hashedPassword]);
   console.log('✅ Sample admin account created or verified');
 } catch (error) {
   console.log('⚠️ Could not create sample admin:', error.message);
 }
};

// Health check function
const checkDatabaseHealth = async () => {
 try {
   const pool = createPool();
   const connection = await pool.getConnection();
   await connection.query('SELECT 1');
   connection.release();
   console.log('💚 Database health check: OK');
   return true;
 } catch (error) {
   console.error('❤️ Database health check: FAILED', error.message);
   return false;
 }
};

// Query helper function
const query = async (sql, params = []) => {
 const pool = createPool();
 try {
   const [results] = await pool.execute(sql, params);
   return results;
 } catch (error) {
   console.error('Database query error:', error);
   throw error;
 }
};

// Transaction helper function
const transaction = async (callback) => {
 const pool = createPool();
 const connection = await pool.getConnection();
 
 try {
   await connection.beginTransaction();
   const result = await callback(connection);
   await connection.commit();
   return result;
 } catch (error) {
   await connection.rollback();
   throw error;
 } finally {
   connection.release();
 }
};

// Close all connections
const closePool = async () => {
 if (pool) {
   await pool.end();
   pool = null;
   console.log('🔌 Database pool closed');
 }
};

// Age calculation helper functions
const formatAge = (days) => {
  if (days === 0) return 'Newborn';
  
  const months = Math.floor(days / 30);
  const weeks = Math.floor((days % 30) / 7);
  const remainingDays = days % 7;
  
  let result = '';
  if (months > 0) {
    result += `${months} month${months > 1 ? 's' : ''}`;
  }
  if (weeks > 0) {
    if (result) result += ' ';
    result += `${weeks} week${weeks > 1 ? 's' : ''}`;
  }
  if (remainingDays > 0 && months === 0) {
    if (result) result += ' ';
    result += `${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
  }
  
  return result || 'Newborn';
};

const getAgeCategory = (days) => {
  if (days <= 30) return 'newborn';
  if (days <= 90) return 'young';
  if (days <= 180) return 'adolescent';
  if (days <= 365) return 'adult';
  return 'mature';
};

// Function to update ages for all tables
const updateAllAges = async () => {
  try {
    console.log('🔄 Updating ages for all animals...');
    
    // Get all records and update them individually
    const grownPigs = await query('SELECT id, birth_date FROM grown_pigs WHERE birth_date IS NOT NULL');
    for (const pig of grownPigs) {
      const days = Math.floor((new Date() - new Date(pig.birth_date)) / (1000 * 60 * 60 * 24));
      await query(`
        UPDATE grown_pigs 
        SET 
          age_in_days = ?,
          age_in_weeks = FLOOR(? / 7),
          age_in_months = FLOOR(? / 30),
          age_formatted = ?,
          age_category = ?
        WHERE id = ?
      `, [days, days, days, formatAge(days), getAgeCategory(days), pig.id]);
    }
    
    const litters = await query('SELECT id, birth_date FROM litters WHERE birth_date IS NOT NULL');
    for (const litter of litters) {
      const days = Math.floor((new Date() - new Date(litter.birth_date)) / (1000 * 60 * 60 * 24));
      await query(`
        UPDATE litters 
        SET 
          age_in_days = ?,
          age_in_weeks = FLOOR(? / 7),
          age_in_months = FLOOR(? / 30),
          age_formatted = ?,
          age_category = ?
        WHERE id = ?
      `, [days, days, days, formatAge(days), getAgeCategory(days), litter.id]);
    }
    
    const batches = await query('SELECT id, average_birth_date FROM batches WHERE average_birth_date IS NOT NULL');
    for (const batch of batches) {
      const days = Math.floor((new Date() - new Date(batch.average_birth_date)) / (1000 * 60 * 60 * 24));
      await query(`
        UPDATE batches 
        SET 
          age_in_days = ?,
          age_in_weeks = FLOOR(? / 7),
          age_in_months = FLOOR(? / 30),
          age_formatted = ?,
          age_category = ?
        WHERE id = ?
      `, [days, days, days, formatAge(days), getAgeCategory(days), batch.id]);
    }
    
    console.log('✅ All ages updated successfully');
  } catch (error) {
    console.error('❌ Error updating ages:', error);
  }
};

// Function to update age for a specific record
const updateAgeForRecord = async (table, id, birthDateColumn = 'birth_date') => {
  try {
    const sql = `
      UPDATE ${table} 
      SET 
        age_in_days = DATEDIFF(CURDATE(), ${birthDateColumn}),
        age_in_weeks = FLOOR(DATEDIFF(CURDATE(), ${birthDateColumn}) / 7),
        age_in_months = FLOOR(DATEDIFF(CURDATE(), ${birthDateColumn}) / 30),
        age_formatted = ?,
        age_category = ?
      WHERE id = ?
    `;
    
    const days = await query(`SELECT DATEDIFF(CURDATE(), ${birthDateColumn}) as days FROM ${table} WHERE id = ?`, [id]);
    const ageInDays = days[0]?.days || 0;
    
    await query(sql, [formatAge(ageInDays), getAgeCategory(ageInDays), id]);
    console.log(`✅ Updated age for ${table} record ${id}`);
  } catch (error) {
    console.error(`❌ Error updating age for ${table} record ${id}:`, error);
 }
};

// Legacy compatibility - for backward compatibility with existing code
promisePool = {
 getConnection: getConnection,
 execute: async (sql, params) => {
   const pool = createPool();
   return await pool.execute(sql, params);
 },
 query: async (sql, params) => {
   const pool = createPool();
   return await pool.query(sql, params);
 }
};

module.exports = { 
 initializeDatabase, 
 checkDatabaseHealth, 
 getConnection, 
 query, 
 transaction,
 closePool,
 pool: createPool,
 promisePool,  // For backward compatibility
 formatAge,
 getAgeCategory,
 updateAllAges,
 updateAgeForRecord
};