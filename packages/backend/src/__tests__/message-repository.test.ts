import { describe, it, expect, beforeEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { RoomToken } from '@peer/shared';
import {
  createMessage,
  getMessagesByRoom,
  softDeleteRoomMessages,
  deleteOldMessages,
  validateMessage,
} from '../repositories/message-repository.js';

// Helper to create a valid RoomToken
const createTestToken = (): RoomToken => {
  return uuidv4() as RoomToken;
};

// Mock the database module
vi.mock('../db/index', () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from '../db/index';

describe('Message Repository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      run: vi.fn(),
      exec: vi.fn(),
    };
    vi.mocked(getDatabase).mockReturnValue(mockDb);
  });

  describe('createMessage', () => {
    it('should create a message with valid input', () => {
      mockDb.run = vi.fn();

      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-456',
        displayName: 'Test User',
        message: 'Hello, world!',
      });

      expect(result).toBeDefined();
      expect(result.message).toBe('Hello, world!');
      expect(result.displayName).toBe('Test User');
      expect(result.peerId).toBe('peer-456');
      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should throw error when message exceeds 2000 characters', () => {
      const longMessage = 'a'.repeat(2001);

      expect(() =>
        createMessage({
          roomToken: createTestToken(),
          peerId: 'peer-123',
          displayName: 'Test User',
          message: longMessage,
        })
      ).toThrow('Message exceeds maximum length of 2000 characters');
    });

    it('should sanitize HTML in message', () => {
      mockDb.run = vi.fn();

      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: 'Test User',
        message: '<script>alert("xss")</script>Hello',
      });

      expect(result.message).not.toContain('<script>');
      expect(result.message).toContain('&lt;script&gt;');
    });

    it('should sanitize HTML entities', () => {
      mockDb.run = vi.fn();

      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: 'Test User',
        message: 'Hello & <world> "test" \'quote\' /slash',
      });

      expect(result.message).toContain('&amp;');
      expect(result.message).toContain('&lt;');
      expect(result.message).toContain('&gt;');
      expect(result.message).toContain('&quot;');
      expect(result.message).toContain('&#x27;');
      expect(result.message).toContain('&#x2F;');
    });
  });

  describe('getMessagesByRoom', () => {
    it('should return messages for a room', () => {
      mockDb.exec = vi.fn().mockReturnValue([
        {
          columns: ['id', 'peer_id', 'display_name', 'message', 'timestamp'],
          values: [
            ['msg-1', 'peer-1', 'User 1', 'Hello', 1700000000000],
            ['msg-2', 'peer-2', 'User 2', 'Hi there', 1700000001000],
          ],
        },
      ]);

      const messages = getMessagesByRoom(createTestToken());

      expect(messages).toHaveLength(2);
      expect(messages[0]?.id).toBe('msg-1');
      expect(messages[0]?.message).toBe('Hello');
    });

    it('should return empty array when no messages exist', () => {
      mockDb.exec = vi.fn().mockReturnValue([]);

      const messages = getMessagesByRoom(createTestToken());

      expect(messages).toHaveLength(0);
    });

    it('should return empty array when results are empty', () => {
      mockDb.exec = vi.fn().mockReturnValue([{ columns: [], values: [] }]);

      const messages = getMessagesByRoom(createTestToken());

      expect(messages).toHaveLength(0);
    });

    it('should use limit parameter', () => {
      mockDb.exec = vi.fn().mockReturnValue([]);
      const testToken = createTestToken();

      getMessagesByRoom(testToken, 50);

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        [testToken, 50]
      );
    });
  });

  describe('softDeleteRoomMessages', () => {
    it('should update messages as deleted', () => {
      mockDb.run = vi.fn();
      const testToken = createTestToken();

      softDeleteRoomMessages(testToken);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE messages SET deleted = 1'),
        [testToken]
      );
    });

    it('should handle database not initialized', () => {
      vi.mocked(getDatabase).mockImplementation(() => {
        throw new Error('Database not initialized');
      });

      expect(() => softDeleteRoomMessages(createTestToken())).not.toThrow();
    });
  });

  describe('deleteOldMessages', () => {
    it('should delete messages older than specified hours', () => {
      mockDb.exec = vi.fn();

      deleteOldMessages(24);

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM messages'),
        expect.any(Array)
      );
    });
  });

  describe('validateMessage', () => {
    it('should validate empty message', () => {
      const result = validateMessage('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message cannot be empty');
    });

    it('should validate whitespace-only message', () => {
      const result = validateMessage('   ');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message cannot be empty');
    });

    it('should validate message exceeding 2000 characters', () => {
      const longMessage = 'a'.repeat(2001);
      const result = validateMessage(longMessage);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message exceeds maximum length of 2000 characters');
    });

    it('should validate valid message', () => {
      const result = validateMessage('Hello, world!');

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate message at exactly 2000 characters', () => {
      const exactMessage = 'a'.repeat(2000);
      const result = validateMessage(exactMessage);

      expect(result.valid).toBe(true);
    });
  });
});
