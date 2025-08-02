const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// GET all farm locations
router.get('/locations', authenticateToken, async (req, res) => {
  try {
    const { type, active } = req.query;
    
    let sql = 'SELECT * FROM farm_locations WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND location_type = ?';
      params.push(type);
    }

    if (active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(active === 'true');
    }

    sql += ' ORDER BY location_name ASC';

    const locations = await query(sql, params);
    
    res.json({
      success: true,
      data: locations
    });
  } catch (error) {
    console.error('Error fetching farm locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch farm locations',
      error: error.message
    });
  }
});

// GET single farm location
router.get('/locations/:locationCode', authenticateToken, async (req, res) => {
  try {
    const { locationCode } = req.params;
    
    const [location] = await query(
      'SELECT * FROM farm_locations WHERE location_code = ?',
      [locationCode]
    );

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Farm location not found'
      });
    }

    res.json({
      success: true,
      data: location
    });
  } catch (error) {
    console.error('Error fetching farm location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch farm location',
      error: error.message
    });
  }
});

// POST create new farm location
router.post('/locations', authenticateToken, async (req, res) => {
  try {
    const { location_code, location_name, location_type, description } = req.body;

    // Validate required fields
    if (!location_code || !location_name || !location_type) {
      return res.status(400).json({
        success: false,
        message: 'Location code, name, and type are required'
      });
    }

    // Validate location type
    const validTypes = ['farm', 'store', 'facility', 'general'];
    if (!validTypes.includes(location_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location type. Must be one of: farm, store, facility, general'
      });
    }

    // Check if location code already exists
    const [existing] = await query(
      'SELECT location_code FROM farm_locations WHERE location_code = ?',
      [location_code]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Location code already exists'
      });
    }

    // Insert new location
    const result = await query(`
      INSERT INTO farm_locations (location_code, location_name, location_type, description)
      VALUES (?, ?, ?, ?)
    `, [location_code, location_name, location_type, description || null]);

    const [newLocation] = await query(
      'SELECT * FROM farm_locations WHERE id = ?',
      [result.insertId]
    );

    // Log the activity
    const userId = req.user.id;
    const userName = req.user.full_name || req.user.username;
    const userRole = req.user.role;

    await query(`
      INSERT INTO audit_activities (user_id, user_name, user_role, activity_type, description, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, userName, userRole, 'create', `Created new farm location: ${location_name}`, JSON.stringify({
      location_code: location_code,
      location_name: location_name,
      location_type: location_type,
      description: description
    })]);

    res.status(201).json({
      success: true,
      message: 'Farm location created successfully',
      data: newLocation
    });
  } catch (error) {
    console.error('Error creating farm location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create farm location',
      error: error.message
    });
  }
});

// PUT update farm location
router.put('/locations/:locationCode', authenticateToken, async (req, res) => {
  try {
    const { locationCode } = req.params;
    const { location_name, location_type, description, is_active } = req.body;

    // Check if location exists
    const [existing] = await query(
      'SELECT * FROM farm_locations WHERE location_code = ?',
      [locationCode]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Farm location not found'
      });
    }

    // Validate location type if provided
    if (location_type) {
      const validTypes = ['farm', 'store', 'facility', 'general'];
      if (!validTypes.includes(location_type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid location type. Must be one of: farm, store, facility, general'
        });
      }
    }

    // Update location
    const updateFields = [];
    const params = [];

    if (location_name !== undefined) {
      updateFields.push('location_name = ?');
      params.push(location_name);
    }

    if (location_type !== undefined) {
      updateFields.push('location_type = ?');
      params.push(location_type);
    }

    if (description !== undefined) {
      updateFields.push('description = ?');
      params.push(description);
    }

    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      params.push(is_active);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(locationCode);

    await query(`
      UPDATE farm_locations 
      SET ${updateFields.join(', ')}
      WHERE location_code = ?
    `, params);

    // Get updated location
    const [updatedLocation] = await query(
      'SELECT * FROM farm_locations WHERE location_code = ?',
      [locationCode]
    );

    // Log the activity
    const userId = req.user.id;
    const userName = req.user.full_name || req.user.username;
    const userRole = req.user.role;

    await query(`
      INSERT INTO audit_activities (user_id, user_name, user_role, activity_type, description, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, userName, userRole, 'update', `Updated farm location: ${existing.location_name}`, JSON.stringify({
      location_code: locationCode,
      old_data: existing,
      new_data: updatedLocation
    })]);

    res.json({
      success: true,
      message: 'Farm location updated successfully',
      data: updatedLocation
    });
  } catch (error) {
    console.error('Error updating farm location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update farm location',
      error: error.message
    });
  }
});

// DELETE farm location (soft delete by setting is_active to false) - ADMIN ONLY
router.delete('/locations/:locationCode', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can delete farm locations'
      });
    }

    const { locationCode } = req.params;

    // Check if location exists
    const [existing] = await query(
      'SELECT * FROM farm_locations WHERE location_code = ?',
      [locationCode]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Farm location not found'
      });
    }

    // Check if location is being used in other tables
    const usageChecks = [
      { table: 'grown_pigs', field: 'location' },
      { table: 'litters', field: 'location' },
      { table: 'batches', field: 'location' },
      
    ];

    for (const check of usageChecks) {
      const [usage] = await query(
        `SELECT COUNT(*) as count FROM ${check.table} WHERE ${check.field} = ?`,
        [locationCode]
      );

      if (usage.count > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete location. It is being used in ${check.table} table.`
        });
      }
    }

    // Soft delete by setting is_active to false
    await query(`
      UPDATE farm_locations 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE location_code = ?
    `, [locationCode]);

    res.json({
      success: true,
      message: 'Farm location deactivated successfully'
    });
  } catch (error) {
    console.error('Error deleting farm location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete farm location',
      error: error.message
    });
  }
});

// POST request to delete farm location (for managers)
router.post('/locations/:locationCode/delete-request', authenticateToken, async (req, res) => {
  try {
    const { locationCode } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    const userName = req.user.full_name || req.user.username;
    const userRole = req.user.role;

    // Check if location exists
    const [existing] = await query(
      'SELECT * FROM farm_locations WHERE location_code = ?',
      [locationCode]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Farm location not found'
      });
    }

    // Check if there's already a pending delete request for this location
    const [existingRequest] = await query(
      'SELECT * FROM delete_requests WHERE item_type = ? AND item_id = ? AND status = ?',
      ['farm_location', locationCode, 'pending']
    );

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'A delete request for this farm location is already pending'
      });
    }

    // Create delete request
    await query(`
      INSERT INTO delete_requests (item_type, item_id, item_details, requester_id, requester_name, requester_role, reason, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, ['farm_location', locationCode, existing.location_name, userId, userName, userRole, reason, 'pending']);

    // Log the activity
    await query(`
      INSERT INTO audit_activities (user_id, user_name, user_role, activity_type, description, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, userName, userRole, 'delete_request', `Requested deletion of farm location: ${existing.location_name}`, JSON.stringify({
      location_code: locationCode,
      location_name: existing.location_name,
      reason: reason
    })]);

    res.json({
      success: true,
      message: 'Delete request submitted successfully. Awaiting admin approval.'
    });
  } catch (error) {
    console.error('Error creating delete request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create delete request',
      error: error.message
    });
  }
});

// POST cancel delete request for farm location
router.post('/locations/:locationCode/cancel-delete-request', authenticateToken, async (req, res) => {
  try {
    const { locationCode } = req.params;
    const userId = req.user.id;
    const userName = req.user.full_name || req.user.username;
    const userRole = req.user.role;

    // Find and delete the pending request
    const [deletedRequest] = await query(
      'DELETE FROM delete_requests WHERE item_type = ? AND item_id = ? AND requester_id = ? AND status = ?',
      ['farm_location', locationCode, userId, 'pending']
    );

    if (deletedRequest.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'No pending delete request found for this farm location'
      });
    }

    // Log the activity
    await query(`
      INSERT INTO audit_activities (user_id, user_name, user_role, activity_type, description, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, userName, userRole, 'cancel_delete_request', `Cancelled delete request for farm location: ${locationCode}`, JSON.stringify({
      location_code: locationCode
    })]);

    res.json({
      success: true,
      message: 'Delete request cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling delete request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel delete request',
      error: error.message
    });
  }
});

// GET farm location statistics
router.get('/locations/:locationCode/statistics', authenticateToken, async (req, res) => {
  try {
    const { locationCode } = req.params;

    // Check if location exists
    const [existing] = await query(
      'SELECT * FROM farm_locations WHERE location_code = ?',
      [locationCode]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Farm location not found'
      });
    }

    // Get statistics from different tables
    const [grownPigsCount] = await query(
      'SELECT COUNT(*) as count FROM grown_pigs WHERE location = ?',
      [locationCode]
    );

    const [littersCount] = await query(
      'SELECT COUNT(*) as count FROM litters WHERE location = ?',
      [locationCode]
    );

    const [batchesCount] = await query(
      'SELECT COUNT(*) as count FROM batches WHERE location = ?',
      [locationCode]
    );

    // Get cow statistics (placeholder for now)
    const [cowsCount] = await query(
      'SELECT COUNT(*) as count FROM cows WHERE location = ?',
      [locationCode]
    ).catch(() => [{ count: 0 }]);

    // Get chicken statistics (placeholder for now)
    const [chickensCount] = await query(
      'SELECT COUNT(*) as count FROM chickens WHERE location = ?',
      [locationCode]
    ).catch(() => [{ count: 0 }]);

    const statistics = {
      location: existing,
      counts: {
        pigs: {
          total: grownPigsCount.count + littersCount.count + batchesCount.count,
          grown: grownPigsCount.count,
          litters: littersCount.count,
          batches: batchesCount.count
        },
        cows: {
          total: cowsCount.count,
          milking: 0, // Will be updated when cow tables are implemented
          pregnant: 0,
          calves: 0
        },
        chickens: {
          total: chickensCount.count,
          layers: 0, // Will be updated when chicken tables are implemented
          broilers: 0,
          chicks: 0
        },
        store: {
          items: 0,
          lowStock: 0,
          categories: 0
        }
      }
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Error fetching farm location statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch farm location statistics',
      error: error.message
    });
  }
});

// GET farm pigs data
router.get('/locations/:locationCode/pigs', authenticateToken, async (req, res) => {
  try {
    const { locationCode } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Check if location exists
    const [existing] = await query(
      'SELECT * FROM farm_locations WHERE location_code = ?',
      [locationCode]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Farm location not found'
      });
    }

    // Get grown pigs
    const grownPigs = await query(`
      SELECT * FROM grown_pigs 
      WHERE location = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [locationCode, parseInt(limit), offset]);

    // Get litters
    const litters = await query(`
      SELECT * FROM litters 
      WHERE location = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [locationCode, parseInt(limit), offset]);

    // Get batches
    const batches = await query(`
      SELECT * FROM batches 
      WHERE location = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [locationCode, parseInt(limit), offset]);

    // Get breeding records for pigs in this location
    const breedingRecords = await query(`
      SELECT br.*, 
             gp.location as pig_location,
             gp.pig_id as sow_pig_id,
             boar.pig_id as boar_pig_id
      FROM breeding_records br
      LEFT JOIN grown_pigs gp ON br.sow_id = gp.pig_id
      LEFT JOIN grown_pigs boar ON br.boar_id = boar.pig_id
      WHERE gp.location = ? OR boar.location = ?
      ORDER BY br.breeding_date DESC
      LIMIT ? OFFSET ?
    `, [locationCode, locationCode, parseInt(limit), offset]);

    // Get total counts
    const [grownPigsCount] = await query(
      'SELECT COUNT(*) as count FROM grown_pigs WHERE location = ?',
      [locationCode]
    );

    const [littersCount] = await query(
      'SELECT COUNT(*) as count FROM litters WHERE location = ?',
      [locationCode]
    );

    const [batchesCount] = await query(
      'SELECT COUNT(*) as count FROM batches WHERE location = ?',
      [locationCode]
    );

    const [breedingCount] = await query(`
      SELECT COUNT(*) as count 
      FROM breeding_records br
      LEFT JOIN grown_pigs gp ON br.sow_id = gp.pig_id
      LEFT JOIN grown_pigs boar ON br.boar_id = boar.pig_id
      WHERE gp.location = ? OR boar.location = ?
    `, [locationCode, locationCode]);

    res.json({
      success: true,
      data: {
        grown_pigs: grownPigs,
        litters: litters,
        batches: batches,
        breeding_records: breedingRecords,
        counts: {
          grown_pigs: grownPigsCount.count,
          litters: littersCount.count,
          batches: batchesCount.count,
          breeding_records: breedingCount.count,
          total: grownPigsCount.count + littersCount.count + batchesCount.count
        }
      }
    });
  } catch (error) {
    console.error('Error fetching farm pigs data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch farm pigs data',
      error: error.message
    });
  }
});

// GET farm cows data
router.get('/locations/:locationCode/cows', authenticateToken, async (req, res) => {
  try {
    const { locationCode } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Check if location exists
    const [existing] = await query(
      'SELECT * FROM farm_locations WHERE location_code = ?',
      [locationCode]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Farm location not found'
      });
    }

    // Get cows (placeholder - will be implemented when cow tables are created)
    const cows = [];
    const [cowsCount] = await query(
      'SELECT COUNT(*) as count FROM cows WHERE location = ?',
      [locationCode]
    ).catch(() => [{ count: 0 }]);

    res.json({
      success: true,
      data: {
        cows: cows,
        counts: {
          total: cowsCount.count,
          milking: 0,
          pregnant: 0,
          calves: 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching farm cows data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch farm cows data',
      error: error.message
    });
  }
});

// GET farm chickens data
router.get('/locations/:locationCode/chickens', authenticateToken, async (req, res) => {
  try {
    const { locationCode } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Check if location exists
    const [existing] = await query(
      'SELECT * FROM farm_locations WHERE location_code = ?',
      [locationCode]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Farm location not found'
      });
    }

    // Get chickens (placeholder - will be implemented when chicken tables are created)
    const chickens = [];
    const [chickensCount] = await query(
      'SELECT COUNT(*) as count FROM chickens WHERE location = ?',
      [locationCode]
    ).catch(() => [{ count: 0 }]);

    res.json({
      success: true,
      data: {
        chickens: chickens,
        counts: {
          total: chickensCount.count,
          layers: 0,
          broilers: 0,
          chicks: 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching farm chickens data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch farm chickens data',
      error: error.message
    });
  }
});

module.exports = router; 