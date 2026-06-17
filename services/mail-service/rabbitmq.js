const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const QUEUES = ['mail.score', 'mail.reminder', 'mail.winner'];

async function connectWithRetry() {
  while (true) {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      console.log('Connected to RabbitMQ');
      connection.on('close', () => {
        console.error('RabbitMQ connection closed, reconnecting in 5s...');
        setTimeout(() => connectWithRetry().then(startConsumers), 5000);
      });
      connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err.message);
      });
      return connection;
    } catch (err) {
      console.error('RabbitMQ connection failed, retrying in 5s...', err.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function startConsumers(connection, handlers) {
  const ch = await connection.createChannel();

  for (const queue of QUEUES) {
    await ch.assertQueue(queue, { durable: true });

    ch.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const data = JSON.parse(msg.content.toString());
        await handlers[queue](data);
        ch.ack(msg);
      } catch (error) {
        console.error(`Failed to process message from ${queue}:`, error.message);
        ch.nack(msg, false, true);
      }
    });

    console.log(`Listening for messages on queue: ${queue}`);
  }
}

async function start(handlers) {
  const connection = await connectWithRetry();
  await startConsumers(connection, handlers);
}

module.exports = { start };
