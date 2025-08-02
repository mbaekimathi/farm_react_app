const { getConnection } = require('../config/database');

// Log user activity
async function logActivity(userId, activityType, description, details = null) {
  const connection = await getConnection();
  
  try {
    await connection.execute(`
      INSERT INTO audit_activities (user_id, activity_type, description, details, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, activityType, description, details ? JSON.stringify(details) : null]);
  } catch (error) {
    console.error('Error logging activity:', error);
  } finally {
    connection.release();
  }
}

// Log edit changes
async function logEditChange(userId, entityType, entityId, action, oldData = null, newData = null) {
  const connection = await getConnection();
  
  try {
    const changes = {};
    if (oldData) changes.old = oldData;
    if (newData) changes.new = newData;
    
    await connection.execute(`
      INSERT INTO edit_changes (user_id, entity_type, entity_id, action, changes, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, entityType, entityId, action, JSON.stringify(changes)]);
  } catch (error) {
    console.error('Error logging edit change:', error);
  } finally {
    connection.release();
  }
}

// Create delete request
async function createDeleteRequest(requesterId, itemType, itemId, itemDetails, reason) {
  const connection = await getConnection();
  
  try {
    const [result] = await connection.execute(`
      INSERT INTO delete_requests (requester_id, item_type, item_id, item_details, reason, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `, [requesterId, itemType, itemId, itemDetails, reason]);
    
    return result.insertId;
  } catch (error) {
    console.error('Error creating delete request:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Get pending delete requests count
async function getPendingDeleteRequestsCount() {
  const connection = await getConnection();
  
  try {
    const [result] = await connection.execute(`
      SELECT COUNT(*) as count FROM delete_requests WHERE status = 'pending'
    `);
    
    return result[0].count;
  } catch (error) {
    console.error('Error getting pending delete requests count:', error);
    return 0;
  } finally {
    connection.release();
  }
}

// Log login activity
async function logLogin(userId, ipAddress, userAgent) {
  await logActivity(userId, 'login', 'User logged in successfully', {
    ip: ipAddress,
    user_agent: userAgent,
    timestamp: new Date().toISOString()
  });
}

// Log logout activity
async function logLogout(userId) {
  await logActivity(userId, 'logout', 'User logged out', {
    timestamp: new Date().toISOString()
  });
}

// Log view activity
async function logView(userId, page, details = null) {
  await logActivity(userId, 'view', `Viewed ${page}`, {
    page,
    ...details,
    timestamp: new Date().toISOString()
  });
}

// Log create activity
async function logCreate(userId, entityType, entityId, details = null) {
  await logActivity(userId, 'create', `Created new ${entityType}`, {
    entity_type: entityType,
    entity_id: entityId,
    ...details,
    timestamp: new Date().toISOString()
  });
}

// Log update activity
async function logUpdate(userId, entityType, entityId, field, oldValue, newValue, details = null) {
  await logActivity(userId, 'update', `Updated ${entityType} ${field}`, {
    entity_type: entityType,
    entity_id: entityId,
    field,
    old_value: oldValue,
    new_value: newValue,
    ...details,
    timestamp: new Date().toISOString()
  });
}

// Log delete activity
async function logDelete(userId, entityType, entityId, details = null) {
  await logActivity(userId, 'delete', `Deleted ${entityType}`, {
    entity_type: entityType,
    entity_id: entityId,
    ...details,
    timestamp: new Date().toISOString()
  });
}

// Log export activity
async function logExport(userId, exportType, details = null) {
  await logActivity(userId, 'export', `Exported ${exportType}`, {
    export_type: exportType,
    ...details,
    timestamp: new Date().toISOString()
  });
}

// Log import activity
async function logImport(userId, importType, details = null) {
  await logActivity(userId, 'import', `Imported ${importType}`, {
    import_type: importType,
    ...details,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  logActivity,
  logEditChange,
  createDeleteRequest,
  getPendingDeleteRequestsCount,
  logLogin,
  logLogout,
  logView,
  logCreate,
  logUpdate,
  logDelete,
  logExport,
  logImport
}; 