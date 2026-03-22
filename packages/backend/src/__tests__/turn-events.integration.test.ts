/**
 * TURN Events Integration Tests
 * Tests Socket.IO TURN credential generation event
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import http from 'http';
import express from 'express';
import request from 'supertest';
import { setupTurnEvents } from '../events/turn-events.js';
import { generateTurnCredentials } from '../services/turn-credentials.js';

// Mock at top level - database
vi.mock('../db/index', () => ({
  getDatabase: vi.fn().mockReturnValue({
    run: vi.fn(),
    exec: vi.fn().mockReturnValue([]),
  }),
}));

// Shared state for rate limiter mock (accessible via closure)
let rateLimitConsumeCount = 0;

// Mock RateLimiterMemory at top level to avoid in-memory state sharing
vi.mock('rate-limiter-flexible', () => {
  const mockInstance = {
    consume: vi.fn().mockImplementation(() => {
      rateLimitConsumeCount++;
      // Allow 100 requests before blocking (default POINTS=100)
      if (rateLimitConsumeCount > 100) {
        return Promise.reject(new Error('Rate limit exceeded'));
      }
      return Promise.resolve({ remainingPoints: 100 - rateLimitConsumeCount });
    }),
    get: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockImplementation(() => {
      rateLimitConsumeCount = 0;
      return Promise.resolve(undefined);
    }),
  };
  function MockRateLimiter(_opts: unknown) {
    return mockInstance;
  }
  return {
    RateLimiterMemory: MockRateLimiter,
  };
});

describe('TURN Events Integration', () => {
  let httpServer: http.Server;
  let io: SocketIOServer;
  let clientSocket: ClientSocket;
  let testPort: number;

  beforeEach(async () => {
    rateLimitConsumeCount = 0;
    const app = express();
    app.use(express.json());
    httpServer = http.createServer(app);
    io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

    setupTurnEvents(io);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        testPort = typeof addr === 'object' && addr !== null ? addr.port : 9997;
        resolve();
      });
    });
  });

  afterEach(async () => {
    clientSocket?.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      setTimeout(resolve, 500);
    });
    vi.restoreAllMocks();
  });

  describe('turn:request via socket event', () => {
    it('should generate TURN credentials on request', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Connect timeout')), 5000);
        clientSocket.on('connect', () => {
          clearTimeout(t);
          resolve();
        });
      });

      const receivedCredentials: unknown[] = [];
      clientSocket.on('turn:credentials', (data: unknown) => {
        receivedCredentials.push(data);
      });

      // Emit without callback - server emits turn:credentials event
      clientSocket.emit('turn:request');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedCredentials).toHaveLength(1);
      const credentials = receivedCredentials[0] as Record<string, unknown>;
      expect(credentials).toHaveProperty('username');
      expect(credentials).toHaveProperty('password');
      expect(credentials).toHaveProperty('urls');
      expect(credentials).toHaveProperty('ttl', 3600);

      // Username format: timestamp:realm
      expect(credentials.username as string).toMatch(/^\d+:\w+$/);
      expect(credentials.password as string).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should generate credentials with valid HMAC-SHA1 password', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Connect timeout')), 5000);
        clientSocket.on('connect', () => {
          clearTimeout(t);
          resolve();
        });
      });

      const receivedCredentials: unknown[] = [];
      clientSocket.on('turn:credentials', (data: unknown) => {
        receivedCredentials.push(data);
      });

      clientSocket.emit('turn:request');

      await new Promise(resolve => setTimeout(resolve, 100));

      const credentials = receivedCredentials[0] as Record<string, unknown>;

      // Verify username format: timestamp:realm
      expect(credentials.username).toMatch(/^\d+:peer$/);

      // Verify password is valid base64
      expect(credentials.password).toMatch(/^[A-Za-z0-9+/=]+$/);

      // Verify HMAC-SHA1 calculation is correct by recalculating with the received username
      const crypto = await import('crypto');
      const hmac = crypto.createHmac('sha1', process.env.TURN_SECRET || 'change-me-in-production');
      hmac.update(credentials.username as string);
      const expectedPassword = hmac.digest('base64');
      expect(credentials.password).toBe(expectedPassword);
    });

    it('should generate credentials with all required fields', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Connect timeout')), 5000);
        clientSocket.on('connect', () => {
          clearTimeout(t);
          resolve();
        });
      });

      const receivedCredentials: unknown[] = [];
      clientSocket.on('turn:credentials', (data: unknown) => {
        receivedCredentials.push(data);
      });

      clientSocket.emit('turn:request');

      await new Promise(resolve => setTimeout(resolve, 100));

      const credentials = receivedCredentials[0] as Record<string, unknown>;
      expect(credentials.username).toBeDefined();
      expect(credentials.password).toBeDefined();
      expect(credentials.urls).toBeDefined();
      expect(credentials.ttl).toBe(3600);
    });

    it('should include TURN/STUN URLs with correct format', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Connect timeout')), 5000);
        clientSocket.on('connect', () => {
          clearTimeout(t);
          resolve();
        });
      });

      const receivedCredentials: unknown[] = [];
      clientSocket.on('turn:credentials', (data: unknown) => {
        receivedCredentials.push(data);
      });

      clientSocket.emit('turn:request');

      await new Promise(resolve => setTimeout(resolve, 100));

      const urls = (receivedCredentials[0] as Record<string, string[]>).urls;
      expect(urls.length).toBe(4);
      expect(urls[0]).toMatch(/^turn:localhost:3478$/);
      expect(urls[1]).toMatch(/^turn:localhost:3478\/tcp$/);
      expect(urls[2]).toMatch(/^turn:127\.0\.0\.1:3478$/);
      expect(urls[3]).toMatch(/^turn:127\.0\.0\.1:3478\/tcp$/);
    });

    it('should set correct TTL value', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Connect timeout')), 5000);
        clientSocket.on('connect', () => {
          clearTimeout(t);
          resolve();
        });
      });

      const receivedCredentials: unknown[] = [];
      clientSocket.on('turn:credentials', (data: unknown) => {
        receivedCredentials.push(data);
      });

      clientSocket.emit('turn:request');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect((receivedCredentials[0] as Record<string, number>).ttl).toBe(3600);
    });
  });

  describe('rate limiting on HTTP endpoints', () => {
    it('should call rate limiter consume on each request', async () => {
      const { rateLimitMiddleware } = await import('../middleware/rate-limit.js');
      const app = express();
      app.use(express.json());
      app.use(rateLimitMiddleware);
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
    });

    it('should return 200 when under rate limit', async () => {
      const { rateLimitMiddleware } = await import('../middleware/rate-limit.js');
      const app = express();
      app.use(express.json());
      app.use(rateLimitMiddleware);
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const { rateLimitMiddleware } = await import('../middleware/rate-limit.js');
      const app = express();
      app.use(express.json());
      app.use(rateLimitMiddleware);
      app.get('/test', (_req, res) => res.json({ ok: true }));

      // Exhaust the rate limit (default 100 points)
      for (let i = 0; i < 100; i++) {
        await request(app).get('/test');
      }

      const response = await request(app).get('/test');
      expect(response.status).toBe(429);
      expect(response.body.error).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
    });
  });

  describe('health endpoint via Express router', () => {
    it('should return health status with ok status', async () => {
      const healthRoutes = (await import('../routes/health.js')).default;
      const { securityMiddleware, corsMiddleware } = await import('../middleware/security.js');
      const { rateLimitMiddleware } = await import('../middleware/rate-limit.js');

      const app = express();
      app.use(securityMiddleware);
      app.use(corsMiddleware);
      app.use(express.json());
      app.use(rateLimitMiddleware);
      app.use('/health', healthRoutes);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
    });

    it('should set security headers on health endpoint', async () => {
      const healthRoutes = (await import('../routes/health.js')).default;
      const { securityMiddleware, corsMiddleware } = await import('../middleware/security.js');
      const { rateLimitMiddleware } = await import('../middleware/rate-limit.js');

      const app = express();
      app.use(securityMiddleware);
      app.use(corsMiddleware);
      app.use(express.json());
      app.use(rateLimitMiddleware);
      app.use('/health', healthRoutes);

      const response = await request(app).get('/health');

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('referrer-policy');
    });

    it('should set CORS headers on health endpoint', async () => {
      const healthRoutes = (await import('../routes/health.js')).default;
      const { securityMiddleware, corsMiddleware } = await import('../middleware/security.js');
      const { rateLimitMiddleware } = await import('../middleware/rate-limit.js');

      const app = express();
      app.use(securityMiddleware);
      app.use(corsMiddleware);
      app.use(express.json());
      app.use(rateLimitMiddleware);
      app.use('/health', healthRoutes);

      const response = await request(app).get('/health');

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });
});
