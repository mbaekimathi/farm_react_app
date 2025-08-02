// backend/routes/breeding.js - FIXED with better litter ID generation and dead count display

const express = require('express');
const { query, getConnection, formatAge, getAgeCategory, updateAllAges, updateAgeForRecord } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const auditLogger = require('../utils/auditLogger');
const router = express.Router();

// Get all grown pigs from the database - UPDATED to include breeding_status and age calculation
router.get('/grown-pigs', authenticateToken, async (req, res) => {
  try {
    console.log('🐷 Fetching all grown pigs with age calculation...');
    
    const sql = `
      SELECT 
        pig_id, gender, breed, birth_date, weight, location, 
        health_status, breeding_status, current_breeding_record_id, created_at,
        age_in_days, age_in_weeks, age_in_months, age_formatted, age_category
      FROM grown_pigs 
      ORDER BY pig_id ASC
    `;

    const pigs = await query(sql);
    
    console.log(`✅ Found ${pigs.length} grown pigs with age data for breeding`);
    
    res.json(pigs);
  } catch (error) {
    console.error('Error fetching grown pigs:', error);
    res.status(500).json({ message: 'Failed to fetch grown pigs' });
  }
});



// UPDATED: Get all breeding records with separated status groups
router.get('/records', authenticateToken, async (req, res) => {
  try {
    console.log('📋 Fetching breeding records...');
    
    const sql = `
      SELECT 
        br.*,
        DATEDIFF(br.expected_farrowing_date, CURDATE()) as days_left_to_farrowing,
        sow.breed as sow_breed,
        sow.weight as sow_weight,
        sow.breeding_status as sow_breeding_status,
        boar.breed as boar_breed,
        boar.weight as boar_weight
      FROM breeding_records br
      LEFT JOIN grown_pigs sow ON br.sow_id = sow.pig_id
      LEFT JOIN grown_pigs boar ON br.boar_id = boar.pig_id
      ORDER BY 
        CASE 
          WHEN sow.breeding_status = 'pregnant' THEN 1
          WHEN sow.breeding_status = 'farrowed' THEN 2
          WHEN sow.breeding_status = 'weaning' THEN 3
          ELSE 4
        END,
        br.breeding_date DESC
    `;

    const records = await query(sql);
    
    console.log(`✅ Found ${records.length} breeding records`);
    res.json(records);
  } catch (error) {
    console.error('Error fetching breeding records:', error);
    res.status(500).json({ message: 'Failed to fetch breeding records' });
  }
});

// FIXED: Get next litter ID with better generation logic
router.get('/next-litter-id', authenticateToken, async (req, res) => {
  try {
    console.log('🔢 Generating next litter ID...');
    
    // Get the latest litter ID with more robust query
    const latestLitters = await query(`
      SELECT litter_id 
      FROM litters 
      WHERE litter_id REGEXP '^LT[0-9]+$'
      ORDER BY 
        CAST(SUBSTRING(litter_id, 3) AS UNSIGNED) DESC,
        created_at DESC
      LIMIT 5
    `);

    let nextNumber = 1;
    if (latestLitters && latestLitters.length > 0) {
      // Get the highest number from the latest litters
      const numbers = latestLitters.map(litter => {
        const match = litter.litter_id.match(/^LT(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      });
      nextNumber = Math.max(...numbers) + 1;
    }

    // Generate the next litter ID with zero padding
    let nextLitterId;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      nextLitterId = `LT${(nextNumber + attempts).toString().padStart(3, '0')}`;
      
      // Check if this ID already exists
      const [existingLitter] = await query('SELECT litter_id FROM litters WHERE litter_id = ?', [nextLitterId]);
      
      if (!existingLitter) {
        break; // ID is unique, use it
      }
      
      attempts++;
    } while (attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      // Fallback: generate with timestamp
      const timestamp = Date.now().toString().slice(-3);
      nextLitterId = `LT${nextNumber}${timestamp}`;
    }
    
    console.log(`✅ Next litter ID: ${nextLitterId}`);
    res.json({ nextLitterId });
  } catch (error) {
    console.error('Error generating next litter ID:', error);
    // Fallback response
    const fallbackId = `LT${Date.now().toString().slice(-3)}`;
    res.json({ nextLitterId: fallbackId });
  }
});

// Create new breeding record
router.post('/records', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      sowId, boarId, breedingDate, expectedFarrowingDate, boarSource, notes
    } = req.body;

    console.log('📝 Creating new breeding record:', { sowId, boarId, breedingDate });

    // Validate that both pigs exist and are suitable for breeding
    const [sow] = await query('SELECT * FROM grown_pigs WHERE pig_id = ? AND gender = ?', [sowId, 'female']);
    const [boar] = await query('SELECT * FROM grown_pigs WHERE pig_id = ? AND gender = ?', [boarId, 'male']);

    if (!sow) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid sow ID or pig is not female' });
    }
    if (!boar) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid boar ID or pig is not male' });
    }

    // Check if sow is available for breeding (can be 'available' or 'breeding')
    if (!['available', 'breeding'].includes(sow.breeding_status)) {
      await connection.rollback();
      return res.status(400).json({ 
        message: `Sow is currently ${sow.breeding_status} and not available for breeding` 
      });
    }

    // Check if sow is already in an active breeding cycle
    const [existingRecord] = await query(`
      SELECT * FROM breeding_records 
      WHERE sow_id = ? AND 
      breeding_status IN ('bred', 'confirmed_pregnant', 'due_soon', 'overdue') AND
      (breeding_date > DATE_SUB(?, INTERVAL 120 DAY))
    `, [sowId, breedingDate]);

    if (existingRecord) {
      await connection.rollback();
      return res.status(400).json({ 
        message: 'Sow is already in an active breeding cycle' 
      });
    }

    // Create breeding record
    const insertBreedingSQL = `
      INSERT INTO breeding_records (
        sow_id, boar_id, breeding_date, expected_farrowing_date, 
        boar_source, notes, breeding_status, registered_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'bred', ?)
    `;

    const breedingResult = await connection.execute(insertBreedingSQL, [
      sowId, boarId, breedingDate, expectedFarrowingDate,
      boarSource, notes, req.user.id
    ]);

    const breedingRecordId = breedingResult[0].insertId;

    // Set sow status to 'pregnant'
    const updateSowSQL = `
      UPDATE grown_pigs 
      SET breeding_status = 'pregnant', 
          current_breeding_record_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE pig_id = ?
    `;

    await connection.execute(updateSowSQL, [breedingRecordId, sowId]);

    // Log the creation
    await auditLogger.logCreate(
      req.user.id,
      'breeding_record',
      breedingRecordId,
      `Breeding record created for sow ${sowId} and boar ${boarId}`
    );

    await connection.commit();
    
    console.log('✅ Breeding record created and sow status updated to pregnant');
    res.status(201).json({ 
      message: 'Breeding record created successfully and sow status updated to pregnant',
      id: breedingRecordId,
      sowStatus: 'pregnant'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating breeding record:', error);
    res.status(500).json({ message: 'Failed to create breeding record' });
  } finally {
    connection.release();
  }
});

// Update breeding record status and pig status
router.put('/records/:id', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const {
      sowId, boarId, breedingDate, expectedFarrowingDate, boarSource, notes, breedingStatus
    } = req.body;

    console.log('📝 Updating breeding record:', id);

    // Get the original record for audit logging
    const originalRecord = await query('SELECT * FROM breeding_records WHERE id = ?', [id]);
    
    if (!originalRecord || originalRecord.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Breeding record not found' });
    }

    // Update breeding record
    const updateBreedingSQL = `
      UPDATE breeding_records SET
        sow_id = ?, boar_id = ?, breeding_date = ?, expected_farrowing_date = ?,
        boar_source = ?, notes = ?, breeding_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const result = await connection.execute(updateBreedingSQL, [
      sowId, boarId, breedingDate, expectedFarrowingDate,
      boarSource, notes, breedingStatus || 'bred', id
    ]);

    if (result[0].affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Breeding record not found' });
    }

    // Update sow breeding status based on breeding record status
    let sowBreedingStatus = 'pregnant'; // Default to pregnant
    if (breedingStatus === 'farrowed') {
      sowBreedingStatus = 'farrowed';
    } else if (breedingStatus === 'failed') {
      sowBreedingStatus = 'available';
    }

    const updateSowSQL = `
      UPDATE grown_pigs 
      SET breeding_status = ?,
          current_breeding_record_id = CASE 
            WHEN ? = 'available' THEN NULL 
            ELSE current_breeding_record_id 
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE pig_id = ?
    `;

    await connection.execute(updateSowSQL, [sowBreedingStatus, sowBreedingStatus, sowId]);

    // Log the edit change
    const changes = {
      sow_id: { from: originalRecord[0].sow_id, to: sowId },
      boar_id: { from: originalRecord[0].boar_id, to: boarId },
      breeding_date: { from: originalRecord[0].breeding_date, to: breedingDate },
      expected_farrowing_date: { from: originalRecord[0].expected_farrowing_date, to: expectedFarrowingDate },
      boar_source: { from: originalRecord[0].boar_source, to: boarSource },
      notes: { from: originalRecord[0].notes, to: notes },
      breeding_status: { from: originalRecord[0].breeding_status, to: breedingStatus || 'bred' }
    };

    await auditLogger.logEditChange(
      req.user.id,
      'breeding_record',
      id,
      'update',
      originalRecord[0],
      { sow_id: sowId, boar_id: boarId, breeding_date: breedingDate, expected_farrowing_date: expectedFarrowingDate, boar_source: boarSource, notes: notes, breeding_status: breedingStatus || 'bred' }
    );

    await connection.commit();

    console.log('✅ Breeding record and sow status updated successfully');
    res.json({ 
      message: 'Breeding record updated successfully',
      sowStatus: sowBreedingStatus
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating breeding record:', error);
    res.status(500).json({ message: 'Failed to update breeding record' });
  } finally {
    connection.release();
  }
});

// Request delete breeding record
router.post('/records/delete-request/:id', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    console.log('🗑️ Requesting deletion of breeding record:', id);

    // Validate reason
    if (!reason || reason.trim().length < 10) {
      await connection.rollback();
      return res.status(400).json({ message: 'Reason is required and must be at least 10 characters long' });
    }

    // Get the breeding record first to find the sow
    const breedingRecord = await query('SELECT * FROM breeding_records WHERE id = ?', [id]);
    
    if (!breedingRecord || breedingRecord.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Breeding record not found' });
    }

    // Check for existing pending delete request
    let existingRequests = [];
    try {
      existingRequests = await query('SELECT * FROM delete_requests WHERE item_type = ? AND item_id = ? AND status = ?', ['breeding_record', id, 'pending']);
    } catch (error) {
      console.error('Error checking existing requests:', error);
      existingRequests = [];
    }

    if (existingRequests && existingRequests.length > 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'A delete request for this breeding record is already pending' });
    }

    // Create delete request
    await auditLogger.createDeleteRequest(
      userId,
      'breeding_record',
      id,
      JSON.stringify(breedingRecord[0]),
      reason.trim()
    );

    await connection.commit();

    console.log('✅ Delete request for breeding record created successfully');
    res.json({ 
      message: 'Delete request submitted successfully. Awaiting admin approval.' 
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating delete request for breeding record:', error);
    res.status(500).json({ message: 'Failed to create delete request' });
  } finally {
    connection.release();
  }
});

// Cancel delete request for breeding record
router.post('/records/cancel-delete-request/:id', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const userId = req.user.id;

    console.log('❌ Cancelling delete request for breeding record:', id);

    // Find and delete the pending request
    const deleteResult = await connection.execute(
      'DELETE FROM delete_requests WHERE item_type = ? AND item_id = ? AND requester_id = ? AND status = ?',
      ['breeding_record', id, userId, 'pending']
    );

    if (deleteResult[0].affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'No pending delete request found for this breeding record' });
    }

    await connection.commit();

    console.log('✅ Delete request for breeding record cancelled successfully');
    res.json({ 
      message: 'Delete request cancelled successfully' 
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error cancelling delete request for breeding record:', error);
    res.status(500).json({ message: 'Failed to cancel delete request' });
  } finally {
    connection.release();
  }
});

// FIXED: Register farrowing with better litter ID handling and proper dead count tracking
router.post('/records/:id/farrowing', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const {
      litterId,
      birthDate,
      maleCount,
      femaleCount,
      numberDied,
      averageWeight,
      location,
      healthStatus,
      healthReason,
      numberAffected
    } = req.body;

    console.log('🐷 Registering farrowing for breeding record:', id);
    console.log('📋 Request body:', req.body);
    console.log('👤 User info:', req.user);
    console.log('🔑 User ID:', req.user?.id);

    // Calculate totals
    const male = parseInt(maleCount) || 0;
    const female = parseInt(femaleCount) || 0;
    const died = parseInt(numberDied) || 0;
    const litterSize = male + female; // Living piglets only
    const totalBorn = male + female + died; // All piglets born

    // Validation: Must have at least some piglets
    if (totalBorn === 0) {
      await connection.rollback();
      return res.status(400).json({ 
        message: 'Must have at least one piglet (male, female, or died)' 
      });
    }

    // Get the breeding record
    const [breedingRecord] = await query('SELECT * FROM breeding_records WHERE id = ?', [id]);
    
    if (!breedingRecord) {
      await connection.rollback();
      return res.status(404).json({ message: 'Breeding record not found' });
    }

    // Check if farrowing can be registered (7 days or less, or overdue)
    const daysLeft = await query('SELECT DATEDIFF(expected_farrowing_date, CURDATE()) as days_left FROM breeding_records WHERE id = ?', [id]);
    if (daysLeft[0]?.days_left > 7) {
      await connection.rollback();
      return res.status(400).json({ 
        message: 'Farrowing can only be registered when 7 days or less remain, or if overdue' 
      });
    }

    // FIXED: Better check for existing litter ID
    const [existingLitter] = await query('SELECT litter_id FROM litters WHERE litter_id = ?', [litterId]);
    if (existingLitter) {
      await connection.rollback();
      
      // Generate a new unique litter ID as fallback
      const timestamp = Date.now().toString().slice(-4);
      const fallbackId = `LT${litterId.substring(2)}${timestamp}`;
      
      return res.status(400).json({ 
        message: 'Litter ID already exists. Please use a unique ID.',
        suggestedId: fallbackId,
        error: 'DUPLICATE_LITTER_ID'
      });
    }

    // Validate health status requirements
    if (healthStatus !== 'healthy' && !healthReason) {
      await connection.rollback();
      return res.status(400).json({ message: 'Health reason is required when health status is not healthy' });
    }

    if (healthStatus !== 'healthy' && !numberAffected) {
      await connection.rollback();
      return res.status(400).json({ message: 'Number affected is required when health status is not healthy' });
    }

    // UPDATED: Create litter record with proper totals and dead count tracking
    const insertLitterSQL = `
      INSERT INTO litters (
        litter_id, birth_date, sow_id, boar_id, total_born, male_count, female_count,
        number_died, average_weight, piglet_status, location, health_status, health_reason, 
        number_affected, registered_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'farrowed', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    // Ensure user ID exists
    if (!req.user || !req.user.id) {
      await connection.rollback();
      return res.status(401).json({ message: 'User authentication required' });
    }

    await connection.execute(insertLitterSQL, [
      litterId, birthDate, breedingRecord.sow_id, breedingRecord.boar_id,
      totalBorn, male, female, died, averageWeight, location,
      healthStatus, healthReason, numberAffected, req.user.id
    ]);

    // UPDATED: Update breeding record with litter size (living piglets only) and dead count
    const updateBreedingSQL = `
      UPDATE breeding_records 
      SET breeding_status = 'farrowed', 
          actual_farrowing_date = ?,
          litter_size = ?,
          number_died = ?,
          total_born = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await connection.execute(updateBreedingSQL, [birthDate, litterSize, died, totalBorn, id]);

    // Update sow status to farrowed
    const updateSowSQL = `
      UPDATE grown_pigs 
      SET breeding_status = 'farrowed',
          updated_at = CURRENT_TIMESTAMP
      WHERE pig_id = ?
    `;

    await connection.execute(updateSowSQL, [breedingRecord.sow_id]);

    // Log the farrowing registration
    await auditLogger.logUpdate(
      req.user.id,
      'breeding_record',
      id,
      'farrowing_status',
      'pregnant',
      'farrowed',
      `Farrowing registered for breeding record ${id}, litter ${litterId} created with ${litterSize} living piglets`
    );

    await connection.commit();

    console.log('✅ Farrowing registered successfully');
    res.status(201).json({ 
      message: 'Farrowing registered successfully! Litter created and sow status updated to farrowed.',
      litterId: litterId,
      breedingRecordId: id,
      sowStatus: 'farrowed',
      litterSize: litterSize,
      totalBorn: totalBorn,
      numberDied: died,
      summary: {
        living: litterSize,
        died: died,
        total: totalBorn,
        maleCount: male,
        femaleCount: female
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Error registering farrowing:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      stack: error.stack
    });
    
    // More detailed error response for debugging
    const errorResponse = {
      message: 'Failed to register farrowing',
      error: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    };
    
    // Only include stack trace in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
    }
    
    res.status(500).json(errorResponse);
  } finally {
    connection.release();
  }
});

// Update breeding statuses based on days left
router.put('/update-statuses', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 Updating breeding statuses based on days left...');

    // Update breeding records status based on days left
    const updateBreedingStatusSQL = `
      UPDATE breeding_records 
      SET breeding_status = CASE 
        WHEN DATEDIFF(expected_farrowing_date, CURDATE()) < 0 AND breeding_status NOT IN ('farrowed', 'failed') THEN 'overdue'
        WHEN DATEDIFF(expected_farrowing_date, CURDATE()) <= 7 AND DATEDIFF(expected_farrowing_date, CURDATE()) >= 0 THEN 'due_soon'
        WHEN DATEDIFF(expected_farrowing_date, CURDATE()) > 21 AND breeding_status = 'bred' THEN 'confirmed_pregnant'
        ELSE breeding_status
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE breeding_status IN ('bred', 'confirmed_pregnant', 'due_soon')
    `;

    const breedingResult = await query(updateBreedingStatusSQL);

    // Update sow statuses
    const updateSowStatusSQL = `
      UPDATE grown_pigs gp
      INNER JOIN breeding_records br ON gp.current_breeding_record_id = br.id
      SET gp.breeding_status = CASE 
        WHEN br.breeding_status = 'farrowed' THEN 'farrowed'
        WHEN br.breeding_status = 'failed' THEN 'available'
        ELSE 'pregnant'
      END,
      gp.updated_at = CURRENT_TIMESTAMP
      WHERE gp.gender = 'female' AND gp.current_breeding_record_id IS NOT NULL
    `;

    const sowResult = await query(updateSowStatusSQL);

    console.log(`✅ Updated ${breedingResult.affectedRows} breeding records and ${sowResult.affectedRows} sow statuses`);
    
    res.json({ 
      message: 'Breeding statuses updated successfully',
      breedingRecordsUpdated: breedingResult.affectedRows,
      sowsUpdated: sowResult.affectedRows
    });

  } catch (error) {
    console.error('Error updating breeding statuses:', error);
    res.status(500).json({ message: 'Failed to update breeding statuses' });
  }
});

// Test endpoint for debugging database connection
router.get('/test-connection', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic query
    const testResult = await query('SELECT 1 as test');
    console.log('✅ Basic query test:', testResult);
    
    // Test breeding_records table
    const breedingCount = await query('SELECT COUNT(*) as count FROM breeding_records');
    console.log('✅ Breeding records count:', breedingCount);
    
    // Test litters table
    const littersCount = await query('SELECT COUNT(*) as count FROM litters');
    console.log('✅ Litters count:', littersCount);
    
    // Test grown_pigs table
    const pigsCount = await query('SELECT COUNT(*) as count FROM grown_pigs');
    console.log('✅ Grown pigs count:', pigsCount);
    
    res.json({
      message: 'Database connection test successful',
      tests: {
        basicQuery: testResult[0],
        breedingRecords: breedingCount[0],
        litters: littersCount[0],
        grownPigs: pigsCount[0]
      }
    });
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    res.status(500).json({ 
      message: 'Database connection test failed',
      error: error.message,
      stack: error.stack
    });
  }
});

// Get breeding statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Calculating breeding statistics...');

    // Total breeding records
    const [totalRecords] = await query('SELECT COUNT(*) as count FROM breeding_records');
    
    // Currently pregnant sows
    const [pregnantSows] = await query(`
      SELECT COUNT(*) as count FROM grown_pigs 
      WHERE gender = 'female' AND breeding_status = 'pregnant'
    `);

    // Farrowed sows
    const [farrowedSows] = await query(`
      SELECT COUNT(*) as count FROM grown_pigs 
      WHERE gender = 'female' AND breeding_status = 'farrowed'
    `);

    // Weaning sows
    const [weaningSows] = await query(`
      SELECT COUNT(*) as count FROM grown_pigs 
      WHERE gender = 'female' AND breeding_status = 'weaning'
    `);

    // Due soon (within 7 days)
    const [dueSoon] = await query(`
      SELECT COUNT(*) as count FROM breeding_records 
      WHERE DATEDIFF(expected_farrowing_date, CURDATE()) <= 7 
      AND DATEDIFF(expected_farrowing_date, CURDATE()) > 0
      AND breeding_status NOT IN ('farrowed', 'failed')
    `);

    // Overdue farrowings
    const [overdue] = await query(`
      SELECT COUNT(*) as count FROM breeding_records 
      WHERE DATEDIFF(expected_farrowing_date, CURDATE()) < 0
      AND breeding_status NOT IN ('farrowed', 'failed')
    `);

    // Average days to farrowing for active pregnancies
    const [avgDays] = await query(`
      SELECT AVG(DATEDIFF(expected_farrowing_date, CURDATE())) as avg_days
      FROM breeding_records 
      WHERE breeding_status IN ('bred', 'confirmed_pregnant', 'due_soon')
      AND DATEDIFF(expected_farrowing_date, CURDATE()) > 0
    `);

    const statistics = {
      totalRecords: totalRecords.count,
      pregnantSows: pregnantSows.count,
      farrowedSows: farrowedSows.count,
      weaningSows: weaningSows.count,
      dueSoon: dueSoon.count,
      overdue: overdue.count,
      avgDaysToFarrowing: Math.round(avgDays.avg_days || 0)
    };

    console.log('✅ Breeding statistics calculated:', statistics);
    res.json(statistics);
  } catch (error) {
    console.error('Error calculating breeding statistics:', error);
    res.status(500).json({ message: 'Failed to calculate breeding statistics' });
  }
});

// Get breeding notifications
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    console.log('🔔 Fetching breeding notifications...');

    const notifications = [];

    // Check for sows due to farrow soon (within 3 days)
    const dueSoonSows = await query(`
      SELECT 
        br.id,
        br.sow_id,
        br.expected_farrowing_date,
        DATEDIFF(br.expected_farrowing_date, CURDATE()) as days_left,
        gp.breed as sow_breed
      FROM breeding_records br
      JOIN grown_pigs gp ON br.sow_id = gp.pig_id
      WHERE DATEDIFF(br.expected_farrowing_date, CURDATE()) <= 3 
      AND DATEDIFF(br.expected_farrowing_date, CURDATE()) > 0
      AND br.breeding_status NOT IN ('farrowed', 'failed')
    `);

    dueSoonSows.forEach(sow => {
      notifications.push({
        id: `breeding-due-${sow.id}`,
        title: `Farrowing Due Soon`,
        message: `Sow ${sow.sow_id} (${sow.sow_breed}) is due to farrow in ${sow.days_left} day${sow.days_left !== 1 ? 's' : ''}`,
        created_at: new Date().toISOString(),
        is_read: false,
        notification_type: 'due_soon',
        sow_id: sow.sow_id,
        expected_farrowing_date: sow.expected_farrowing_date
      });
    });

    // Check for overdue farrowings
    const overdueSows = await query(`
      SELECT 
        br.id,
        br.sow_id,
        br.expected_farrowing_date,
        ABS(DATEDIFF(br.expected_farrowing_date, CURDATE())) as days_overdue,
        gp.breed as sow_breed
      FROM breeding_records br
      JOIN grown_pigs gp ON br.sow_id = gp.pig_id
      WHERE DATEDIFF(br.expected_farrowing_date, CURDATE()) < 0
      AND br.breeding_status NOT IN ('farrowed', 'failed')
    `);

    overdueSows.forEach(sow => {
      notifications.push({
        id: `breeding-overdue-${sow.id}`,
        title: `Farrowing Overdue`,
        message: `Sow ${sow.sow_id} (${sow.sow_breed}) is ${sow.days_overdue} day${sow.days_overdue !== 1 ? 's' : ''} overdue for farrowing`,
        created_at: new Date().toISOString(),
        is_read: false,
        notification_type: 'overdue',
        sow_id: sow.sow_id,
        expected_farrowing_date: sow.expected_farrowing_date
      });
    });

    // Check for sows ready for breeding (not currently pregnant and of breeding age)
    const readyForBreeding = await query(`
      SELECT 
        gp.pig_id,
        gp.breed,
        gp.age_in_days,
        gp.last_breeding_date
      FROM grown_pigs gp
      WHERE gp.gender = 'female' 
      AND gp.breeding_status = 'ready'
      AND gp.age_in_days >= 240  -- At least 8 months old
      AND (gp.last_breeding_date IS NULL OR DATEDIFF(CURDATE(), gp.last_breeding_date) >= 21)  -- At least 21 days since last breeding
    `);

    readyForBreeding.forEach(sow => {
      notifications.push({
        id: `breeding-ready-${sow.pig_id}`,
        title: `Sow Ready for Breeding`,
        message: `Sow ${sow.pig_id} (${sow.breed}) is ready for breeding`,
        created_at: new Date().toISOString(),
        is_read: false,
        notification_type: 'ready_for_breeding',
        sow_id: sow.pig_id
      });
    });

    // Sort by priority (overdue first, then due soon, then ready for breeding)
    notifications.sort((a, b) => {
      const priorityOrder = { 'overdue': 1, 'due_soon': 2, 'ready_for_breeding': 3 };
      return priorityOrder[a.notification_type] - priorityOrder[b.notification_type];
    });

    console.log(`✅ Found ${notifications.length} breeding notifications`);
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching breeding notifications:', error);
    res.status(500).json({ message: 'Failed to fetch breeding notifications' });
  }
});

module.exports = router;