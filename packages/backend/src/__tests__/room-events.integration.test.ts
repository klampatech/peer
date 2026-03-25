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

    it('should keep room when last peer calls room:leave (allows rejoining)', async () => {
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

      // Room should still exist but be empty - this allows peers to rejoin
      const room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room).toBeDefined();
      expect(room?.peers.size).toBe(0);
    });

    it('should destroy room when last peer disconnects', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'User One' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      // Disconnect the socket (simulating actual disconnect, not room:leave)
      clientSocket.disconnect();

      await new Promise(resolve => setTimeout(resolve, 100));

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

  describe('WebRTC Signaling - sdp:offer', () => {
    it('should relay SDP offer to target peer in same room', async () => {
      // Create room with peer 1
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const token = createResponse.data as Record<string, unknown>;

      // Peer 2 joins
      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: token.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      // Listen for sdp:offer on peer 2
      const sdpOfferEvents: unknown[] = [];
      clientSocket2.on('sdp:offer', (data: unknown) => {
        sdpOfferEvents.push(data);
      });

      // Peer 1 sends SDP offer to peer 2
      const mockSdp = {
        type: 'offer' as const,
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=ice-ufrag:test\r\na=ice-pwd:test\r\n',
      };
      clientSocket.emit('sdp:offer', {
        targetPeerId: clientSocket2.id,
        sdp: mockSdp,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(sdpOfferEvents).toHaveLength(1);
      const event = sdpOfferEvents[0] as Record<string, unknown>;
      expect(event).toHaveProperty('peerId', clientSocket.id);
      expect(event).toHaveProperty('sdp');
      expect((event.sdp as Record<string, unknown>).type).toBe('offer');
    });

    it('should reject SDP offer with invalid payload', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const token = createResponse.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: token.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      // Listen for any errors (server logs but doesn't emit errors for invalid payload)
      const sdpOfferEvents: unknown[] = [];
      clientSocket2.on('sdp:offer', (data: unknown) => {
        sdpOfferEvents.push(data);
      });

      // Send invalid SDP offer (missing required fields)
      clientSocket.emit('sdp:offer', {
        targetPeerId: clientSocket2.id,
        sdp: { type: 'offer' }, // missing sdp field
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not relay invalid payload
      expect(sdpOfferEvents).toHaveLength(0);
    });

    it('should reject SDP offer from peer not in a room', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const token = createResponse.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: token.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      // Client 3 not in any room
      const clientSocket3 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const sdpOfferEvents: unknown[] = [];
      clientSocket2.on('sdp:offer', (data: unknown) => {
        sdpOfferEvents.push(data);
      });

      // Peer not in room tries to send SDP offer
      const mockSdp = {
        type: 'offer' as const,
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
      };
      clientSocket3.emit('sdp:offer', {
        targetPeerId: clientSocket2.id,
        sdp: mockSdp,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not relay - peer not authorized
      expect(sdpOfferEvents).toHaveLength(0);
    });

    it('should reject cross-room SDP offer', async () => {
      // Create room A with peer 1
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponseA = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const tokenA = createResponseA.data as Record<string, unknown>;

      // Create room B with peer 2
      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponseB = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket2.emit('room:create', { displayName: 'Peer 2' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const tokenB = createResponseB.data as Record<string, unknown>;

      // Peer 2 joins room A
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: tokenA.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      // Listen for sdp:offer in room B (should NOT receive)
      const clientSocket3 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket3.emit('room:join', { token: tokenB.token, displayName: 'Peer 3' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      const sdpOfferEvents: unknown[] = [];
      clientSocket3.on('sdp:offer', (data: unknown) => {
        sdpOfferEvents.push(data);
      });

      // Peer 1 (in room A) tries to send SDP offer to peer 3 (in room B)
      const mockSdp = {
        type: 'offer' as const,
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
      };
      clientSocket.emit('sdp:offer', {
        targetPeerId: clientSocket3.id,
        sdp: mockSdp,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Peer 3 should NOT receive the offer (cross-room)
      expect(sdpOfferEvents).toHaveLength(0);
    });

    it('should reject SDP with private IP addresses', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const token = createResponse.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: token.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      const sdpOfferEvents: unknown[] = [];
      clientSocket2.on('sdp:offer', (data: unknown) => {
        sdpOfferEvents.push(data);
      });

      // SDP containing private IP in ICE candidate
      const mockSdpWithPrivateIP = {
        type: 'offer' as const,
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=candidate:1 1 UDP 2130363903 192.168.1.100 54777 typ host\r\n',
      };
      clientSocket.emit('sdp:offer', {
        targetPeerId: clientSocket2.id,
        sdp: mockSdpWithPrivateIP,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should reject SDP with private IP in ICE candidate
      expect(sdpOfferEvents).toHaveLength(0);
    });
  });

  describe('WebRTC Signaling - sdp:answer', () => {
    it('should relay SDP answer to target peer in same room', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const token = createResponse.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: token.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      // Listen for sdp:answer on peer 1
      const sdpAnswerEvents: unknown[] = [];
      clientSocket.on('sdp:answer', (data: unknown) => {
        sdpAnswerEvents.push(data);
      });

      // Peer 2 sends SDP answer to peer 1
      const mockSdp = {
        type: 'answer' as const,
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=ice-ufrag:test\r\na=ice-pwd:test\r\n',
      };
      clientSocket2.emit('sdp:answer', {
        targetPeerId: clientSocket.id,
        sdp: mockSdp,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(sdpAnswerEvents).toHaveLength(1);
      const event = sdpAnswerEvents[0] as Record<string, unknown>;
      expect(event).toHaveProperty('peerId', clientSocket2.id);
      expect(event).toHaveProperty('sdp');
      expect((event.sdp as Record<string, unknown>).type).toBe('answer');
    });

    it('should reject SDP answer with invalid payload', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const token = createResponse.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: token.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      const sdpAnswerEvents: unknown[] = [];
      clientSocket.on('sdp:answer', (data: unknown) => {
        sdpAnswerEvents.push(data);
      });

      // Send invalid SDP answer (wrong type)
      clientSocket2.emit('sdp:answer', {
        targetPeerId: clientSocket.id,
        sdp: { type: 'invalid' }, // invalid type
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(sdpAnswerEvents).toHaveLength(0);
    });

    it('should reject cross-room SDP answer', async () => {
      // Create two separate rooms
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponseA = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const tokenA = createResponseA.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: tokenA.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      // Peer 3 in different room
      const clientSocket3 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket3.emit('room:create', { displayName: 'Peer 3' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const sdpAnswerEvents: unknown[] = [];
      clientSocket3.on('sdp:answer', (data: unknown) => {
        sdpAnswerEvents.push(data);
      });

      // Peer 2 tries to send SDP answer to peer 3 in different room
      const mockSdp = {
        type: 'answer' as const,
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
      };
      clientSocket2.emit('sdp:answer', {
        targetPeerId: clientSocket3.id,
        sdp: mockSdp,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not relay cross-room
      expect(sdpAnswerEvents).toHaveLength(0);
    });
  });

  describe('WebRTC Signaling - ice-candidate', () => {
    it('should relay ICE candidate to target peer in same room', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const token = createResponse.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: token.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      const iceCandidateEvents: unknown[] = [];
      clientSocket2.on('ice-candidate', (data: unknown) => {
        iceCandidateEvents.push(data);
      });

      // Peer 1 sends ICE candidate to peer 2
      const mockCandidate = {
        candidate: 'candidate:1 1 UDP 2130363903 192.168.1.100 54777 typ host',
        sdpMid: 'audio-0',
        sdpMLineIndex: 0,
      };
      clientSocket.emit('ice-candidate', {
        targetPeerId: clientSocket2.id,
        candidate: mockCandidate,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(iceCandidateEvents).toHaveLength(1);
      const event = iceCandidateEvents[0] as Record<string, unknown>;
      expect(event).toHaveProperty('peerId', clientSocket.id);
      expect(event).toHaveProperty('candidate');
    });

    it('should reject ICE candidate with invalid payload', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const token = createResponse.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: token.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      const iceCandidateEvents: unknown[] = [];
      clientSocket2.on('ice-candidate', (data: unknown) => {
        iceCandidateEvents.push(data);
      });

      // Send invalid ICE candidate (missing candidate field)
      clientSocket.emit('ice-candidate', {
        targetPeerId: clientSocket2.id,
        candidate: { sdpMid: null }, // missing candidate string
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(iceCandidateEvents).toHaveLength(0);
    });

    it('should reject ICE candidate from peer not in a room', async () => {
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const token = createResponse.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: token.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      // Peer not in any room
      const clientSocket3 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const iceCandidateEvents: unknown[] = [];
      clientSocket2.on('ice-candidate', (data: unknown) => {
        iceCandidateEvents.push(data);
      });

      const mockCandidate = {
        candidate: 'candidate:1 1 UDP 2130363903 192.168.1.100 54777 typ host',
        sdpMid: 'audio-0',
        sdpMLineIndex: 0,
      };
      clientSocket3.emit('ice-candidate', {
        targetPeerId: clientSocket2.id,
        candidate: mockCandidate,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(iceCandidateEvents).toHaveLength(0);
    });

    it('should reject cross-room ICE candidate', async () => {
      // Create two separate rooms
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });
      const createResponseA = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Peer 1' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });
      const tokenA = createResponseA.data as Record<string, unknown>;

      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket2.emit('room:join', { token: tokenA.token, displayName: 'Peer 2' }, (res: unknown) => {
          const r = res as Record<string, unknown>;
          if (r.success) resolve();
          else reject(new Error('Join failed'));
        });
      });

      // Peer 3 in different room
      const clientSocket3 = ioc(`http://localhost:${testPort}`, { forceNew: true });
      await new Promise<void>((resolve, reject) => {
        clientSocket3.emit('room:create', { displayName: 'Peer 3' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const iceCandidateEvents: unknown[] = [];
      clientSocket3.on('ice-candidate', (data: unknown) => {
        iceCandidateEvents.push(data);
      });

      // Peer 2 tries to send ICE candidate to peer 3 in different room
      const mockCandidate = {
        candidate: 'candidate:1 1 UDP 2130363903 192.168.1.100 54777 typ host',
        sdpMid: 'audio-0',
        sdpMLineIndex: 0,
      };
      clientSocket2.emit('ice-candidate', {
        targetPeerId: clientSocket3.id,
        candidate: mockCandidate,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not relay cross-room
      expect(iceCandidateEvents).toHaveLength(0);
    });
  });

  describe('socket:disconnect', () => {
    it('should notify remaining peers when a peer disconnects abruptly', async () => {
      // Client 1 creates a room
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'User One' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      // Client 2 joins the room
      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const joinResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket2.emit('room:join', { token, displayName: 'User Two' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      expect(joinResponse).toHaveProperty('success', true);

      // Wait for socket state to stabilize after join
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify room exists with 2 peers
      let room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room?.peers.size).toBe(2);

      // Capture socket ID before disconnect
      const clientSocketId = clientSocket.id;

      // Client 1 disconnects abruptly (no room:leave)
      clientSocket.disconnect();

      // Wait for server to process disconnect and emit events
      await new Promise(resolve => setTimeout(resolve, 500));

      // Room should still exist but with only 1 peer now
      room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room).toBeDefined();
      expect(room?.peers.size).toBe(1);
      expect(room?.peers.has(clientSocketId)).toBe(false);
    });

    it('should preserve room state when peer disconnects', async () => {
      // Client 1 creates a room
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Host' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      // Client 2 joins the room
      clientSocket2 = ioc(`http://localhost:${testPort}`, { forceNew: true });

      await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket2.emit('room:join', { token, displayName: 'Guest' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      // Wait for socket state to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify room has 2 peers
      let room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room?.peers.size).toBe(2);

      // Client 2 disconnects abruptly
      clientSocket2.disconnect();

      // Wait for server to process disconnect
      await new Promise(resolve => setTimeout(resolve, 500));

      // Room should still exist with 1 peer (Client 1)
      room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room).toBeDefined();
      expect(room?.peers.size).toBe(1);
    });

    it('should clean up room when last peer disconnects', async () => {
      // Client 1 creates a room
      clientSocket = ioc(`http://localhost:${testPort}`, { forceNew: true });

      const createResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
        clientSocket.emit('room:create', { displayName: 'Solo User' }, (res: unknown) => {
          if (res) resolve(res as Record<string, unknown>);
          else reject(new Error('No response'));
        });
      });

      const token = (createResponse.data as Record<string, unknown>).token as string;

      // Wait for socket state to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify room exists
      let room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room).toBeDefined();

      // Client disconnects abruptly (no room:leave)
      clientSocket.disconnect();

      // Wait for server to process disconnect and room cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      // Room should be destroyed
      room = getRoom(token as import('@peer/shared').RoomToken);
      expect(room).toBeUndefined();
    });
  });
});
