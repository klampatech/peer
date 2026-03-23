import express, { type Express } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { securityMiddleware, permissionsPolicyMiddleware, corsMiddleware } from './middleware/security.js';
import { rateLimitMiddleware, setupSocketRateLimiter, setupPerSocketRateLimiter } from './middleware/rate-limit.js';
import healthRoutes from './routes/health.js';
import metricsRoutes, { metricsMiddleware } from './routes/metrics.js';
import { setupRoomEvents } from './events/room-events.js';
import { setupTurnEvents } from './events/turn-events.js';
import { setupChatEvents } from './events/chat-events.js';
import { initDatabase } from './db/index.js';
import { startCleanupScheduler } from './services/cleanup.js';
import { setCleanupSchedulerStatus } from './routes/health.js';

export interface AppServer {
  app: Express;
  httpServer: HttpServer;
  io: SocketIOServer;
}

/**
 * Creates and configures the Express server with Socket.IO
 */
export async function createServer(): Promise<AppServer> {
  // Initialize database first
  await initDatabase();

  // Start cleanup scheduler for old chat messages
  startCleanupScheduler();
  setCleanupSchedulerStatus(true);

  const app = express();
  const httpServer = http.createServer(app);

  // Validate CORS_ORIGIN in production - fail fast if not set
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN environment variable is required in production');
  }

  // Configure Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Setup Socket.IO rate limiting
  setupSocketRateLimiter(io);

  // Setup per-socket event rate limiting (P3-1)
  setupPerSocketRateLimiter(io);

  // Middleware
  app.use(securityMiddleware);
  app.use(permissionsPolicyMiddleware);
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(rateLimitMiddleware);

  // Routes
  app.use('/health', healthRoutes);
  app.use('/metrics', metricsRoutes);
  app.use(metricsMiddleware);

  // Socket.IO events
  setupRoomEvents(io);
  setupTurnEvents(io);
  setupChatEvents(io);

  return {
    app,
    httpServer,
    io,
  };
}
