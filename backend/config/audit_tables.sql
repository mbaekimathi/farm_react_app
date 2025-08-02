-- Audit System Tables

-- Delete Requests Table
CREATE TABLE IF NOT EXISTS delete_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_id INT NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  item_id VARCHAR(100) NOT NULL,
  item_details TEXT,
  reason TEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  processed_by INT,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (requester_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_by) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_item_type (item_type),
  INDEX idx_created_at (created_at)
);

-- Edit Changes Table
CREATE TABLE IF NOT EXISTS edit_changes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  action ENUM('create', 'update', 'delete') NOT NULL,
  changes JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_entity_type (entity_type),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

-- Audit Activities Table
CREATE TABLE IF NOT EXISTS audit_activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_activity_type (activity_type),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

-- Insert some sample data for testing
INSERT INTO delete_requests (requester_id, item_type, item_id, item_details, reason, status) VALUES
(1, 'employee', '2', 'John Doe - Employee', 'Employee resigned', 'pending'),
(1, 'pig', 'PIG001', 'Pig PIG001 - Grown Pig', 'Sick pig, needs to be removed', 'pending'),
(1, 'litter', 'LIT001', 'Litter LIT001 - 8 piglets', 'Stillborn litter', 'pending');

INSERT INTO edit_changes (user_id, entity_type, entity_id, action, changes) VALUES
(1, 'employee', '2', 'update', '{"old": {"full_name": "John Doe"}, "new": {"full_name": "John Smith"}}'),
(1, 'pig', 'PIG001', 'update', '{"old": {"weight": 50}, "new": {"weight": 55}}'),
(1, 'farm_location', 'FARM001', 'create', '{"new": {"name": "New Farm", "location": "Nairobi"}}');

INSERT INTO audit_activities (user_id, activity_type, description, details) VALUES
(1, 'login', 'User logged in successfully', '{"ip": "192.168.1.1", "user_agent": "Mozilla/5.0"}'),
(1, 'create', 'Created new employee record', '{"entity_type": "employee", "entity_id": "3"}'),
(1, 'update', 'Updated pig weight', '{"entity_type": "pig", "entity_id": "PIG001", "field": "weight"}'),
(1, 'view', 'Viewed employee dashboard', '{"page": "employee-dashboard"}'); 