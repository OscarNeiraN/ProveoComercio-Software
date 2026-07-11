require('dotenv').config();
const mysql = require('mysql2/promise');

const {
  DB_HOST,
  DB_PORT = '3306',
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
} = process.env;

const hasDbConfig = !!(DB_HOST && DB_NAME && DB_USER && DB_PASSWORD);

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
  {
    sku: 'DELL-XPS-001',
    brand: 'Dell',
    name: 'Notebook XPS 15 Intel Core i7 16GB 1TB SSD',
    category: 'Computacion',
    description: 'Pantalla 15.6 pulgadas, chasis de aluminio y rendimiento para trabajo intensivo.',
    image_url: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=900&q=80',
    price: 1299990,
    old_price: 1499990,
    rating: 4.8,
    reviews: 184,
    stock: 12,
  },
  {
    sku: 'HP-PAV-14-2026',
    brand: 'HP',
    name: 'Notebook Pavilion 14 Ryzen 7 16GB 512GB SSD',
    category: 'Computacion',
    description: 'Equipo liviano para estudio, oficina y videollamadas con carga rapida.',
    image_url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80',
    price: 699990,
    old_price: 849990,
    rating: 4.6,
    reviews: 96,
    stock: 18,
  },
  {
    sku: 'LEN-LEGION-5',
    brand: 'Lenovo',
    name: 'Notebook Gamer Legion 5 RTX 4060 16GB',
    category: 'Computacion',
    description: 'GPU dedicada, pantalla de alta tasa de refresco y sistema termico avanzado.',
    image_url: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=900&q=80',
    price: 1199990,
    old_price: 1399990,
    rating: 4.7,
    reviews: 142,
    stock: 9,
  },
  {
    sku: 'APL-MBA-M2-13',
    brand: 'Apple',
    name: 'MacBook Air 13 M2 8GB 256GB',
    category: 'Computacion',
    description: 'Diseno ultradelgado, chip M2 y bateria para toda la jornada.',
    image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80',
    price: 1049990,
    old_price: 1199990,
    rating: 4.9,
    reviews: 231,
    stock: 7,
  },
  {
    sku: 'LG-UW-034',
    brand: 'LG',
    name: 'Monitor UltraWide 34 pulgadas QHD',
    category: 'Monitores',
    description: 'Formato 21:9 para productividad, edicion y multitarea.',
    image_url: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=80',
    price: 489990,
    old_price: 579990,
    rating: 4.7,
    reviews: 121,
    stock: 5,
  },
  {
    sku: 'SAM-ODYSSEY-G5',
    brand: 'Samsung',
    name: 'Monitor Odyssey G5 27 pulgadas 165Hz',
    category: 'Monitores',
    description: 'Pantalla curva para juegos competitivos con respuesta rapida.',
    image_url: 'https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=900&q=80',
    price: 249990,
    old_price: 329990,
    rating: 4.5,
    reviews: 88,
    stock: 14,
  },
  {
    sku: 'DELL-P2425H',
    brand: 'Dell',
    name: 'Monitor Profesional 24 pulgadas IPS',
    category: 'Monitores',
    description: 'Pantalla IPS Full HD con altura ajustable para oficina.',
    image_url: 'https://images.unsplash.com/photo-1585792180666-f7347c490ee2?auto=format&fit=crop&w=900&q=80',
    price: 159990,
    old_price: 199990,
    rating: 4.4,
    reviews: 57,
    stock: 22,
  },
  {
    sku: 'KEY-K2-001',
    brand: 'Keychron',
    name: 'Teclado Mecanico K2 Bluetooth',
    category: 'Perifericos',
    description: 'Switches tactiles, formato compacto y conexion multi-dispositivo.',
    image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80',
    price: 89990,
    old_price: 109990,
    rating: 4.8,
    reviews: 276,
    stock: 30,
  },
  {
    sku: 'LOG-MX3-001',
    brand: 'Logitech',
    name: 'Mouse MX Master 3S Inalambrico',
    category: 'Perifericos',
    description: 'Sensor de alta precision, scroll magnetico y ergonomia premium.',
    image_url: 'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=900&q=80',
    price: 79990,
    old_price: 99990,
    rating: 4.9,
    reviews: 341,
    stock: 18,
  },
  {
    sku: 'HYP-QUADCAST-S',
    brand: 'HyperX',
    name: 'Microfono QuadCast S RGB USB',
    category: 'Perifericos',
    description: 'Microfono de condensador para streaming, clases y reuniones.',
    image_url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=900&q=80',
    price: 119990,
    old_price: 149990,
    rating: 4.6,
    reviews: 74,
    stock: 11,
  },
  {
    sku: 'LOG-C920S',
    brand: 'Logitech',
    name: 'Webcam C920s Full HD',
    category: 'Perifericos',
    description: 'Video 1080p, tapa de privacidad y enfoque automatico.',
    image_url: 'https://images.unsplash.com/photo-1623949556303-b0d17d198863?auto=format&fit=crop&w=900&q=80',
    price: 69990,
    old_price: 89990,
    rating: 4.5,
    reviews: 61,
    stock: 16,
  },
  {
    sku: 'SAM-SSD-1T',
    brand: 'Samsung',
    name: 'SSD 980 NVMe 1TB M.2',
    category: 'Almacenamiento',
    description: 'Unidad NVMe para mejorar velocidad de arranque, juegos y aplicaciones.',
    image_url: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=900&q=80',
    price: 69990,
    old_price: 89990,
    rating: 4.8,
    reviews: 214,
    stock: 25,
  },
  {
    sku: 'KGT-SD-2T',
    brand: 'Kingston',
    name: 'SSD Externo XS1000 2TB USB-C',
    category: 'Almacenamiento',
    description: 'Almacenamiento portatil compacto para respaldos y archivos grandes.',
    image_url: 'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?auto=format&fit=crop&w=900&q=80',
    price: 149990,
    old_price: 189990,
    rating: 4.6,
    reviews: 83,
    stock: 13,
  },
  {
    sku: 'SNY-WH5-001',
    brand: 'Sony',
    name: 'Audifonos WH-1000XM5 Noise Cancelling',
    category: 'Audio',
    description: 'Cancelacion de ruido, audio de alta resolucion y bateria de larga duracion.',
    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80',
    price: 319990,
    old_price: 399990,
    rating: 4.9,
    reviews: 389,
    stock: 8,
  },
  {
    sku: 'JBL-FLIP-6',
    brand: 'JBL',
    name: 'Parlante Bluetooth Flip 6 Resistente al Agua',
    category: 'Audio',
    description: 'Sonido potente, diseno resistente y bateria para exteriores.',
    image_url: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=80',
    price: 99990,
    old_price: 129990,
    rating: 4.7,
    reviews: 159,
    stock: 21,
  },
  {
    sku: 'APP-AIRPODS-PRO2',
    brand: 'Apple',
    name: 'AirPods Pro 2da Generacion USB-C',
    category: 'Audio',
    description: 'Audio espacial, cancelacion activa de ruido y estuche MagSafe.',
    image_url: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=900&q=80',
    price: 249990,
    old_price: 289990,
    rating: 4.8,
    reviews: 203,
    stock: 10,
  },
  {
    sku: 'XIA-PAD-6',
    brand: 'Xiaomi',
    name: 'Tablet Pad 6 11 pulgadas 128GB',
    category: 'Tablets',
    description: 'Pantalla fluida, cuerpo metalico y rendimiento para estudio o entretenimiento.',
    image_url: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=900&q=80',
    price: 329990,
    old_price: 389990,
    rating: 4.6,
    reviews: 92,
    stock: 12,
  },
  {
    sku: 'SAM-TAB-S9FE',
    brand: 'Samsung',
    name: 'Galaxy Tab S9 FE 10.9 pulgadas',
    category: 'Tablets',
    description: 'Incluye S Pen, pantalla amplia y resistencia para uso diario.',
    image_url: 'https://images.unsplash.com/photo-1589739900243-4b52cd9b104e?auto=format&fit=crop&w=900&q=80',
    price: 429990,
    old_price: 499990,
    rating: 4.7,
    reviews: 76,
    stock: 6,
  },
  {
    sku: 'APL-IPAD-10',
    brand: 'Apple',
    name: 'iPad 10.9 pulgadas WiFi 64GB',
    category: 'Tablets',
    description: 'Pantalla Liquid Retina, chip A14 y camara frontal horizontal.',
    image_url: 'https://images.unsplash.com/photo-1542751110-97427bbecf20?auto=format&fit=crop&w=900&q=80',
    price: 459990,
    old_price: 529990,
    rating: 4.8,
    reviews: 118,
    stock: 9,
  },
  {
    sku: 'SAM-S24-128',
    brand: 'Samsung',
    name: 'Galaxy S24 128GB 5G',
    category: 'Smartphones',
    description: 'Pantalla AMOLED, camaras avanzadas y funciones Galaxy AI.',
    image_url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=900&q=80',
    price: 729990,
    old_price: 849990,
    rating: 4.7,
    reviews: 212,
    stock: 15,
  },
  {
    sku: 'MOT-EDGE-50',
    brand: 'Motorola',
    name: 'Motorola Edge 50 Fusion 256GB',
    category: 'Smartphones',
    description: 'Pantalla pOLED, carga TurboPower y gran almacenamiento.',
    image_url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=900&q=80',
    price: 329990,
    old_price: 399990,
    rating: 4.4,
    reviews: 67,
    stock: 19,
  },
  {
    sku: 'ANK-HUB-8IN1',
    brand: 'Anker',
    name: 'Hub USB-C 8 en 1 HDMI 4K',
    category: 'Accesorios',
    description: 'Expande tu notebook con HDMI, USB, lector SD y carga Power Delivery.',
    image_url: 'https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=900&q=80',
    price: 59990,
    old_price: 74990,
    rating: 4.5,
    reviews: 51,
    stock: 28,
  },
  {
    sku: 'BEL-CHG-65W',
    brand: 'Belkin',
    name: 'Cargador GaN 65W USB-C Doble Puerto',
    category: 'Accesorios',
    description: 'Carga rapida para notebook, tablet y smartphone con diseno compacto.',
    image_url: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=900&q=80',
    price: 44990,
    old_price: 59990,
    rating: 4.6,
    reviews: 44,
    stock: 32,
  },
  {
    sku: 'TAR-MOCH-156',
    brand: 'Targus',
    name: 'Mochila Notebook 15.6 pulgadas Antirrobo',
    category: 'Accesorios',
    description: 'Compartimento acolchado, bolsillos interiores y material repelente al agua.',
    image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80',
    price: 39990,
    old_price: 54990,
    rating: 4.3,
    reviews: 38,
    stock: 24,
  },
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
      brand VARCHAR(120) NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(120) NOT NULL,
      description TEXT NULL,
      image_url VARCHAR(700) NULL,
      price DECIMAL(12,2) NOT NULL,
      old_price DECIMAL(12,2) NULL,
      rating DECIMAL(2,1) NOT NULL DEFAULT 4.5,
      reviews INT NOT NULL DEFAULT 0,
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
      processing_started_at DATETIME NULL,
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
  await ensureColumn('products', 'brand', 'VARCHAR(120) NULL');
  await ensureColumn('products', 'description', 'TEXT NULL');
  await ensureColumn('products', 'image_url', 'VARCHAR(700) NULL');
  await ensureColumn('products', 'old_price', 'DECIMAL(12,2) NULL');
  await ensureColumn('products', 'rating', 'DECIMAL(2,1) NOT NULL DEFAULT 4.5');
  await ensureColumn('products', 'reviews', 'INT NOT NULL DEFAULT 0');
  await ensureColumn('products', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('products', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await ensureColumn('orders', 'order_ref', 'VARCHAR(120) NULL');
  await ensureColumn('orders', 'processing_status', "VARCHAR(30) NOT NULL DEFAULT 'completed'");
  await ensureColumn('orders', 'processing_error', 'TEXT NULL');
  await ensureColumn('orders', 'processing_attempts', 'INT NOT NULL DEFAULT 0');
  await ensureColumn('orders', 'processing_started_at', 'DATETIME NULL');
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
    'orders',
    'idx_orders_processing_recovery',
    'CREATE INDEX idx_orders_processing_recovery ON orders (processing_status, processing_started_at)'
  );
  await ensureIndex(
    'order_items',
    'idx_order_items_product_id',
    'CREATE INDEX idx_order_items_product_id ON order_items (product_id)'
  );

  await seedDefaultProducts();
  await normalizeExistingData();

  for (const tipoDte of [39, 33]) {
    await pool.execute(
      'INSERT INTO folios (tipo_dte, ultimo_folio) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_folio = ultimo_folio',
      [tipoDte, 0]
    );
  }
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
      `INSERT INTO products (
         sku, brand, name, category, description, image_url,
         price, old_price, rating, reviews, stock, active
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         brand = VALUES(brand),
         name = VALUES(name),
         category = VALUES(category),
         description = VALUES(description),
         image_url = VALUES(image_url),
         price = VALUES(price),
         old_price = VALUES(old_price),
         rating = VALUES(rating),
         reviews = VALUES(reviews),
         active = TRUE`,
      [
        product.sku,
        product.brand,
        product.name,
        product.category,
        product.description,
        product.image_url,
        product.price,
        product.old_price,
        product.rating,
        product.reviews,
        product.stock,
      ]
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
