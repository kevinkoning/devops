const request = require('supertest');

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('axios');
jest.mock('../rabbitmq', () => ({
  publish: jest.fn().mockResolvedValue({}),
  connect: jest.fn().mockResolvedValue({}),
}));

const axios = require('axios');
const app = require('../server');

describe('Clock Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('geeft status ok terug', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('clock-service');
    });
  });

  describe('GET /clock/status', () => {
    it('geeft actieve targets terug', async () => {
      axios.get.mockResolvedValue({ data: { targets: [], total: 5 } });

      const res = await request(app).get('/clock/status');
      expect(res.status).toBe(200);
      expect(res.body.activeTargets).toBeDefined();
      expect(res.body.lastCheck).toBeDefined();
    });

    it('geeft 500 als target-service niet bereikbaar is', async () => {
      axios.get.mockRejectedValue(new Error('Connection refused'));

      const res = await request(app).get('/clock/status');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /clock/trigger', () => {
    it('triggert deadline check succesvol', async () => {
      axios.get.mockResolvedValue({ data: { targets: [], total: 0 } });

      const res = await request(app).post('/clock/trigger');
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/triggered/i);
    });
  });
});
