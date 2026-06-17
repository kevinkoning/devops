const request = require('supertest');

jest.mock('axios');

const axios = require('axios');
const app = require('../server');

describe('Register Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('geeft status ok terug', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('register-service');
    });
  });

  describe('POST /participate', () => {
    it('registreert deelname succesvol', async () => {
      axios.post.mockResolvedValue({ data: { message: 'Succesvol geregistreerd voor target' } });

      const res = await request(app)
        .post('/participate')
        .send({ targetId: 'target1', userId: 'user1' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/geregistreerd/i);
    });

    it('geeft foutmelding door van target-service', async () => {
      axios.post.mockRejectedValue({
        response: { status: 400, data: { error: 'Target is niet actief' } },
      });

      const res = await request(app)
        .post('/participate')
        .send({ targetId: 'target1', userId: 'user1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/niet actief/i);
    });
  });

  describe('POST /unsubscribe', () => {
    it('schrijft gebruiker uit voor target', async () => {
      axios.delete.mockResolvedValue({ data: { message: 'Succesvol uitgeschreven' } });

      const res = await request(app)
        .post('/unsubscribe')
        .send({ targetId: 'target1', userId: 'user1' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/uitgeschreven/i);
    });
  });

  describe('GET /participants/:targetId', () => {
    it('geeft deelnemers terug', async () => {
      axios.get.mockResolvedValue({ data: { participants: ['user1', 'user2'], count: 2 } });

      const res = await request(app).get('/participants/target1');
      expect(res.status).toBe(200);
      expect(res.body.participants).toHaveLength(2);
    });
  });
});
