const request = require('supertest');

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    process: jest.fn(),
    add: jest.fn().mockResolvedValue({ id: 'job123' }),
    on: jest.fn(),
  }));
});

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }),
  }),
}));

jest.mock('opossum', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    fire: jest.fn().mockResolvedValue({}),
    status: { state: 'closed' },
    stats: { failures: 0, successes: 0, rejects: 0, pending: 0 },
  }));
});

jest.mock('../rabbitmq', () => ({
  start: jest.fn().mockResolvedValue({}),
  publish: jest.fn().mockResolvedValue({}),
}));

const app = require('../server');

describe('Mail Service', () => {
  describe('GET /health', () => {
    it('geeft status ok terug', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('mail-service');
    });
  });

  describe('GET /mail/circuit-status', () => {
    it('geeft circuit breaker status terug', async () => {
      const res = await request(app).get('/mail/circuit-status');
      expect(res.status).toBe(200);
      expect(res.body.smtp).toBeDefined();
    });
  });

  describe('POST /mail/score', () => {
    it('zet score email in de wachtrij', async () => {
      const res = await request(app)
        .post('/mail/score')
        .send({
          email: 'test@example.com',
          targetTitle: 'Test Target',
          score: 85,
          finalScore: 90,
          rank: 1,
        });
      expect(res.status).toBe(200);
      expect(res.body.jobId).toBeDefined();
    });
  });

  describe('POST /mail/welcome', () => {
    it('zet welcome email in de wachtrij', async () => {
      const res = await request(app)
        .post('/mail/welcome')
        .send({ email: 'nieuw@example.com', password: 'geheim123' });
      expect(res.status).toBe(200);
      expect(res.body.jobId).toBeDefined();
    });
  });
});
