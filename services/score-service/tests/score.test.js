const request = require('supertest');

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({}),
    set: jest.fn(),
    model: jest.fn().mockReturnValue({
      findOne: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndDelete: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      aggregate: jest.fn(),
      countDocuments: jest.fn(),
    }),
  };
});

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    putObject: jest.fn().mockResolvedValue({}),
  })),
}));

jest.mock('../rabbitmq', () => ({
  publish: jest.fn().mockResolvedValue({}),
  connect: jest.fn().mockResolvedValue({}),
}));

jest.mock('axios');

const app = require('../server');

describe('Score Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('geeft status ok terug', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('score-service');
    });
  });

  describe('GET /score/circuit-status', () => {
    it('geeft circuit breaker status terug', async () => {
      const res = await request(app).get('/score/circuit-status');
      expect(res.status).toBe(200);
      expect(res.body.imagga).toBeDefined();
    });
  });

  describe('POST /score/submit', () => {
    it('geeft 400 als verplichte velden ontbreken', async () => {
      const res = await request(app)
        .post('/score/submit')
        .send({ targetId: 'target1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ontbrekende/i);
    });

    it('geeft 400 als userId ontbreekt', async () => {
      const res = await request(app)
        .post('/score/submit')
        .send({ targetId: 'target1', imageBase64: 'abc' });
      expect(res.status).toBe(400);
    });

    it('geeft 400 als imageBase64 ontbreekt', async () => {
      const res = await request(app)
        .post('/score/submit')
        .send({ targetId: 'target1', userId: 'user1' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /score/leaderboard', () => {
    it('geeft leaderboard terug', async () => {
      const mongoose = require('mongoose');
      const Submission = mongoose.model('Submission');
      Submission.aggregate.mockResolvedValue([
        { _id: 'user1', totalScore: 95, bestScore: 95, count: 1 },
      ]);

      const res = await request(app).get('/score/leaderboard');
      expect(res.status).toBe(200);
      expect(res.body.leaderboard).toBeDefined();
    });
  });
});
