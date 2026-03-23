/**
 * Socket Rate Limiter Integration Tests
 * Tests Socket.IO connection rate limiting functionality
 * Spec: Section 8.2 - 10 joins per IP per minute
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import http from 'http';
import express from 'express';
import { setupRoomEvents } from '../events/room-events.js';
import { setupSocketRateLimiter } from '../middleware/rate-limit.js';

describe('Socket Rate Limiter Integration', () => {
  let httpServer: http.Server;
  let io: SocketIOServer;
  let testPort: number;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    httpServer = http.createServer(app);
    io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

    // Set up socket rate limiter with very low limits for testing
    // 5 connections per 2 seconds = 2.5 per second
    process.env.SOCKET_RATE_LIMIT_POINTS = '5';
    process.env.SOCKET_RATE_LIMIT_DURATION = '2';
    setupSocketRateLimiter(io);

    setupRoomEvents(io);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        testPort = typeof addr === 'object' && addr !== null ? addr.port : 9998;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      setTimeout(resolve, 500);
    });
    vi.restoreAllMocks();
    delete process.env.SOCKET_RATE_LIMIT_POINTS;
    delete process.env.SOCKET_RATE_LIMIT_DURATION;
  });

  describe('Connection Rate Limiting', () => {
    it('should allow connections within rate limit', async () => {
      // First 5 connections should succeed
      const sockets: ClientSocket[] = [];

      for (let i = 0; i < 5; i++) {
        const socket = ioc(`http://localhost:${testPort}`, {
          forceNew: true,
          timeout: 1000,
        });
        sockets.push(socket);

        await new Promise<void>((resolve) => {
          socket.on('connect', () => resolve());
          setTimeout(() => resolve(), 500);
        });
      }

      // All 5 should be connected
      for (const socket of sockets) {
        expect(socket.connected).toBe(true);
      }

      // Clean up
      for (const socket of sockets) {
        socket.disconnect();
      }
    });

    it('should block connections exceeding rate limit', async () => {
      // First 5 connections should succeed
      const sockets: ClientSocket[] = [];

      for (let i = 0; i < 5; i++) {
        const socket = ioc(`http://localhost:${testPort}`, {
          forceNew: true,
          timeout: 1000,
        });
        sockets.push(socket);

        await new Promise<void>((resolve) => {
          socket.on('connect', () => resolve());
          setTimeout(() => resolve(), 500);
        });
      }

      // All 5 should be connected
      for (const socket of sockets) {
        expect(socket.connected).toBe(true);
      }

      // The 6th connection should be blocked
      const blockedSocket = ioc(`http://localhost:${testPort}`, {
        forceNew: true,
        timeout: 1000,
      });

      const connectionResult = await new Promise<boolean>((resolve) => {
        blockedSocket.on('connect', () => resolve(true));
        blockedSocket.on('connect_error', () => resolve(false));
        setTimeout(() => resolve(false), 1500);
      });

      expect(connectionResult).toBe(false);
      expect(blockedSocket.connected).toBe(false);

      // Clean up
      for (const socket of sockets) {
        socket.disconnect();
      }
      blockedSocket.disconnect();
    });

    it('should reset rate limit after duration expires', async () => {
      // First 5 connections
      const sockets: ClientSocket[] = [];

      for (let i = 0; i < 5; i++) {
        const socket = ioc(`http://localhost:${testPort}`, {
          forceNew: true,
          timeout: 1000,
        });
        sockets.push(socket);

        await new Promise<void>((resolve) => {
          socket.on('connect', () => resolve());
          setTimeout(() => resolve(), 500);
        });
      }

      // Wait for rate limit window to expire (2 seconds + buffer)
      await new Promise<void>((resolve) => setTimeout(resolve, 2500));

      // Should be able to connect again after duration expires
      const reconnectedSocket = ioc(`http://localhost:${testPort}`, {
        forceNew: true,
        timeout: 1000,
      });

      const connectionResult = await new Promise<boolean>((resolve) => {
        reconnectedSocket.on('connect', () => resolve(true));
        reconnectedSocket.on('connect_error', () => resolve(false));
        setTimeout(() => resolve(false), 1500);
      });

      expect(connectionResult).toBe(true);

      // Clean up
      for (const socket of sockets) {
        socket.disconnect();
      }
      reconnectedSocket.disconnect();
    });
  });
});
