const request = require('supertest');
const app = require('../server');

describe('Swagger Service', () => {
  describe('GET /health', () => {
    it('geeft status ok terug', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('swagger-service');
    });
  });

  describe('GET /openapi.json', () => {
    it('geeft een geldig OpenAPI spec terug', async () => {
      const res = await request(app).get('/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.0.0');
      expect(res.body.info.title).toBe('PhotoPrestiges API');
      expect(res.body.paths).toBeDefined();
    });

    it('bevat de verplichte paden', async () => {
      const res = await request(app).get('/openapi.json');
      expect(res.body.paths['/auth/register']).toBeDefined();
      expect(res.body.paths['/auth/login']).toBeDefined();
      expect(res.body.paths['/targets']).toBeDefined();
      expect(res.body.paths['/score/submit']).toBeDefined();
    });
  });
});
