const db = require('./db');

function assertDbConfigured() {
  if (!db.pool) {
    throw new Error('MySQL no esta configurado');
  }
}

function mapProduct(row) {
  const price = Number(row.price);
  const oldPrice = row.old_price === null ? null : Number(row.old_price);
  const discount = oldPrice && oldPrice > price
    ? Math.round((1 - price / oldPrice) * 100)
    : 0;

  return {
    id: Number(row.id),
    sku: row.sku,
    brand: row.brand || '',
    name: row.name,
    category: row.category,
    description: row.description || '',
    image_url: row.image_url || '',
    price,
    old_price: oldPrice,
    discount,
    rating: Number(row.rating || 0),
    reviews: Number(row.reviews || 0),
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
    `SELECT id, sku, brand, name, category, description, image_url,
            price, old_price, rating, reviews, stock
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
    `SELECT id, sku, brand, name, category, description, image_url,
            price, old_price, rating, reviews, stock
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
