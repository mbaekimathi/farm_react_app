// backend/routes/pigGrowth.js
const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Get all pig growth stages
router.get('/stages', authenticateToken, async (req, res) => {
  try {
    const stages = await query('SELECT * FROM pig_growth_stages WHERE is_active = TRUE ORDER BY min_age_days ASC');
    res.json(stages);
  } catch (error) {
    console.error('Error fetching pig growth stages:', error);
    res.status(500).json({ message: 'Failed to fetch pig growth stages' });
  }
});

// Get pig details with growth information
router.get('/pig/:pigId', authenticateToken, async (req, res) => {
  try {
    const { pigId } = req.params;
    
    // Get pig details from grown_pigs table
    const [pig] = await query(`
      SELECT 
        gp.*,
        DATEDIFF(CURDATE(), gp.birth_date) as current_age_days,
        pgs.stage_name as current_growth_stage,
        pgs.target_weight_min,
        pgs.target_weight_max
      FROM grown_pigs gp
      LEFT JOIN pig_growth_stages pgs ON 
        DATEDIFF(CURDATE(), gp.birth_date) BETWEEN pgs.min_age_days AND pgs.max_age_days
      WHERE gp.pig_id = ?
    `, [pigId]);
    
    if (!pig) {
      return res.status(404).json({ message: 'Pig not found' });
    }
    
    // Get weight measurement history
    const weightHistory = await query(`
      SELECT 
        pwm.*,
        pgs.stage_name as growth_stage_name,
        e.full_name as measured_by_name
      FROM pig_weight_measurements pwm
      LEFT JOIN pig_growth_stages pgs ON pwm.growth_stage_id = pgs.id
      LEFT JOIN employees e ON pwm.measured_by = e.id
      WHERE pwm.pig_id = ?
      ORDER BY pwm.measurement_date DESC
    `, [pigId]);
    
    // Get growth schedule
    const [growthSchedule] = await query(`
      SELECT * FROM pig_growth_schedule 
      WHERE pig_id = ? AND pig_type = 'grown'
      ORDER BY next_measurement_date DESC LIMIT 1
    `, [pigId]);
    
    // Calculate growth statistics
    const growthStats = calculateGrowthStatistics(weightHistory);
    
    res.json({
      pig,
      weightHistory,
      growthSchedule,
      growthStats
    });
  } catch (error) {
    console.error('Error fetching pig details:', error);
    res.status(500).json({ message: 'Failed to fetch pig details' });
  }
});

// Add weight measurement for a pig
router.post('/measurement/:pigId', authenticateToken, async (req, res) => {
  try {
    const { pigId } = req.params;
    const { weight_kg, measurement_date, notes } = req.body;
    
    // Get pig details
    const [pig] = await query('SELECT birth_date FROM grown_pigs WHERE pig_id = ?', [pigId]);
    if (!pig) {
      return res.status(404).json({ message: 'Pig not found' });
    }
    
    // Calculate age in days
    const ageDays = Math.floor((new Date(measurement_date) - new Date(pig.birth_date)) / (1000 * 60 * 60 * 24));
    
    // Determine growth stage
    const [growthStage] = await query(`
      SELECT id FROM pig_growth_stages 
      WHERE ? BETWEEN min_age_days AND max_age_days AND is_active = TRUE
    `, [ageDays]);
    
    // Insert weight measurement
    const result = await query(`
      INSERT INTO pig_weight_measurements 
      (pig_id, pig_type, measurement_date, weight_kg, age_days, growth_stage_id, notes, measured_by)
      VALUES (?, 'grown', ?, ?, ?, ?, ?, ?)
    `, [pigId, measurement_date, weight_kg, ageDays, growthStage?.id || null, notes || null, req.user.employeeId]);
    
    // Update or create growth schedule for next measurement (14 days later)
    const nextMeasurementDate = new Date(measurement_date);
    nextMeasurementDate.setDate(nextMeasurementDate.getDate() + 14);
    
    await query(`
      INSERT INTO pig_growth_schedule (pig_id, pig_type, next_measurement_date, measurement_interval_days, status)
      VALUES (?, 'grown', ?, 14, 'pending')
      ON DUPLICATE KEY UPDATE 
        next_measurement_date = VALUES(next_measurement_date),
        status = 'pending',
        updated_at = CURRENT_TIMESTAMP
    `, [pigId, nextMeasurementDate.toISOString().split('T')[0]]);
    
    res.status(201).json({ 
      message: 'Weight measurement recorded successfully',
      measurement_id: result.insertId,
      next_measurement_date: nextMeasurementDate.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Error recording weight measurement:', error);
    res.status(500).json({ message: 'Failed to record weight measurement' });
  }
});

// Get growth schedule for all pigs
router.get('/schedule', authenticateToken, async (req, res) => {
  try {
    const sql = `
      SELECT 
        pgs.id,
        pgs.pig_id,
        pgs.pig_type,
        pgs.next_measurement_date,
        pgs.measurement_interval_days,
        pgs.notification_sent,
        pgs.notification_sent_date,
        pgs.status,
        pgs.notes,
        gp.pig_id as pig_identifier,
        gp.breed,
        gp.gender,
        DATEDIFF(CURDATE(), gp.birth_date) as current_age_days,
        DATEDIFF(pgs.next_measurement_date, CURDATE()) as days_until_measurement
      FROM pig_growth_schedule pgs
      JOIN grown_pigs gp ON pgs.pig_id = gp.pig_id
      WHERE pgs.pig_type = 'grown'
      ORDER BY 
        CASE 
          WHEN pgs.next_measurement_date < CURDATE() THEN 1
          WHEN pgs.next_measurement_date = CURDATE() THEN 2
          WHEN pgs.next_measurement_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 3
          ELSE 4
        END,
        pgs.next_measurement_date ASC
    `;
    
    const schedule = await query(sql);
    res.json(schedule);
  } catch (error) {
    console.error('Error fetching growth schedule:', error);
    res.status(500).json({ message: 'Failed to fetch growth schedule' });
  }
});

// Get pending growth notifications
router.get('/notifications/pending', authenticateToken, async (req, res) => {
  try {
    const sql = `
      SELECT 
        pgn.id,
        pgn.notification_type,
        pgn.message,
        pgn.created_at,
        pgn.pig_id,
        pgn.pig_type,
        gp.breed,
        pgs.next_measurement_date
      FROM pig_growth_notifications pgn
      JOIN pig_growth_schedule pgs ON pgn.schedule_id = pgs.id
      JOIN grown_pigs gp ON pgn.pig_id = gp.pig_id
      WHERE pgn.is_read = FALSE
      ORDER BY pgn.created_at DESC
    `;
    
    const notifications = await query(sql);
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching pending notifications:', error);
    res.status(500).json({ message: 'Failed to fetch pending notifications' });
  }
});

// Mark notification as read
router.put('/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    await query(`
      UPDATE pig_growth_notifications 
      SET is_read = TRUE, read_by = ?, read_at = NOW() 
      WHERE id = ?
    `, [req.user.employeeId, notificationId]);
    
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// Generate growth notifications
router.post('/generate-notifications', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get pigs due for measurement
    const sql = `
      SELECT 
        pgs.id as schedule_id,
        pgs.pig_id,
        pgs.pig_type,
        pgs.next_measurement_date,
        gp.breed,
        DATEDIFF(pgs.next_measurement_date, CURDATE()) as days_until_measurement
      FROM pig_growth_schedule pgs
      JOIN grown_pigs gp ON pgs.pig_id = gp.pig_id
      WHERE pgs.status = 'pending' 
        AND pgs.notification_sent = FALSE
        AND pgs.next_measurement_date <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)
    `;
    
    const duePigs = await query(sql);
    let notificationsCreated = 0;
    
    for (const pig of duePigs) {
      let notificationType, message;
      
      if (pig.days_until_measurement < 0) {
        notificationType = 'overdue';
        message = `OVERDUE: Weight measurement for pig ${pig.pig_id} (${pig.breed}) was due ${Math.abs(pig.days_until_measurement)} days ago`;
      } else if (pig.days_until_measurement === 0) {
        notificationType = 'measurement_due';
        message = `DUE TODAY: Weight measurement for pig ${pig.pig_id} (${pig.breed})`;
      } else {
        notificationType = 'measurement_due';
        message = `DUE TOMORROW: Weight measurement for pig ${pig.pig_id} (${pig.breed})`;
      }
      
      try {
        await query(`
          INSERT INTO pig_growth_notifications 
          (schedule_id, pig_id, pig_type, notification_type, message)
          VALUES (?, ?, ?, ?, ?)
        `, [pig.schedule_id, pig.pig_id, pig.pig_type, notificationType, message]);
        
        // Mark notification as sent
        await query(`
          UPDATE pig_growth_schedule 
          SET notification_sent = TRUE, notification_sent_date = NOW() 
          WHERE id = ?
        `, [pig.schedule_id]);
        
        notificationsCreated++;
      } catch (error) {
        console.error(`Error creating notification for pig ${pig.pig_id}:`, error);
      }
    }
    
    res.json({ 
      message: `Generated ${notificationsCreated} notifications`,
      notifications_created: notificationsCreated
    });
  } catch (error) {
    console.error('Error generating notifications:', error);
    res.status(500).json({ message: 'Failed to generate notifications' });
  }
});

// Update expected weight for a specific age
router.post('/expected-weight', authenticateToken, async (req, res) => {
  try {
    const { pig_id, age_days, expected_weight } = req.body;
    
    // Validate input
    if (!pig_id || age_days === undefined || expected_weight === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Check if pig exists
    const [pig] = await query('SELECT id FROM grown_pigs WHERE pig_id = ?', [pig_id]);
    if (!pig) {
      return res.status(404).json({ message: 'Pig not found' });
    }
    
    // Insert or update expected weight record
    await query(`
      INSERT INTO pig_expected_weights (pig_id, age_days, expected_weight_kg, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        expected_weight_kg = VALUES(expected_weight_kg),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP
    `, [pig_id, age_days, expected_weight, req.user.employeeId, req.user.employeeId]);
    
    res.json({ 
      success: true,
      message: 'Expected weight updated successfully',
      pig_id,
      age_days,
      expected_weight
    });
  } catch (error) {
    console.error('Error updating expected weight:', error);
    res.status(500).json({ message: 'Failed to update expected weight' });
  }
});

// Get expected weight for a pig
router.get('/expected-weight/:pigId', authenticateToken, async (req, res) => {
  try {
    const { pigId } = req.params;
    
    const expectedWeights = await query(`
      SELECT age_days, expected_weight_kg, created_at, updated_at
      FROM pig_expected_weights 
      WHERE pig_id = ?
      ORDER BY age_days ASC
    `, [pigId]);
    
    res.json(expectedWeights);
  } catch (error) {
    console.error('Error fetching expected weights:', error);
    res.status(500).json({ message: 'Failed to fetch expected weights' });
  }
});

// Get comprehensive analytics for a specific pig
router.get('/analytics/:pigId', authenticateToken, async (req, res) => {
  try {
    const { pigId } = req.params;
    
    // Get pig details with enhanced information
    const [pig] = await query(`
      SELECT 
        gp.*,
        DATEDIFF(CURDATE(), gp.birth_date) as current_age_days,
        pgs.stage_name as current_growth_stage,
        pgs.target_weight_min,
        pgs.target_weight_max,
        pgs.min_age_days as stage_min_age,
        pgs.max_age_days as stage_max_age
      FROM grown_pigs gp
      LEFT JOIN pig_growth_stages pgs ON 
        DATEDIFF(CURDATE(), gp.birth_date) BETWEEN pgs.min_age_days AND pgs.max_age_days
      WHERE gp.pig_id = ?
    `, [pigId]);
    
    if (!pig) {
      return res.status(404).json({ message: 'Pig not found' });
    }
    
    // Get comprehensive weight history with expected weights
    const weightHistory = await query(`
      SELECT 
        pwm.*,
        pgs.stage_name as growth_stage_name,
        e.full_name as measured_by_name,
        pew.expected_weight_kg as expected_weight
      FROM pig_weight_measurements pwm
      LEFT JOIN pig_growth_stages pgs ON pwm.growth_stage_id = pgs.id
      LEFT JOIN employees e ON pwm.measured_by = e.id
      LEFT JOIN pig_expected_weights pew ON pwm.pig_id = pew.pig_id AND pwm.age_days = pew.age_days
      WHERE pwm.pig_id = ?
      ORDER BY pwm.measurement_date DESC
    `, [pigId]);
    
    // Get growth schedule with enhanced information
    const [growthSchedule] = await query(`
      SELECT 
        pgs.*,
        DATEDIFF(pgs.next_measurement_date, CURDATE()) as days_until_measurement,
        CASE 
          WHEN pgs.next_measurement_date < CURDATE() THEN 'overdue'
          WHEN pgs.next_measurement_date = CURDATE() THEN 'due'
          WHEN pgs.next_measurement_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 'due_tomorrow'
          ELSE 'pending'
        END as measurement_status
      FROM pig_growth_schedule pgs
      WHERE pgs.pig_id = ? AND pgs.pig_type = 'grown'
      ORDER BY pgs.next_measurement_date DESC LIMIT 1
    `, [pigId]);
    
    // Get custom expected weights
    const expectedWeights = await query(`
      SELECT age_days, expected_weight_kg, created_at, updated_at
      FROM pig_expected_weights 
      WHERE pig_id = ?
      ORDER BY age_days ASC
    `, [pigId]);
    
    // Get growth notifications for this pig
    const notifications = await query(`
      SELECT 
        pgn.*,
        pgs.next_measurement_date
      FROM pig_growth_notifications pgn
      JOIN pig_growth_schedule pgs ON pgn.schedule_id = pgs.id
      WHERE pgn.pig_id = ? AND pgs.pig_type = 'grown'
      ORDER BY pgn.created_at DESC
      LIMIT 10
    `, [pigId]);
    
    // Get breeding records for this pig (if it's a grown pig)
    let breedingRecords = [];
    if (pig.gender === 'female') {
      breedingRecords = await query(`
        SELECT 
          br.*,
          DATEDIFF(br.expected_farrowing_date, CURDATE()) as days_left_to_farrowing,
          sow.breed as sow_breed,
          sow.weight as sow_weight,
          boar.breed as boar_breed,
          boar.weight as boar_weight,
          e.full_name as recorded_by_name
        FROM breeding_records br
        LEFT JOIN grown_pigs sow ON br.sow_id = sow.pig_id
        LEFT JOIN grown_pigs boar ON br.boar_id = boar.pig_id
        LEFT JOIN employees e ON br.recorded_by = e.id
        WHERE br.sow_id = ?
        ORDER BY br.breeding_date DESC
      `, [pigId]);
    } else if (pig.gender === 'male') {
      breedingRecords = await query(`
        SELECT 
          br.*,
          DATEDIFF(br.expected_farrowing_date, CURDATE()) as days_left_to_farrowing,
          sow.breed as sow_breed,
          sow.weight as sow_weight,
          boar.breed as boar_breed,
          boar.weight as boar_weight,
          e.full_name as recorded_by_name
        FROM breeding_records br
        LEFT JOIN grown_pigs sow ON br.sow_id = sow.pig_id
        LEFT JOIN grown_pigs boar ON br.boar_id = boar.pig_id
        LEFT JOIN employees e ON br.recorded_by = e.id
        WHERE br.boar_id = ?
        ORDER BY br.breeding_date DESC
      `, [pigId]);
    }
    
    // Calculate enhanced growth statistics
    const growthStats = calculateEnhancedGrowthStatistics(weightHistory, pig);
    
    // Calculate performance metrics
    const performanceMetrics = calculatePerformanceMetrics(pig, weightHistory, expectedWeights);
    
    res.json({
      pig,
      weightHistory,
      growthSchedule,
      expectedWeights,
      notifications,
      breedingRecords,
      growthStats,
      performanceMetrics
    });
  } catch (error) {
    console.error('Error fetching pig analytics:', error);
    res.status(500).json({ message: 'Failed to fetch pig analytics' });
  }
});

// Get comprehensive analytics for a specific litter
router.get('/analytics/litter/:litterId', authenticateToken, async (req, res) => {
  try {
    const { litterId } = req.params;
    
    console.log(`🔍 Looking for litter: ${litterId}`);
    
    // First, let's see what litters exist in the database
    const allLitters = await query('SELECT litter_id FROM litters ORDER BY litter_id');
    console.log('📋 Available litters in database:', allLitters.map(l => l.litter_id));
    
    // Get litter details - try both regular and breeding formats
    let [litter] = await query(`
      SELECT 
        l.*,
        DATEDIFF(CURDATE(), l.birth_date) as current_age_days,
        sow.breed as sow_breed,
        sow.pig_id as sow_id,
        boar.breed as boar_breed,
        boar.pig_id as boar_id,
        e.full_name as registered_by_name
      FROM litters l
      LEFT JOIN grown_pigs sow ON l.sow_id = sow.pig_id
      LEFT JOIN grown_pigs boar ON l.boar_id = boar.pig_id
      LEFT JOIN employees e ON l.registered_by = e.id
      WHERE l.litter_id = ?
    `, [litterId]);
    
    // If not found, try to find it in breeding records
    if (!litter) {
      console.log(`Litter ${litterId} not found in litters table, checking breeding records...`);
      
      // Check if this is a breeding litter that hasn't been created yet
      const [breedingRecord] = await query(`
        SELECT 
          br.*,
          sow.breed as sow_breed,
          sow.pig_id as sow_id,
          boar.breed as boar_breed,
          boar.pig_id as boar_id
        FROM breeding_records br
        LEFT JOIN grown_pigs sow ON br.sow_id = sow.pig_id
        LEFT JOIN grown_pigs boar ON br.boar_id = boar.pig_id
        WHERE br.expected_litter_id = ? OR br.id = ?
      `, [litterId, litterId.replace(/^LT/, '')]);
      
      if (breedingRecord) {
        console.log(`Found breeding record for ${litterId}, but litter not yet created`);
        return res.status(404).json({ 
          message: 'Litter not found in database. This may be a breeding record that has not been farrowed yet.',
          breedingRecord: breedingRecord,
          status: 'not_farrowed'
        });
      }
      
      return res.status(404).json({ message: 'Litter not found' });
    }
    
    // Get piglet care schedule for this litter
    const pigletCareSchedule = await query(`
      SELECT 
        pcs.id,
        pcs.litter_id,
        pcs.task_id,
        pcs.due_date,
        pcs.notification_sent,
        pcs.notification_sent_date,
        pcs.status,
        pcs.notes,
        pct.task_name,
        pct.description,
        pct.min_age_days,
        pct.max_age_days,
        CASE 
          WHEN pcc.id IS NOT NULL THEN 'completed'
          WHEN pcs.due_date < CURDATE() THEN 'overdue'
          WHEN pcs.due_date = CURDATE() THEN 'due_today'
          WHEN pcs.due_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 'due_tomorrow'
          ELSE 'pending'
        END as task_status,
        CASE 
          WHEN DATEDIFF(CURDATE(), l.birth_date) < pct.min_age_days THEN 'too_young'
          WHEN DATEDIFF(CURDATE(), l.birth_date) > pct.max_age_days THEN 'too_old'
          ELSE 'appropriate_age'
        END as age_appropriateness,
        pcc.completed_date,
        pcc.completed_by,
        emp.full_name as completed_by_name
      FROM piglet_care_schedule pcs
      JOIN piglet_care_tasks pct ON pcs.task_id = pct.id
      JOIN litters l ON pcs.litter_id = l.litter_id
      LEFT JOIN piglet_care_completions pcc ON pcs.id = pcc.schedule_id
      LEFT JOIN employees emp ON pcc.completed_by = emp.id
      WHERE pcs.litter_id = ?
      ORDER BY pct.min_age_days ASC, pcs.due_date ASC
    `, [litterId]);
    
    // Get weaning information
    const weaningInfo = await query(`
      SELECT 
        w.*,
        e.full_name as weaned_by_name
      FROM weaning_records w
      LEFT JOIN employees e ON w.weaned_by = e.id
      WHERE w.litter_id = ?
      ORDER BY w.weaning_date DESC
    `, [litterId]);
    
    // Generate piglet information from litter data since individual piglets are not stored separately
    const piglets = [];
    const totalPiglets = litter.total_born || 0;
    const maleCount = litter.male_count || 0;
    const femaleCount = litter.female_count || 0;
    
    for (let i = 0; i < totalPiglets; i++) {
      const gender = i < maleCount ? 'male' : 'female';
      piglets.push({
        piglet_id: `${litter.litter_id}-${String(i + 1).padStart(2, '0')}`,
        litter_id: litter.litter_id,
        gender: gender,
        birth_date: litter.birth_date,
        current_age_days: litter.current_age_days,
        weight: litter.average_weight,
        status: litter.health_status,
        location: litter.location,
        registered_by_name: litter.registered_by_name
      });
    }
    
    // Calculate litter statistics
    const litterStats = calculateLitterStatistics(litter, pigletCareSchedule, weaningInfo);
    
    res.json({
      litter,
      pigletCareSchedule,
      weaningInfo,
      piglets,
      litterStats
    });
  } catch (error) {
    console.error('Error fetching litter analytics:', error);
    res.status(500).json({ message: 'Failed to fetch litter analytics' });
  }
});

// List all available litters for debugging
router.get('/litters', authenticateToken, async (req, res) => {
  try {
    const litters = await query(`
      SELECT 
        l.litter_id,
        l.birth_date,
        l.total_born,
        l.male_count,
        l.female_count,
        l.health_status,
        DATEDIFF(CURDATE(), l.birth_date) as current_age_days
      FROM litters l
      ORDER BY l.litter_id
    `);
    
    res.json(litters);
  } catch (error) {
    console.error('Error fetching litters:', error);
    res.status(500).json({ message: 'Failed to fetch litters' });
  }
});

// Get comprehensive analytics for a specific batch
router.get('/analytics/batch/:batchId', authenticateToken, async (req, res) => {
  try {
    const { batchId } = req.params;
    
    // Get batch details
    const [batch] = await query(`
      SELECT 
        b.*,
        DATEDIFF(CURDATE(), b.average_birth_date) as current_age_days,
        e.full_name as registered_by_name
      FROM batches b
      LEFT JOIN employees e ON b.registered_by = e.id
      WHERE b.batch_id = ?
    `, [batchId]);
    
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    
    // Get piglets in this batch from batch_piglets table
    const batchPiglets = await query(`
      SELECT 
        bp.piglet_id,
        bp.litter_id,
        l.birth_date,
        l.average_weight,
        l.health_status,
        l.location,
        DATEDIFF(CURDATE(), l.birth_date) as current_age_days,
        e.full_name as registered_by_name
      FROM batch_piglets bp
      LEFT JOIN litters l ON bp.litter_id = l.litter_id
      LEFT JOIN employees e ON l.registered_by = e.id
      WHERE bp.batch_id = ?
      ORDER BY bp.piglet_id ASC
    `, [batchId]);
    
    // Also get manual piglets if any
    const manualPiglets = await query(`
      SELECT 
        piglet_id,
        gender,
        birth_date,
        location,
        DATEDIFF(CURDATE(), birth_date) as current_age_days,
        'manual' as registered_by_name
      FROM manual_piglets
      WHERE batch_id = ?
      ORDER BY piglet_id ASC
    `, [batchId]);
    
    // Combine both types of piglets
    const piglets = [...batchPiglets, ...manualPiglets];
    
    // Get batch care schedule (if applicable)
    const batchCareSchedule = await query(`
      SELECT 
        pcs.id,
        pcs.litter_id,
        pcs.task_id,
        pcs.due_date,
        pcs.status,
        pcs.notes,
        pct.task_name,
        pct.description,
        pct.min_age_days,
        pct.max_age_days,
        l.birth_date,
        CASE 
          WHEN pcc.id IS NOT NULL THEN 'completed'
          WHEN pcs.due_date < CURDATE() THEN 'overdue'
          WHEN pcs.due_date = CURDATE() THEN 'due_today'
          WHEN pcs.due_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 'due_tomorrow'
          ELSE 'pending'
        END as task_status
      FROM piglet_care_schedule pcs
      JOIN piglet_care_tasks pct ON pcs.task_id = pct.id
      JOIN litters l ON pcs.litter_id = l.litter_id
      LEFT JOIN piglet_care_completions pcc ON pcs.id = pcc.schedule_id
      WHERE l.litter_id IN (
        SELECT DISTINCT litter_id FROM batch_piglets WHERE batch_id = ?
      )
      ORDER BY pct.min_age_days ASC, pcs.due_date ASC
    `, [batchId]);
    
    // Calculate batch statistics
    const batchStats = calculateBatchStatistics(batch, piglets, batchCareSchedule);
    
    res.json({
      batch,
      piglets,
      batchCareSchedule,
      batchStats
    });
  } catch (error) {
    console.error('Error fetching batch analytics:', error);
    res.status(500).json({ message: 'Failed to fetch batch analytics' });
  }
});

// Get growth statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    // Get overall statistics
    const [totalMeasurements] = await query('SELECT COUNT(*) as count FROM pig_weight_measurements');
    const [pigsWithSchedules] = await query('SELECT COUNT(*) as count FROM pig_growth_schedule WHERE pig_type = "grown"');
    const [overdueMeasurements] = await query('SELECT COUNT(*) as count FROM pig_growth_schedule WHERE next_measurement_date < CURDATE() AND status = "pending"');
    const [dueToday] = await query('SELECT COUNT(*) as count FROM pig_growth_schedule WHERE next_measurement_date = CURDATE() AND status = "pending"');
    const [dueTomorrow] = await query('SELECT COUNT(*) as count FROM pig_growth_schedule WHERE next_measurement_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND status = "pending"');
    const [unreadNotifications] = await query('SELECT COUNT(*) as count FROM pig_growth_notifications WHERE is_read = FALSE');
    
    res.json({
      total_measurements: totalMeasurements.count,
      pigs_with_schedules: pigsWithSchedules.count,
      overdue_measurements: overdueMeasurements.count,
      due_today: dueToday.count,
      due_tomorrow: dueTomorrow.count,
      unread_notifications: unreadNotifications.count
    });
  } catch (error) {
    console.error('Error fetching growth statistics:', error);
    res.status(500).json({ message: 'Failed to fetch growth statistics' });
  }
});

// Helper function to calculate growth statistics
const calculateGrowthStatistics = (weightHistory) => {
  if (weightHistory.length < 2) {
    return {
      total_gain: 0,
      average_daily_gain: 0,
      growth_rate: 0,
      trend: 'insufficient_data'
    };
  }
  
  // Sort by date
  const sortedHistory = weightHistory.sort((a, b) => new Date(a.measurement_date) - new Date(b.measurement_date));
  
  const firstMeasurement = sortedHistory[0];
  const lastMeasurement = sortedHistory[sortedHistory.length - 1];
  
  const totalGain = lastMeasurement.weight_kg - firstMeasurement.weight_kg;
  const daysBetween = Math.floor((new Date(lastMeasurement.measurement_date) - new Date(firstMeasurement.measurement_date)) / (1000 * 60 * 60 * 24));
  const averageDailyGain = daysBetween > 0 ? totalGain / daysBetween : 0;
  
  // Calculate growth rate percentage
  const growthRate = firstMeasurement.weight_kg > 0 ? (totalGain / firstMeasurement.weight_kg) * 100 : 0;
  
  // Determine trend
  let trend = 'stable';
  if (weightHistory.length >= 3) {
    const recentGain = weightHistory[0].weight_kg - weightHistory[1].weight_kg;
    if (recentGain > averageDailyGain * 1.2) trend = 'accelerating';
    else if (recentGain < averageDailyGain * 0.8) trend = 'slowing';
  }
  
  return {
    total_gain: totalGain,
    average_daily_gain: averageDailyGain,
    growth_rate: growthRate,
    trend: trend,
    measurements_count: weightHistory.length
  };
};

// Enhanced growth statistics with performance analysis
const calculateEnhancedGrowthStatistics = (weightHistory, pig) => {
  const basicStats = calculateGrowthStatistics(weightHistory);
  
  if (weightHistory.length < 2) {
    return {
      ...basicStats,
      consistency_score: 0,
      growth_efficiency: 0,
      stage_progress: 0,
      health_indicators: []
    };
  }
  
  // Calculate consistency score (how regular measurements are)
  const sortedHistory = weightHistory.sort((a, b) => new Date(a.measurement_date) - new Date(b.measurement_date));
  let consistencyScore = 100;
  
  for (let i = 1; i < sortedHistory.length; i++) {
    const daysBetween = Math.floor((new Date(sortedHistory[i].measurement_date) - new Date(sortedHistory[i-1].measurement_date)) / (1000 * 60 * 60 * 24));
    if (daysBetween < 10 || daysBetween > 18) {
      consistencyScore -= 10; // Penalty for irregular measurements
    }
  }
  
  // Calculate growth efficiency (weight gain per day of age)
  const growthEfficiency = pig.current_age_days > 0 ? (pig.weight / pig.current_age_days) : 0;
  
  // Calculate stage progress
  const stageProgress = pig.stage_min_age && pig.stage_max_age ? 
    ((pig.current_age_days - pig.stage_min_age) / (pig.stage_max_age - pig.stage_min_age)) * 100 : 0;
  
  // Health indicators
  const healthIndicators = [];
  
  // Check for weight loss
  if (weightHistory.length >= 2) {
    const recentWeight = weightHistory[0].weight_kg;
    const previousWeight = weightHistory[1].weight_kg;
    if (recentWeight < previousWeight) {
      healthIndicators.push({
        type: 'warning',
        message: 'Recent weight loss detected',
        severity: 'medium'
      });
    }
  }
  
  // Check for growth rate consistency
  if (basicStats.average_daily_gain < 0.3) {
    healthIndicators.push({
      type: 'warning',
      message: 'Low growth rate detected',
      severity: 'medium'
    });
  }
  
  return {
    ...basicStats,
    consistency_score: Math.max(0, consistencyScore),
    growth_efficiency: growthEfficiency,
    stage_progress: Math.min(100, Math.max(0, stageProgress)),
    health_indicators: healthIndicators
  };
};

// Calculate performance metrics
const calculatePerformanceMetrics = (pig, weightHistory, expectedWeights) => {
  const metrics = {
    current_performance: 0,
    historical_performance: [],
    target_achievement: 0,
    growth_consistency: 0,
    recommendations: []
  };
  
  // Calculate current performance against expected weight
  if (pig.target_weight_max && pig.weight) {
    metrics.current_performance = (pig.weight / pig.target_weight_max) * 100;
  }
  
  // Calculate historical performance
  if (weightHistory.length > 0) {
    weightHistory.forEach(measurement => {
      if (measurement.expected_weight) {
        const performance = (measurement.weight_kg / measurement.expected_weight) * 100;
        metrics.historical_performance.push({
          date: measurement.measurement_date,
          age: measurement.age_days,
          actual: measurement.weight_kg,
          expected: measurement.expected_weight,
          performance: performance
        });
      }
    });
  }
  
  // Calculate target achievement
  if (pig.target_weight_max) {
    metrics.target_achievement = Math.min(100, (pig.weight / pig.target_weight_max) * 100);
  }
  
  // Calculate growth consistency
  if (weightHistory.length >= 3) {
    const sortedHistory = weightHistory.sort((a, b) => new Date(a.measurement_date) - new Date(b.measurement_date));
    let consistencyScore = 0;
    
    for (let i = 1; i < sortedHistory.length; i++) {
      const dailyGain1 = (sortedHistory[i-1].weight_kg - sortedHistory[i].weight_kg) / 
                        Math.max(1, Math.floor((new Date(sortedHistory[i-1].measurement_date) - new Date(sortedHistory[i].measurement_date)) / (1000 * 60 * 60 * 24)));
      const dailyGain2 = (sortedHistory[i].weight_kg - sortedHistory[i+1]?.weight_kg) / 
                        Math.max(1, Math.floor((new Date(sortedHistory[i].measurement_date) - new Date(sortedHistory[i+1]?.measurement_date)) / (1000 * 60 * 60 * 24)));
      
      if (Math.abs(dailyGain1 - dailyGain2) < 0.1) {
        consistencyScore += 20;
      }
    }
    
    metrics.growth_consistency = Math.min(100, consistencyScore);
  }
  
  // Generate recommendations
  if (metrics.current_performance < 85) {
    metrics.recommendations.push({
      type: 'improvement',
      message: 'Consider reviewing feeding program and health status',
      priority: 'high'
    });
  }
  
  if (metrics.growth_consistency < 70) {
    metrics.recommendations.push({
      type: 'consistency',
      message: 'Growth pattern is inconsistent - monitor feeding schedule',
      priority: 'medium'
    });
  }
  
  if (weightHistory.length < 3) {
    metrics.recommendations.push({
      type: 'data',
      message: 'More weight measurements needed for accurate analysis',
      priority: 'low'
    });
  }
  
  return metrics;
};

// Calculate litter statistics
const calculateLitterStatistics = (litter, pigletCareSchedule, weaningInfo) => {
  const stats = {
    total_piglets: litter.total_born || 0,
    male_count: litter.male_count || 0,
    female_count: litter.female_count || 0,
    died_count: litter.number_died || 0,
    survival_rate: 0,
    average_weight: litter.average_weight || 0,
    care_tasks_total: pigletCareSchedule.length,
    care_tasks_completed: 0,
    care_tasks_overdue: 0,
    care_tasks_pending: 0,
    weaning_status: 'not_weaned',
    weaning_date: null,
    health_status: litter.health_status || 'unknown',
    age_in_days: litter.current_age_days || 0
  };
  
  // Calculate survival rate
  if (stats.total_piglets > 0) {
    stats.survival_rate = ((stats.total_piglets - stats.died_count) / stats.total_piglets) * 100;
  }
  
  // Calculate care task statistics
  pigletCareSchedule.forEach(task => {
    if (task.task_status === 'completed') {
      stats.care_tasks_completed++;
    } else if (task.task_status === 'overdue') {
      stats.care_tasks_overdue++;
    } else {
      stats.care_tasks_pending++;
    }
  });
  
  // Check weaning status
  if (weaningInfo && weaningInfo.length > 0) {
    const latestWeaning = weaningInfo[0];
    stats.weaning_status = 'weaned';
    stats.weaning_date = latestWeaning.weaning_date;
  }
  
  return stats;
};

// Calculate batch statistics
const calculateBatchStatistics = (batch, piglets, batchCareSchedule) => {
  const stats = {
    total_piglets: piglets.length,
    male_count: 0,
    female_count: 0,
    average_age_days: batch.current_age_days || 0,
    average_weight: 0,
    health_status: batch.health_status || 'unknown',
    care_tasks_total: batchCareSchedule.length,
    care_tasks_completed: 0,
    care_tasks_overdue: 0,
    care_tasks_pending: 0,
    litters_in_batch: 0,
    purpose: batch.purpose || 'unknown'
  };
  
  // Calculate piglet statistics
  let totalWeight = 0;
  const litterIds = new Set();
  
  piglets.forEach(piglet => {
    if (piglet.gender === 'male') {
      stats.male_count++;
    } else if (piglet.gender === 'female') {
      stats.female_count++;
    }
    
    if (piglet.weight) {
      totalWeight += piglet.weight;
    }
    
    if (piglet.litter_id) {
      litterIds.add(piglet.litter_id);
    }
  });
  
  stats.average_weight = stats.total_piglets > 0 ? totalWeight / stats.total_piglets : 0;
  stats.litters_in_batch = litterIds.size;
  
  // Calculate care task statistics
  batchCareSchedule.forEach(task => {
    if (task.task_status === 'completed') {
      stats.care_tasks_completed++;
    } else if (task.task_status === 'overdue') {
      stats.care_tasks_overdue++;
    } else {
      stats.care_tasks_pending++;
    }
  });
  
  return stats;
};

module.exports = router; 