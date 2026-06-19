const request = require('supertest');

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({}),
    set: jest.fn(),
  };
});

jest.mock('../models/Target');
jest.mock('../utils/minio', () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  uploadFileCircuitBreaker: {
    status: { state: 'closed' },
    stats: { failures: 0, successes: 0, rejects: 0, pending: 0 },
  },
}));
jest.mock('axios');

const jwt = require('jsonwebtoken');
const Target = require('../models/Target');
const app = require('../server');

const JWT_SECRET = 'supersecretkey123';

function makeOwnerToken() {
  return jwt.sign({ userId: 'owner123', role: 'target_owner' }, JWT_SECRET);
}

describe('Target Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('geeft status ok terug', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('target-service');
    });
  });

  describe('GET /targets', () => {
    it('geeft lijst van actieve targets terug', async () => {
      const mockTargets = [
        { _id: 'target1', title: 'Test Target', status: 'active' },
      ];
      Target.find.mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockTargets),
      });
      Target.countDocuments.mockResolvedValue(1);

      const res = await request(app).get('/targets');
      expect(res.status).toBe(200);
      expect(res.body.targets).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /targets/:id', () => {
    it('geeft 404 als target niet bestaat', async () => {
      Target.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      const res = await request(app).get('/targets/nonexistentid');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/niet gevonden/i);
    });

    it('geeft target terug als het bestaat', async () => {
      const mockTarget = { _id: 'target1', title: 'Test', status: 'active' };
      Target.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockTarget) });

      const res = await request(app).get('/targets/target1');
      expect(res.status).toBe(200);
      expect(res.body.target.title).toBe('Test');
    });
  });

  describe('POST /targets', () => {
    it('geeft 401 zonder token', async () => {
      const res = await request(app)
        .post('/targets')
        .send({ title: 'Nieuw', latitude: 52.3, longitude: 4.9, deadline: new Date(Date.now() + 86400000) });
      expect(res.status).toBe(401);
    });

    it('geeft 400 als verplichte velden ontbreken', async () => {
      const token = makeOwnerToken();
      const res = await request(app)
        .post('/targets')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Alleen titel' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/verplicht/i);
    });

    it('geeft 400 als deadline in het verleden ligt', async () => {
      const token = makeOwnerToken();
      const res = await request(app)
        .post('/targets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          latitude: 52.3,
          longitude: 4.9,
          deadline: new Date(Date.now() - 86400000).toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/toekomst/i);
    });

    it('maakt een target aan met geldige data', async () => {
      const token = makeOwnerToken();
      const mockTarget = {
        _id: 'target1',
        title: 'Nieuw Target',
        save: jest.fn().mockResolvedValue({}),
      };
      Target.mockImplementation(() => mockTarget);

      const res = await request(app)
        .post('/targets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Nieuw Target',
          latitude: 52.3,
          longitude: 4.9,
          deadline: new Date(Date.now() + 86400000).toISOString(),
        });
      expect(res.status).toBe(201);
      expect(res.body.message).toMatch(/aangemaakt/i);
    });
  });
});
