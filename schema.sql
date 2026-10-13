-- Mar Social Hub website schema for MySQL 5.7+/MariaDB compatible shared hosting.
-- Existing deployments should back up first. The PHP app also performs additive table/column creation.
CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 username VARCHAR(60) NOT NULL UNIQUE,
 email VARCHAR(190) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 balance DECIMAL(14,2) NOT NULL DEFAULT 0,
 role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
 status ENUM('active','blocked') NOT NULL DEFAULT 'active',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS settings (
 skey VARCHAR(100) PRIMARY KEY,
 svalue TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS deposits (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 amount DECIMAL(14,2) NOT NULL,
 method VARCHAR(60) NOT NULL DEFAULT 'Bank Transfer',
 reference VARCHAR(120) NOT NULL,
 receipt_note TEXT NULL,
 payment_sender_name VARCHAR(160) NULL,
 payment_reference VARCHAR(160) NULL,
 receipt_path VARCHAR(500) NULL,
 receipt_original_name VARCHAR(255) NULL,
 receipt_mime VARCHAR(100) NULL,
 status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 reviewed_at DATETIME NULL,
 INDEX(user_id), INDEX(status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS transactions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 kind VARCHAR(40) NOT NULL,
 amount DECIMAL(14,2) NOT NULL,
 balance_after DECIMAL(14,2) NOT NULL,
 reference VARCHAR(120) NOT NULL,
 description VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(user_id), INDEX(created_at), INDEX(reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS orders (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 provider_key VARCHAR(30) NOT NULL,
 service_type VARCHAR(30) NOT NULL,
 service_name VARCHAR(255) NOT NULL,
 provider_order_id VARCHAR(120) NULL,
 provider_session_id VARCHAR(160) NULL,
 provider_activation_id VARCHAR(160) NULL,
 phone_number VARCHAR(80) NULL,
 otp_code VARCHAR(100) NULL,
 cancel_allowed_at DATETIME NULL,
 expires_at DATETIME NULL,
  last_polled_at DATETIME NULL,
 details MEDIUMTEXT NULL,
 amount DECIMAL(14,2) NOT NULL,
 status VARCHAR(40) NOT NULL DEFAULT 'pending_review',
 request_key VARCHAR(100) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(user_id), INDEX(status), INDEX(provider_order_id), UNIQUE KEY unique_request_key(request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS service_overrides (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 service_type VARCHAR(30) NOT NULL,
 provider_key VARCHAR(30) NOT NULL,
 provider_service_id VARCHAR(120) NOT NULL,
 name VARCHAR(255) NOT NULL,
 price DECIMAL(14,2) NOT NULL DEFAULT 0,
 provider_cost DECIMAL(14,4) NULL,
 provider_currency VARCHAR(20) NOT NULL DEFAULT '',
 category VARCHAR(180) NOT NULL DEFAULT '',
 min_quantity INT NOT NULL DEFAULT 1,
 max_quantity INT NOT NULL DEFAULT 10000000,
 enabled TINYINT(1) NOT NULL DEFAULT 1,
 UNIQUE KEY unique_service_type(provider_key,service_type,provider_service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS number_pool_overrides (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 provider_key VARCHAR(30) NOT NULL DEFAULT 'grizzly',
 service_id VARCHAR(120) NOT NULL,
 country_id VARCHAR(80) NOT NULL,
 pool_key CHAR(64) NOT NULL,
 provider_id VARCHAR(120) NULL,
 provider_cost DECIMAL(14,5) NOT NULL DEFAULT 0,
 stock_count INT NULL,
 customer_price DECIMAL(14,2) NOT NULL DEFAULT 0,
 enabled TINYINT(1) NOT NULL DEFAULT 1,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY unique_pool(provider_key,service_id,country_id,pool_key),
 INDEX(service_id,country_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS products (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 section ENUM('marketplace','website') NOT NULL DEFAULT 'marketplace',
 name VARCHAR(180) NOT NULL,
 description TEXT NULL,
 image_url VARCHAR(500) NULL,
 price DECIMAL(14,2) NOT NULL,
 enabled TINYINT(1) NOT NULL DEFAULT 1,
 admin_panel_url VARCHAR(500) NULL,
 customer_panel_url VARCHAR(500) NULL,
 instructions MEDIUMTEXT NULL,
 activation_mode VARCHAR(12) NOT NULL DEFAULT 'per_buyer',
 shared_code VARCHAR(255) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(section,enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Existing installs: the app adds the five website columns above automatically on first load.
CREATE TABLE IF NOT EXISTS inventory (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 product_id BIGINT UNSIGNED NOT NULL,
 delivery_content MEDIUMTEXT NOT NULL,
 status ENUM('available','sold') NOT NULL DEFAULT 'available',
 sold_to BIGINT UNSIGNED NULL,
 sold_order_id BIGINT UNSIGNED NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(product_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS support_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 sender_role ENUM('customer','admin') NOT NULL,
 message TEXT NOT NULL,
 read_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NULL,
 title VARCHAR(180) NOT NULL,
 message TEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 admin_user_id BIGINT UNSIGNED NULL,
 action VARCHAR(100) NOT NULL,
 entity_type VARCHAR(80) NOT NULL,
 entity_ref VARCHAR(120) NULL,
 details VARCHAR(500) NULL,
 ip_hash CHAR(64) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(created_at), INDEX(action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
