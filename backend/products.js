const db = require('./db');

function assertDbConfigured() {
  if (!db.pool) {
    throw new Error('MySQL no esta configurado');
  }
}

function mapProduct(row) {
  return {
    id: Number(row.id),
    sku: row.sku,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    stock: Number(row.stock),
  };
}

async function listProducts({ category, search } = {}) {
  assertDbConfigured();

  const where = ['active = TRUE'];
  const params = [];

  if (category) {
    where.push('LOWER(category) LIKE ?');
    params.push(`%${String(category).toLowerCase()}%`);
  }

  if (search) {
    where.push('(LOWER(name) LIKE ? OR LOWER(sku) LIKE ?)');
    const q = `%${String(search).toLowerCase()}%`;
    params.push(q, q);
  }

  const [rows] = await db.pool.execute(
    `SELECT id, sku, name, category, price, stock
       FROM products
      WHERE ${where.join(' AND ')}
      ORDER BY category ASC, name ASC`,
    params
  );

  return rows.map(mapProduct);
}

async function getProductById(id) {
  assertDbConfigured();

  const [rows] = await db.pool.execute(
    `SELECT id, sku, name, category, price, stock
       FROM products
      WHERE id = ?
        AND active = TRUE
      LIMIT 1`,
    [id]
  );

  return rows[0] ? mapProduct(rows[0]) : null;
}

async function listCategories() {
  assertDbConfigured();

  const [rows] = await db.pool.execute(
    `SELECT category AS id, category AS name
       FROM products
      WHERE active = TRUE
      GROUP BY category
      ORDER BY category ASC`
  );

  return rows;
}

module.exports = {
  listProducts,
  getProductById,
  listCategories,
};
