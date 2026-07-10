const {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');

const region = process.env.AWS_REGION || 'us-east-1';
const queueUrl = process.env.SQS_QUEUE_URL || '';
const visibilityTimeout = Number(process.env.SQS_VISIBILITY_TIMEOUT_SECONDS || 300);
const waitTimeSeconds = Number(process.env.SQS_WAIT_TIME_SECONDS || 20);
const maxMessages = Number(process.env.SQS_MAX_MESSAGES || 5);

const client = queueUrl ? new SQSClient({ region }) : null;

function isQueueEnabled() {
  return !!(client && queueUrl);
}

async function sendOrderMessage(orderId) {
  if (!isQueueEnabled()) {
    throw new Error('SQS_QUEUE_URL no esta configurado');
  }

  const result = await client.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({
      type: 'PROCESS_ORDER',
      order_id: orderId,
      created_at: new Date().toISOString(),
    }),
    MessageAttributes: {
      type: {
        DataType: 'String',
        StringValue: 'PROCESS_ORDER',
      },
      order_id: {
        DataType: 'String',
        StringValue: orderId,
      },
    },
  }));

  return result.MessageId;
}

async function receiveMessages() {
  if (!isQueueEnabled()) {
    throw new Error('SQS_QUEUE_URL no esta configurado');
  }

  const result = await client.send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: Math.min(Math.max(maxMessages, 1), 10),
    WaitTimeSeconds: Math.min(Math.max(waitTimeSeconds, 0), 20),
    VisibilityTimeout: visibilityTimeout,
    MessageAttributeNames: ['All'],
    AttributeNames: ['ApproximateReceiveCount'],
  }));

  return result.Messages || [];
}

async function deleteMessage(receiptHandle) {
  if (!isQueueEnabled()) {
    throw new Error('SQS_QUEUE_URL no esta configurado');
  }

  await client.send(new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  }));
}

module.exports = {
  isQueueEnabled,
  sendOrderMessage,
  receiveMessages,
  deleteMessage,
};
