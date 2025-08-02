// backend/middleware/auth.js - UPDATED
const jwt = require('jsonwebtoken');
const { getConnection } = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔑 Token received:', token ? 'Present' : 'Missing');

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔓 Token decoded:', decoded);
    
    // FIXED: Handle both 'id' and 'employeeId' from different login systems
    const employeeId = decoded.employeeId || decoded.id;
    
    if (!employeeId) {
      console.error('❌ No employee ID in token:', decoded);
      return res.status(401).json({ message: 'Invalid token format' });
    }
    
    // Get current employee data
    const connection = await getConnection();
    const [employees] = await connection.execute(
      'SELECT id, role, status, full_name FROM employees WHERE id = ?',
      [employeeId]
    );
    connection.release();

    if (employees.length === 0) {
      console.error('❌ Employee not found:', employeeId);
      return res.status(401).json({ message: 'Employee not found' });
    }

    const employee = employees[0];

    if (employee.status === 'suspended') {
      return res.status(401).json({ message: 'Account suspended' });
    }

    // Set req.user with both formats for compatibility
    req.user = {
      id: employee.id,           // What pig routes expect
      employeeId: employee.id,   // Backward compatibility
      role: employee.role,
      status: employee.status,
      name: employee.full_name
    };

    console.log('✅ User authenticated:', {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      status: req.user.status
    });
    next();
  } catch (error) {
    console.error('❌ Auth error:', error.message);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    console.log('🔐 Role check:', {
      userRole: req.user.role,
      allowedRoles: allowedRoles,
      hasPermission: allowedRoles.includes(req.user.role)
    });
    
    if (!allowedRoles.includes(req.user.role)) {
      console.log('❌ Access denied:', req.user.role, 'not in', allowedRoles);
      return res.status(403).json({ 
        message: 'Insufficient permissions',
        userRole: req.user.role,
        requiredRoles: allowedRoles
      });
    }
    console.log('✅ Access granted for role:', req.user.role);
    next();
  };
};

module.exports = { authenticateToken, requireRole };