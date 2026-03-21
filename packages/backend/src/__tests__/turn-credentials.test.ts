import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateTurnCredentials, validateTurnCredentials } from '../services/turn-credentials.js';

describe('Turn Credentials', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generateTurnCredentials', () => {
    it('should generate valid TURN credentials', () => {
      const credentials = generateTurnCredentials();

      expect(credentials).toBeDefined();
      expect(credentials.username).toBeDefined();
      expect(credentials.password).toBeDefined();
      expect(credentials.urls).toBeDefined();
      expect(credentials.ttl).toBe(3600);
    });

    it('should generate username with timestamp and realm format', () => {
      const credentials = generateTurnCredentials();

      // Username format: timestamp:realm
      const parts = credentials.username.split(':');
      expect(parts).toHaveLength(2);
      expect(parseInt(parts[0] || '0', 10)).toBeGreaterThan(0);
      expect(parts[1]).toBe('peer');
    });

    it('should generate HMAC-SHA1 password', () => {
      const credentials = generateTurnCredentials();

      // Password should be base64 encoded
      expect(credentials.password).toMatch(/^[A-Za-z0-9+/=]+$/);
      // HMAC-SHA1 produces 20 bytes, base64 encoded = 28 chars with padding
      expect(credentials.password.length).toBeGreaterThanOrEqual(27);
    });

    it('should generate TURN URLs with correct format', () => {
      const credentials = generateTurnCredentials();

      expect(credentials.urls).toHaveLength(4);
      expect(credentials.urls[0]).toMatch(/^turn:/);
      expect(credentials.urls[1]).toMatch(/^turn:.*\/tcp$/);
    });

    it('should use COTURN_PORT environment variable', () => {
      process.env.COTURN_PORT = '3479';

      const credentials = generateTurnCredentials();

      expect(credentials.urls[0]).toContain('3479');
    });
  });

  describe('validateTurnCredentials', () => {
    it('should validate correct credentials', () => {
      const credentials = generateTurnCredentials();
      const isValid = validateTurnCredentials(credentials.username, credentials.password);

      expect(isValid).toBe(true);
    });

    it('should reject invalid password', () => {
      const credentials = generateTurnCredentials();
      const isValid = validateTurnCredentials(credentials.username, 'invalid-password');

      expect(isValid).toBe(false);
    });

    it('should reject expired credentials', async () => {
      // Create credentials that are already expired
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
      const expiredUsername = `${expiredTimestamp}:peer`;

      // We need to generate a valid HMAC for this username
      const crypto = await import('crypto');
      const secret = process.env.TURN_SECRET || 'change-me-in-production';
      const hmac = crypto.createHmac('sha1', secret);
      hmac.update(expiredUsername);
      const password = hmac.digest('base64');

      const isValid = validateTurnCredentials(expiredUsername, password);

      expect(isValid).toBe(false);
    });

    it('should reject malformed username', () => {
      const isValid = validateTurnCredentials('not-a-timestamp', 'some-password');

      expect(isValid).toBe(false);
    });

    it('should reject empty username', () => {
      const isValid = validateTurnCredentials('', 'some-password');

      expect(isValid).toBe(false);
    });
  });
});
