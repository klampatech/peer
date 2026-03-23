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

      const input = '<script>alert("xss")</script>Hello';
      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: 'Test User',
        message: input,
      });

      // The output should NOT equal the input (sanitization happened)
      expect(result.message).not.toBe(input);
      // Original text content is preserved after sanitization
      expect(result.message).toContain('Hello');
    });

    it('should sanitize HTML entities', () => {
      mockDb.run = vi.fn();

      const input = 'Hello & world "test" /slash';
      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: 'Test User',
        message: input,
      });

      // Output should not equal input (sanitization happened)
      expect(result.message).not.toBe(input);
      // Check entity encoding happened - & became &
      expect(result.message).toContain('&');
      expect(result.message).toContain('Hello');
    });

    it('should sanitize img onerror XSS payload', () => {
      mockDb.run = vi.fn();

      const input = '<img src=x onerror=alert(1)>';
      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: 'Test User',
        message: input,
      });

      // Result should be different from input
      expect(result.message).not.toBe(input);
      // Original text content is preserved after sanitization
      expect(result.message).toContain('img');
    });

    it('should sanitize svg onload XSS payload', () => {
      mockDb.run = vi.fn();

      const input = '<svg onload=alert(1)>';
      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: 'Test User',
        message: input,
      });

      // Result should be different from input
      expect(result.message).not.toBe(input);
      // Original text content is preserved after sanitization
      expect(result.message).toContain('svg');
    });

    it('should sanitize javascript protocol XSS payload', () => {
      mockDb.run = vi.fn();

      const input = '<a href="javascript:alert(1)">click</a>';
      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: 'Test User',
        message: input,
      });

      // Result should be different from input
      expect(result.message).not.toBe(input);
      // Original text content is preserved after sanitization
      expect(result.message).toContain('click');
    });

    it('should sanitize nested XSS payload', () => {
      mockDb.run = vi.fn();

      const input = '<div onclick="alert(1)"><script>alert(2)</script></div>';
      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: 'Test User',
        message: input,
      });

      // Result should be different from input
      expect(result.message).not.toBe(input);
      // Original text content is preserved after sanitization
      expect(result.message).toContain('alert');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should handle malicious roomToken with SQL injection attempt', () => {
      mockDb.run = vi.fn();

      // This should not cause SQL syntax errors or allow injection
      const maliciousToken = "test'; DROP TABLE messages; --" as RoomToken;

      expect(() => {
        createMessage({
          roomToken: maliciousToken,
          peerId: 'peer-123',
          displayName: 'Test User',
          message: 'Hello',
        });
      }).not.toThrow();

      // Verify parameterized query was used (no string concatenation)
      expect(mockDb.run).toHaveBeenCalled();
      const callArgs = mockDb.run.mock.calls[0];
      expect(callArgs[0]).toContain('?');
    });

    it('should handle malicious peerId with SQL injection attempt', () => {
      mockDb.run = vi.fn();

      const maliciousPeerId = "peer-1' OR '1'='1";

      expect(() => {
        createMessage({
          roomToken: createTestToken(),
          peerId: maliciousPeerId,
          displayName: 'Test User',
          message: 'Hello',
        });
      }).not.toThrow();
    });

    it('should handle malicious displayName with SQL injection attempt', () => {
      mockDb.run = vi.fn();

      const maliciousDisplayName = "Test<script>alert(1)</script>User";

      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: maliciousDisplayName,
        message: 'Hello',
      });

      // NOTE: displayName is NOT sanitized in createMessage - this is by design
      // The caller is responsible for sanitizing displayName before passing it
      // This test documents the current behavior
      expect(result.displayName).toBe(maliciousDisplayName);
    });

    it('should handle SQL injection in message content', () => {
      mockDb.run = vi.fn();

      const input = "Hello'; UPDATE messages SET message='hacked' WHERE '1'='1";
      const result = createMessage({
        roomToken: createTestToken(),
        peerId: 'peer-123',
        displayName: 'Test User',
        message: input,
      });

      // Message should be sanitized - single quotes become HTML entities
      expect(result.message).not.toBe(input);
      // The single quote should be escaped to HTML entity
      expect(result.message).toMatch(/&#[xX]27;/);
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