require('dotenv').config();

const db = require('./db');
const { isQueueEnabled, receiveMessages, deleteMessage } = require('./sqs');
const { processQueuedOrder, findRecoverableOrderIds } = require('./orderProcessor');

const recoveryIntervalMs = Number(process.env.WORKER_RECOVERY_INTERVAL_SECONDS || 60) * 1000;
const recoveryBatchSize = Number(process.env.WORKER_RECOVERY_BATCH_SIZE || 10);

let shuttingDown = false;
let lastRecoveryAt = 0;

process.on('SIGTERM', () => {
  shuttingDown = true;
  console.log('[worker] SIGTERM recibido, cerrando despues del ciclo actual');
});

process.on('SIGINT', () => {
  shuttingDown = true;
  console.log('[worker] SIGINT recibido, cerrando despues del ciclo actual');
});

function parseMessage(message) {
  const body = JSON.parse(message.Body || '{}');
  if (body.type !== 'PROCESS_ORDER' || !body.order_id) {
    throw new Error(`Mensaje SQS invalido: ${message.Body || ''}`);
  }

  return body;
}

async function handleMessage(message) {
  const payload = parseMessage(message);
  console.log(`[worker] Procesando orden ${payload.order_id}`);
  const result = await processQueuedOrder(payload.order_id);
  await deleteMessage(message.ReceiptHandle);
  console.log(`[worker] Orden ${payload.order_id} finalizada con estado ${result.status}`);
}

async function recoverPendingOrders(force = false) {
  const now = Date.now();
  if (!force && now - lastRecoveryAt < recoveryIntervalMs) {
    return;
  }

  lastRecoveryAt = now;
  const orderIds = await findRecoverableOrderIds(recoveryBatchSize);
  if (!orderIds.length) {
    return;
  }

  console.log(`[worker] Recuperando ${orderIds.length} orden(es) pendientes fuera de SQS`);
  for (const orderId of orderIds) {
    if (shuttingDown) break;

    try {
      const result = await processQueuedOrder(orderId);
      console.log(`[worker] Recuperacion orden ${orderId}: ${result.status}`);
    } catch (err) {
      console.error(`[worker] Recuperacion orden ${orderId} fallo: ${err.message}`);
    }
  }
}

async function main() {
  console.log('[worker] Iniciando consumidor SQS');

  if (!isQueueEnabled()) {
    throw new Error('SQS_QUEUE_URL no esta configurado');
  }

  await db.testConnection();
  await db.initializeSchema();
  console.log('[worker] MySQL conectado y esquema verificado');

  await recoverPendingOrders(true);

  while (!shuttingDown) {
    const messages = await receiveMessages();
    if (!messages.length) {
      await recoverPendingOrders();
      continue;
    }

    for (const message of messages) {
      if (shuttingDown) break;

      try {
        await handleMessage(message);
      } catch (err) {
        console.error('[worker]', err.message);
        if (err.message.startsWith('Mensaje SQS invalido')) {
          await deleteMessage(message.ReceiptHandle).catch(deleteErr =>
            console.error('[worker] No se pudo borrar mensaje invalido:', deleteErr.message)
          );
        }
      }
    }
  }

  console.log('[worker] Detenido');
}

main().catch(err => {
  console.error('[worker] Error fatal:', err.message);
  process.exit(1);
});
