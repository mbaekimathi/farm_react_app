// routes/employees.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { promisePool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Employee Registration
router.post('/register', [
  body('fullName').trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phoneNumber').isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('idNumber').trim().isLength({ min: 7 }).withMessage('ID number is required'),
  body('employeeCode').isLength({ min: 6, max: 6 }).withMessage('Employee code must be exactly 6 digits'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { fullName, email, phoneNumber, idNumber, employeeCode, password } = req.body;

    // Check if employee already exists with detailed conflict checking
    const [existingEmployees] = await promisePool.execute(
      'SELECT id, email, phone_number, id_number, employee_code FROM employees WHERE email = ? OR phone_number = ? OR id_number = ? OR employee_code = ?',
      [email, phoneNumber, idNumber, employeeCode]
    );

    if (existingEmployees.length > 0) {
      const existing = existingEmployees[0];
      let conflictField = '';
      
      if (existing.email === email) conflictField = 'email address';
      else if (existing.phone_number === phoneNumber) conflictField = 'phone number';
      else if (existing.id_number === idNumber) conflictField = 'ID number';
      else if (existing.employee_code === employeeCode) conflictField = 'employee code';
      
      return res.status(400).json({ 
        message: `An employee already exists with this ${conflictField}`,
        conflictField,
        success: false
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create employee record
    const [result] = await promisePool.execute(
      `INSERT INTO employees (full_name, email, phone_number, id_number, employee_code, password, role, status, hire_date, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), NOW())`,
      [fullName, email, phoneNumber, idNumber, employeeCode, hashedPassword, 'waiting_approval', 'suspended']
    );

    res.status(201).json({
      success: true,
      message: 'Employee registration submitted successfully. Awaiting approval.',
      employee: {
        id: result.insertId,
        fullName,
        email,
        phoneNumber,
        employeeCode,
        role: 'waiting_approval',
        status: 'suspended',
        registrationDate: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Debug endpoint to check current user role
router.get('/debug/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      status: req.user.status
    }
  });
});

// Temporary endpoint to list all users and their roles (for debugging)
router.get('/debug/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const [users] = await promisePool.execute(
      'SELECT id, full_name, email, role, status, employee_code FROM employees ORDER BY id'
    );
    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Temporary endpoint to update user role (for debugging)
router.put('/debug/update-role/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!['admin', 'manager', 'employee', 'cashier', 'vet'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    
    await promisePool.execute(
      'UPDATE employees SET role = ?, status = ? WHERE id = ?',
      [role, 'active', userId]
    );
    
    res.json({ success: true, message: `User role updated to ${role}` });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Temporary endpoint to create a manager user (for debugging)
router.post('/debug/create-manager', async (req, res) => {
  try {
    const { fullName, email, phoneNumber, idNumber, employeeCode, password } = req.body;
    
    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create manager user
    const [result] = await promisePool.execute(
      `INSERT INTO employees (full_name, email, phone_number, id_number, employee_code, password, role, status, hire_date, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), NOW())`,
      [fullName, email, phoneNumber, idNumber, employeeCode, hashedPassword, 'manager', 'active']
    );
    
    res.status(201).json({
      success: true,
      message: 'Manager user created successfully',
      employee: {
        id: result.insertId,
        fullName,
        email,
        employeeCode,
        role: 'manager',
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Error creating manager:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Employee Login
router.post('/login', [
  body('employeeCode').isLength({ min: 6, max: 6 }).withMessage('Employee code must be 6 digits'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { employeeCode, password } = req.body;

    // Get employee by employee code with all necessary fields
    const [employees] = await promisePool.execute(
      `SELECT id, full_name, email, phone_number, id_number, password, role, status, employee_code, 
              department, position, hire_date, salary, created_at, updated_at 
       FROM employees WHERE employee_code = ?`,
      [employeeCode]
    );

    if (employees.length === 0) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid employee code or password',
        statusCode: 'INVALID_CREDENTIALS'
      });
    }

    const employee = employees[0];

    // Verify password first
    const isValidPassword = await bcrypt.compare(password, employee.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid employee code or password',
        statusCode: 'INVALID_CREDENTIALS'
      });
    }

    // Check employee status - CRITICAL: Check suspension first
    if (employee.status === 'suspended') {
      return res.status(403).json({ 
        success: false,
        message: 'Your account has been suspended. Please contact the administrator.',
        statusCode: 'ACCOUNT_SUSPENDED'
      });
    }

    // Check employee role - waiting approval
    if (employee.role === 'waiting_approval') {
      return res.status(403).json({ 
        success: false,
        message: 'Your account is still pending approval. Please wait for administrator approval.',
        statusCode: 'PENDING_APPROVAL'
      });
    }

    // Validate role is active role
    const validRoles = ['admin', 'manager', 'employee', 'cashier', 'vet'];
    if (!validRoles.includes(employee.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Invalid account role. Please contact administrator.',
        statusCode: 'INVALID_ROLE'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        employeeId: employee.id, 
        role: employee.role,
        employeeCode: employee.employee_code,
        status: employee.status,
        name: employee.full_name
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last login timestamp
    await promisePool.execute(
      'UPDATE employees SET updated_at = NOW() WHERE id = ?',
      [employee.id]
    );

    // Return comprehensive user data
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: employee.id,
        name: employee.full_name,
        email: employee.email,
        phoneNumber: employee.phone_number,
        idNumber: employee.id_number,
        role: employee.role,
        employeeCode: employee.employee_code,
        department: employee.department,
        position: employee.position,
        status: employee.status,
        hireDate: employee.hire_date,
        salary: employee.salary,
        createdAt: employee.created_at,
        lastLogin: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login. Please try again.',
      statusCode: 'SERVER_ERROR'
    });
  }
});

// Employee Logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Optional: Update last logout timestamp
    await promisePool.execute(
      'UPDATE employees SET updated_at = NOW() WHERE id = ?',
      [req.user.employeeId]
    );

    res.json({
      success: true,
      message: 'Logged out successfully',
      logoutDetails: {
        employeeId: req.user.employeeId,
        employeeName: req.user.name,
        loggedOutAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during logout' 
    });
  }
});

// Get Employee Profile
router.get('/profile', authenticateToken, requireRole(['admin', 'manager', 'employee', 'cashier', 'vet']), async (req, res) => {
  try {
    const [employees] = await promisePool.execute(
      `SELECT id, full_name, email, phone_number, id_number, employee_code, role, department, 
              position, hire_date, status, salary, created_at, updated_at 
       FROM employees WHERE id = ?`,
      [req.user.employeeId]
    );

    if (employees.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee profile not found' 
      });
    }

    const employee = employees[0];

    res.json({ 
      success: true,
      employee: {
        ...employee,
        // Add computed fields
        profileCompleteness: calculateProfileCompleteness(employee),
        accountAge: calculateAccountAge(employee.created_at),
        isProfileComplete: !!(employee.department && employee.position && employee.salary)
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching profile' 
    });
  }
});

// Admin/Manager: Approve Employee
router.put('/approve/:employeeId', authenticateToken, requireRole(['admin', 'manager']), [
  body('role').isIn(['admin', 'manager', 'employee', 'cashier', 'vet']).withMessage('Invalid role specified'),
  body('department').optional().trim().isLength({ min: 1 }).withMessage('Department cannot be empty'),
  body('position').optional().trim().isLength({ min: 1 }).withMessage('Position cannot be empty'),
  body('salary').optional().isNumeric().withMessage('Salary must be a valid number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { employeeId } = req.params;
    const { role, department, position, salary } = req.body;

    // Prevent managers from approving employees as admins
    if (req.user.role === 'manager' && role === 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Managers cannot approve employees as administrators' 
      });
    }

    // First check if employee exists and is pending
    const [existingEmployee] = await promisePool.execute(
      'SELECT id, full_name, email, role FROM employees WHERE id = ?',
      [employeeId]
    );

    if (existingEmployee.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee not found' 
      });
    }

    if (existingEmployee[0].role !== 'waiting_approval') {
      return res.status(400).json({ 
        success: false,
        message: 'Employee is not pending approval',
        currentStatus: existingEmployee[0].role
      });
    }

    // Update employee role and status
    const [result] = await promisePool.execute(
      `UPDATE employees 
       SET role = ?, status = ?, department = ?, position = ?, salary = ?, updated_at = NOW() 
       WHERE id = ? AND role = 'waiting_approval'`,
      [role, 'active', department || null, position || null, salary || null, employeeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Failed to approve employee. Employee may have already been processed.' 
      });
    }

    // Get the updated employee data to return
    const [updatedEmployee] = await promisePool.execute(
      'SELECT id, full_name, email, employee_code, role, department, position, status, salary FROM employees WHERE id = ?',
      [employeeId]
    );

    res.json({ 
      success: true,
      message: `Employee ${existingEmployee[0].full_name} approved successfully as ${role}`,
      employee: updatedEmployee[0],
      approvalDetails: {
        approvedBy: req.user.name,
        approvedAt: new Date().toISOString(),
        assignedRole: role,
        department: department || 'Not assigned',
        position: position || 'Not assigned',
        salary: salary || 'Not set'
      }
    });

  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during employee approval' 
    });
  }
});

// Admin/Manager: Get Pending Approvals
router.get('/pending', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  console.log('📋 Pending employees request from:', req.user.name, 'with role:', req.user.role);
  try {
    const [pendingEmployees] = await promisePool.execute(
      `SELECT id, full_name, email, phone_number, id_number, employee_code, hire_date, created_at,
              DATEDIFF(NOW(), created_at) as days_pending
       FROM employees 
       WHERE role = 'waiting_approval'
       ORDER BY created_at DESC`
    );

    // Add additional metadata for each pending employee
    const enrichedPendingEmployees = pendingEmployees.map(employee => ({
      ...employee,
      status: 'pending',
      urgency: employee.days_pending > 7 ? 'high' : employee.days_pending > 3 ? 'medium' : 'low',
      waitingTime: formatWaitingTime(employee.days_pending)
    }));

    res.json({ 
      success: true,
      pendingEmployees: enrichedPendingEmployees,
      summary: {
        total: pendingEmployees.length,
        urgent: enrichedPendingEmployees.filter(emp => emp.urgency === 'high').length,
        recent: enrichedPendingEmployees.filter(emp => emp.days_pending <= 1).length,
        oldestPending: pendingEmployees.length > 0 ? Math.max(...pendingEmployees.map(emp => emp.days_pending)) : 0
      }
    });
  } catch (error) {
    console.error('Pending employees fetch error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching pending employees' 
    });
  }
});

// Admin: Get All Employees
router.get('/all', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const [employees] = await promisePool.execute(
      `SELECT id, full_name, email, phone_number, id_number, employee_code, role, department, 
              position, status, hire_date, salary, created_at, updated_at,
              DATEDIFF(NOW(), hire_date) as days_employed
       FROM employees 
       WHERE role != 'waiting_approval'
       ORDER BY created_at DESC`
    );

    // Calculate statistics
    const stats = {
      total: employees.length,
      active: employees.filter(emp => emp.status === 'active').length,
      suspended: employees.filter(emp => emp.status === 'suspended').length,
      byRole: employees.reduce((acc, emp) => {
        acc[emp.role] = (acc[emp.role] || 0) + 1;
        return acc;
      }, {}),
      byDepartment: employees.reduce((acc, emp) => {
        if (emp.department) {
          acc[emp.department] = (acc[emp.department] || 0) + 1;
        }
        return acc;
      }, {}),
      recentHires: employees.filter(emp => emp.days_employed <= 30).length,
      averageTenure: employees.length > 0 ? Math.round(employees.reduce((sum, emp) => sum + emp.days_employed, 0) / employees.length) : 0
    };

    // Enrich employee data
    const enrichedEmployees = employees.map(employee => ({
      ...employee,
      tenure: formatTenure(employee.days_employed),
      salaryFormatted: employee.salary ? `KSh ${Number(employee.salary).toLocaleString()}` : 'Not set',
      profileComplete: !!(employee.department && employee.position && employee.salary),
      isNewHire: employee.days_employed <= 30
    }));

    res.json({ 
      success: true,
      employees: enrichedEmployees,
      statistics: stats,
      metadata: {
        fetchedAt: new Date().toISOString(),
        totalRecords: employees.length,
        requestedBy: req.user.name
      }
    });
  } catch (error) {
    console.error('All employees fetch error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching employees' 
    });
  }
});

// Admin/Manager: Update Employee Details (Enhanced version with full editing)
router.put('/update/:employeeId', authenticateToken, requireRole(['admin', 'manager']), [
  body('full_name').trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone_number').isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('id_number').trim().isLength({ min: 7 }).withMessage('ID number is required'),
  body('role').optional().isIn(['admin', 'manager', 'employee', 'cashier', 'vet']).withMessage('Invalid role specified'),
  body('status').optional().isIn(['active', 'suspended']).withMessage('Status must be either active or suspended'),
  body('salary').optional().isNumeric().withMessage('Salary must be a valid number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { employeeId } = req.params;
    const { full_name, email, phone_number, id_number, role, department, position, salary, status } = req.body;

    // Get current employee details
    const [currentEmployee] = await promisePool.execute(
      'SELECT id, full_name, email, phone_number, id_number, role, status FROM employees WHERE id = ?',
      [employeeId]
    );

    if (currentEmployee.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee not found' 
      });
    }

    const employee = currentEmployee[0];

    // Prevent admin from changing their own role or suspending themselves
    if (req.user.employeeId == employeeId) {
      if (role && role !== employee.role && employee.role === 'admin') {
        return res.status(400).json({ 
          success: false,
          message: 'You cannot change your own admin role',
          action: 'self_role_change_prevented'
        });
      }
      if (status === 'suspended') {
        return res.status(400).json({ 
          success: false,
          message: 'You cannot suspend your own account',
          action: 'self_suspension_prevented'
        });
      }
    }

    // Check if email, phone, or ID already exists for other employees
    const [existingEmployees] = await promisePool.execute(
      'SELECT id, email, phone_number, id_number FROM employees WHERE (email = ? OR phone_number = ? OR id_number = ?) AND id != ?',
      [email, phone_number, id_number, employeeId]
    );

    if (existingEmployees.length > 0) {
      const existing = existingEmployees[0];
      let conflictField = '';
      
      if (existing.email === email) conflictField = 'email address';
      else if (existing.phone_number === phone_number) conflictField = 'phone number';
      else if (existing.id_number === id_number) conflictField = 'ID number';
      
      return res.status(400).json({ 
        success: false,
        message: `Another employee already exists with this ${conflictField}`,
        conflictField
      });
    }

    // Check if we're trying to change the last admin
    if (role && role !== 'admin' && employee.role === 'admin') {
      const [adminCount] = await promisePool.execute(
        'SELECT COUNT(*) as count FROM employees WHERE role = "admin" AND status = "active" AND id != ?',
        [employeeId]
      );

      if (adminCount[0].count === 0) {
        return res.status(400).json({ 
          success: false,
          message: 'Cannot change the role of the last active admin. Please promote another employee to admin first.',
          action: 'last_admin_protection'
        });
      }
    }

    // Update employee details
    const [result] = await promisePool.execute(
      `UPDATE employees 
       SET full_name = ?, email = ?, phone_number = ?, id_number = ?, role = ?, 
           department = ?, position = ?, salary = ?, status = ?, updated_at = NOW() 
       WHERE id = ? AND role != 'waiting_approval'`,
      [full_name, email, phone_number, id_number, role || employee.role, 
       department, position, salary || null, status || employee.status, employeeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee not found or cannot be updated' 
      });
    }

    // Get updated employee data
    const [updatedEmployee] = await promisePool.execute(
      'SELECT id, full_name, email, phone_number, id_number, employee_code, role, department, position, status, salary FROM employees WHERE id = ?',
      [employeeId]
    );

    res.json({ 
      success: true,
      message: `Employee ${full_name} updated successfully`,
      employee: updatedEmployee[0],
      changes: {
        updatedBy: req.user.name,
        updatedAt: new Date().toISOString(),
        previousData: {
          name: employee.full_name,
          role: employee.role,
          status: employee.status
        },
        newData: {
          name: full_name,
          role: role || employee.role,
          status: status || employee.status
        }
      }
    });

  } catch (error) {
    console.error('Employee update error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during employee update' 
    });
  }
});

// Request Employee Deletion (for all users)
router.post('/delete-request/:employeeId', authenticateToken, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ 
        success: false,
        message: 'Reason is required and must be at least 10 characters long' 
      });
    }

    // Check if employee exists
    const [employeeRows] = await promisePool.execute(
      'SELECT id, full_name, role, status FROM employees WHERE id = ?',
      [employeeId]
    );

    if (employeeRows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee not found' 
      });
    }

    const employee = employeeRows[0];

    // Prevent users from requesting deletion of their own account
    if (req.user.employeeId == employeeId) {
      return res.status(400).json({ 
        success: false,
        message: 'You cannot request deletion of your own account',
        action: 'self_deletion_prevented'
      });
    }

    // Check if delete request already exists
    const [existingRequests] = await promisePool.execute(
      'SELECT id FROM delete_requests WHERE item_type = "employee" AND item_id = ? AND status = "pending"',
      [employeeId]
    );

    if (existingRequests.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'A delete request for this employee already exists and is pending approval' 
      });
    }

    // Create delete request
    const { createDeleteRequest } = require('../utils/auditLogger');
    const requestId = await createDeleteRequest(
      req.user.employeeId,
      'employee',
      employeeId,
      `${employee.full_name} - ${employee.role}`,
      reason.trim()
    );

    res.json({ 
      success: true,
      message: 'Delete request submitted successfully. Awaiting admin approval.',
      requestId,
      employee: {
        id: employee.id,
        full_name: employee.full_name,
        role: employee.role
      }
    });

  } catch (error) {
    console.error('Error creating delete request:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create delete request' 
    });
  }
});

// Admin: Delete Employee
router.delete('/delete/:employeeId', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Check if employee exists and get their details
    const [employee] = await promisePool.execute(
      'SELECT id, full_name, role, status, email FROM employees WHERE id = ?',
      [employeeId]
    );

    if (employee.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee not found' 
      });
    }

    const employeeData = employee[0];

    // Prevent admin from deleting themselves
    if (req.user.employeeId == employeeId) {
      return res.status(400).json({ 
        success: false,
        message: 'You cannot delete your own account',
        action: 'self_deletion_prevented'
      });
    }

    // Prevent deletion of the last admin
    if (employeeData.role === 'admin') {
      const [adminCount] = await promisePool.execute(
        'SELECT COUNT(*) as count FROM employees WHERE role = "admin" AND status = "active" AND id != ?',
        [employeeId]
      );

      if (adminCount[0].count === 0) {
        return res.status(400).json({ 
          success: false,
          message: 'Cannot delete the last active admin. Please promote another employee to admin first.',
          action: 'last_admin_protection'
        });
      }
    }

    // Delete the employee
    const [result] = await promisePool.execute(
      'DELETE FROM employees WHERE id = ?',
      [employeeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee not found or could not be deleted' 
      });
    }

    // Log the deletion
    const { logDelete } = require('../utils/auditLogger');
    await logDelete(req.user.employeeId, 'employee', employeeId, {
      employee_name: employeeData.full_name,
      employee_role: employeeData.role,
      deleted_by: req.user.name
    });

    res.json({ 
      success: true,
      message: `Employee ${employeeData.full_name} deleted successfully`,
      deletedEmployee: {
        id: employeeData.id,
        name: employeeData.full_name,
        email: employeeData.email,
        role: employeeData.role
      },
      deletionDetails: {
        deletedBy: req.user.name,
        deletedAt: new Date().toISOString(),
        reason: 'Admin deletion'
      }
    });

  } catch (error) {
    console.error('Employee deletion error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during employee deletion' 
    });
  }
});

// Admin/Manager: Update Employee Status
router.put('/status/:employeeId', authenticateToken, requireRole(['admin', 'manager']), [
  body('status').isIn(['active', 'suspended']).withMessage('Status must be either active or suspended')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { employeeId } = req.params;
    const { status } = req.body;

    // Prevent admin from suspending themselves
    if (req.user.employeeId == employeeId && status === 'suspended') {
      return res.status(400).json({ 
        success: false,
        message: 'You cannot suspend your own account',
        action: 'self_suspension_prevented'
      });
    }

    // Get employee details before update
    const [beforeUpdate] = await promisePool.execute(
      'SELECT id, full_name, email, role, status FROM employees WHERE id = ? AND role != "waiting_approval"',
      [employeeId]
    );

    if (beforeUpdate.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee not found or cannot be updated' 
      });
    }

    const employee = beforeUpdate[0];

    // Check if status is already the same
    if (employee.status === status) {
      return res.status(400).json({
        success: false,
        message: `Employee is already ${status}`,
        currentStatus: status
      });
    }

    // Update employee status
    const [result] = await promisePool.execute(
      'UPDATE employees SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, employeeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Failed to update employee status' 
      });
    }

    res.json({ 
      success: true,
      message: `Employee ${employee.full_name} ${status === 'active' ? 'activated' : 'suspended'} successfully`,
      employee: {
        id: employee.id,
        name: employee.full_name,
        email: employee.email,
        role: employee.role,
        previousStatus: employee.status,
        newStatus: status
      },
      actionDetails: {
        performedBy: req.user.name,
        performedAt: new Date().toISOString(),
        action: status === 'active' ? 'activation' : 'suspension'
      }
    });

  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during status update' 
    });
  }
});

// Admin: Get Dashboard Statistics
router.get('/dashboard/stats', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    // Get comprehensive dashboard statistics
    const [employeeStats] = await promisePool.execute(`
      SELECT 
        COUNT(*) as total_employees,
        COUNT(CASE WHEN role != 'waiting_approval' THEN 1 END) as approved_employees,
        COUNT(CASE WHEN role = 'waiting_approval' THEN 1 END) as pending_approvals,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_employees,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_employees,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_registrations_30d,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as new_registrations_7d
      FROM employees
    `);

    const [roleDistribution] = await promisePool.execute(`
      SELECT role, COUNT(*) as count 
      FROM employees 
      WHERE role != 'waiting_approval' 
      GROUP BY role
    `);

    const [departmentDistribution] = await promisePool.execute(`
      SELECT department, COUNT(*) as count 
      FROM employees 
      WHERE department IS NOT NULL AND role != 'waiting_approval'
      GROUP BY department
    `);

    const [recentActivity] = await promisePool.execute(`
      SELECT full_name, role, status, created_at, updated_at,
             CASE 
               WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 'new_registration'
               WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 'status_change'
               ELSE 'other'
             END as activity_type
      FROM employees 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) 
         OR updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY GREATEST(created_at, updated_at) DESC 
      LIMIT 10
    `);

    res.json({
      success: true,
      statistics: {
        overview: employeeStats[0],
        roleDistribution: roleDistribution.reduce((acc, item) => {
          acc[item.role] = item.count;
          return acc;
        }, {}),
        departmentDistribution: departmentDistribution.reduce((acc, item) => {
          acc[item.department] = item.count;
          return acc;
        }, {}),
        trends: {
          growthRate30d: calculateGrowthRate(employeeStats[0].new_registrations_30d, employeeStats[0].total_employees),
          approvalRate: employeeStats[0].pending_approvals > 0 ? 
            ((employeeStats[0].approved_employees / (employeeStats[0].approved_employees + employeeStats[0].pending_approvals)) * 100).toFixed(1) : 100
        },
        recentActivity: recentActivity.map(activity => ({
          ...activity,
          timeAgo: formatTimeAgo(activity.updated_at > activity.created_at ? activity.updated_at : activity.created_at)
        }))
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: req.user.name
      }
    });

  } catch (error) {
   console.error('Dashboard stats error:', error);
   res.status(500).json({ 
     success: false,
     message: 'Server error fetching dashboard statistics' 
   });
 }
});

// Admin: Get Employee by ID
router.get('/employee/:employeeId', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
 try {
   const { employeeId } = req.params;

   const [employees] = await promisePool.execute(
     `SELECT id, full_name, email, phone_number, id_number, employee_code, role, department, 
             position, status, hire_date, salary, created_at, updated_at,
             DATEDIFF(NOW(), hire_date) as days_employed
      FROM employees 
      WHERE id = ?`,
     [employeeId]
   );

   if (employees.length === 0) {
     return res.status(404).json({ 
       success: false,
       message: 'Employee not found' 
     });
   }

   const employee = employees[0];

   // Enrich employee data
   const enrichedEmployee = {
     ...employee,
     tenure: formatTenure(employee.days_employed || 0),
     salaryFormatted: employee.salary ? `KSh ${Number(employee.salary).toLocaleString()}` : 'Not set',
     profileComplete: !!(employee.department && employee.position && employee.salary),
     isNewHire: (employee.days_employed || 0) <= 30,
     profileCompleteness: calculateProfileCompleteness(employee),
     accountAge: calculateAccountAge(employee.created_at)
   };

   res.json({ 
     success: true,
     employee: enrichedEmployee,
     metadata: {
       fetchedAt: new Date().toISOString(),
       requestedBy: req.user.name
     }
   });
 } catch (error) {
   console.error('Employee fetch error:', error);
   res.status(500).json({ 
     success: false,
     message: 'Server error fetching employee' 
   });
 }
});

// Admin: Search Employees
router.get('/search', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
 try {
   const { query, role, status, department, limit = 50 } = req.query;

   let sql = `
     SELECT id, full_name, email, phone_number, employee_code, role, department, 
            position, status, hire_date, salary, created_at
     FROM employees 
     WHERE role != 'waiting_approval'
   `;
   
   const params = [];

   if (query) {
     sql += ` AND (full_name LIKE ? OR email LIKE ? OR employee_code LIKE ? OR phone_number LIKE ?)`;
     const searchTerm = `%${query}%`;
     params.push(searchTerm, searchTerm, searchTerm, searchTerm);
   }

   if (role && role !== 'all') {
     sql += ` AND role = ?`;
     params.push(role);
   }

   if (status && status !== 'all') {
     sql += ` AND status = ?`;
     params.push(status);
   }

   if (department && department !== 'all') {
     sql += ` AND department = ?`;
     params.push(department);
   }

   sql += ` ORDER BY full_name ASC LIMIT ?`;
   params.push(parseInt(limit));

   const [employees] = await promisePool.execute(sql, params);

   // Enrich the search results
   const enrichedEmployees = employees.map(employee => ({
     ...employee,
     salaryFormatted: employee.salary ? `KSh ${Number(employee.salary).toLocaleString()}` : 'Not set',
     profileComplete: !!(employee.department && employee.position && employee.salary)
   }));

   res.json({ 
     success: true,
     employees: enrichedEmployees,
     searchMetadata: {
       query: query || 'all',
       filters: { role, status, department },
       resultCount: employees.length,
       searchedAt: new Date().toISOString()
     }
   });
 } catch (error) {
   console.error('Search error:', error);
   res.status(500).json({ 
     success: false,
     message: 'Server error during search' 
   });
 }
});

// Admin: Get Departments List
router.get('/departments', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
 try {
   const [departments] = await promisePool.execute(
     `SELECT 
       department as name, 
       COUNT(*) as employee_count,
       AVG(salary) as average_salary,
       COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
       COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_count,
       MIN(hire_date) as oldest_hire_date,
       MAX(hire_date) as newest_hire_date
      FROM employees 
      WHERE department IS NOT NULL AND role != 'waiting_approval'
      GROUP BY department 
      ORDER BY employee_count DESC, department ASC`
   );

   // Enrich department data
   const enrichedDepartments = departments.map(dept => ({
     ...dept,
     average_salary: dept.average_salary ? Math.round(dept.average_salary) : null,
     average_salary_formatted: dept.average_salary ? `KSh ${Math.round(dept.average_salary).toLocaleString()}` : 'N/A',
     activity_rate: ((dept.active_count / dept.employee_count) * 100).toFixed(1)
   }));

   res.json({ 
     success: true,
     departments: enrichedDepartments,
     summary: {
       totalDepartments: departments.length,
       totalEmployees: departments.reduce((sum, dept) => sum + dept.employee_count, 0),
       averageSize: departments.length > 0 ? Math.round(departments.reduce((sum, dept) => sum + dept.employee_count, 0) / departments.length) : 0
     },
     metadata: {
       fetchedAt: new Date().toISOString(),
       requestedBy: req.user.name
     }
   });
 } catch (error) {
   console.error('Departments fetch error:', error);
   res.status(500).json({ 
     success: false,
     message: 'Server error fetching departments' 
   });
 }
});

// Admin: Get Employee Statistics
router.get('/statistics', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
 try {
   // Get comprehensive statistics
   const [overallStats] = await promisePool.execute(`
     SELECT 
       COUNT(*) as total,
       COUNT(CASE WHEN status = 'active' AND role != 'waiting_approval' THEN 1 END) as active,
       COUNT(CASE WHEN status = 'suspended' AND role != 'waiting_approval' THEN 1 END) as suspended,
       COUNT(CASE WHEN role = 'waiting_approval' THEN 1 END) as pending,
       COUNT(CASE WHEN hire_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND role != 'waiting_approval' THEN 1 END) as recentHires,
       COUNT(CASE WHEN hire_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND role != 'waiting_approval' THEN 1 END) as weeklyHires,
       AVG(salary) as averageSalary,
       MIN(salary) as minSalary,
       MAX(salary) as maxSalary
     FROM employees
   `);

   const [roleDistribution] = await promisePool.execute(`
     SELECT role, COUNT(*) as count 
     FROM employees 
     WHERE role != 'waiting_approval' 
     GROUP BY role
   `);

   const [departmentDistribution] = await promisePool.execute(`
     SELECT department, COUNT(*) as count 
     FROM employees 
     WHERE department IS NOT NULL AND role != 'waiting_approval'
     GROUP BY department
   `);

   const [monthlyHiringTrend] = await promisePool.execute(`
     SELECT 
       DATE_FORMAT(hire_date, '%Y-%m') as month,
       COUNT(*) as hires
     FROM employees 
     WHERE hire_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) 
       AND role != 'waiting_approval'
     GROUP BY DATE_FORMAT(hire_date, '%Y-%m')
     ORDER BY month DESC
   `);

   const [salaryDistribution] = await promisePool.execute(`
     SELECT 
       CASE 
         WHEN salary < 20000 THEN 'Under 20K'
         WHEN salary < 30000 THEN '20K-30K'
         WHEN salary < 50000 THEN '30K-50K'
         WHEN salary < 100000 THEN '50K-100K'
         ELSE 'Over 100K'
       END as salary_range,
       COUNT(*) as count
     FROM employees 
     WHERE salary IS NOT NULL AND role != 'waiting_approval'
     GROUP BY salary_range
     ORDER BY MIN(salary)
   `);

   const statistics = {
     ...overallStats[0],
     averageSalary: overallStats[0].averageSalary ? Math.round(overallStats[0].averageSalary) : null,
     roleDistribution: roleDistribution.reduce((acc, item) => {
       acc[item.role] = item.count;
       return acc;
     }, {}),
     departmentDistribution: departmentDistribution.reduce((acc, item) => {
       acc[item.department] = item.count;
       return acc;
     }, {}),
     monthlyTrend: monthlyHiringTrend,
     salaryDistribution: salaryDistribution.reduce((acc, item) => {
       acc[item.salary_range] = item.count;
       return acc;
     }, {})
   };

   res.json({
     success: true,
     statistics,
     metadata: {
       fetchedAt: new Date().toISOString(),
       requestedBy: req.user.name
     }
   });
 } catch (error) {
   console.error('Statistics fetch error:', error);
   res.status(500).json({
     success: false,
     message: 'Server error fetching statistics'
   });
 }
});

module.exports = router;