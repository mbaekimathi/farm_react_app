const fs = require('fs');
const path = require('path');
const { getConnection } = require('./config/database');

async function setupAuditTables() {
  const connection = await getConnection();
  
  try {
    console.log('Setting up audit tables...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'config', 'audit_tables.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await connection.execute(statement);
          console.log('✅ Executed:', statement.substring(0, 50) + '...');
        } catch (error) {
          if (error.code === 'ER_TABLE_EXISTS_ERROR') {
            console.log('⚠️  Table already exists, skipping...');
          } else {
            console.error('❌ Error executing statement:', error.message);
          }
        }
      }
    }
    
    console.log('✅ Audit tables setup completed!');
    
  } catch (error) {
    console.error('❌ Error setting up audit tables:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

// Run the setup
setupAuditTables(); 