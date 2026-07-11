const crypto = require('crypto');
const db = require('./db');
const { generarXMLDTE, siguienteFolio } = require('./boleta');
const { enviarConfirmacionCompra } = require('./mailer');

const PROCESSING_STALE_MINUTES = Math.max(
  1,
  Number(process.env.ORDER_PROCESSING_STALE_MINUTES || 15)
);

const EMISOR = {
  rut: process.env.RUT_EMISOR || '00000000-0',
  razonSocial: process.env.RAZON_SOCIAL || 'ProveoComercio SpA',
  giro: process.env.GIRO || 'Comercio al por menor de equipos tecnologicos',
  acteco: process.env.ACTECO || '472000',
  direccion: process.env.DIR_EMISOR || 'Direccion no configurada',
  comuna: process.env.COMUNA_EMISOR || 'Santiago',
  ciudad: process.env.CIUDAD_EMISOR || 'Santiago',
};

function assertDbConfigured() {
  if (!db.pool) {
    throw new Error('MySQL no esta configurado');
  }
}

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('Faltan items en el pedido');
  }

  return items.map(item => {
    const productId = parseInt(item.product_id, 10);
    const quantity = Number(item.quantity);

    if (!productId || !Number.isInteger(productId)) {
      throw new Error(`Producto invalido: ${item.product_id || ''}`);
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Cantidad invalida para producto ${productId}`);
    }

    return { product_id: productId, quantity };
  });
}

function validateAddress(address) {
  if (!address || !address.street || !address.number || !address.commune || !address.region) {
    throw new Error('Falta la direccion de envio (calle, numero, comuna y region)');
  }
}

function normalizeDocument({ tipo_dte, rut_receptor }) {
  const tipoDte = Number(tipo_dte || 39);
  const rutReceptor = String(rut_receptor || '').trim();

  if (![39, 33].includes(tipoDte)) {
    throw new Error('Tipo de documento no soportado. Usa boleta 39 o factura 33');
  }

  if (tipoDte === 33 && !rutReceptor) {
    throw new Error('La factura requiere RUT receptor');
  }

  return {
    tipoDte,
    rutReceptor: rutReceptor || '66666666-6',
  };
}

function makeOrderRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `PV-${stamp}-${suffix}`;
}

async function loadProductForUpdate(connection, productId) {
  const [rows] = await connection.execute(
    `SELECT id, sku, name, category, price, stock
       FROM products
      WHERE id = ?
        AND active = TRUE
      LIMIT 1
      FOR UPDATE`,
    [productId]
  );

  return rows[0] || null;
}

async function createQueuedOrder({ user, items, tipo_dte = 39, rut_receptor, address }) {
  assertDbConfigured();
  validateAddress(address);

  const requestedItems = normalizeItems(items);
  const document = normalizeDocument({ tipo_dte, rut_receptor });
  const orderId = crypto.randomUUID();
  const addressId = crypto.randomUUID();
  const orderRef = makeOrderRef();
  const connection = await db.pool.getConnection();

  let total = 0;
  const orderItems = [];

  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO addresses
         (id, user_id, alias, street, number, apartment, commune, region, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        addressId,
        user.id,
        address.alias || 'Envio',
        address.street,
        address.number,
        address.apartment || null,
        address.commune,
        address.region,
        false,
      ]
    );

    for (const item of requestedItems) {
      const product = await loadProductForUpdate(connection, item.product_id);
      if (!product) {
        throw new Error(`Producto ${item.product_id} no existe`);
      }

      const availableStock = Number(product.stock);
      if (availableStock < item.quantity) {
        throw new Error(`Stock insuficiente para ${product.name} (disponible: ${availableStock})`);
      }

      const unitPrice = Number(product.price);
      const subtotal = unitPrice * item.quantity;
      total += subtotal;

      await connection.execute(
        `UPDATE products
            SET stock = stock - ?
          WHERE id = ?`,
        [item.quantity, product.id]
      );

      orderItems.push({
        product_id: Number(product.id),
        sku: product.sku,
        name: product.name,
        unit_price: unitPrice,
        quantity: item.quantity,
        subtotal,
      });
    }

    await connection.execute(
      `INSERT INTO orders
         (id, user_id, address_id, subtotal, shipping_cost, total,
          order_ref, payment_method, boleta_tipo, rut_receptor,
          processing_status, queued_at, stock_status, stock_error,
          stock_adjusted_at, mail_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NULL, NOW(), ?)`,
      [
        orderId,
        user.id,
        addressId,
        total,
        0,
        total,
        orderRef,
        'sin_pago',
        document.tipoDte,
        document.rutReceptor,
        'queued',
        'adjusted',
        'pending',
      ]
    );

    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items
           (id, order_id, product_id, sku, product_name, unit_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          orderId,
          item.product_id,
          item.sku,
          item.name,
          item.unit_price,
          item.quantity,
          item.subtotal,
        ]
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return {
    order_id: orderId,
    address_id: addressId,
    order_ref: orderRef,
    status: 'queued',
    total,
  };
}

async function claimOrder(orderId) {
  const [result] = await db.pool.execute(
    `UPDATE orders
        SET processing_status = 'processing',
            processing_attempts = processing_attempts + 1,
            processing_error = NULL,
            processing_started_at = NOW()
      WHERE id = ?
        AND (
          processing_status IN ('queued', 'failed')
         OR (
           processing_status = 'completed'
           AND stock_adjusted_at IS NULL
           AND stock_status IN ('pending', 'failed')
          )
          OR (
            processing_status = 'completed'
            AND mail_status IN ('pending', 'failed')
          )
         OR (
           processing_status = 'processing'
           AND (
             processing_started_at IS NULL
             OR TIMESTAMPDIFF(MINUTE, processing_started_at, NOW()) >= ?
           )
           AND processing_attempts < 10
         )
        )`,
    [orderId, PROCESSING_STALE_MINUTES]
  );

  return result.affectedRows === 1;
}

async function markOrderFailed(orderId, err) {
  await db.pool.execute(
    `UPDATE orders
        SET processing_status = 'failed',
            processing_error = ?,
            processing_started_at = NULL
      WHERE id = ?`,
    [String(err.message || err).slice(0, 6000), orderId]
  );
}

async function markOrderCompleted(orderId) {
  await db.pool.execute(
    `UPDATE orders
        SET processing_status = 'completed',
            processing_error = NULL,
            processing_started_at = NULL,
            processed_at = NOW()
      WHERE id = ?`,
    [orderId]
  );
}

async function loadOrderData(orderId) {
  const [orders] = await db.pool.execute(
    `SELECT
       o.*,
       u.email,
       u.first_name,
       u.last_name,
       a.alias AS address_alias,
       a.street,
       a.number,
       a.apartment,
       a.commune,
       a.region
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN addresses a ON a.id = o.address_id
     WHERE o.id = ?
     LIMIT 1`,
    [orderId]
  );

  if (!orders.length) {
    throw new Error(`Orden ${orderId} no existe`);
  }

  const [items] = await db.pool.execute(
    `SELECT
       product_id,
       sku,
       product_name AS name,
       unit_price,
       quantity,
       subtotal
     FROM order_items
     WHERE order_id = ?
     ORDER BY id ASC`,
    [orderId]
  );

  return {
    order: orders[0],
    user: {
      id: orders[0].user_id,
      email: orders[0].email,
      first_name: orders[0].first_name,
      last_name: orders[0].last_name,
    },
    address: {
      id: orders[0].address_id,
      alias: orders[0].address_alias,
      street: orders[0].street,
      number: orders[0].number,
      apartment: orders[0].apartment,
      commune: orders[0].commune,
      region: orders[0].region,
    },
    items: items.map(item => ({
      ...item,
      product_id: item.product_id === null ? null : Number(item.product_id),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    })),
  };
}

async function reserveStockForLegacyOrder(order, items) {
  if (order.stock_adjusted_at) {
    return {
      skipped: true,
      status: order.stock_status || 'adjusted',
    };
  }

  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const item of items) {
      if (!item.product_id) {
        throw new Error(`Orden ${order.id} tiene item sin product_id`);
      }

      const product = await loadProductForUpdate(connection, item.product_id);
      if (!product) {
        throw new Error(`Producto ${item.product_id} no existe`);
      }

      const availableStock = Number(product.stock);
      if (availableStock < item.quantity) {
        throw new Error(`Stock insuficiente para ${product.name} (disponible: ${availableStock})`);
      }

      await connection.execute(
        `UPDATE products
            SET stock = stock - ?
          WHERE id = ?`,
        [item.quantity, item.product_id]
      );
    }

    await connection.execute(
      `UPDATE orders
          SET stock_status = 'adjusted',
              stock_error = NULL,
              stock_adjusted_at = NOW()
        WHERE id = ?`,
      [order.id]
    );

    await connection.commit();
    return { status: 'adjusted', source: 'rds' };
  } catch (err) {
    await connection.rollback();
    await db.pool.execute(
      `UPDATE orders
          SET stock_status = 'failed',
              stock_error = ?
        WHERE id = ?`,
      [String(err.message || err).slice(0, 6000), order.id]
    );
    throw err;
  } finally {
    connection.release();
  }
}

async function createOrReuseBoleta(order, user, address, items) {
  if (order.boleta_xml && order.boleta_folio) {
    return {
      tipo: order.boleta_tipo || 39,
      folio: order.boleta_folio,
      fecha: order.boleta_fecha ? new Date(order.boleta_fecha) : new Date(),
      xml: order.boleta_xml,
    };
  }

  const tipo = order.boleta_tipo || 39;
  const folio = await siguienteFolio(db.pool, tipo);
  const fecha = new Date();
  const xml = generarXMLDTE({
    tipo,
    folio,
    fecha,
    emisor: EMISOR,
    receptor: {
      rut: order.rut_receptor || '66666666-6',
      nombre: `${user.first_name} ${user.last_name}`,
      email: user.email,
    },
    items: items.map(item => ({
      nombre: item.name || 'Producto',
      descripcion: item.sku || '',
      cantidad: item.quantity,
      precio: item.unit_price,
    })),
  });

  await db.pool.execute(
    `UPDATE orders
        SET boleta_tipo = ?,
            boleta_folio = ?,
            boleta_fecha = ?,
            boleta_xml = ?
      WHERE id = ?`,
    [tipo, folio, fecha, xml, order.id]
  );

  return { tipo, folio, fecha, xml };
}

async function sendMailIfNeeded(order, user, address, items, boleta) {
  if (order.mail_sent_at && order.mail_status === 'sent') {
    return {
      skipped: true,
      messageId: order.mail_message_id,
    };
  }

  try {
    const mailStatus = await enviarConfirmacionCompra({
      user,
      items,
      total: order.total,
      address,
      folio: boleta.folio,
      tipo: boleta.tipo,
      boletaXML: boleta.xml,
    });

    if (mailStatus.simulated) {
      await db.pool.execute(
        `UPDATE orders
            SET mail_status = 'simulated',
                mail_message_id = NULL,
                mail_error = NULL,
                mail_sent_at = NULL
          WHERE id = ?`,
        [order.id]
      );
    } else {
      await db.pool.execute(
        `UPDATE orders
            SET mail_status = 'sent',
                mail_message_id = ?,
                mail_error = NULL,
                mail_sent_at = NOW()
          WHERE id = ?`,
        [mailStatus.messageId || null, order.id]
      );
    }

    return mailStatus;
  } catch (err) {
    await db.pool.execute(
      `UPDATE orders
          SET mail_status = 'failed',
              mail_error = ?
        WHERE id = ?`,
      [String(err.message || err).slice(0, 6000), order.id]
    );
    console.error('[mailer]', err.message);
    return { error: err.message };
  }
}

async function processQueuedOrder(orderId) {
  assertDbConfigured();

  const claimed = await claimOrder(orderId);
  if (!claimed) {
    const existing = await getOrderById(orderId);
    return {
      skipped: true,
      order_id: orderId,
      status: existing ? existing.processing_status : 'missing',
    };
  }

  try {
    const { order, user, address, items } = await loadOrderData(orderId);
    const stock = await reserveStockForLegacyOrder(order, items);
    const latestAfterStock = (await loadOrderData(orderId)).order;
    const boleta = await createOrReuseBoleta(latestAfterStock, user, address, items);
    const latestAfterBoleta = (await loadOrderData(orderId)).order;
    const mail = await sendMailIfNeeded(latestAfterBoleta, user, address, items, boleta);

    await markOrderCompleted(orderId);

    return {
      order_id: orderId,
      order_ref: latestAfterBoleta.order_ref,
      status: 'completed',
      total: Number(latestAfterBoleta.total),
      boleta: {
        tipo: boleta.tipo,
        folio: boleta.folio,
        fecha: boleta.fecha.toISOString(),
      },
      stock,
      mail,
      source: 'rds',
    };
  } catch (err) {
    await markOrderFailed(orderId, err);
    throw err;
  }
}

async function findRecoverableOrderIds(limit = 10) {
  assertDbConfigured();

  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
  const [rows] = await db.pool.execute(
    `SELECT id
       FROM orders
      WHERE processing_status IN ('queued', 'failed')
         OR (
           processing_status = 'completed'
           AND stock_adjusted_at IS NULL
           AND stock_status IN ('pending', 'failed')
         )
         OR (
           processing_status = 'completed'
           AND mail_status IN ('pending', 'failed')
         )
          OR (
            processing_status = 'processing'
            AND (
              processing_started_at IS NULL
              OR TIMESTAMPDIFF(MINUTE, processing_started_at, NOW()) >= ?
            )
            AND processing_attempts < 10
          )
      ORDER BY queued_at ASC, id ASC
      LIMIT ${safeLimit}`,
    [PROCESSING_STALE_MINUTES]
  );

  return rows.map(row => row.id);
}

function mapOrderRow(row, items = []) {
  const tipo = Number(row.boleta_tipo || 39);
  return {
    id: row.id,
    order_ref: row.order_ref,
    subtotal: Number(row.subtotal),
    shipping_cost: Number(row.shipping_cost),
    total: Number(row.total),
    payment_method: row.payment_method,
    document_type: tipo,
    document_label: tipo === 33 ? 'Factura' : 'Boleta',
    rut_receptor: row.rut_receptor,
    boleta_tipo: row.boleta_tipo,
    boleta_folio: row.boleta_folio,
    boleta_fecha: row.boleta_fecha,
    processing_status: row.processing_status,
    processing_error: row.processing_error,
    processing_attempts: Number(row.processing_attempts || 0),
    processing_started_at: row.processing_started_at,
    queued_at: row.queued_at,
    processed_at: row.processed_at,
    stock_status: row.stock_status,
    stock_error: row.stock_error,
    stock_adjusted_at: row.stock_adjusted_at,
    mail_status: row.mail_status,
    mail_message_id: row.mail_message_id,
    mail_error: row.mail_error,
    mail_sent_at: row.mail_sent_at,
    created_at: row.created_at,
    items,
  };
}

async function listOrdersForUser(userId, limit = 20) {
  assertDbConfigured();

  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const [orders] = await db.pool.execute(
    `SELECT
       id,
       subtotal,
       shipping_cost,
       total,
       order_ref,
       payment_method,
       boleta_tipo,
       boleta_folio,
       boleta_fecha,
       rut_receptor,
       processing_status,
       processing_error,
       processing_attempts,
       queued_at,
       processed_at,
       stock_status,
       stock_error,
       stock_adjusted_at,
       mail_status,
       mail_message_id,
       mail_error,
       mail_sent_at,
       created_at
     FROM orders
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}`,
    [userId]
  );

  if (!orders.length) return [];

  const orderIds = orders.map(order => order.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const [items] = await db.pool.execute(
    `SELECT
       order_id,
       product_id,
       sku,
       product_name AS name,
       unit_price,
       quantity,
       subtotal
     FROM order_items
     WHERE order_id IN (${placeholders})
     ORDER BY created_at ASC, id ASC`,
    orderIds
  );

  const itemsByOrder = new Map();
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) || [];
    list.push({
      product_id: item.product_id === null ? null : Number(item.product_id),
      sku: item.sku,
      name: item.name,
      unit_price: Number(item.unit_price),
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
    });
    itemsByOrder.set(item.order_id, list);
  }

  return orders.map(order => mapOrderRow(order, itemsByOrder.get(order.id) || []));
}

async function getOrderById(orderId) {
  const [rows] = await db.pool.execute(
    `SELECT *
       FROM orders
      WHERE id = ?
      LIMIT 1`,
    [orderId]
  );

  return rows[0] || null;
}

async function getOrderForUser(orderId, userId) {
  assertDbConfigured();

  const [rows] = await db.pool.execute(
    `SELECT
       id,
       user_id,
       address_id,
       subtotal,
       shipping_cost,
       total,
       order_ref,
       payment_method,
       boleta_tipo,
       boleta_folio,
       boleta_fecha,
       rut_receptor,
       processing_status,
       processing_error,
       processing_attempts,
       processing_started_at,
       queued_at,
       processed_at,
       stock_status,
       stock_error,
       stock_adjusted_at,
       mail_status,
       mail_message_id,
       mail_error,
       mail_sent_at,
       created_at
     FROM orders
     WHERE id = ?
       AND user_id = ?
     LIMIT 1`,
    [orderId, userId]
  );

  return rows[0] ? mapOrderRow(rows[0]) : null;
}

module.exports = {
  createQueuedOrder,
  processQueuedOrder,
  findRecoverableOrderIds,
  listOrdersForUser,
  getOrderForUser,
};
