const mysql = require('mysql2/promise');
require('dotenv').config();

const setupDatabase = async () => {
  let connection;
  
  try {
    console.log('🔄 Setting up database...');
    
    // Connect to MySQL without specifying database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    console.log('✅ Connected to MySQL server');

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'kwetu_farm';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✅ Database '${dbName}' created or already exists`);

    // Use the database
    await connection.query(`USE \`${dbName}\``);

    // Create employees table
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

    // Create pig_expected_weights table
    const createExpectedWeightsTableSQL = `
      CREATE TABLE IF NOT EXISTS pig_expected_weights (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pig_id VARCHAR(50) NOT NULL,
        age_days INT NOT NULL,
        expected_weight_kg DECIMAL(8, 2) NOT NULL,
        created_by INT,
        updated_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_pig_age (pig_id, age_days),
        FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL
      );
    `;

    await connection.query(createExpectedWeightsTableSQL);
    console.log('✅ Pig expected weights table created or verified');

    // Create pig_growth_stages table
    const createGrowthStagesTableSQL = `
      CREATE TABLE IF NOT EXISTS pig_growth_stages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stage_name VARCHAR(50) NOT NULL,
        min_age_days INT NOT NULL,
        max_age_days INT NOT NULL,
        target_weight_min DECIMAL(8, 2),
        target_weight_max DECIMAL(8, 2),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;

    await connection.query(createGrowthStagesTableSQL);
    console.log('✅ Pig growth stages table created or verified');

    // Create pig_weight_measurements table
    const createWeightMeasurementsTableSQL = `
      CREATE TABLE IF NOT EXISTS pig_weight_measurements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pig_id VARCHAR(50) NOT NULL,
        pig_type ENUM('grown', 'litter', 'batch') DEFAULT 'grown',
        measurement_date DATE NOT NULL,
        weight_kg DECIMAL(8, 2) NOT NULL,
        age_days INT,
        growth_stage_id INT,
        notes TEXT,
        measured_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (growth_stage_id) REFERENCES pig_growth_stages(id) ON DELETE SET NULL,
        FOREIGN KEY (measured_by) REFERENCES employees(id) ON DELETE SET NULL
      );
    `;

    await connection.query(createWeightMeasurementsTableSQL);
    console.log('✅ Pig weight measurements table created or verified');

    // Create pig_growth_schedule table
    const createGrowthScheduleTableSQL = `
      CREATE TABLE IF NOT EXISTS pig_growth_schedule (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pig_id VARCHAR(50) NOT NULL,
        pig_type ENUM('grown', 'litter', 'batch') DEFAULT 'grown',
        next_measurement_date DATE NOT NULL,
        measurement_interval_days INT DEFAULT 14,
        status ENUM('pending', 'due', 'overdue', 'completed') DEFAULT 'pending',
        notification_sent BOOLEAN DEFAULT FALSE,
        notification_sent_date TIMESTAMP NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;

    await connection.query(createGrowthScheduleTableSQL);
    console.log('✅ Pig growth schedule table created or verified');

    // Create pig_growth_notifications table
    const createGrowthNotificationsTableSQL = `
      CREATE TABLE IF NOT EXISTS pig_growth_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        schedule_id INT,
        pig_id VARCHAR(50) NOT NULL,
        pig_type ENUM('grown', 'litter', 'batch') DEFAULT 'grown',
        notification_type ENUM('measurement_due', 'overdue', 'reminder') DEFAULT 'measurement_due',
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        read_by INT,
        read_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (schedule_id) REFERENCES pig_growth_schedule(id) ON DELETE CASCADE,
        FOREIGN KEY (read_by) REFERENCES employees(id) ON DELETE SET NULL
      );
    `;

    await connection.query(createGrowthNotificationsTableSQL);
    console.log('✅ Pig growth notifications table created or verified');

    // Create weaning records table
    const createWeaningRecordsTableSQL = `
      CREATE TABLE IF NOT EXISTS weaning_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        litter_id VARCHAR(50) NOT NULL,
        weaning_date DATE NOT NULL,
        piglets_weaned INT DEFAULT 0,
        average_weight DECIMAL(5,2) DEFAULT 0.00,
        notes TEXT,
        weaned_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (litter_id) REFERENCES litters(litter_id) ON DELETE CASCADE,
        FOREIGN KEY (weaned_by) REFERENCES employees(id) ON DELETE SET NULL
      );
    `;

    await connection.query(createWeaningRecordsTableSQL);
    console.log('✅ Weaning records table created or verified');

    // Create individual_piglets table
    const createIndividualPigletsTableSQL = `
      CREATE TABLE IF NOT EXISTS individual_piglets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        piglet_id VARCHAR(20) UNIQUE NOT NULL,
        litter_id VARCHAR(20),
        batch_id VARCHAR(20),
        birth_date DATE NOT NULL,
        gender ENUM('male', 'female') NOT NULL,
        weight_at_birth DECIMAL(4,2),
        current_weight DECIMAL(5,2),
        status ENUM('healthy', 'sick', 'deceased', 'weaned') DEFAULT 'healthy',
        notes TEXT,
        registered_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (litter_id) REFERENCES litters(litter_id) ON DELETE SET NULL,
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE SET NULL,
        FOREIGN KEY (registered_by) REFERENCES employees(id) ON DELETE SET NULL
      );
    `;

    await connection.query(createIndividualPigletsTableSQL);
    console.log('✅ Individual piglets table created or verified');

    // Create batch_care_schedule table
    const createBatchCareScheduleTableSQL = `
      CREATE TABLE IF NOT EXISTS batch_care_schedule (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(20) NOT NULL,
        task_id INT NOT NULL,
        due_date DATE NOT NULL,
        status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES piglet_care_tasks(id) ON DELETE CASCADE
      );
    `;

    await connection.query(createBatchCareScheduleTableSQL);
    console.log('✅ Batch care schedule table created or verified');

    // Create batch_care_completions table
    const createBatchCareCompletionsTableSQL = `
      CREATE TABLE IF NOT EXISTS batch_care_completions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        schedule_id INT NOT NULL,
        batch_id VARCHAR(20) NOT NULL,
        task_id INT NOT NULL,
        completed_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_by INT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (schedule_id) REFERENCES batch_care_schedule(id) ON DELETE CASCADE,
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES piglet_care_tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (completed_by) REFERENCES employees(id) ON DELETE SET NULL
      );
    `;

    await connection.query(createBatchCareCompletionsTableSQL);
    console.log('✅ Batch care completions table created or verified');

    // Create pig location history table
    const createLocationHistoryTableSQL = `
      CREATE TABLE IF NOT EXISTS pig_location_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pig_id VARCHAR(50) NOT NULL,
        pig_type ENUM('grown', 'litter', 'batch') NOT NULL,
        old_location VARCHAR(100),
        new_location VARCHAR(100) NOT NULL,
        reason VARCHAR(200) NOT NULL,
        notes TEXT,
        changed_by VARCHAR(100) NOT NULL,
        changed_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pig_id (pig_id),
        INDEX idx_pig_type (pig_type),
        INDEX idx_changed_at (changed_at),
        INDEX idx_reason (reason)
      );
    `;

    await connection.query(createLocationHistoryTableSQL);
    console.log('✅ Pig location history table created or verified');

    // Insert default growth stages if they don't exist
    const insertGrowthStagesSQL = `
      INSERT IGNORE INTO pig_growth_stages (stage_name, min_age_days, max_age_days, target_weight_min, target_weight_max) VALUES
      ('piglet', 0, 56, 0, 16.8),
      ('weaner', 57, 84, 16.8, 30.8),
      ('grower', 85, 140, 30.8, 75.6),
      ('finisher', 141, 168, 75.6, 109.2),
      ('market', 169, 9999, 109.2, 200.0);
    `;

    await connection.query(insertGrowthStagesSQL);
    console.log('✅ Default growth stages inserted or verified');

    // Create indexes with error handling
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

    // Verify table structure
    const [tableInfo] = await connection.query('DESCRIBE employees');
    console.log(`✅ Employees table has ${tableInfo.length} columns`);

    // Count existing records
    const [countResult] = await connection.query('SELECT COUNT(*) as count FROM employees');
    const recordCount = countResult[0].count;
    console.log(`📊 Database contains ${recordCount} employee record(s)`);

    console.log('🎉 Database setup completed successfully!');
    console.log('📝 Database is ready for employee registrations');

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    
    // Provide specific error guidance
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 MySQL server is not running. Please start MySQL service.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Access denied. Please check your MySQL credentials in .env file.');
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 MySQL host not found. Please check DB_HOST in .env file.');
    }
    
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
};

// Additional utility function to check database health
const checkDatabaseHealth = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kwetu_farm'
    });

    await connection.query('SELECT 1');
    console.log('💚 Database health check: OK');
    return true;
  } catch (error) {
    console.error('❤️ Database health check: FAILED', error.message);
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

module.exports = { setupDatabase, checkDatabaseHealth };