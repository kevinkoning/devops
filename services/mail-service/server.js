require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Queue = require('bull');
const nodemailer = require('nodemailer');
const Opossum = require('opossum');
const rabbitmq = require('./rabbitmq');
const { metricsMiddleware, metricsHandler } = require('./metrics');

const app = express();
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

const mailQueue = new Queue('mail', process.env.REDIS_URL || 'redis://localhost:6379');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

const mailOptions = {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 60000,
  volumeThreshold: 5
};

const sendMailCircuitBreaker = new Opossum(async (options) => {
  const result = await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html
  });
  return result;
}, mailOptions);

sendMailCircuitBreaker.on('success', () => console.log('Email sent successfully'));
sendMailCircuitBreaker.on('failure', (error) => console.error('Email circuit breaker failure:', error.message));
sendMailCircuitBreaker.on('open', () => console.warn('Email circuit breaker OPEN - SMTP unavailable'));
sendMailCircuitBreaker.on('halfOpen', () => console.log('Email circuit breaker HALF-OPEN - testing SMTP'));
sendMailCircuitBreaker.on('close', () => console.log('Email circuit breaker CLOSED - SMTP recovered'));

mailQueue.process(async (job) => {
  const { to, subject, html } = job.data;
  
  try {
    await sendMailCircuitBreaker.fire({
      from: process.env.FROM_EMAIL || 'noreply@photoprestiges.com',
      to,
      subject,
      html
    });
    console.log(`Email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error.message);
    throw error;
  }
});

mailQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

app.post('/mail/send', async (req, res) => {
  try {
    const { to, subject, html, type = 'general' } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Ontbrekende verplichte velden' });
    }

    const job = await mailQueue.add({
      to,
      subject,
      html,
      type
    });

    res.json({ message: 'Email in wachtrij geplaatst', jobId: job.id });
  } catch (error) {
    console.error('Queue error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.post('/mail/welcome', async (req, res) => {
  try {
    const { email, password } = req.body;

    const html = `
      <h1>Welkom bij PhotoPrestiges!</h1>
      <p>Je account is aangemaakt met de volgende inloggegevens:</p>
      <ul>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Wachtwoord:</strong> ${password}</li>
      </ul>
      <p>Je kunt nu inloggen en beginnen met het creëren of najagen van targets!</p>
    `;

    const job = await mailQueue.add({
      to: email,
      subject: 'Welkom bij PhotoPrestiges!',
      html,
      type: 'welcome'
    });

    res.json({ message: 'Welkom email verstuurd', jobId: job.id });
  } catch (error) {
    console.error('Welcome email error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

function buildScoreEmail({ email, targetTitle, score, finalScore, rank }) {
  const html = `
    <h1>Jouw score voor "${targetTitle}"</h1>
    <p>Gefeliciteerd! Je hebt een score behaald:</p>
    <ul>
      <li><strong>Afbeeldingssimilariteit:</strong> ${score}%</li>
      <li><strong>Eindscore (met snelheidsbonus):</strong> ${finalScore}%</li>
      <li><strong>Ranglijst:</strong> #${rank}</li>
    </ul>
  `;
  return { to: email, subject: `Jouw score voor "${targetTitle}"`, html, type: 'score' };
}

function buildReminderEmail({ email, targetTitle, deadline }) {
  const deadlineDate = new Date(deadline);
  const timeLeft = deadlineDate - new Date();

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

  const html = `
    <h1>Herinnering: Deadline nadert!</h1>
    <p>De deadline voor de target "${targetTitle}" nadert!</p>
    <p><strong>Nog ${hours} uur en ${minutes} minuten</strong> om je foto in te sturen.</p>
    <p>Veel succes!</p>
  `;
  return { to: email, subject: `Herinnering: Deadline voor "${targetTitle}"`, html, type: 'reminder' };
}

function buildWinnerEmail({ email, targetTitle, winnerEmail, score }) {
  const html = `
    <h1>Winnaar bekend voor "${targetTitle}"!</h1>
    <p>De winnaar van deze target is bekend:</p>
    <ul>
      <li><strong>Gebruiker:</strong> ${winnerEmail}</li>
      <li><strong>Eindscore:</strong> ${score}%</li>
    </ul>
    <p>Bekijk de winnaar en alle inzendingen op je dashboard!</p>
  `;
  return { to: email, subject: `Winnaar bekend voor "${targetTitle}"!`, html, type: 'winner' };
}

app.post('/mail/score', async (req, res) => {
  try {
    const job = await mailQueue.add(buildScoreEmail(req.body));
    res.json({ message: 'Score email verstuurd', jobId: job.id });
  } catch (error) {
    console.error('Score email error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.post('/mail/reminder', async (req, res) => {
  try {
    const job = await mailQueue.add(buildReminderEmail(req.body));
    res.json({ message: 'Herinnering email verstuurd', jobId: job.id });
  } catch (error) {
    console.error('Reminder email error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

app.post('/mail/winner', async (req, res) => {
  try {
    const job = await mailQueue.add(buildWinnerEmail(req.body));
    res.json({ message: 'Winnaar email verstuurd', jobId: job.id });
  } catch (error) {
    console.error('Winner email error:', error);
    res.status(500).json({ error: 'Interne server error' });
  }
});

rabbitmq.start({
  'mail.score': async (data) => { await mailQueue.add(buildScoreEmail(data)); },
  'mail.reminder': async (data) => { await mailQueue.add(buildReminderEmail(data)); },
  'mail.winner': async (data) => { await mailQueue.add(buildWinnerEmail(data)); }
}).catch((err) => console.error('Failed to start RabbitMQ consumers:', err.message));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mail-service' });
});

app.get('/metrics', metricsHandler);

app.get('/mail/circuit-status', (req, res) => {
  res.json({
    smtp: {
      state: sendMailCircuitBreaker.status.state,
      status: sendMailCircuitBreaker.status,
      failures: sendMailCircuitBreaker.stats.failures,
      successes: sendMailCircuitBreaker.stats.successes,
      rejects: sendMailCircuitBreaker.stats.rejects,
      pending: sendMailCircuitBreaker.stats.pending
    }
  });
});

const PORT = process.env.PORT || 3004;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Mail Service running on port ${PORT}`);
  });
}

module.exports = app;
