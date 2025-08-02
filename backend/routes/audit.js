const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getConnection } = require('../config/database');

// Get all delete requests
router.get('/delete-requests', authenticateToken, requireRole(['admin']), async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [requests] = await connection.execute(`
      SELECT 
        dr.id,
        dr.item_type,
        dr.item_id,
        dr.item_details,
        dr.reason,
        dr.status,
        dr.created_at,
        e.full_name as requester_name,
        e.role as requester_role
      FROM delete_requests dr
      LEFT JOIN employees e ON dr.requester_id = e.id
      ORDER BY dr.created_at DESC
    `);

    res.json({ requests });
  } catch (error) {
    console.error('Error fetching delete requests:', error);
    res.status(500).json({ message: 'Failed to fetch delete requests' });
  } finally {
    connection.release();
  }
});

// Approve or reject delete request
router.put('/delete-requests/:id/:action', authenticateToken, requireRole(['admin']), async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { id, action } = req.params;
    const { user } = req;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    await connection.beginTransaction();

    // Get the delete request
    const [requests] = await connection.execute(
      'SELECT * FROM delete_requests WHERE id = ? AND status = "pending"',
      [id]
    );

    if (requests.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Delete request not found or already processed' });
    }

    const request = requests[0];
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update request status
    await connection.execute(
      'UPDATE delete_requests SET status = ?, processed_by = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, user.id, id]
    );

    // If approved, perform the actual deletion
    if (action === 'approve') {
      await performActualDeletion(connection, request);
    }

    // Log the activity
    await connection.execute(`
      INSERT INTO audit_activities (user_id, activity_type, description, details, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      user.id,
      action === 'approve' ? 'approve' : 'reject',
      `${action === 'approve' ? 'Approved' : 'Rejected'} delete request for ${request.item_type} (ID: ${request.item_id})`,
      JSON.stringify({
        request_id: id,
        item_type: request.item_type,
        item_id: request.item_id,
        reason: request.reason
      })
    ]);

    await connection.commit();

    res.json({ 
      message: `Delete request ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      status: newStatus
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error processing delete request:', error);
    res.status(500).json({ message: 'Failed to process delete request' });
  } finally {
    connection.release();
  }
});

// Get all edit changes
router.get('/edit-changes', authenticateToken, requireRole(['admin']), async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [changes] = await connection.execute(`
      SELECT 
        ec.id,
        ec.entity_type,
        ec.entity_id,
        ec.action,
        ec.changes,
        ec.created_at,
        e.full_name as user_name,
        e.role as user_role
      FROM edit_changes ec
      LEFT JOIN employees e ON ec.user_id = e.id
      ORDER BY ec.created_at DESC
      LIMIT 1000
    `);

    res.json({ changes });
  } catch (error) {
    console.error('Error fetching edit changes:', error);
    res.status(500).json({ message: 'Failed to fetch edit changes' });
  } finally {
    connection.release();
  }
});

// Get all activities
router.get('/activities', authenticateToken, requireRole(['admin']), async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [activities] = await connection.execute(`
      SELECT 
        aa.id,
        aa.activity_type,
        aa.description,
        aa.details,
        aa.created_at,
        e.full_name as user_name,
        e.role as user_role
      FROM audit_activities aa
      LEFT JOIN employees e ON aa.user_id = e.id
      ORDER BY aa.created_at DESC
      LIMIT 1000
    `);

    res.json({ activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ message: 'Failed to fetch activities' });
  } finally {
    connection.release();
  }
});

// Helper function to perform actual deletion
async function performActualDeletion(connection, request) {
  const { item_type, item_id } = request;
  
  switch (item_type) {
    case 'employee':
      await connection.execute('DELETE FROM employees WHERE id = ?', [item_id]);
      break;
    case 'pig':
      await connection.execute('DELETE FROM grown_pigs WHERE pig_id = ?', [item_id]);
      break;
    case 'litter':
      await connection.execute('DELETE FROM litters WHERE id = ?', [item_id]);
      break;
    case 'batch':
      await connection.execute('DELETE FROM batches WHERE id = ?', [item_id]);
      break;
    case 'breeding_record':
      await connection.execute('DELETE FROM breeding_records WHERE id = ?', [item_id]);
      break;
    case 'farm_location':
      await connection.execute('DELETE FROM farm_locations WHERE id = ?', [item_id]);
      break;
    case 'stock_item':
      await connection.execute('DELETE FROM stock_items WHERE id = ?', [item_id]);
      break;
    default:
      throw new Error(`Unknown item type: ${item_type}`);
  }
}

module.exports = router; 