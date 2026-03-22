/**
 * Room Events Integration Tests
 * Tests Socket.IO room event flows: room creation, join, leave, peer notifications
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import http from 'http';
import express from 'express';
import { setupRoomEvents } from '../events/room-events.js';
import { setupChatEvents } from '../events/chat-events.js';
import { getAllRooms, getRoom } from '../rooms.js';

// Mock at top level
vi.mock('../db/index', () => ({
  getDatabase: vi.fn().mockReturnValue({
    run: vi.fn(),
    exec: vi.fn().mockReturnValue([]),
  }),
}));

describe('Room Events Integration', () => {
  let httpServer: http.Server;
  let io: SocketIOServer;
  let clientSocket: ClientSocket;
  let clientSocket2: ClientSocket;
  let testPort: number;

  beforeEach(async () => {
    // Clean up any existing rooms
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

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        testPort = typeof addr === 'object' && addr !== null ? addr.port : 9998;
        resolve();
      });
    });
  });

  afterEach(async () => {
    clientSocket?.disconnect();
    clientSocket2?.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => {
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

  describe('room:create', () => {
    it('should create a new room with a valid UUID token', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Test User' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('data');
      const data = response.data as Record<string, unknown>;
      expect(data).toHaveProperty('token');

      const token = data.token as string;
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should reject empty display name', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: '' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(response).toHaveProperty('success', false);
      const error = response.error as Record<string, unknown>;
      expect(error).toHaveProperty('code', 'INVALID_DISPLAY_NAME');
    });

    it('should reject whitespace-only display name', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: '   ' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(response).toHaveProperty('success', false);
      const error = response.error as Record<string, unknown>;
      expect(error).toHaveProperty('code', 'INVALID_DISPLAY_NAME');
    });

    it('should reject display name exceeding 50 characters', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const longName = 'a'.repeat(51);
      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: longName }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(response).toHaveProperty('success', false);
      const error = response.error as Record<string, unknown>;
      expect(error).toHaveProperty('code', 'DISPLAY_NAME_TOO_LONG');
    });

    it('should add creator to the room as a peer', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Creator' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (response.data as Record<string, unknown>).token as string;
      const room = getRoom(token as import('@peer/shared').RoomToken);

      expect(room).toBeDefined();
      expect(room?.peers.size).toBe(1);
      expect(room?.peers.get(clientSocket.id)?.displayName).toBe('Creator');
    });
  });

  describe('room:join', () => {
    it('should allow a peer to join an existing room', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'User One' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const joinResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket2.emit('room:join', { token, displayName: 'User Two' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(joinResponse).toHaveProperty('success', true);
      const data = joinResponse.data as Record<string, unknown>;
      expect(data).toHaveProperty('token', token);
      expect(data).toHaveProperty('peers');

      const room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room?.peers.size).toBe(2);
    });

    it('should reject invalid room token', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:join', { token: 'not-a-valid-uuid', displayName: 'User' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(response).toHaveProperty('success', false);
      const error = response.error as Record<string, unknown>;
      expect(error).toHaveProperty('code', 'INVALID_TOKEN');
    });

    it('should reject non-existent room', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const fakeToken = '12345678-1234-4123-8123-123456789abc';
      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:join', { token: fakeToken, displayName: 'User' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(response).toHaveProperty('success', false);
      const error = response.error as Record<string, unknown>;
      expect(error).toHaveProperty('code', 'ROOM_NOT_FOUND');
    });

    it('should notify existing peers when a new peer joins', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'User One' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      const peerJoinedEvents: unknown[] = [];
      clientSocket.on('peer-joined', (data: unknown) => {
        peerJoinedEvents.push(data);
      });

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token, displayName: 'User Two' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(peerJoinedEvents).toHaveLength(1);
      const event = peerJoinedEvents[0] as Record<string, unknown>;
      expect(event).toHaveProperty('displayName', 'User Two');
      expect(event).toHaveProperty('peerId');
    });

    it('should send peer-list to newly joined peer', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'User One' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const peerListEvents: unknown[] = [];
      clientSocket2.on('peer-list', (data: unknown) => {
        peerListEvents.push(data);
      });

      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token, displayName: 'User Two' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(peerListEvents).toHaveLength(1);
      const peers = peerListEvents[0] as Array<Record<string, unknown>>;
      expect(peers).toHaveLength(1);
      expect(peers[0]).toHaveProperty('displayName', 'User One');
    });
  });

  describe('room:leave', () => {
    it('should allow a peer to leave a room', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'User One' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      const leaveResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:leave', { token }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(leaveResponse).toHaveProperty('success', true);
    });

    it('should reject invalid token on leave', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:leave', { token: 'invalid' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(response).toHaveProperty('success', false);
      const error = response.error as Record<string, unknown>;
      expect(error).toHaveProperty('code', 'INVALID_TOKEN');
    });

    it('should notify remaining peers when someone leaves', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'User One' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token, displayName: 'User Two' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      const peerLeftEvents: unknown[] = [];
      clientSocket.on('peer-left', (data: unknown) => {
        peerLeftEvents.push(data);
      });

      await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket2.emit('room:leave', { token }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(peerLeftEvents).toHaveLength(1);
      const event = peerLeftEvents[0] as Record<string, unknown>;
      expect(event).toHaveProperty('peerId', clientSocket2.id);
    });

    it('should destroy room when last peer leaves', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'User One' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:leave', { token }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room).toBeUndefined();
    });

    it('should keep room when peers remain after one leaves', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'User One' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token, displayName: 'User Two' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket2.emit('room:leave', { token }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room).toBeDefined();
      expect(room?.peers.size).toBe(1);
    });
  });
});
