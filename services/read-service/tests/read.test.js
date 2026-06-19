const request = require('supertest');

jest.mock('axios');

const axios = require('axios');
const app = require('../server');

describe('Read Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('geeft status ok terug', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('read-service');
    });
  });

  describe('GET /read/targets', () => {
    it('geeft lijst van targets terug', async () => {
      axios.get.mockResolvedValue({ data: { targets: [{ _id: 't1', title: 'Test' }], total: 1 } });

      const res = await request(app).get('/read/targets');
      expect(res.status).toBe(200);
      expect(res.body.targets).toBeDefined();
    });

    it('geeft 502 als target-service niet bereikbaar is', async () => {
      axios.get.mockRejectedValue(new Error('Connection refused'));

      const res = await request(app).get('/read/targets');
      expect(res.status).toBe(502);
    });
  });

  describe('GET /read/targets/nearby', () => {
    it('geeft 400 als lat/lng ontbreekt', async () => {
      const res = await request(app).get('/read/targets/nearby');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/verplicht/i);
    });

    it('geeft targets in de buurt terug', async () => {
      axios.get.mockResolvedValue({ data: { targets: [], total: 0 } });

      const res = await request(app).get('/read/targets/nearby?lat=52.3&lng=4.9');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /read/leaderboard', () => {
    it('geeft leaderboard terug', async () => {
      axios.get.mockResolvedValueOnce({ data: { leaderboard: [] } })
               .mockResolvedValueOnce({ data: { users: [] } });

      const res = await request(app).get('/read/leaderboard');
      expect(res.status).toBe(200);
    });
  });
});
