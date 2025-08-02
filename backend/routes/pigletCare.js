// backend/routes/pigletCare.js - Enhanced with individual piglet tracking and batch care support

const express = require('express');
const { query, getConnection } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Get all piglet care tasks
router.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const tasks = await query('SELECT * FROM piglet_care_tasks ORDER BY min_age_days ASC');
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching piglet care tasks:', error);
    res.status(500).json({ message: 'Failed to fetch piglet care tasks' });
  }
});

// Get piglet care schedule for all litters
router.get('/schedule', authenticateToken, async (req, res) => {
  try {
    const schedule = await query(`
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
        DATEDIFF(CURDATE(), l.birth_date) as current_age_days,
        pcc.completed_date,
        pcc.completed_by,
        emp.full_name as completed_by_name
      FROM piglet_care_schedule pcs
      JOIN piglet_care_tasks pct ON pcs.task_id = pct.id
      JOIN litters l ON pcs.litter_id = l.litter_id
      LEFT JOIN piglet_care_completions pcc ON pcs.id = pcc.schedule_id
      LEFT JOIN employees emp ON pcc.completed_by = emp.id
      ORDER BY pct.min_age_days ASC, pcs.due_date ASC
    `);
    
    res.json(schedule);
  } catch (error) {
    console.error('Error fetching piglet care schedule:', error);
    res.status(500).json({ message: 'Failed to fetch piglet care schedule' });
  }
});

// Get individual piglets
router.get('/individual-piglets', authenticateToken, async (req, res) => {
  try {
    const piglets = await query(`
      SELECT 
        p.*,
        DATEDIFF(CURDATE(), p.birth_date) as current_age_days,
        CASE 
          WHEN p.batch_id IS NOT NULL THEN 'batch'
          WHEN p.litter_id IS NOT NULL THEN 'litter'
          ELSE 'individual'
        END as current_type,
        COALESCE(p.batch_id, p.litter_id) as current_id,
        COALESCE(b.batch_id, l.litter_id) as current_location,
        e.full_name as registered_by_name
      FROM individual_piglets p
      LEFT JOIN batches b ON p.batch_id = b.batch_id
      LEFT JOIN litters l ON p.litter_id = l.litter_id
      LEFT JOIN employees e ON p.registered_by = e.id
      ORDER BY p.piglet_id ASC
    `);
    
    res.json(piglets);
  } catch (error) {
    console.error('Error fetching individual piglets:', error);
    res.status(500).json({ message: 'Failed to fetch individual piglets' });
  }
});

// Get batch care schedule
router.get('/batch-schedule', authenticateToken, async (req, res) => {
  try {
    const schedule = await query(`
      SELECT 
        bcs.id,
        bcs.batch_id,
        bcs.task_id,
        bcs.due_date,
        bcs.status,
        bcs.notes,
        pct.task_name,
        pct.description,
        pct.min_age_days,
        pct.max_age_days,
        CASE 
          WHEN bcc.id IS NOT NULL THEN 'completed'
          WHEN bcs.due_date < CURDATE() THEN 'overdue'
          WHEN bcs.due_date = CURDATE() THEN 'due_today'
          WHEN bcs.due_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 'due_tomorrow'
          ELSE 'pending'
        END as task_status,
        DATEDIFF(CURDATE(), b.average_birth_date) as average_age_days,
        bcc.completed_date,
        bcc.completed_by,
        emp.full_name as completed_by_name
      FROM batch_care_schedule bcs
      JOIN piglet_care_tasks pct ON bcs.task_id = pct.id
      JOIN batches b ON bcs.batch_id = b.batch_id
      LEFT JOIN batch_care_completions bcc ON bcs.id = bcc.schedule_id
      LEFT JOIN employees emp ON bcc.completed_by = emp.id
      ORDER BY pct.min_age_days ASC, bcs.due_date ASC
    `);
    
    res.json(schedule);
  } catch (error) {
    console.error('Error fetching batch care schedule:', error);
    res.status(500).json({ message: 'Failed to fetch batch care schedule' });
  }
});

// Get batch statistics
router.get('/batch-statistics', authenticateToken, async (req, res) => {
  try {
    const [totalBatches] = await query('SELECT COUNT(*) as count FROM batches');
    const [totalPiglets] = await query('SELECT COUNT(*) as count FROM individual_piglets WHERE batch_id IS NOT NULL');
    const [completedTasks] = await query('SELECT COUNT(*) as count FROM batch_care_completions');
    const [overdueTasks] = await query(`
      SELECT COUNT(*) as count FROM batch_care_schedule 
      WHERE due_date < CURDATE() AND id NOT IN (SELECT schedule_id FROM batch_care_completions)
    `);
    
    res.json({
      total_batches: totalBatches.count,
      total_piglets: totalPiglets.count,
      completed_tasks: completedTasks.count,
      overdue_tasks: overdueTasks.count
    });
  } catch (error) {
    console.error('Error fetching batch statistics:', error);
    res.status(500).json({ message: 'Failed to fetch batch statistics' });
  }
});

// Get notifications
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await query(`
      SELECT 
        pcn.*,
        pct.task_name,
        pcs.litter_id,
        pcs.due_date
      FROM piglet_care_notifications pcn
      JOIN piglet_care_schedule pcs ON pcn.schedule_id = pcs.id
      JOIN piglet_care_tasks pct ON pcs.task_id = pct.id
      WHERE pcn.is_read = FALSE
      ORDER BY pcn.created_at DESC
      LIMIT 20
    `);
    
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// Get care statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const [totalTasks] = await query('SELECT COUNT(*) as count FROM piglet_care_schedule');
    const [completedTasks] = await query('SELECT COUNT(*) as count FROM piglet_care_completions');
    const [overdueTasks] = await query(`
      SELECT COUNT(*) as count FROM piglet_care_schedule 
      WHERE due_date < CURDATE() AND id NOT IN (SELECT schedule_id FROM piglet_care_completions)
    `);
    const [unreadNotifications] = await query('SELECT COUNT(*) as count FROM piglet_care_notifications WHERE is_read = FALSE');
    
    res.json({
      total_tasks: totalTasks.count,
      completed_tasks: completedTasks.count,
      overdue_tasks: overdueTasks.count,
      unread_notifications: unreadNotifications.count
    });
  } catch (error) {
    console.error('Error fetching care statistics:', error);
    res.status(500).json({ message: 'Failed to fetch care statistics' });
  }
});

// Create schedules for all litters
router.post('/create-schedules', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    
    // Get all litters
    const litters = await connection.execute('SELECT litter_id, birth_date FROM litters');
    
    // Get all piglet care tasks
    const tasks = await connection.execute('SELECT * FROM piglet_care_tasks ORDER BY min_age_days ASC');
    
    let createdCount = 0;
    
    for (const litter of litters[0]) {
      for (const task of tasks[0]) {
        // Calculate due date based on birth date and task age requirements
        const dueDate = new Date(litter.birth_date);
        dueDate.setDate(dueDate.getDate() + task.min_age_days);
        
        // Check if schedule already exists
        const [existing] = await connection.execute(
          'SELECT id FROM piglet_care_schedule WHERE litter_id = ? AND task_id = ?',
          [litter.litter_id, task.id]
        );
        
        if (existing.length === 0) {
          await connection.execute(`
            INSERT INTO piglet_care_schedule (litter_id, task_id, due_date, status, created_at)
            VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
          `, [litter.litter_id, task.id, dueDate]);
          createdCount++;
        }
      }
    }
    
    await connection.commit();
    res.json({ message: `Created ${createdCount} new care schedules` });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating schedules:', error);
    res.status(500).json({ message: 'Failed to create schedules' });
  } finally {
    connection.release();
  }
});

// Create batch care schedules
router.post('/create-batch-schedules', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    
    // Get all batches
    const batches = await connection.execute('SELECT batch_id, average_birth_date FROM batches');
    
    // Get all piglet care tasks
    const tasks = await connection.execute('SELECT * FROM piglet_care_tasks ORDER BY min_age_days ASC');
    
    let createdCount = 0;
    
    for (const batch of batches[0]) {
      for (const task of tasks[0]) {
        // Calculate due date based on average birth date and task age requirements
        const dueDate = new Date(batch.average_birth_date);
        dueDate.setDate(dueDate.getDate() + task.min_age_days);
        
        // Check if schedule already exists
        const [existing] = await connection.execute(
          'SELECT id FROM batch_care_schedule WHERE batch_id = ? AND task_id = ?',
          [batch.batch_id, task.id]
        );
        
        if (existing.length === 0) {
          await connection.execute(`
            INSERT INTO batch_care_schedule (batch_id, task_id, due_date, status, created_at)
            VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
          `, [batch.batch_id, task.id, dueDate]);
          createdCount++;
        }
      }
    }
    
    await connection.commit();
    res.json({ message: `Created ${createdCount} new batch care schedules` });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating batch schedules:', error);
    res.status(500).json({ message: 'Failed to create batch schedules' });
  } finally {
    connection.release();
  }
});

// Generate notifications
router.post('/generate-notifications', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    
    // Get overdue and due today tasks
    const tasks = await connection.execute(`
      SELECT 
        pcs.id as schedule_id,
        pcs.litter_id,
        pcs.task_id,
        pcs.due_date,
        pct.task_name,
        pct.description
      FROM piglet_care_schedule pcs
      JOIN piglet_care_tasks pct ON pcs.task_id = pct.id
      WHERE pcs.due_date <= CURDATE() 
      AND pcs.id NOT IN (SELECT schedule_id FROM piglet_care_completions)
      AND pcs.id NOT IN (SELECT schedule_id FROM piglet_care_notifications WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 DAY))
    `);
    
    let notificationCount = 0;
    
    for (const task of tasks[0]) {
      const isOverdue = new Date(task.due_date) < new Date();
      const message = isOverdue 
        ? `OVERDUE: ${task.task_name} for litter ${task.litter_id}`
        : `DUE TODAY: ${task.task_name} for litter ${task.litter_id}`;
      
      await connection.execute(`
        INSERT INTO piglet_care_notifications (schedule_id, litter_id, task_id, notification_type, message, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [task.schedule_id, task.litter_id, task.task_id, isOverdue ? 'overdue' : 'due_today', message]);
      
      notificationCount++;
    }
    
    await connection.commit();
    res.json({ message: `Generated ${notificationCount} notifications` });
  } catch (error) {
    await connection.rollback();
    console.error('Error generating notifications:', error);
    res.status(500).json({ message: 'Failed to generate notifications' });
  } finally {
    connection.release();
  }
});

// Complete task
router.put('/tasks/:scheduleId/complete', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  try {
    const { scheduleId } = req.params;
    const { taskName, litterId } = req.body;
    
    await connection.beginTransaction();
    
    // Check if already completed
    const [existing] = await connection.execute(
      'SELECT id FROM piglet_care_completions WHERE schedule_id = ?',
      [scheduleId]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Task already completed' });
    }
    
    // Mark as completed
    await connection.execute(`
      INSERT INTO piglet_care_completions (schedule_id, litter_id, task_id, completed_date, completed_by, created_at)
      SELECT ?, ?, task_id, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
      FROM piglet_care_schedule WHERE id = ?
    `, [scheduleId, litterId, req.user.id, scheduleId]);
    
    // Update schedule status
    await connection.execute(
      'UPDATE piglet_care_schedule SET status = "completed" WHERE id = ?',
      [scheduleId]
    );
    
    await connection.commit();
    res.json({ message: 'Task completed successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error completing task:', error);
    res.status(500).json({ message: 'Failed to complete task' });
  } finally {
    connection.release();
  }
});

// Complete batch task
router.put('/batch-tasks/:scheduleId/complete', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  try {
    const { scheduleId } = req.params;
    const { taskName, batchId } = req.body;
    
    await connection.beginTransaction();
    
    // Check if already completed
    const [existing] = await connection.execute(
      'SELECT id FROM batch_care_completions WHERE schedule_id = ?',
      [scheduleId]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Task already completed' });
    }
    
    // Mark as completed
    await connection.execute(`
      INSERT INTO batch_care_completions (schedule_id, batch_id, task_id, completed_date, completed_by, created_at)
      SELECT ?, ?, task_id, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
      FROM batch_care_schedule WHERE id = ?
    `, [scheduleId, batchId, req.user.id, scheduleId]);
    
    // Update schedule status
    await connection.execute(
      'UPDATE batch_care_schedule SET status = "completed" WHERE id = ?',
      [scheduleId]
    );
    
    await connection.commit();
    res.json({ message: 'Batch task completed successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error completing batch task:', error);
    res.status(500).json({ message: 'Failed to complete batch task' });
  } finally {
    connection.release();
  }
});

// Move piglet between litter and batch
router.post('/move-piglet', authenticateToken, async (req, res) => {
  const connection = await getConnection();
  try {
    const { pigletId, fromType, fromId, toType, toId } = req.body;
    
    await connection.beginTransaction();
    
    // Update piglet location
    if (toType === 'batch') {
      await connection.execute(`
        UPDATE individual_piglets 
        SET batch_id = ?, litter_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE piglet_id = ?
      `, [toId, pigletId]);
    } else if (toType === 'litter') {
      await connection.execute(`
        UPDATE individual_piglets 
        SET litter_id = ?, batch_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE piglet_id = ?
      `, [toId, pigletId]);
    }
    
    await connection.commit();
    res.json({ message: 'Piglet moved successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error moving piglet:', error);
    res.status(500).json({ message: 'Failed to move piglet' });
  } finally {
    connection.release();
  }
});

// Mark notification as read
router.put('/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    await query(`
      UPDATE piglet_care_notifications 
      SET is_read = TRUE, read_by = ?, read_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.user.id, notificationId]);
    
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

module.exports = router; 