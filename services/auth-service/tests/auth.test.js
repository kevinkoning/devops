const request = require('supertest');

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({}),
    set: jest.fn(),
  };
});

jest.mock('../models/User');

const User = require('../models/User');
const app = require('../server');

describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('geeft status ok terug', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('auth-service');
    });
  });

  describe('POST /auth/register', () => {
    it('geeft 400 als email ontbreekt', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ password: 'geheim123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/verplicht/i);
    });

    it('geeft 400 als wachtwoord ontbreekt', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/verplicht/i);
    });

    it('geeft 400 als wachtwoord korter dan 6 tekens is', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: '123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/6 tekens/i);
    });

    it('geeft 400 als email al bestaat', async () => {
      User.findOne.mockResolvedValue({ email: 'bestaand@example.com' });

      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'bestaand@example.com', password: 'geheim123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/bestaat al/i);
    });

    it('registreert een nieuwe gebruiker succesvol', async () => {
      User.findOne.mockResolvedValue(null);

      const mockUser = {
        _id: 'user123',
        email: 'nieuw@example.com',
        role: 'participant',
        save: jest.fn().mockResolvedValue({}),
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', email: 'nieuw@example.com', role: 'participant' }),
      };
      User.mockImplementation(() => mockUser);

      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'nieuw@example.com', password: 'geheim123' });

      expect(res.status).toBe(201);
      expect(res.body.message).toMatch(/succesvol/i);
      expect(res.body.token).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    it('geeft 400 als email ontbreekt', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ password: 'geheim123' });
      expect(res.status).toBe(400);
    });

    it('geeft 400 als wachtwoord ontbreekt', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(400);
    });

    it('geeft 401 als gebruiker niet bestaat', async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'onbekend@example.com', password: 'geheim123' });
      expect(res.status).toBe(401);
    });

    it('geeft 401 bij verkeerd wachtwoord', async () => {
      const mockUser = {
        email: 'test@example.com',
        comparePassword: jest.fn().mockResolvedValue(false),
      };
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'fout' });
      expect(res.status).toBe(401);
    });

    it('logt in met geldige credentials', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'participant',
        comparePassword: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', email: 'test@example.com' }),
      };
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'geheim123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });
  });
});
