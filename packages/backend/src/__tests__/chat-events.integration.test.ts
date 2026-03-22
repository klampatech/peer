/**
 * Chat Events Integration Tests
 * Tests Socket.IO chat event flows: message creation, sanitization, persistence, room scoping
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import http from 'http';
import express from 'express';
import { setupChatEvents } from '../events/chat-events.js';
import { setupRoomEvents } from '../events/room-events.js';
import { createRoom, getAllRooms } from '../rooms.js';

// Mock at top level
vi.mock('../db/index', () => ({
  getDatabase: vi.fn().mockReturnValue({
    run: vi.fn(),
    exec: vi.fn().mockReturnValue([]),
  }),
}));

describe('Chat Events Integration', () => {
  let httpServer: http.Server;
  let io: SocketIOServer;
  let clientSocket: ClientSocket;
  let clientSocket2: ClientSocket;
  let testPort: number;

  beforeEach(async () => {
    // Clean up any existing rooms from previous tests
    const rooms = getAllRooms();
    for (const token of rooms.keys()) {
      rooms.delete(token);
    }

    const app = express();
    app.use(express.json());
    httpServer = http.createServer(app);
    io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

    setupRoomEvents(io);
    setupChatEvents(io);

    await new Promise<void>(resolve => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        testPort = typeof addr === 'object' && addr !== null ? addr.port : 9999;
        resolve();
      });
    });
  });

  afterEach(async () => {
    clientSocket?.disconnect();
    clientSocket2?.disconnect();
    await new Promise<void>(resolve => io.close(() => resolve()));
    await new Promise<void>(resolve => {
      httpServer.close(() => resolve());
      setTimeout(resolve, 500);
    });
    vi.restoreAllMocks();

    // Clean up rooms after each test
    const rooms = getAllRooms();
    for (const token of rooms.keys()) {
      rooms.delete(token);
    }
  });

  describe('chat:message', () => {
    it('should send a message when peer is in room', async () => {
      const room = createRoom();

      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      // Join first peer
      await new Promise<void>((resolve, reject) => {
        clientSocket.emit('room:join', { token: room.token, displayName: 'User One' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Failed to join room'));
        });
      });

      // Join second peer
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: room.token, displayName: 'User Two' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Failed to join room'));
        });
      });

      // Receive message on second client
      const receivedMessages: unknown[] = [];
      clientSocket2.on('chat:message', (msg: unknown) => {
        receivedMessages.push(msg);
      });

      // Send message from first peer (no server acknowledgment - server broadcasts)
      clientSocket.emit('chat:message', { roomToken: room.token, message: 'Hello, world!' });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedMessages).toHaveLength(1);
      const msg = receivedMessages[0] as Record<string, unknown>;
      expect(msg).toHaveProperty('id');
      expect(msg).toHaveProperty('peerId');
      expect(msg).toHaveProperty('displayName', 'User One');
      expect(msg).toHaveProperty('message', 'Hello, world!');
      expect(msg).toHaveProperty('timestamp');
    });

    it('should reject message when peer is not in room', async () => {
      const room = createRoom();

      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const errors: unknown[] = [];
      clientSocket.on('chat:error', (err: unknown) => {
        errors.push(err);
      });

      // No server acknowledgment - server emits 'chat:error'
      clientSocket.emit('chat:message', { roomToken: room.token, message: 'Hello' });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(errors).toHaveLength(1);
      const err = errors[0] as Record<string, unknown>;
      expect(err).toHaveProperty('code', 'NOT_IN_ROOM');
    });

    it('should reject empty message', async () => {
      const room = createRoom();

      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        clientSocket.emit('room:join', { token: room.token, displayName: 'User One' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Failed to join room'));
        });
      });

      const errors: unknown[] = [];
      clientSocket.on('chat:error', (err: unknown) => {
        errors.push(err);
      });

      // No server acknowledgment - server emits 'chat:error'
      clientSocket.emit('chat:message', { roomToken: room.token, message: '' });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(errors).toHaveLength(1);
      const err = errors[0] as Record<string, unknown>;
      expect(err).toHaveProperty('code', 'INVALID_MESSAGE');
    });

    it('should sanitize HTML in messages', async () => {
      const room = createRoom();

      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        clientSocket.emit('room:join', { token: room.token, displayName: 'User One' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Failed to join room'));
        });
      });

      const receivedMessages: unknown[] = [];
      clientSocket.on('chat:message', (msg: unknown) => {
        receivedMessages.push(msg);
      });

      // No server acknowledgment - server broadcasts to room
      clientSocket.emit(
        'chat:message',
        { roomToken: room.token, message: '<script>alert("xss")</script>Hello' }
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedMessages).toHaveLength(1);
      const msg = receivedMessages[0] as Record<string, unknown>;
      // HTML entities are escaped, preventing script execution
      expect(msg.message).not.toContain('<script>');
      expect(msg.message).not.toContain('&lt;script&gt;Hello');
      // Original text content is preserved
      expect(msg.message).toContain('Hello');
    });

    it('should only broadcast message to peers in the same room', async () => {
      const room1 = createRoom();
      const room2 = createRoom();

      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        clientSocket.emit('room:join', { token: room1.token, displayName: 'User One' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Failed to join room'));
        });
      });

      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: room2.token, displayName: 'User Two' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Failed to join room'));
        });
      });

      const room2Messages: unknown[] = [];
      clientSocket2.on('chat:message', (msg: unknown) => {
        room2Messages.push(msg);
      });

      // No server acknowledgment - server broadcasts to room1 only
      clientSocket.emit('chat:message', { roomToken: room1.token, message: 'Hello room 1 only' });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(room2Messages).toHaveLength(0);
    });

    it('should reject message exceeding 2000 characters', async () => {
      const room = createRoom();

      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        clientSocket.emit('room:join', { token: room.token, displayName: 'User One' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Failed to join room'));
        });
      });

      const errors: unknown[] = [];
      clientSocket.on('chat:error', (err: unknown) => {
        errors.push(err);
      });

      const longMessage = 'a'.repeat(2001);
      // No server acknowledgment - server emits 'chat:error'
      clientSocket.emit('chat:message', { roomToken: room.token, message: longMessage });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(errors).toHaveLength(1);
      const err = errors[0] as Record<string, unknown>;
      expect(err).toHaveProperty('code', 'INVALID_MESSAGE');
      expect(err.message).toContain('2000');
    });
  });

  describe('chat:history', () => {
    it('should reject history request when peer is not in room', async () => {
      const room = createRoom();

      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const errors: unknown[] = [];
      clientSocket.on('chat:error', (err: unknown) => {
        errors.push(err);
      });

      // No server acknowledgment - server emits 'chat:error'
      clientSocket.emit('chat:history', { roomToken: room.token });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(errors).toHaveLength(1);
      const err = errors[0] as Record<string, unknown>;
      expect(err).toHaveProperty('code', 'NOT_IN_ROOM');
    });
  });
});
