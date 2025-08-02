// backend/routes/pigs.js
const express = require('express');
const { query, formatAge, getAgeCategory, updateAllAges, updateAgeForRecord } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

// Database health check endpoint (no auth required for testing)
router.get('/db-health', async (req, res) => {
  try {
    console.log('🔍 Checking database health...');
    
    // Test basic connection
    await query('SELECT 1 as test');
    console.log('✅ Basic database connection works');
    
    // Check if tables exist
    const tables = ['grown_pigs', 'litters', 'batches', 'employees'];
    const tableStatus = {};
    
    for (const table of tables) {
      try {
        await query(`SELECT 1 FROM ${table} LIMIT 1`);
        tableStatus[table] = 'exists';
        console.log(`✅ ${table} table exists`);
      } catch (error) {
        tableStatus[table] = 'missing';
        console.log(`❌ ${table} table missing:`, error.message);
      }
    }
    
    res.json({ 
      status: 'healthy', 
      tables: tableStatus, 
      message: 'Database health check completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error.message, 
      message: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Test endpoint to check if authentication is working
router.get('/test-auth', async (req, res) => {
  res.json({ 
    message: 'No auth required - this endpoint works without authentication',
    timestamp: new Date().toISOString()
  });
});

// Get next available IDs (temporarily removing auth for testing)
router.get('/next-ids', async (req, res) => {
  try {
    console.log('🔍 Starting next-ids request...');
    console.log('🔍 Request headers:', req.headers);
    console.log('🔍 Request method:', req.method);
    console.log('🔍 Request URL:', req.url);
    
    // First, check if tables exist
    try {
      await query('SELECT 1 FROM grown_pigs LIMIT 1');
      console.log('✅ grown_pigs table exists');
    } catch (tableError) {
      console.error('❌ grown_pigs table does not exist:', tableError.message);
      return res.status(500).json({ 
        message: 'Database tables not initialized. Please restart the server.',
        error: tableError.message 
      });
    }

    // Get next pig ID (P for new, E for edited)
    console.log('🔍 Querying database for pig IDs...');
    
    // First, let's see what's in the grown_pigs table
    const [allPigs] = await query('SELECT id, pig_id FROM grown_pigs ORDER BY id DESC LIMIT 10');
    console.log('📊 All pigs in database:', allPigs);
    
    const lastPigRows = await query('SELECT pig_id FROM grown_pigs WHERE pig_id LIKE "P%"');
    console.log('📊 Raw database result:', lastPigRows);
    console.log('🔍 Found pig IDs:', lastPigRows ? lastPigRows.map(row => row.pig_id) : []);
    
    let nextPigId = 'P001';
    if (lastPigRows && Array.isArray(lastPigRows) && lastPigRows.length > 0) {
      let maxNum = 0;
      for (const row of lastPigRows) {
        const num = parseInt(row.pig_id.substring(1));
        console.log(`📊 Parsing pig ID ${row.pig_id} -> number: ${num}`);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
      console.log(`🏆 Highest pig number found: ${maxNum}`);
      if (maxNum > 0) {
        nextPigId = `P${String(maxNum + 1).padStart(3, '0')}`;
      }
    } else if (lastPigRows && !Array.isArray(lastPigRows)) {
      // Handle single row case
      const num = parseInt(lastPigRows.pig_id.substring(1));
      console.log(`📊 Parsing single pig ID ${lastPigRows.pig_id} -> number: ${num}`);
      if (!isNaN(num) && num > 0) {
        nextPigId = `P${String(num + 1).padStart(3, '0')}`;
      }
    }
    console.log(`🎯 Next pig ID will be: ${nextPigId}`);

    // Get next litter ID (L for new, M for edited)
    const lastLitterRows = await query('SELECT litter_id FROM litters WHERE litter_id LIKE "L%"');
    let nextLitterId = 'L001';
    if (lastLitterRows && Array.isArray(lastLitterRows) && lastLitterRows.length > 0) {
      let maxNum = 0;
      for (const row of lastLitterRows) {
        const num = parseInt(row.litter_id.substring(1));
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
      if (maxNum > 0) {
        nextLitterId = `L${String(maxNum + 1).padStart(3, '0')}`;
      }
    } else if (lastLitterRows && !Array.isArray(lastLitterRows)) {
      // Handle single row case
      const num = parseInt(lastLitterRows.litter_id.substring(1));
      if (!isNaN(num) && num > 0) {
        nextLitterId = `L${String(num + 1).padStart(3, '0')}`;
      }
    }

    // Get next batch ID (B for new, C for edited)
    const lastBatchRows = await query('SELECT batch_id FROM batches WHERE batch_id LIKE "B%"');
    let nextBatchId = 'B001';
    if (lastBatchRows && Array.isArray(lastBatchRows) && lastBatchRows.length > 0) {
      let maxNum = 0;
      for (const row of lastBatchRows) {
        const num = parseInt(row.batch_id.substring(1));
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
      if (maxNum > 0) {
        nextBatchId = `B${String(maxNum + 1).padStart(3, '0')}`;
      }
    } else if (lastBatchRows && !Array.isArray(lastBatchRows)) {
      // Handle single row case
      const num = parseInt(lastBatchRows.batch_id.substring(1));
      if (!isNaN(num) && num > 0) {
        nextBatchId = `B${String(num + 1).padStart(3, '0')}`;
      }
    }

    const response = {
      nextPigId,
      nextLitterId,
      nextBatchId
    };
    
    console.log('✅ Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('❌ Error getting next IDs:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Failed to get next IDs',
      error: error.message,
      stack: error.stack
    });
  }
});

// NEW: Get all grown pigs with stored age data
router.get('/grown-pigs', authenticateToken, async (req, res) => {
  try {
    console.log('🐷 Fetching all grown pigs with stored age data...');
    
    const sql = `
      SELECT 
        id, pig_id, gender, breed, birth_date, weight, location, 
        health_status, health_reason, number_affected, breeding_status,
        current_breeding_record_id, is_purchased, purchase_date,
        registered_by, created_at, updated_at,
        age_in_days, age_in_weeks, age_in_months, age_formatted, age_category
      FROM grown_pigs 
      ORDER BY pig_id ASC
    `;

    const pigs = await query(sql);
    
    console.log(`✅ Found ${pigs.length} grown pigs with stored age data`);
    
    res.json(pigs);
  } catch (error) {
    console.error('Error fetching grown pigs:', error);
    res.status(500).json({ message: 'Failed to fetch grown pigs' });
  }
});

// NEW: Get all litters with stored age data
router.get('/litters', authenticateToken, async (req, res) => {
  try {
    console.log('🐷 Fetching all litters with stored age data...');
    
    const sql = `
      SELECT 
        id, litter_id, birth_date, sow_id, boar_id, total_born, 
        male_count, female_count, number_died, average_weight, 
        piglet_status, location, health_status, health_reason, 
        number_affected, registered_by, created_at, updated_at,
        age_in_days, age_in_weeks, age_in_months, age_formatted, age_category
      FROM litters 
      ORDER BY birth_date DESC
    `;

    const litters = await query(sql);
    
    console.log(`✅ Found ${litters.length} litters with stored age data`);
    
    res.json(litters);
  } catch (error) {
    console.error('Error fetching litters:', error);
    res.status(500).json({ message: 'Failed to fetch litters' });
  }
});

// NEW: Get all batches with stored age data
router.get('/batches', authenticateToken, async (req, res) => {
  try {
    console.log('🐷 Fetching all batches with stored age data...');
    
    const sql = `
      SELECT 
        id, batch_id, formation_date, average_birth_date, male_count,
        female_count, purpose, location, health_status, health_reason,
        number_affected, registered_by, created_at, updated_at,
        age_in_days, age_in_weeks, age_in_months, age_formatted, age_category
      FROM batches 
      ORDER BY formation_date DESC
    `;

    const batches = await query(sql);
    
    console.log(`✅ Found ${batches.length} batches with stored age data`);
    
    res.json(batches);
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({ message: 'Failed to fetch batches' });
  }
});

// NEW: Get animals by age range
router.get('/animals/age-range', authenticateToken, async (req, res) => {
  try {
    const { minDays, maxDays, type } = req.query;
    
    let table, idColumn, birthDateColumn;
    
    switch (type) {
      case 'grown':
        table = 'grown_pigs';
        idColumn = 'pig_id';
        birthDateColumn = 'birth_date';
        break;
      case 'litter':
        table = 'litters';
        idColumn = 'litter_id';
        birthDateColumn = 'birth_date';
        break;
      case 'batch':
        table = 'batches';
        idColumn = 'batch_id';
        birthDateColumn = 'average_birth_date';
        break;
      default:
        return res.status(400).json({ message: 'Invalid type. Use: grown, litter, or batch' });
    }
    
    const sql = `
      SELECT 
        *,
        DATEDIFF(CURDATE(), ${birthDateColumn}) as age_in_days,
        FLOOR(DATEDIFF(CURDATE(), ${birthDateColumn}) / 7) as age_in_weeks,
        FLOOR(DATEDIFF(CURDATE(), ${birthDateColumn}) / 30) as age_in_months
      FROM ${table}
      WHERE DATEDIFF(CURDATE(), ${birthDateColumn}) BETWEEN ? AND ?
      ORDER BY ${birthDateColumn} DESC
    `;
    
    const animals = await query(sql, [minDays || 0, maxDays || 9999]);
    
    // Add formatted age strings
    const animalsWithFormattedAge = animals.map(animal => ({
      ...animal,
      age_formatted: formatAge(animal.age_in_days),
      age_category: getAgeCategory(animal.age_in_days)
    }));
    
    res.json(animalsWithFormattedAge);
  } catch (error) {
    console.error('Error fetching animals by age range:', error);
    res.status(500).json({ message: 'Failed to fetch animals by age range' });
  }
});

// NEW: Update all ages in the database
router.post('/update-ages', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 Updating ages for all animals...');
    await updateAllAges();
    res.json({ message: 'All ages updated successfully' });
  } catch (error) {
    console.error('Error updating ages:', error);
    res.status(500).json({ message: 'Failed to update ages' });
  }
});

// NEW: Get comprehensive age statistics with detailed logging
router.get('/statistics/age', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Generating comprehensive age statistics...');
    
    // Get age statistics for grown pigs
    const [grownPigsAgeStats] = await query(`
      SELECT 
        COUNT(*) as total_count,
        AVG(DATEDIFF(CURDATE(), birth_date)) as avg_age_days,
        MIN(DATEDIFF(CURDATE(), birth_date)) as min_age_days,
        MAX(DATEDIFF(CURDATE(), birth_date)) as max_age_days
      FROM grown_pigs
    `);
    
    console.log('🐖 Grown Pigs Age Statistics:');
    console.log(`   - Total Count: ${grownPigsAgeStats.total_count}`);
    console.log(`   - Average Age: ${Math.round(grownPigsAgeStats.avg_age_days || 0)} days`);
    console.log(`   - Minimum Age: ${grownPigsAgeStats.min_age_days || 0} days`);
    console.log(`   - Maximum Age: ${grownPigsAgeStats.max_age_days || 0} days`);
    
    // Get age statistics for litters
    const [littersAgeStats] = await query(`
      SELECT 
        COUNT(*) as total_count,
        AVG(DATEDIFF(CURDATE(), birth_date)) as avg_age_days,
        MIN(DATEDIFF(CURDATE(), birth_date)) as min_age_days,
        MAX(DATEDIFF(CURDATE(), birth_date)) as max_age_days
      FROM litters
    `);
    
    console.log('🐷 Litters Age Statistics:');
    console.log(`   - Total Count: ${littersAgeStats.total_count}`);
    console.log(`   - Average Age: ${Math.round(littersAgeStats.avg_age_days || 0)} days`);
    console.log(`   - Minimum Age: ${littersAgeStats.min_age_days || 0} days`);
    console.log(`   - Maximum Age: ${littersAgeStats.max_age_days || 0} days`);
    
    // Get age statistics for batches
    const [batchesAgeStats] = await query(`
      SELECT 
        COUNT(*) as total_count,
        AVG(DATEDIFF(CURDATE(), average_birth_date)) as avg_age_days,
        MIN(DATEDIFF(CURDATE(), average_birth_date)) as min_age_days,
        MAX(DATEDIFF(CURDATE(), average_birth_date)) as max_age_days
      FROM batches
    `);
    
    console.log('📦 Batches Age Statistics:');
    console.log(`   - Total Count: ${batchesAgeStats.total_count}`);
    console.log(`   - Average Age: ${Math.round(batchesAgeStats.avg_age_days || 0)} days`);
    console.log(`   - Minimum Age: ${batchesAgeStats.min_age_days || 0} days`);
    console.log(`   - Maximum Age: ${batchesAgeStats.max_age_days || 0} days`);
    
    // Get age distribution for grown pigs
    const grownPigsAgeDistribution = await query(`
      SELECT 
        CASE 
          WHEN DATEDIFF(CURDATE(), birth_date) <= 30 THEN '0-30 days'
          WHEN DATEDIFF(CURDATE(), birth_date) <= 90 THEN '31-90 days'
          WHEN DATEDIFF(CURDATE(), birth_date) <= 180 THEN '91-180 days'
          WHEN DATEDIFF(CURDATE(), birth_date) <= 365 THEN '181-365 days'
          ELSE 'Over 1 year'
        END as age_range,
        COUNT(*) as count
      FROM grown_pigs
      GROUP BY age_range
      ORDER BY 
        CASE age_range
          WHEN '0-30 days' THEN 1
          WHEN '31-90 days' THEN 2
          WHEN '91-180 days' THEN 3
          WHEN '181-365 days' THEN 4
          ELSE 5
        END
    `);
    
    res.json({
      grownPigs: {
        ...grownPigsAgeStats,
        ageDistribution: grownPigsAgeDistribution
      },
      litters: littersAgeStats,
      batches: batchesAgeStats
    });
  } catch (error) {
    console.error('Error fetching age statistics:', error);
    res.status(500).json({ message: 'Failed to fetch age statistics' });
  }
});



// Validate and handle custom ID
const validateCustomId = async (customId, table, idColumn, excludeId = null) => {
  // Basic validation - ID should be alphanumeric and not empty
  if (!customId || !/^[A-Za-z0-9]+$/.test(customId)) {
    throw new Error('ID must contain only letters and numbers');
  }
  
  // Check if ID already exists (excluding current record if editing)
  let sql = `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = ?`;
  let params = [customId];
  
  if (excludeId) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }
  
  const [existing] = await query(sql, params);
  
  if (existing) {
    throw new Error(`${idColumn.replace('_', ' ')} ID already exists`);
  }
  
  return customId;
};

// Register grown pig
router.post('/grown-pig', authenticateToken, async (req, res) => {
  try {
    const {
      pigId, gender, breed, birthDate, weight, location,
      healthStatus, healthReason, numberAffected, isPurchased, purchaseDate
    } = req.body;

    // Use the provided pigId directly - frontend should handle ID conflicts
    const finalPigId = pigId;

    const sql = `
      INSERT INTO grown_pigs (
        pig_id, gender, breed, birth_date, weight, location,
        health_status, health_reason, number_affected, is_purchased, 
        purchase_date, registered_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await query(sql, [
      finalPigId, gender, breed, birthDate, weight, location,
      healthStatus, healthReason, numberAffected, isPurchased,
      purchaseDate, req.user.id
    ]);

    // Calculate and update age for the newly registered pig
    if (result.insertId) {
      await updateAgeForRecord('grown_pigs', result.insertId, 'birth_date');
    }

    res.status(201).json({ 
      message: 'Grown pig registered successfully',
      pigId: finalPigId
    });
  } catch (error) {
    console.error('Error registering grown pig:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ message: 'Pig ID already exists' });
    } else {
      res.status(500).json({ message: 'Failed to register grown pig' });
    }
  }
});

// Update grown pig
router.put('/grown-pig/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      pigId, gender, breed, birthDate, weight, location,
      healthStatus, healthReason, numberAffected, isPurchased, purchaseDate
    } = req.body;

    // Get the original pig data
    const [originalPig] = await query('SELECT pig_id FROM grown_pigs WHERE id = ?', [id]);
    if (!originalPig) {
      return res.status(404).json({ message: 'Grown pig not found' });
    }

    // Convert date format if needed (from ISO to yyyy-MM-dd)
    let formattedBirthDate = birthDate;
    if (birthDate && birthDate.includes('T')) {
      formattedBirthDate = birthDate.split('T')[0];
    }
    
    let formattedPurchaseDate = purchaseDate;
    if (purchaseDate && purchaseDate.includes('T')) {
      formattedPurchaseDate = purchaseDate.split('T')[0];
    }

    // Handle ID changes with full custom ID support
    let finalPigId = pigId;
    if (pigId !== originalPig.pig_id) {
      try {
        // Validate the custom ID
        finalPigId = await validateCustomId(pigId, 'grown_pigs', 'pig_id', id);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }

    // If pig ID is changing, use a transaction to handle foreign key updates
    if (finalPigId !== originalPig.pig_id) {
      const connection = await require('../config/database').getConnection();
      await connection.beginTransaction();
      
      try {
        // Temporarily disable foreign key checks
        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
        
        // First update the main grown pig record
        const updatePigSQL = `
          UPDATE grown_pigs SET
            pig_id = ?, gender = ?, breed = ?, birth_date = ?, weight = ?, location = ?,
            health_status = ?, health_reason = ?, number_affected = ?, 
            is_purchased = ?, purchase_date = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;

        await connection.execute(updatePigSQL, [
          finalPigId, gender, breed, formattedBirthDate, weight, location,
          healthStatus, healthReason, numberAffected, isPurchased,
          formattedPurchaseDate, id
        ]);

        // Now update all foreign key references
        await connection.execute('UPDATE litters SET sow_id = ? WHERE sow_id = ?', 
          [finalPigId, originalPig.pig_id]);
        await connection.execute('UPDATE litters SET boar_id = ? WHERE boar_id = ?', 
          [finalPigId, originalPig.pig_id]);
        
        await connection.execute('UPDATE pig_weight_measurements SET pig_id = ? WHERE pig_id = ?', 
          [finalPigId, originalPig.pig_id]);
        
        await connection.execute('UPDATE pig_growth_schedule SET pig_id = ? WHERE pig_id = ?', 
          [finalPigId, originalPig.pig_id]);
        
        await connection.execute('UPDATE pig_growth_notifications SET pig_id = ? WHERE pig_id = ?', 
          [finalPigId, originalPig.pig_id]);

        // Re-enable foreign key checks
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

        await connection.commit();
        connection.release();

        // Update age for the modified pig
        try {
          await updateAgeForRecord('grown_pigs', id, 'birth_date');
        } catch (ageError) {
          console.error('Warning: Failed to update age for grown pig:', ageError);
        }

        res.json({ 
          message: 'Grown pig updated successfully',
          newPigId: finalPigId
        });
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } else {
      // No ID change, just update normally
      const sql = `
        UPDATE grown_pigs SET
          pig_id = ?, gender = ?, breed = ?, birth_date = ?, weight = ?, location = ?,
          health_status = ?, health_reason = ?, number_affected = ?, 
          is_purchased = ?, purchase_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      const result = await query(sql, [
        finalPigId, gender, breed, formattedBirthDate, weight, location,
        healthStatus, healthReason, numberAffected, isPurchased,
        formattedPurchaseDate, id
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Grown pig not found' });
      }

      // Update age for the modified pig
      try {
        await updateAgeForRecord('grown_pigs', id, 'birth_date');
      } catch (ageError) {
        console.error('Warning: Failed to update age for grown pig:', ageError);
      }

      res.json({ 
        message: 'Grown pig updated successfully',
        newPigId: finalPigId
      });
    }
  } catch (error) {
    console.error('Error updating grown pig:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ message: 'Pig ID already exists' });
    } else {
      res.status(500).json({ message: 'Failed to update grown pig' });
    }
  }
});

// Request grown pig deletion
router.post('/grown-pig/delete-request/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ 
        message: 'Reason is required and must be at least 10 characters long' 
      });
    }

    // Check if pig exists
    const pigRows = await query('SELECT id, pig_id, breed, gender FROM grown_pigs WHERE id = ?', [id]);
    
    if (pigRows.length === 0) {
      return res.status(404).json({ message: 'Grown pig not found' });
    }

    const pig = pigRows[0];

    // Check if delete request already exists
    let existingRequests = [];
    try {
      existingRequests = await query(
        'SELECT id FROM delete_requests WHERE item_type = "pig" AND item_id = ? AND status = "pending"',
        [pig.pig_id]
      );
      console.log('Existing requests result:', existingRequests);
    } catch (error) {
      console.error('Error checking existing requests:', error);
      existingRequests = [];
    }

    if (existingRequests && existingRequests.length > 0) {
      return res.status(400).json({ 
        message: 'A delete request for this pig already exists and is pending approval' 
      });
    }

    // Create delete request
    const { createDeleteRequest } = require('../utils/auditLogger');
    const requestId = await createDeleteRequest(
      req.user.id,
      'pig',
      pig.pig_id,
      `Pig ${pig.pig_id} - ${pig.breed} ${pig.gender}`,
      reason.trim()
    );

    res.json({ 
      message: 'Delete request submitted successfully. Awaiting admin approval.',
      requestId,
      pig: {
        id: pig.id,
        pig_id: pig.pig_id,
        breed: pig.breed,
        gender: pig.gender
      }
    });

  } catch (error) {
    console.error('Error creating delete request:', error);
    res.status(500).json({ message: 'Failed to create delete request' });
  }
});

// Cancel delete request (for the requester)
router.post('/cancel-delete-request/:itemType/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;

    // Check if delete request exists and belongs to the current user
    const existingRequests = await query(
      'SELECT id, requester_id, status FROM delete_requests WHERE item_type = ? AND item_id = ? AND status = "pending"',
      [itemType, itemId]
    );

    if (existingRequests.length === 0) {
      return res.status(404).json({ 
        message: 'Delete request not found or already processed' 
      });
    }

    const request = existingRequests[0];

    // Only the requester can cancel their own request
    if (request.requester_id !== req.user.id) {
      return res.status(403).json({ 
        message: 'You can only cancel your own delete requests' 
      });
    }

    // Update the request status to cancelled
    await query(
      'UPDATE delete_requests SET status = "cancelled", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [request.id]
    );

    // Log the cancellation
    const { logActivity } = require('../utils/auditLogger');
    await logActivity(req.user.id, 'cancel_delete_request', `Cancelled delete request for ${itemType} ${itemId}`, {
      request_id: request.id,
      item_type: itemType,
      item_id: itemId
    });

    res.json({ 
      message: 'Delete request cancelled successfully',
      requestId: request.id
    });

  } catch (error) {
    console.error('Error cancelling delete request:', error);
    res.status(500).json({ message: 'Failed to cancel delete request' });
  }
});

// Delete grown pig (Direct deletion - only for admin)
router.delete('/grown-pig/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get pig details before deletion
    const pigRows = await query('SELECT id, pig_id, breed, gender FROM grown_pigs WHERE id = ?', [id]);
    
    if (pigRows.length === 0) {
      return res.status(404).json({ message: 'Grown pig not found' });
    }

    const pig = pigRows[0];

    const result = await query('DELETE FROM grown_pigs WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Grown pig not found' });
    }

    // Log the deletion
    const { logDelete } = require('../utils/auditLogger');
    await logDelete(req.user.id, 'pig', pig.pig_id, {
      pig_id: pig.pig_id,
      breed: pig.breed,
      gender: pig.gender,
      deleted_by: req.user.name
    });

    res.json({ message: 'Grown pig deleted successfully' });
  } catch (error) {
    console.error('Error deleting grown pig:', error);
    res.status(500).json({ message: 'Failed to delete grown pig' });
  }
});

// Register litter
router.post('/litter', authenticateToken, async (req, res) => {
  try {
    const {
      litterId, birthDate, sowId, boarId, totalBorn, maleCount,
      femaleCount, averageWeight, pigletStatus, location,
      healthStatus, healthReason, numberAffected
    } = req.body;

    // Use the provided litterId directly - frontend should handle ID conflicts
    const finalLitterId = litterId;

    const sql = `
      INSERT INTO litters (
        litter_id, birth_date, sow_id, boar_id, total_born, male_count,
        female_count, average_weight, piglet_status, location,
        health_status, health_reason, number_affected, registered_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await query(sql, [
      finalLitterId, birthDate, sowId, boarId, totalBorn, maleCount,
      femaleCount, averageWeight, pigletStatus, location,
      healthStatus, healthReason, numberAffected, req.user.id
    ]);

    // Calculate and update age for the newly registered litter
    if (result.insertId) {
      await updateAgeForRecord('litters', result.insertId, 'birth_date');
    }

    // Create piglet care schedule for the new litter
    try {
      await createPigletCareSchedule(litterId, birthDate);
    } catch (error) {
      console.error('Error creating piglet care schedule:', error);
      // Don't fail the litter registration if piglet care schedule creation fails
    }

    res.status(201).json({ 
      message: 'Litter registered successfully',
      litterId: finalLitterId
    });
  } catch (error) {
    console.error('Error registering litter:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ message: 'Litter ID already exists' });
    } else {
      res.status(500).json({ message: 'Failed to register litter' });
    }
  }
});

// Update litter
router.put('/litter/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      litterId, birthDate, sowId, boarId, totalBorn, maleCount,
      femaleCount, averageWeight, pigletStatus, location,
      healthStatus, healthReason, numberAffected
    } = req.body;

    // Get the original litter data
    const [originalLitter] = await query('SELECT litter_id FROM litters WHERE id = ?', [id]);
    if (!originalLitter) {
      return res.status(404).json({ message: 'Litter not found' });
    }

    // Convert date format if needed (from ISO to yyyy-MM-dd)
    let formattedBirthDate = birthDate;
    if (birthDate && birthDate.includes('T')) {
      formattedBirthDate = birthDate.split('T')[0];
    }

    // Handle ID changes with full custom ID support
    let finalLitterId = litterId;
    if (litterId !== originalLitter.litter_id) {
      try {
        // Validate the custom ID
        finalLitterId = await validateCustomId(litterId, 'litters', 'litter_id', id);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }

    // If litter ID is changing, use a transaction to handle foreign key updates
    if (finalLitterId !== originalLitter.litter_id) {
      const connection = await require('../config/database').getConnection();
      await connection.beginTransaction();
      
      try {
        // Temporarily disable foreign key checks
        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
        
        // First update the main litter record
        const updateLitterSQL = `
          UPDATE litters SET
            litter_id = ?, birth_date = ?, sow_id = ?, boar_id = ?, total_born = ?, male_count = ?,
            female_count = ?, average_weight = ?, piglet_status = ?, location = ?,
            health_status = ?, health_reason = ?, number_affected = ?, 
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;

        await connection.execute(updateLitterSQL, [
          finalLitterId, formattedBirthDate, sowId, boarId, totalBorn, maleCount,
          femaleCount, averageWeight, pigletStatus, location,
          healthStatus, healthReason, numberAffected, id
        ]);

        // Now update all foreign key references
        await connection.execute('UPDATE batch_piglets SET litter_id = ? WHERE litter_id = ?', 
          [finalLitterId, originalLitter.litter_id]);
        
        await connection.execute('UPDATE weaning_records SET litter_id = ? WHERE litter_id = ?', 
          [finalLitterId, originalLitter.litter_id]);
        
        await connection.execute('UPDATE individual_piglets SET litter_id = ? WHERE litter_id = ?', 
          [finalLitterId, originalLitter.litter_id]);
        
        await connection.execute('UPDATE piglet_care_schedule SET litter_id = ? WHERE litter_id = ?', 
          [finalLitterId, originalLitter.litter_id]);
        
        await connection.execute('UPDATE piglet_care_notifications SET litter_id = ? WHERE litter_id = ?', 
          [finalLitterId, originalLitter.litter_id]);
        
        await connection.execute('UPDATE piglet_care_completions SET litter_id = ? WHERE litter_id = ?', 
          [finalLitterId, originalLitter.litter_id]);

        // Re-enable foreign key checks
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

        await connection.commit();
        connection.release();

        // Update age for the modified litter
        try {
          await updateAgeForRecord('litters', id, 'birth_date');
        } catch (ageError) {
          console.error('Warning: Failed to update age for litter:', ageError);
        }

        res.json({ 
          message: 'Litter updated successfully',
          newLitterId: finalLitterId
        });
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } else {
      // No ID change, just update normally
      const sql = `
        UPDATE litters SET
          litter_id = ?, birth_date = ?, sow_id = ?, boar_id = ?, total_born = ?, male_count = ?,
          female_count = ?, average_weight = ?, piglet_status = ?, location = ?,
          health_status = ?, health_reason = ?, number_affected = ?, 
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      const result = await query(sql, [
        finalLitterId, formattedBirthDate, sowId, boarId, totalBorn, maleCount,
        femaleCount, averageWeight, pigletStatus, location,
        healthStatus, healthReason, numberAffected, id
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Litter not found' });
      }

      // Update age for the modified litter
      try {
        await updateAgeForRecord('litters', id, 'birth_date');
      } catch (ageError) {
        console.error('Warning: Failed to update age for litter:', ageError);
      }

      res.json({ 
        message: 'Litter updated successfully',
        newLitterId: finalLitterId
      });
    }
  } catch (error) {
    console.error('Error updating litter:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ message: 'Litter ID already exists' });
    } else {
      res.status(500).json({ message: 'Failed to update litter' });
    }
  }
});

// Request litter deletion
router.post('/litter/delete-request/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ 
        message: 'Reason is required and must be at least 10 characters long' 
      });
    }

    // Check if litter exists
    const litterRows = await query('SELECT id, litter_id FROM litters WHERE id = ?', [id]);
    
    if (litterRows.length === 0) {
      return res.status(404).json({ message: 'Litter not found' });
    }

    const litter = litterRows[0];

    // Check if delete request already exists
    let existingRequests = [];
    try {
      existingRequests = await query(
        'SELECT id FROM delete_requests WHERE item_type = "litter" AND item_id = ? AND status = "pending"',
        [litter.litter_id]
      );
      console.log('Existing litter requests result:', existingRequests);
    } catch (error) {
      console.error('Error checking existing litter requests:', error);
      existingRequests = [];
    }

    if (existingRequests && existingRequests.length > 0) {
      return res.status(400).json({ 
        message: 'A delete request for this litter already exists and is pending approval' 
      });
    }

    // Create delete request
    const { createDeleteRequest } = require('../utils/auditLogger');
    const requestId = await createDeleteRequest(
      req.user.id,
      'litter',
      litter.litter_id,
      `Litter ${litter.litter_id}`,
      reason.trim()
    );

    res.json({ 
      message: 'Delete request submitted successfully. Awaiting admin approval.',
      requestId,
      litter: {
        id: litter.id,
        litter_id: litter.litter_id
      }
    });

  } catch (error) {
    console.error('Error creating delete request:', error);
    res.status(500).json({ message: 'Failed to create delete request' });
  }
});

// Delete litter (Direct deletion - only for admin)
router.delete('/litter/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Start transaction
    const connection = await require('../config/database').getConnection();
    await connection.beginTransaction();

    try {
      // Get litter info first
      const [litterRows] = await connection.execute('SELECT litter_id FROM litters WHERE id = ?', [id]);
      
      if (!litterRows || litterRows.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ message: 'Litter not found' });
      }

      const litter = litterRows[0];

      // Delete related batch_piglets if any
      await connection.execute('DELETE FROM batch_piglets WHERE litter_id = ?', [litter.litter_id]);

      // Delete the litter
      await connection.execute('DELETE FROM litters WHERE id = ?', [id]);

      await connection.commit();
      connection.release();

      // Log the deletion
      const { logDelete } = require('../utils/auditLogger');
      await logDelete(req.user.id, 'litter', litter.litter_id, {
        litter_id: litter.litter_id,
        deleted_by: req.user.name
      });

      res.json({ message: 'Litter and related data deleted successfully' });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting litter:', error);
    res.status(500).json({ message: 'Failed to delete litter' });
  }
});

// Create batch
router.post('/batch', authenticateToken, async (req, res) => {
  try {
    const {
      batchId, formationDate, selectedPiglets, averageBirthDate,
      maleCount, femaleCount, purpose, location,
      healthStatus, healthReason, numberAffected, manualPiglets
    } = req.body;

    // Use the provided batchId directly - frontend should handle ID conflicts
    const finalBatchId = batchId;

    // Start transaction
    const connection = await require('../config/database').getConnection();
    await connection.beginTransaction();

    try {
      // Insert batch
      const batchSQL = `
        INSERT INTO batches (
          batch_id, formation_date, average_birth_date, male_count,
          female_count, purpose, location, health_status, health_reason,
          number_affected, registered_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await connection.execute(batchSQL, [
        finalBatchId, formationDate, averageBirthDate, maleCount,
        femaleCount, purpose, location, healthStatus, healthReason,
        numberAffected, req.user.id
      ]);

      // Insert batch piglets and update their status to 'batched'
      for (const pigletId of selectedPiglets) {
        const litterId = pigletId.startsWith('M') ? 'Manual' : pigletId.split('-')[0];
        
        const pigletSQL = `
          INSERT INTO batch_piglets (batch_id, piglet_id, litter_id)
          VALUES (?, ?, ?)
        `;
        await connection.execute(pigletSQL, [finalBatchId, pigletId, litterId]);

        // Update litter status to 'batched' if from litter (not manual)
        if (!pigletId.startsWith('M')) {
          const updateLitterSQL = `
            UPDATE litters SET piglet_status = 'batched' 
            WHERE litter_id = ?
          `;
          await connection.execute(updateLitterSQL, [litterId]);
        }
      }

      // Save manual piglets if any
      if (manualPiglets && manualPiglets.length > 0) {
        // Create manual_piglets table if it doesn't exist
        const createManualPigletsTable = `
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
          )
        `;
        await connection.execute(createManualPigletsTable);

        const manualPigletSQL = `
          INSERT INTO manual_piglets (
            piglet_id, batch_id, gender, birth_date, location, registered_by
          ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        for (const piglet of manualPiglets) {
          if (selectedPiglets.includes(piglet.id)) {
            // Validate manual piglet birth date is not in the future
            if (piglet.birthDate && new Date(piglet.birthDate) > new Date()) {
              throw new Error(`Manual piglet ${piglet.id} birth date cannot be in the future`);
            }
            
            await connection.execute(manualPigletSQL, [
              piglet.id, finalBatchId, piglet.gender, piglet.birthDate, 
              piglet.location, req.user.id
            ]);
          }
        }
      }

      await connection.commit();
      connection.release();

      // Calculate and update age for the newly created batch
      const [batchResult] = await query('SELECT id FROM batches WHERE batch_id = ?', [finalBatchId]);
      if (batchResult) {
        await updateAgeForRecord('batches', batchResult.id, 'average_birth_date');
      }

      res.status(201).json({ 
        message: 'Batch created successfully',
        batchId: finalBatchId
      });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('Error creating batch:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ message: 'Batch ID already exists' });
    } else {
      res.status(500).json({ message: 'Failed to create batch' });
    }
  }
});

// Update batch
router.put('/batch/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      batchId, formationDate, averageBirthDate, purpose, location,
      healthStatus, healthReason, numberAffected
   } = req.body;

       // Get the original batch data
    const [originalBatch] = await query('SELECT batch_id FROM batches WHERE id = ?', [id]);
    if (!originalBatch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    // Convert date format if needed (from ISO to yyyy-MM-dd)
    let formattedFormationDate = formationDate;
    if (formationDate && formationDate.includes('T')) {
      formattedFormationDate = formationDate.split('T')[0];
    }
    
    let formattedAverageBirthDate = averageBirthDate;
    if (averageBirthDate && averageBirthDate.includes('T')) {
      formattedAverageBirthDate = averageBirthDate.split('T')[0];
    }

   // Handle ID changes with full custom ID support
   let finalBatchId = batchId;
   if (batchId !== originalBatch.batch_id) {
     try {
       // Validate the custom ID
       finalBatchId = await validateCustomId(batchId, 'batches', 'batch_id', id);
     } catch (error) {
       return res.status(400).json({ message: error.message });
     }
   }

       // If batch ID is changing, use a transaction to handle foreign key updates
    if (finalBatchId !== originalBatch.batch_id) {
      const connection = await require('../config/database').getConnection();
      await connection.beginTransaction();
      
      try {
        // Temporarily disable foreign key checks
        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
        
        // First update the main batch record
        const updateBatchSQL = `
          UPDATE batches SET
            batch_id = ?, formation_date = ?, average_birth_date = ?, purpose = ?, location = ?,
            health_status = ?, health_reason = ?, number_affected = ?, 
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;

        await connection.execute(updateBatchSQL, [
          finalBatchId, formattedFormationDate, formattedAverageBirthDate, purpose, location,
          healthStatus, healthReason, numberAffected, id
        ]);

        // Now update all foreign key references
        await connection.execute('UPDATE batch_piglets SET batch_id = ? WHERE batch_id = ?', 
          [finalBatchId, originalBatch.batch_id]);
        
        await connection.execute('UPDATE manual_piglets SET batch_id = ? WHERE batch_id = ?', 
          [finalBatchId, originalBatch.batch_id]);
        
        await connection.execute('UPDATE individual_piglets SET batch_id = ? WHERE batch_id = ?', 
          [finalBatchId, originalBatch.batch_id]);
        
        await connection.execute('UPDATE batch_care_schedule SET batch_id = ? WHERE batch_id = ?', 
          [finalBatchId, originalBatch.batch_id]);
        
        await connection.execute('UPDATE batch_care_completions SET batch_id = ? WHERE batch_id = ?', 
          [finalBatchId, originalBatch.batch_id]);

        // Re-enable foreign key checks
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

        await connection.commit();
        connection.release();

       // Update age for the modified batch
       try {
         await updateAgeForRecord('batches', id, 'average_birth_date');
       } catch (ageError) {
         console.error('Warning: Failed to update age for batch:', ageError);
       }

       res.json({ 
         message: 'Batch updated successfully',
         newBatchId: finalBatchId
       });
     } catch (error) {
       await connection.rollback();
       connection.release();
       throw error;
     }
   } else {
     // No ID change, just update normally
     const sql = `
       UPDATE batches SET
         batch_id = ?, formation_date = ?, average_birth_date = ?, purpose = ?, location = ?,
         health_status = ?, health_reason = ?, number_affected = ?, 
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
     `;

     const result = await query(sql, [
       finalBatchId, formattedFormationDate, formattedAverageBirthDate, purpose, location,
       healthStatus, healthReason, numberAffected, id
     ]);

     if (result.affectedRows === 0) {
       return res.status(404).json({ message: 'Batch not found' });
     }

     // Update age for the modified batch
     try {
       await updateAgeForRecord('batches', id, 'average_birth_date');
     } catch (ageError) {
       console.error('Warning: Failed to update age for batch:', ageError);
     }

     res.json({ 
       message: 'Batch updated successfully',
       newBatchId: finalBatchId
     });
   }
 } catch (error) {
   console.error('Error updating batch:', error);
   if (error.code === 'ER_DUP_ENTRY') {
     res.status(400).json({ message: 'Batch ID already exists' });
   } else {
     res.status(500).json({ message: 'Failed to update batch' });
   }
 }
});

// Request batch deletion
router.post('/batch/delete-request/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ 
        message: 'Reason is required and must be at least 10 characters long' 
      });
    }

    // Check if batch exists
    const batchRows = await query('SELECT id, batch_id FROM batches WHERE id = ?', [id]);
    
    if (batchRows.length === 0) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const batch = batchRows[0];

    // Check if delete request already exists
    let existingRequests = [];
    try {
      existingRequests = await query(
        'SELECT id FROM delete_requests WHERE item_type = "batch" AND item_id = ? AND status = "pending"',
        [batch.batch_id]
      );
      console.log('Existing batch requests result:', existingRequests);
    } catch (error) {
      console.error('Error checking existing batch requests:', error);
      existingRequests = [];
    }

    if (existingRequests && existingRequests.length > 0) {
      return res.status(400).json({ 
        message: 'A delete request for this batch already exists and is pending approval' 
      });
    }

    // Create delete request
    const { createDeleteRequest } = require('../utils/auditLogger');
    const requestId = await createDeleteRequest(
      req.user.id,
      'batch',
      batch.batch_id,
      `Batch ${batch.batch_id}`,
      reason.trim()
    );

    res.json({ 
      message: 'Delete request submitted successfully. Awaiting admin approval.',
      requestId,
      batch: {
        id: batch.id,
        batch_id: batch.batch_id
      }
    });

  } catch (error) {
    console.error('Error creating delete request:', error);
    res.status(500).json({ message: 'Failed to create delete request' });
  }
});

// Delete batch (Direct deletion - only for admin)
router.delete('/batch/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
 try {
   const { id } = req.params;

   // Start transaction
   const connection = await require('../config/database').getConnection();
   await connection.beginTransaction();

   try {
     // Get batch info first
     const [batchRows] = await connection.execute('SELECT batch_id FROM batches WHERE id = ?', [id]);
     
     if (!batchRows || batchRows.length === 0) {
       await connection.rollback();
       connection.release();
       return res.status(404).json({ message: 'Batch not found' });
     }

     const batch = batchRows[0];

     // Get all piglets in this batch to update litter statuses
     const piglets = await connection.execute('SELECT piglet_id, litter_id FROM batch_piglets WHERE batch_id = ?', [batch.batch_id]);

     // Update litter statuses back to previous state (assuming 'weaning')
     for (const piglet of piglets[0]) {
       if (piglet.litter_id !== 'Manual') {
         await connection.execute('UPDATE litters SET piglet_status = ? WHERE litter_id = ?', ['weaning', piglet.litter_id]);
       }
     }

     // Delete related records
     await connection.execute('DELETE FROM manual_piglets WHERE batch_id = ?', [batch.batch_id]);
     await connection.execute('DELETE FROM batch_piglets WHERE batch_id = ?', [batch.batch_id]);
     await connection.execute('DELETE FROM batches WHERE id = ?', [id]);

     await connection.commit();
     connection.release();

     // Log the deletion
     const { logDelete } = require('../utils/auditLogger');
     await logDelete(req.user.id, 'batch', batch.batch_id, {
       batch_id: batch.batch_id,
       deleted_by: req.user.name
     });

     res.json({ message: 'Batch and related data deleted successfully' });
   } catch (error) {
     await connection.rollback();
     connection.release();
     throw error;
   }
 } catch (error) {
   console.error('Error deleting batch:', error);
   res.status(500).json({ message: 'Failed to delete batch' });
 }
});

// Get available piglets for batching with age calculation
router.get('/available-piglets', authenticateToken, async (req, res) => {
 try {
   const sql = `
     SELECT l.litter_id, l.birth_date, l.total_born, l.male_count, 
            l.female_count, l.piglet_status, l.location,
            DATEDIFF(CURDATE(), l.birth_date) as age_in_days,
            FLOOR(DATEDIFF(CURDATE(), l.birth_date) / 7) as age_in_weeks,
            FLOOR(DATEDIFF(CURDATE(), l.birth_date) / 30) as age_in_months
     FROM litters l
     WHERE l.piglet_status != 'batched'
     ORDER BY l.birth_date DESC
   `;

   const litters = await query(sql);
   
   // Generate piglet list with age data
   const piglets = [];
   litters.forEach(litter => {
     for (let i = 0; i < litter.total_born; i++) {
       const gender = i < litter.male_count ? 'male' : 'female';
       piglets.push({
         id: `${litter.litter_id}-${String(i + 1).padStart(2, '0')}`,
         litterId: litter.litter_id,
         gender: gender,
         birthDate: litter.birth_date,
         status: litter.piglet_status,
         location: litter.location,
         age_in_days: litter.age_in_days,
         age_in_weeks: litter.age_in_weeks,
         age_in_months: litter.age_in_months,
         age_formatted: formatAge(litter.age_in_days),
         age_category: getAgeCategory(litter.age_in_days)
       });
     }
   });

   res.json(piglets);
 } catch (error) {
   console.error('Error getting available piglets:', error);
   res.status(500).json({ message: 'Failed to get available piglets' });
 }
});

// Get registration statistics
router.get('/statistics', authenticateToken, async (req, res) => {
 try {
   const [grownPigsCount] = await query('SELECT COUNT(*) as count FROM grown_pigs');
   const [littersCount] = await query('SELECT COUNT(*) as count FROM litters');
   const [batchesCount] = await query('SELECT COUNT(*) as count FROM batches');
   
   // Count available piglets (excluding batched ones)
   const [availablePigletsCount] = await query(`
     SELECT SUM(total_born) as count 
     FROM litters 
     WHERE piglet_status != 'batched'
   `);
   
   // Count total piglets (including batched ones)
   const [totalPigletsCount] = await query('SELECT SUM(total_born) as count FROM litters');

   res.json({
     grownPigs: grownPigsCount.count,
     litters: littersCount.count,
     batches: batchesCount.count,
     availablePiglets: availablePigletsCount.count || 0,
     totalPiglets: totalPigletsCount.count || 0
   });
 } catch (error) {
   console.error('Error getting statistics:', error);
   res.status(500).json({ message: 'Failed to get statistics' });
 }
});


// Get recent registrations with calculated age data
router.get('/recent/:type', async (req, res) => {
 try {
   const { type } = req.params;
   let sql;

   switch (type) {
     case 'grown':
       sql = `
         SELECT 
           *,
           DATEDIFF(CURDATE(), birth_date) as age_in_days,
           FLOOR(DATEDIFF(CURDATE(), birth_date) / 7) as age_in_weeks,
           FLOOR(DATEDIFF(CURDATE(), birth_date) / 30) as age_in_months
         FROM grown_pigs 
         ORDER BY created_at DESC 
         LIMIT 10
       `;
       break;
     case 'litter':
       sql = `
         SELECT 
           *,
           DATEDIFF(CURDATE(), birth_date) as age_in_days,
           FLOOR(DATEDIFF(CURDATE(), birth_date) / 7) as age_in_weeks,
           FLOOR(DATEDIFF(CURDATE(), birth_date) / 30) as age_in_months
         FROM litters 
         ORDER BY created_at DESC 
         LIMIT 10
       `;
       break;
     case 'batch':
       sql = `
         SELECT 
           *,
           DATEDIFF(CURDATE(), average_birth_date) as age_in_days,
           FLOOR(DATEDIFF(CURDATE(), average_birth_date) / 7) as age_in_weeks,
           FLOOR(DATEDIFF(CURDATE(), average_birth_date) / 30) as age_in_months
         FROM batches 
         ORDER BY created_at DESC 
         LIMIT 10
       `;
       break;
     default:
       return res.status(400).json({ message: 'Invalid type' });
   }

   const results = await query(sql);
   
   // Add formatted age and age category to each result
   const resultsWithAge = results.map(item => {
     const ageInDays = item.age_in_days || 0;
     return {
       ...item,
       age_formatted: formatAge(ageInDays),
       age_category: getAgeCategory(ageInDays)
     };
   });
   
   console.log(`✅ Found ${resultsWithAge.length} recent ${type} records with calculated age data`);
   
   res.json(resultsWithAge);
 } catch (error) {
   console.error('Error getting recent registrations:', error);
   res.status(500).json({ message: 'Failed to get recent registrations' });
 }
});

// Get batch details with piglets
router.get('/batch/:batchId', authenticateToken, async (req, res) => {
 try {
   const { batchId } = req.params;

   // Get batch information
   const [batch] = await query('SELECT * FROM batches WHERE batch_id = ?', [batchId]);
   
   if (!batch) {
     return res.status(404).json({ message: 'Batch not found' });
   }

   // Get batch piglets
   const piglets = await query(`
     SELECT bp.piglet_id, bp.litter_id, l.birth_date, l.location
     FROM batch_piglets bp
     LEFT JOIN litters l ON bp.litter_id = l.litter_id
     WHERE bp.batch_id = ?
   `, [batchId]);

   // Get manual piglets if any
   const manualPiglets = await query(`
     SELECT piglet_id, gender, birth_date, location
     FROM manual_piglets
     WHERE batch_id = ?
   `, [batchId]);

   res.json({
     batch,
     piglets,
     manualPiglets
   });
 } catch (error) {
   console.error('Error getting batch details:', error);
   res.status(500).json({ message: 'Failed to get batch details' });
 }
});

// Update litter status
router.put('/litter/:litterId/status', authenticateToken, async (req, res) => {
 try {
   const { litterId } = req.params;
   const { status } = req.body;

   const validStatuses = ['farrowed', 'breastfeeding', 'castrated', 'weaning', 'batched'];
   
   if (!validStatuses.includes(status)) {
     return res.status(400).json({ message: 'Invalid status' });
   }

   const sql = 'UPDATE litters SET piglet_status = ? WHERE litter_id = ?';
   const result = await query(sql, [status, litterId]);

   if (result.affectedRows === 0) {
     return res.status(404).json({ message: 'Litter not found' });
   }

   res.json({ message: 'Litter status updated successfully' });
 } catch (error) {
   console.error('Error updating litter status:', error);
   res.status(500).json({ message: 'Failed to update litter status' });
 }
});

// Get litters by status
router.get('/litters/status/:status', authenticateToken, async (req, res) => {
 try {
   const { status } = req.params;
   
   const sql = `
     SELECT * FROM litters 
     WHERE piglet_status = ? 
     ORDER BY birth_date DESC
   `;
   
   const litters = await query(sql, [status]);
   res.json(litters);
 } catch (error) {
   console.error('Error getting litters by status:', error);
   res.status(500).json({ message: 'Failed to get litters by status' });
 }
});

// Get detailed statistics with breakdown
router.get('/statistics/detailed', authenticateToken, async (req, res) => {
 try {
   // Basic counts
   const [grownPigsCount] = await query('SELECT COUNT(*) as count FROM grown_pigs');
   const [littersCount] = await query('SELECT COUNT(*) as count FROM litters');
   const [batchesCount] = await query('SELECT COUNT(*) as count FROM batches');
   
   // Piglet status breakdown
   const pigletStatusBreakdown = await query(`
     SELECT piglet_status, COUNT(*) as count, SUM(total_born) as total_piglets
     FROM litters 
     GROUP BY piglet_status
   `);
   
   // Health status breakdown
   const healthBreakdown = await query(`
     SELECT 
       'grown_pigs' as type,
       health_status,
       COUNT(*) as count
     FROM grown_pigs
     GROUP BY health_status
     UNION ALL
     SELECT 
       'litters' as type,
       health_status,
       COUNT(*) as count
     FROM litters
     GROUP BY health_status
     UNION ALL
     SELECT 
       'batches' as type,
       health_status,
       COUNT(*) as count
     FROM batches
     GROUP BY health_status
   `);

   // Location breakdown
   const locationBreakdown = await query(`
     SELECT 
       'grown_pigs' as type,
       location,
       COUNT(*) as count
     FROM grown_pigs
     GROUP BY location
     UNION ALL
     SELECT 
       'litters' as type,
       location,
       COUNT(*) as count
     FROM litters
     GROUP BY location
     UNION ALL
     SELECT 
       'batches' as type,
       location,
       COUNT(*) as count
     FROM batches
     GROUP BY location
   `);

   res.json({
     basic: {
       grownPigs: grownPigsCount.count,
       litters: littersCount.count,
       batches: batchesCount.count
     },
     pigletStatus: pigletStatusBreakdown,
     healthStatus: healthBreakdown,
     locationBreakdown: locationBreakdown
   });
 } catch (error) {
   console.error('Error getting detailed statistics:', error);
   res.status(500).json({ message: 'Failed to get detailed statistics' });
 }
});

// NEW: Comprehensive age logging endpoint
router.get('/age-log', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 ========================================');
    console.log('📊 COMPREHENSIVE AGE CALCULATION LOG');
    console.log('🔍 ========================================');
    console.log(`📅 Current Date: ${new Date().toISOString().split('T')[0]}`);
    console.log('🔍 ========================================');
    
    // Get all grown pigs with age calculation
    console.log('\n🐖 GROWN PIGS AGE CALCULATIONS:');
    console.log('----------------------------------------');
    const [grownPigs] = await query(`
      SELECT 
        pig_id, birth_date, weight, location, health_status,
        DATEDIFF(CURDATE(), birth_date) as age_in_days,
        FLOOR(DATEDIFF(CURDATE(), birth_date) / 7) as age_in_weeks,
        FLOOR(DATEDIFF(CURDATE(), birth_date) / 30) as age_in_months
      FROM grown_pigs 
      ORDER BY pig_id ASC
    `);
    
    if (grownPigs.length === 0) {
      console.log('   No grown pigs found in database');
    } else {
      grownPigs.forEach(pig => {
        const formattedAge = formatAge(pig.age_in_days);
        const ageCategory = getAgeCategory(pig.age_in_days);
        console.log(`   🐖 ${pig.pig_id}:`);
        console.log(`      📅 Birth: ${pig.birth_date} | Age: ${formattedAge} (${pig.age_in_days} days)`);
        console.log(`      🏷️ Category: ${ageCategory} | 📍 Location: ${pig.location}`);
        console.log(`      ⚖️ Weight: ${pig.weight}kg | 💚 Health: ${pig.health_status}`);
      });
    }
    
    // Get all litters with age calculation
    console.log('\n🐷 LITTERS AGE CALCULATIONS:');
    console.log('----------------------------------------');
    const [litters] = await query(`
      SELECT 
        litter_id, birth_date, total_born, male_count, female_count,
        average_weight, location, health_status,
        DATEDIFF(CURDATE(), birth_date) as age_in_days,
        FLOOR(DATEDIFF(CURDATE(), birth_date) / 7) as age_in_weeks,
        FLOOR(DATEDIFF(CURDATE(), birth_date) / 30) as age_in_months
      FROM litters 
      ORDER BY birth_date DESC
    `);
    
    if (litters.length === 0) {
      console.log('   No litters found in database');
    } else {
      litters.forEach(litter => {
        const formattedAge = formatAge(litter.age_in_days);
        const ageCategory = getAgeCategory(litter.age_in_days);
        console.log(`   🐷 ${litter.litter_id}:`);
        console.log(`      📅 Birth: ${litter.birth_date} | Age: ${formattedAge} (${litter.age_in_days} days)`);
        console.log(`      🏷️ Category: ${ageCategory} | 📍 Location: ${litter.location}`);
        console.log(`      🐖 Piglets: ${litter.total_born} (${litter.male_count}♂ ${litter.female_count}♀)`);
        console.log(`      ⚖️ Avg Weight: ${litter.average_weight}kg | 💚 Health: ${litter.health_status}`);
      });
    }
    
    // Get all batches with age calculation
    console.log('\n📦 BATCHES AGE CALCULATIONS:');
    console.log('----------------------------------------');
    const [batches] = await query(`
      SELECT 
        batch_id, average_birth_date, male_count, female_count,
        purpose, location, health_status,
        DATEDIFF(CURDATE(), average_birth_date) as age_in_days,
        FLOOR(DATEDIFF(CURDATE(), average_birth_date) / 7) as age_in_weeks,
        FLOOR(DATEDIFF(CURDATE(), average_birth_date) / 30) as age_in_months
      FROM batches 
      ORDER BY formation_date DESC
    `);
    
    if (batches.length === 0) {
      console.log('   No batches found in database');
    } else {
      batches.forEach(batch => {
        const formattedAge = formatAge(batch.age_in_days);
        const ageCategory = getAgeCategory(batch.age_in_days);
        console.log(`   📦 ${batch.batch_id}:`);
        console.log(`      📅 Avg Birth: ${batch.average_birth_date} | Age: ${formattedAge} (${batch.age_in_days} days)`);
        console.log(`      🏷️ Category: ${ageCategory} | 📍 Location: ${batch.location}`);
        console.log(`      🐖 Total: ${batch.male_count + batch.female_count} (${batch.male_count}♂ ${batch.female_count}♀)`);
        console.log(`      🎯 Purpose: ${batch.purpose} | 💚 Health: ${batch.health_status}`);
      });
    }
    
    // Summary statistics
    console.log('\n📈 AGE SUMMARY STATISTICS:');
    console.log('----------------------------------------');
    
    const totalGrownPigs = grownPigs.length;
    const totalLitters = litters.length;
    const totalBatches = batches.length;
    
    console.log(`🐖 Grown Pigs: ${totalGrownPigs}`);
    console.log(`🐷 Litters: ${totalLitters}`);
    console.log(`📦 Batches: ${totalBatches}`);
    console.log(`📊 Total Animals: ${totalGrownPigs + totalLitters + totalBatches}`);
    
    // Age category breakdown
    const allAnimals = [
      ...grownPigs.map(p => ({ type: 'grown', age: p.age_in_days, category: getAgeCategory(p.age_in_days) })),
      ...litters.map(l => ({ type: 'litter', age: l.age_in_days, category: getAgeCategory(l.age_in_days) })),
      ...batches.map(b => ({ type: 'batch', age: b.age_in_days, category: getAgeCategory(b.age_in_days) }))
    ];
    
    const newborn = allAnimals.filter(a => a.category === 'newborn').length;
    const young = allAnimals.filter(a => a.category === 'young').length;
    const adolescent = allAnimals.filter(a => a.category === 'adolescent').length;
    const adult = allAnimals.filter(a => a.category === 'adult').length;
    const mature = allAnimals.filter(a => a.category === 'mature').length;
    
    console.log('\n🏷️ Age Category Distribution:');
    console.log(`   👶 Newborn (0-30 days): ${newborn}`);
    console.log(`   🐣 Young (31-90 days): ${young}`);
    console.log(`   🐷 Adolescent (91-180 days): ${adolescent}`);
    console.log(`   🐖 Adult (181-365 days): ${adult}`);
    console.log(`   🐗 Mature (1+ years): ${mature}`);
    
    console.log('\n🔍 ========================================');
    console.log('✅ AGE CALCULATION LOG COMPLETED');
    console.log('🔍 ========================================');
    
    res.json({
      message: 'Age calculation log completed. Check server console for detailed output.',
      summary: {
        totalAnimals: totalGrownPigs + totalLitters + totalBatches,
        grownPigs: totalGrownPigs,
        litters: totalLitters,
        batches: totalBatches,
        ageDistribution: { newborn, young, adolescent, adult, mature }
      }
    });
    
  } catch (error) {
    console.error('Error generating age log:', error);
    res.status(500).json({ message: 'Failed to generate age log' });
  }
});

// Function to create piglet care schedule for a new litter
const createPigletCareSchedule = async (litterId, birthDate) => {
  try {
    // Get all active piglet care tasks
    const tasks = await query('SELECT * FROM piglet_care_tasks WHERE is_active = TRUE');
    
    // Create schedule entries for each task
    for (const task of tasks) {
      const dueDate = new Date(birthDate);
      dueDate.setDate(dueDate.getDate() + task.min_age_days);
      
      try {
        await query(`
          INSERT INTO piglet_care_schedule (litter_id, task_id, due_date)
          VALUES (?, ?, ?)
        `, [litterId, task.id, dueDate.toISOString().split('T')[0]]);
        
        console.log(`✅ Created schedule for ${task.task_name} for litter ${litterId} due on ${dueDate.toISOString().split('T')[0]}`);
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') {
          console.error(`Error creating schedule for task ${task.task_name}:`, error);
        }
      }
    }
    
    console.log(`✅ Piglet care schedule created for litter ${litterId}`);
  } catch (error) {
    console.error(`❌ Error creating piglet care schedule for litter ${litterId}:`, error);
    throw error;
  }
};

// Update location for grown pigs with comprehensive tracking
router.put('/grown-pigs/:pigId/location', authenticateToken, async (req, res) => {
  try {
    const { pigId } = req.params;
    const { oldLocation, newLocation, reason, notes, changedBy, changedAt } = req.body;

    console.log(`📍 Updating location for grown pig ${pigId}: ${oldLocation} → ${newLocation}`);

    // First, get the current pig data
    const [currentPig] = await query('SELECT * FROM grown_pigs WHERE pig_id = ?', [pigId]);
    
    if (!currentPig) {
      return res.status(404).json({ message: 'Pig not found' });
    }

    // Update the pig's location
    await query(`
      UPDATE grown_pigs 
      SET location = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE pig_id = ?
    `, [newLocation, pigId]);

    // Log the location change
    await query(`
      INSERT INTO pig_location_history (
        pig_id, pig_type, old_location, new_location, reason, notes, 
        changed_by, changed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [pigId, 'grown', oldLocation, newLocation, reason, notes, changedBy, changedAt]);

    console.log(`✅ Location updated for grown pig ${pigId}`);
    
    res.json({ 
      message: 'Location updated successfully',
      pigId,
      oldLocation,
      newLocation,
      reason,
      changedBy,
      changedAt
    });

  } catch (error) {
    console.error('Error updating grown pig location:', error);
    res.status(500).json({ message: 'Failed to update location' });
  }
});

// Update location for litters with comprehensive tracking
router.put('/litters/:litterId/location', authenticateToken, async (req, res) => {
  try {
    const { litterId } = req.params;
    const { oldLocation, newLocation, reason, notes, changedBy, changedAt } = req.body;

    console.log(`📍 Updating location for litter ${litterId}: ${oldLocation} → ${newLocation}`);

    // First, get the current litter data
    const [currentLitter] = await query('SELECT * FROM litters WHERE litter_id = ?', [litterId]);
    
    if (!currentLitter) {
      return res.status(404).json({ message: 'Litter not found' });
    }

    // Update the litter's location
    await query(`
      UPDATE litters 
      SET location = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE litter_id = ?
    `, [newLocation, litterId]);

    // Log the location change
    await query(`
      INSERT INTO pig_location_history (
        pig_id, pig_type, old_location, new_location, reason, notes, 
        changed_by, changed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [litterId, 'litter', oldLocation, newLocation, reason, notes, changedBy, changedAt]);

    console.log(`✅ Location updated for litter ${litterId}`);
    
    res.json({ 
      message: 'Location updated successfully',
      litterId,
      oldLocation,
      newLocation,
      reason,
      changedBy,
      changedAt
    });

  } catch (error) {
    console.error('Error updating litter location:', error);
    res.status(500).json({ message: 'Failed to update location' });
  }
});

// Update location for batches with comprehensive tracking
router.put('/batches/:batchId/location', authenticateToken, async (req, res) => {
  try {
    const { batchId } = req.params;
    const { oldLocation, newLocation, reason, notes, changedBy, changedAt } = req.body;

    console.log(`📍 Updating location for batch ${batchId}: ${oldLocation} → ${newLocation}`);

    // First, get the current batch data
    const [currentBatch] = await query('SELECT * FROM batches WHERE batch_id = ?', [batchId]);
    
    if (!currentBatch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    // Update the batch's location
    await query(`
      UPDATE batches 
      SET location = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE batch_id = ?
    `, [newLocation, batchId]);

    // Log the location change
    await query(`
      INSERT INTO pig_location_history (
        pig_id, pig_type, old_location, new_location, reason, notes, 
        changed_by, changed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [batchId, 'batch', oldLocation, newLocation, reason, notes, changedBy, changedAt]);

    console.log(`✅ Location updated for batch ${batchId}`);
    
    res.json({ 
      message: 'Location updated successfully',
      batchId,
      oldLocation,
      newLocation,
      reason,
      changedBy,
      changedAt
    });

  } catch (error) {
    console.error('Error updating batch location:', error);
    res.status(500).json({ message: 'Failed to update location' });
  }
});

// Get location history for any pig type
router.get('/location-history/:pigId', authenticateToken, async (req, res) => {
  try {
    const { pigId } = req.params;

    const history = await query(`
      SELECT * FROM pig_location_history 
      WHERE pig_id = ? 
      ORDER BY created_at DESC
    `, [pigId]);

    res.json(history);

  } catch (error) {
    console.error('Error fetching location history:', error);
    res.status(500).json({ message: 'Failed to fetch location history' });
  }
});

// Get all location changes (for admin/reporting)
router.get('/location-history', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, pigType, reason } = req.query;

    let sql = 'SELECT * FROM pig_location_history WHERE 1=1';
    const params = [];

    if (pigType) {
      sql += ' AND pig_type = ?';
      params.push(pigType);
    }

    if (reason) {
      sql += ' AND reason = ?';
      params.push(reason);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const history = await query(sql, params);

    res.json(history);

  } catch (error) {
    console.error('Error fetching location history:', error);
    res.status(500).json({ message: 'Failed to fetch location history' });
  }
});

// Search pigs across all pig types
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const searchTerm = `%${q.trim()}%`;
    
    // Search in grown pigs
    const grownPigs = await query(`
      SELECT 
        pig_id as id,
        pig_id as animal_id,
        CONCAT('Pig ', pig_id) as name,
        'grown' as type,
        'pigs' as animal_type,
        age_formatted as age,
        location,
        health_status as status,
        weight,
        gender
      FROM grown_pigs 
      WHERE pig_id LIKE ? OR location LIKE ?
      ORDER BY pig_id
      LIMIT 10
    `, [searchTerm, searchTerm]);

    // Search in litters
    const litters = await query(`
      SELECT 
        litter_id as id,
        litter_id as animal_id,
        CONCAT('Litter ', litter_id) as name,
        'litter' as type,
        'pigs' as animal_type,
        age_formatted as age,
        location,
        health_status as status,
        total_born as count,
        'litter' as gender
      FROM litters 
      WHERE litter_id LIKE ? OR location LIKE ?
      ORDER BY litter_id
      LIMIT 10
    `, [searchTerm, searchTerm]);

    // Search in batches
    const batches = await query(`
      SELECT 
        batch_id as id,
        batch_id as animal_id,
        CONCAT('Batch ', batch_id) as name,
        'batch' as type,
        'pigs' as animal_type,
        age_formatted as age,
        location,
        health_status as status,
        (male_count + female_count) as count,
        'batch' as gender
      FROM batches 
      WHERE batch_id LIKE ? OR location LIKE ?
      ORDER BY batch_id
      LIMIT 10
    `, [searchTerm, searchTerm]);

    // Combine and limit results
    const allResults = [...grownPigs, ...litters, ...batches].slice(0, 15);
    
    res.json({ 
      success: true, 
      data: allResults 
    });
  } catch (error) {
    console.error('Error searching pigs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to search pigs',
      error: error.message 
    });
  }
});

// Get all available farms in the system
router.get('/farms', authenticateToken, async (req, res) => {
  try {
    console.log('🏠 Fetching all available farms...');

    // Get unique farms from all pig types
    const sql = `
      SELECT DISTINCT location as farm_name, location as farm_id
      FROM (
        SELECT location FROM grown_pigs WHERE location IS NOT NULL AND location != ''
        UNION
        SELECT location FROM litters WHERE location IS NOT NULL AND location != ''
        UNION
        SELECT location FROM batches WHERE location IS NOT NULL AND location != ''
      ) as all_locations
      WHERE location IS NOT NULL AND location != ''
      ORDER BY location ASC
    `;

    const farms = await query(sql);
    
    console.log(`✅ Found ${farms.length} unique farms in the system`);
    
    res.json(farms);
  } catch (error) {
    console.error('Error fetching farms:', error);
    res.status(500).json({ message: 'Failed to fetch farms' });
  }
});

module.exports = router;