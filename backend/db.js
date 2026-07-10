require('dotenv').config();
const mysql = require('mysql2/promise');

const {
  DB_HOST,
  DB_PORT = '3306',
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
} = process.env;

const hasDbConfig = !!(DB_HOST && DB_NAME && DB_USER);

const pool = hasDbConfig ? mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT) || 3306,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
}) : null;

const DEFAULT_PRODUCTS = [
  { sku: 'DELL-XPS-001', name: 'Notebook Dell XPS 15', category: 'Computacion', price: 1299990, stock: 12 },
  { sku: 'LG-UW-034', name: 'Monitor LG UltraWide 34"', category: 'Monitores', price: 489990, stock: 5 },
  { sku: 'KEY-K2-001', name: 'Teclado Mecanico Keychron K2', category: 'Perifericos', price: 89990, stock: 30 },
  { sku: 'LOG-MX3-001', name: 'Mouse Logitech MX Master 3', category: 'Perifericos', price: 79990, stock: 18 },
  { sku: 'SAM-SSD-1T', name: 'Disco SSD Samsung 1TB', category: 'Almacenamiento', price: 69990, stock: 25 },
  { sku: 'SNY-WH5-001', name: 'Auriculares Sony WH-1000XM5', category: 'Audio', price: 319990, stock: 8 },
];

async function testConnection() {
  if (!pool) throw new Error('MySQL no esta configurado');
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0] && rows[0].ok === 1;
}

async function initializeSchema() {
  if (!pool) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS addresses (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      alias VARCHAR(100) NOT NULL DEFAULT 'Envio',
      street VARCHAR(255) NOT NULL,
      number VARCHAR(50) NOT NULL,
      apartment VARCHAR(100) NULL,
      commune VARCHAR(120) NOT NULL,
      region VARCHAR(120) NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_addresses_user_id (user_id),
      CONSTRAINT fk_addresses_user_id FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sku VARCHAR(120) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(120) NOT NULL,
      price DECIMAL(12,2) NOT NULL,
      stock INT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_products_category (category),
      INDEX idx_products_active (active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS orders (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      address_id CHAR(36) NULL,
      subtotal DECIMAL(12,2) NOT NULL,
      shipping_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL,
      order_ref VARCHAR(120) NULL,
      payment_method VARCHAR(60) NOT NULL DEFAULT 'online',
      boleta_tipo INT NULL,
      boleta_folio INT NULL,
      boleta_fecha DATETIME NULL,
      boleta_xml MEDIUMTEXT NULL,
      rut_receptor VARCHAR(20) NULL,
      processing_status VARCHAR(30) NOT NULL DEFAULT 'completed',
      processing_error TEXT NULL,
      processing_attempts INT NOT NULL DEFAULT 0,
      queued_at DATETIME NULL,
      processed_at DATETIME NULL,
      stock_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      stock_error TEXT NULL,
      stock_adjusted_at DATETIME NULL,
      mail_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      mail_message_id VARCHAR(255) NULL,
      mail_error TEXT NULL,
      mail_sent_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_orders_user_id (user_id),
      INDEX idx_orders_address_id (address_id),
      INDEX idx_orders_processing_status (processing_status),
      CONSTRAINT fk_orders_user_id FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_orders_address_id FOREIGN KEY (address_id)
        REFERENCES addresses(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS order_items (
      id CHAR(36) PRIMARY KEY,
      order_id CHAR(36) NOT NULL,
      product_id INT NULL,
      sku VARCHAR(120) NULL,
      product_name VARCHAR(255) NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL,
      quantity INT NOT NULL,
      subtotal DECIMAL(12,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_order_items_order_id (order_id),
      INDEX idx_order_items_product_id (product_id),
      CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id)
        REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_order_items_product_id FOREIGN KEY (product_id)
        REFERENCES products(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS folios (
      tipo_dte INT PRIMARY KEY,
      ultimo_folio INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  ];

  for (const statement of statements) {
    await pool.execute(statement);
  }

  await ensureColumn('products', 'active', 'BOOLEAN NOT NULL DEFAULT TRUE');
  await ensureColumn('products', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('products', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await ensureColumn('orders', 'order_ref', 'VARCHAR(120) NULL');
  await ensureColumn('orders', 'processing_status', "VARCHAR(30) NOT NULL DEFAULT 'completed'");
  await ensureColumn('orders', 'processing_error', 'TEXT NULL');
  await ensureColumn('orders', 'processing_attempts', 'INT NOT NULL DEFAULT 0');
  await ensureColumn('orders', 'queued_at', 'DATETIME NULL');
  await ensureColumn('orders', 'processed_at', 'DATETIME NULL');
  await ensureColumn('orders', 'stock_status', "VARCHAR(30) NOT NULL DEFAULT 'pending'");
  await ensureColumn('orders', 'stock_error', 'TEXT NULL');
  await ensureColumn('orders', 'stock_adjusted_at', 'DATETIME NULL');
  await ensureColumn('orders', 'mail_status', "VARCHAR(30) NOT NULL DEFAULT 'pending'");
  await ensureColumn('orders', 'mail_message_id', 'VARCHAR(255) NULL');
  await ensureColumn('orders', 'mail_error', 'TEXT NULL');
  await ensureColumn('orders', 'mail_sent_at', 'DATETIME NULL');
  await ensureColumn('orders', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('order_items', 'product_id', 'INT NULL');
  await ensureColumn('order_items', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await ensureIndex(
    'orders',
    'idx_orders_processing_status',
    'CREATE INDEX idx_orders_processing_status ON orders (processing_status)'
  );
  await ensureIndex(
    'order_items',
    'idx_order_items_product_id',
    'CREATE INDEX idx_order_items_product_id ON order_items (product_id)'
  );

  await seedDefaultProducts();
  await normalizeExistingData();

  await pool.execute(
    'INSERT INTO folios (tipo_dte, ultimo_folio) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_folio = ultimo_folio',
    [39, 0]
  );
}

async function ensureColumn(tableName, columnName, definition) {
  const [rows] = await pool.execute(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName]
  );

  if (!rows.length) {
    await pool.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function ensureIndex(tableName, indexName, createSql) {
  const [rows] = await pool.execute(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1`,
    [tableName, indexName]
  );

  if (!rows.length) {
    await pool.execute(createSql);
  }
}

async function seedDefaultProducts() {
  for (const product of DEFAULT_PRODUCTS) {
    await pool.execute(
      `INSERT INTO products (sku, name, category, price, stock, active)
       VALUES (?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         category = VALUES(category),
         price = VALUES(price),
         active = TRUE`,
      [product.sku, product.name, product.category, product.price, product.stock]
    );
  }
}

async function normalizeExistingData() {
  await pool.execute(
    `UPDATE orders
        SET processing_status = 'completed'
      WHERE processing_status IS NULL`
  );

  await pool.execute(
    `UPDATE orders
        SET processing_attempts = 0
      WHERE processing_attempts IS NULL`
  );

  await pool.execute(
    `UPDATE orders
        SET stock_status = 'pending'
      WHERE stock_status IS NULL`
  );

  await pool.execute(
    `UPDATE orders
        SET mail_status = 'pending'
      WHERE mail_status IS NULL`
  );

  await pool.execute(
    `UPDATE orders
        SET queued_at = COALESCE(processed_at, NOW())
      WHERE queued_at IS NULL
        AND processing_status IN ('queued', 'failed', 'processing')`
  );

  await pool.execute(
    `UPDATE orders
        SET order_ref = CONCAT('PV-', UPPER(LEFT(REPLACE(id, '-', ''), 10)))
      WHERE order_ref IS NULL`
  );

  await pool.execute(
    `UPDATE order_items oi
      JOIN products p ON p.sku = oi.sku
        SET oi.product_id = p.id
      WHERE oi.product_id IS NULL`
  );
}

module.exports = { pool, testConnection, initializeSchema };
