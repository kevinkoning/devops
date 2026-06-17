const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

let channel = null;
let connecting = null;

async function getChannel() {
  if (channel) return channel;
  if (connecting) return connecting;

  connecting = (async () => {
    const connection = await amqp.connect(RABBITMQ_URL);
    connection.on('close', () => {
      console.error('RabbitMQ connection closed, will reconnect on next publish');
      channel = null;
      connecting = null;
    });
    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err.message);
    });

    const ch = await connection.createChannel();
    channel = ch;
    connecting = null;
    return ch;
  })();

  return connecting;
}

async function publish(queue, message) {
  const ch = await getChannel();
  await ch.assertQueue(queue, { durable: true });
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
}

module.exports = { publish };
