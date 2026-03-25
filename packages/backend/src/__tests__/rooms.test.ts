import { describe, it, expect, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  leaveRoomAndDestroyIfEmpty,
  deleteRoom,
  getAllRooms,
  getPeersInRoom,
  getPeer,
  roomExists,
  isPeerInRoom,
  type Room,
} from '../rooms.js';

describe('Room Management', () => {
  afterEach(() => {
    // Clean up all rooms after each test
    const rooms = getAllRooms();
    for (const token of rooms.keys()) {
      deleteRoom(token);
    }
  });

  describe('createRoom', () => {
    it('should create a room with valid UUID v4 token', () => {
      const room = createRoom();

      expect(room).toBeDefined();
      expect(room.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should create room with empty peers map', () => {
      const room = createRoom();

      expect(room.peers.size).toBe(0);
      expect(room.createdAt).toBeInstanceOf(Date);
    });

    it('should generate unique tokens for each room', () => {
      const room1 = createRoom();
      const room2 = createRoom();

      expect(room1.token).not.toBe(room2.token);
    });
  });

  describe('getRoom', () => {
    it('should return room when it exists', () => {
      const createdRoom = createRoom();
      const foundRoom = getRoom(createdRoom.token);

      expect(foundRoom).toBeDefined();
      expect(foundRoom?.token).toBe(createdRoom.token);
    });

    it('should return undefined for non-existent room', () => {
      const room = getRoom('not-a-valid-uuid' as Room['token']);

      expect(room).toBeUndefined();
    });
  });

  describe('joinRoom', () => {
    it('should add peer to room', () => {
      const room = createRoom();
      const peerId = uuidv4();
      const displayName = 'Test User';

      joinRoom(room.token, peerId, displayName);

      const updatedRoom = getRoom(room.token);
      expect(updatedRoom?.peers.size).toBe(1);
      const peer = updatedRoom?.peers.get(peerId);
      expect(peer?.displayName).toBe(displayName);
    });

    it('should allow multiple peers to join', () => {
      const room = createRoom();

      joinRoom(room.token, uuidv4(), 'User 1');
      joinRoom(room.token, uuidv4(), 'User 2');
      joinRoom(room.token, uuidv4(), 'User 3');

      const updatedRoom = getRoom(room.token);
      expect(updatedRoom?.peers.size).toBe(3);
    });
  });

  describe('leaveRoom', () => {
    it('should remove peer from room', () => {
      const room = createRoom();
      const peer1Id = uuidv4();
      const peer2Id = uuidv4();

      joinRoom(room.token, peer1Id, 'Test User 1');
      joinRoom(room.token, peer2Id, 'Test User 2');
      leaveRoom(room.token, peer1Id);

      const updatedRoom = getRoom(room.token);
      expect(updatedRoom?.peers.has(peer1Id)).toBe(false);
      expect(updatedRoom?.peers.has(peer2Id)).toBe(true);
    });

    it('should keep room when last peer leaves (room persists for rejoining)', () => {
      const room = createRoom();
      const peerId = uuidv4();

      joinRoom(room.token, peerId, 'Test User');
      leaveRoom(room.token, peerId);

      // Room should still exist but be empty - this allows peers to rejoin
      const updatedRoom = getRoom(room.token);
      expect(updatedRoom).toBeDefined();
      expect(updatedRoom?.peers.size).toBe(0);
    });

    it('should destroy room when last peer leaves via leaveRoomAndDestroyIfEmpty', () => {
      const room = createRoom();
      const peerId = uuidv4();

      joinRoom(room.token, peerId, 'Test User');
      leaveRoomAndDestroyIfEmpty(room.token, peerId);

      const updatedRoom = getRoom(room.token);
      expect(updatedRoom).toBeUndefined();
    });

    it('should keep room when peers remain', () => {
      const room = createRoom();
      const peer1 = uuidv4();
      const peer2 = uuidv4();

      joinRoom(room.token, peer1, 'User 1');
      joinRoom(room.token, peer2, 'User 2');
      leaveRoom(room.token, peer1);

      const updatedRoom = getRoom(room.token);
      expect(updatedRoom).toBeDefined();
      expect(updatedRoom?.peers.size).toBe(1);
    });
  });

  describe('deleteRoom', () => {
    it('should delete existing room', () => {
      const room = createRoom();
      const token = room.token;

      deleteRoom(token);

      expect(getRoom(token)).toBeUndefined();
    });

    it('should handle deleting non-existent room gracefully', () => {
      expect(() => {
        deleteRoom('non-existent-token' as Room['token']);
      }).not.toThrow();
    });
  });

  describe('getAllRooms', () => {
    it('should return empty map initially', () => {
      const rooms = getAllRooms();

      expect(rooms.size).toBe(0);
    });

    it('should return all created rooms', () => {
      createRoom();
      createRoom();
      createRoom();

      const rooms = getAllRooms();
      expect(rooms.size).toBe(3);
    });
  });

  describe('joinRoom edge cases', () => {
    it('should return undefined when joining non-existent room', () => {
      const result = joinRoom('non-existent-token' as Room['token'], uuidv4(), 'Test User');

      expect(result).toBeUndefined();
    });
  });

  describe('leaveRoom edge cases', () => {
    it('should return undefined when leaving non-existent room', () => {
      const result = leaveRoom('non-existent-token' as Room['token'], uuidv4());

      expect(result).toBeUndefined();
    });
  });

  describe('getPeersInRoom', () => {
    it('should return empty array for non-existent room', () => {
      const peers = getPeersInRoom('non-existent-token' as Room['token']);

      expect(peers).toEqual([]);
    });

    it('should return all peers in room', () => {
      const room = createRoom();
      const peer1Id = uuidv4();
      const peer2Id = uuidv4();

      joinRoom(room.token, peer1Id, 'User 1');
      joinRoom(room.token, peer2Id, 'User 2');

      const peers = getPeersInRoom(room.token);

      expect(peers.length).toBe(2);
      expect(peers.some(p => p.id === peer1Id)).toBe(true);
      expect(peers.some(p => p.id === peer2Id)).toBe(true);
    });
  });

  describe('getPeer', () => {
    it('should return undefined for non-existent room', () => {
      const peer = getPeer('non-existent-token' as Room['token'], uuidv4());

      expect(peer).toBeUndefined();
    });

    it('should return undefined for non-existent peer', () => {
      const room = createRoom();
      joinRoom(room.token, uuidv4(), 'Existing User');

      const peer = getPeer(room.token, 'non-existent-peer');

      expect(peer).toBeUndefined();
    });

    it('should return peer when found', () => {
      const room = createRoom();
      const peerId = uuidv4();
      joinRoom(room.token, peerId, 'Test User');

      const peer = getPeer(room.token, peerId);

      expect(peer).toBeDefined();
      expect(peer?.displayName).toBe('Test User');
    });
  });

  describe('roomExists', () => {
    it('should return false for non-existent room', () => {
      const exists = roomExists('non-existent-token' as Room['token']);

      expect(exists).toBe(false);
    });

    it('should return true for existing room', () => {
      const room = createRoom();

      const exists = roomExists(room.token);

      expect(exists).toBe(true);
    });
  });

  describe('isPeerInRoom', () => {
    it('should return false for non-existent room', () => {
      const result = isPeerInRoom('non-existent-token' as Room['token'], uuidv4());

      expect(result).toBe(false);
    });

    it('should return false for peer not in room', () => {
      const room = createRoom();
      joinRoom(room.token, uuidv4(), 'Existing User');

      const result = isPeerInRoom(room.token, 'non-existent-peer');

      expect(result).toBe(false);
    });

    it('should return true for peer in room', () => {
      const room = createRoom();
      const peerId = uuidv4();
      joinRoom(room.token, peerId, 'Test User');

      const result = isPeerInRoom(room.token, peerId);

      expect(result).toBe(true);
    });
  });
});
