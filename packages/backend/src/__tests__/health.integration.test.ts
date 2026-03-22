/**
 * Health Endpoint Integration Tests
 * Tests the REST /health endpoint using supertest with a real Express app
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock database at top level
vi.mock('../db/index', () => ({
  getDatabase: vi.fn().mockReturnValue({
    run: vi.fn(),
    exec: vi.fn().mockReturnValue([]),
  }),
}));

describe('Health Endpoint Integration', () => {
  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const healthRoutes = (await import('../routes/health.js')).default;
      const { securityMiddleware, corsMiddleware } = await import('../middleware/security.js');

      const app = express();
      app.use(securityMiddleware);
      app.use(corsMiddleware);
      app.use(express.json());
      app.use('/health', healthRoutes);

      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return a version string', async () => {
      const healthRoutes = (await import('../routes/health.js')).default;
      const { securityMiddleware, corsMiddleware } = await import('../middleware/security.js');

      const app = express();
      app.use(securityMiddleware);
      app.use(corsMiddleware);
      app.use(express.json());
      app.use('/health', healthRoutes);

      const response = await request(app).get('/health').expect(200);

      expect(typeof response.body.version).toBe('string');
      expect(response.body.version.length).toBeGreaterThan(0);
    });

    it('should return JSON content type', async () => {
      const healthRoutes = (await import('../routes/health.js')).default;
      const { securityMiddleware, corsMiddleware } = await import('../middleware/security.js');

      const app = express();
      app.use(securityMiddleware);
      app.use(corsMiddleware);
      app.use(express.json());
      app.use('/health', healthRoutes);

      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/);

      expect(response.body.status).toBe('ok');
    });

    it('should not include sensitive data in response', async () => {
      const healthRoutes = (await import('../routes/health.js')).default;
      const { securityMiddleware, corsMiddleware } = await import('../middleware/security.js');

      const app = express();
      app.use(securityMiddleware);
      app.use(corsMiddleware);
      app.use(express.json());
      app.use('/health', healthRoutes);

      const response = await request(app).get('/health');

      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('secret');
      expect(response.body).not.toHaveProperty('token');
    });

    it('should include required health status fields only', async () => {
      const healthRoutes = (await import('../routes/health.js')).default;
      const { securityMiddleware, corsMiddleware } = await import('../middleware/security.js');

      const app = express();
      app.use(securityMiddleware);
      app.use(corsMiddleware);
      app.use(express.json());
      app.use('/health', healthRoutes);

      const response = await request(app).get('/health');
      const body = response.body;

      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('dependencies');

      const allowedKeys = ['status', 'uptime', 'version', 'dependencies'];
      const actualKeys = Object.keys(body);
      const extraKeys = actualKeys.filter(key => !allowedKeys.includes(key));
      expect(extraKeys).toHaveLength(0);
    });

    it('should increase uptime over time', async () => {
      const healthRoutes = (await import('../routes/health.js')).default;
      const { securityMiddleware, corsMiddleware } = await import('../middleware/security.js');

      const app = express();
      app.use(securityMiddleware);
      app.use(corsMiddleware);
      app.use(express.json());
      app.use('/health', healthRoutes);

      const response1 = await request(app).get('/health');
      const uptime1 = response1.body.uptime;

      await new Promise(resolve => setTimeout(resolve, 10));

      const response2 = await request(app).get('/health');
      const uptime2 = response2.body.uptime;

      expect(uptime2).toBeGreaterThanOrEqual(uptime1);
    });
  });
});
