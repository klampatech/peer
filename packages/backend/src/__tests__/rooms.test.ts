import { describe, it, expect, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  deleteRoom,
  getAllRooms,
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

    it('should destroy room when last peer leaves', () => {
      const room = createRoom();
      const peerId = uuidv4();

      joinRoom(room.token, peerId, 'Test User');
      leaveRoom(room.token, peerId);

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
});
