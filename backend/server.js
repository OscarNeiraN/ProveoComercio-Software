require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');
const { listProducts, getProductById, listCategories } = require('./products');
const { createQueuedOrder, processQueuedOrder, getOrderForUser } = require('./orderProcessor');
const { isQueueEnabled, sendOrderMessage } = require('./sqs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cambiar_este_secreto';
const JWT_EXPIRES_IN = '7d';
const hasDbConfig = !!(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER);

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function getMode() {
  return hasDbConfig ? 'rds' : 'unconfigured';
}

function requireDatabase(req, res, next) {
  if (!db.pool) {
    return res.status(503).json({ error: 'MySQL/RDS no esta configurado' });
  }

  next();
}

async function getUserByEmail(email) {
  const [rows] = await db.pool.execute(
    'SELECT id, email, first_name, last_name, password_hash FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

async function getUserById(id) {
  const [rows] = await db.pool.execute(
    'SELECT id, email, first_name, last_name FROM users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido' });
  }
}

function validatePasswordPolicy({ password, email, first_name, last_name }) {
  const failures = [];
  const value = String(password || '');
  const normalized = value.toLowerCase();
  const localPart = String(email || '').split('@')[0].toLowerCase();
  const identityTokens = [localPart, first_name, last_name]
    .map(token => String(token || '').trim().toLowerCase())
    .filter(token => token.length >= 3);

  if (value.length < 12) failures.push('minimo 12 caracteres');
  if (value.length > 128) failures.push('maximo 128 caracteres');
  if (!/[a-z]/.test(value)) failures.push('una minuscula');
  if (!/[A-Z]/.test(value)) failures.push('una mayuscula');
  if (!/[0-9]/.test(value)) failures.push('un numero');
  if (!/[^A-Za-z0-9]/.test(value)) failures.push('un simbolo');
  if (/\s/.test(value)) failures.push('sin espacios');
  if (identityTokens.some(token => normalized.includes(token))) {
    failures.push('no debe incluir nombre, apellido ni email');
  }

  return failures;
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(express.static(__dirname));
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', async (req, res) => {
  const deep = req.query.deep === '1' || process.env.HEALTHCHECK_DEEP === 'true';
  const dbStatus = !deep
    ? { connected: false, skipped: true }
    : hasDbConfig
      ? await withTimeout(
          db.testConnection()
            .then(() => ({ connected: true }))
            .catch(err => ({ connected: false, error: err.message })),
          1500,
          { connected: false, error: 'timeout' }
        )
      : { connected: false, error: 'not_configured' };

  res.json({
    status: 'ok',
    service: 'proveocomercio-backend',
    version: '2.0.0',
    check: deep ? 'deep' : 'liveness',
    timestamp: new Date().toISOString(),
    db: dbStatus,
    inventory: { source: 'rds' },
    mode: getMode(),
  });
});

app.post('/api/register', requireDatabase, async (req, res) => {
  const { email, password, first_name, last_name } = req.body;
  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const passwordFailures = validatePasswordPolicy({ password, email, first_name, last_name });
  if (passwordFailures.length) {
    return res.status(400).json({
      error: 'La contrasena no cumple la politica de seguridad',
      requirements: passwordFailures,
    });
  }

  try {
    const existing = await getUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const id = crypto.randomUUID();
    await db.pool.execute(
      'INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [id, email.toLowerCase(), password_hash, first_name, last_name]
    );

    const user = { id, email: email.toLowerCase(), first_name, last_name };
    const token = createToken(id);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('[/api/register]', err.message);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

app.post('/api/login', requireDatabase, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Faltan email o password' });
  }

  try {
    const user = await getUserByEmail(email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    const token = createToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    });
  } catch (err) {
    console.error('[/api/login]', err.message);
    res.status(500).json({ error: 'Error al iniciar sesion' });
  }
});

app.get('/api/me', requireDatabase, authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user });
  } catch (err) {
    console.error('[/api/me]', err.message);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

app.get('/api/products', requireDatabase, async (req, res) => {
  try {
    const products = await listProducts({
      category: req.query.category,
      search: req.query.search,
    });

    res.json({
      total: products.length,
      products,
      source: 'rds',
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[/api/products]', err.message);
    res.status(500).json({ error: 'Error al consultar productos', detail: err.message });
  }
});

app.get('/api/products/:id', requireDatabase, async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(product);
  } catch (err) {
    console.error('[/api/products/:id]', err.message);
    res.status(500).json({ error: 'Error al consultar producto', detail: err.message });
  }
});

app.get('/api/categories', requireDatabase, async (_req, res) => {
  try {
    const categories = await listCategories();
    res.json({ categories });
  } catch (err) {
    console.error('[/api/categories]', err.message);
    res.status(500).json({ error: 'Error al obtener categorias', detail: err.message });
  }
});

app.post('/api/orders', requireDatabase, authMiddleware, async (req, res) => {
  const { items, tipo_dte = 39, rut_receptor, address } = req.body;
  if (!items?.length) {
    return res.status(400).json({ error: 'Faltan items en el pedido' });
  }
  if (!address || !address.street || !address.number || !address.commune || !address.region) {
    return res.status(400).json({ error: 'Falta la direccion de envio (calle, numero, comuna y region)' });
  }

  try {
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

    const queuedOrder = await createQueuedOrder({
      user,
      items,
      tipo_dte,
      rut_receptor,
      address,
    });

    if (isQueueEnabled()) {
      try {
        const messageId = await sendOrderMessage(queuedOrder.order_id);
        return res.status(202).json({
          message: 'Pedido recibido y encolado',
          order_id: queuedOrder.order_id,
          order_ref: queuedOrder.order_ref,
          address_id: queuedOrder.address_id,
          status: queuedOrder.status,
          total: queuedOrder.total,
          queued: true,
          queue_message_id: messageId,
          source: 'rds',
        });
      } catch (queueErr) {
        console.error('[sqs]', queueErr.message);
      }
    }

    const processed = await processQueuedOrder(queuedOrder.order_id);
    return res.status(201).json({
      message: 'Orden creada',
      queued: false,
      ...processed,
      address_id: queuedOrder.address_id,
    });
  } catch (err) {
    console.error('[/api/orders]', err.message);
    return res.status(502).json({ error: 'Error al crear orden', detail: err.message });
  }
});

app.get('/api/orders/:id', requireDatabase, authMiddleware, async (req, res) => {
  try {
    const order = await getOrderForUser(req.params.id, req.userId);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json({ order });
  } catch (err) {
    console.error('[/api/orders/:id]', err.message);
    res.status(500).json({ error: 'Error al obtener orden' });
  }
});

app.get('/api/orders/:id/boleta', requireDatabase, authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.pool.execute(
      'SELECT boleta_xml, boleta_tipo, boleta_folio FROM orders WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!rows.length || !rows[0].boleta_xml) {
      return res.status(404).json({ error: 'Boleta no encontrada' });
    }
    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="DTE_T${rows[0].boleta_tipo}F${rows[0].boleta_folio}.xml"`);
    res.send(rows[0].boleta_xml);
  } catch (err) {
    console.error('[/api/orders/:id/boleta]', err.message);
    res.status(500).json({ error: 'Error al obtener boleta' });
  }
});

app.listen(PORT, async () => {
  console.log('');
  console.log('========================================');
  console.log(' ProveoComercio Backend v2.0');
  console.log(` http://localhost:${PORT}`);
  console.log('========================================');

  if (!hasDbConfig) {
    console.warn(' [!] MySQL/RDS no esta configurado. Define DB_HOST, DB_NAME y DB_USER.');
    console.log('========================================');
    return;
  }

  console.log(` MySQL: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}`);
  try {
    await db.testConnection();
    await db.initializeSchema();
    console.log(' [MySQL] Conexion correcta');
    console.log(' [MySQL] Esquema y catalogo verificados');
  } catch (err) {
    console.error(` [!] No se pudo conectar a MySQL: ${err.message}`);
  }

  console.log('========================================');
});
