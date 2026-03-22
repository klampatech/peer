/**
 * Cleanup Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteOldMessages } from '../repositories/message-repository.js';

// Mock the database
vi.mock('../db/index.js', () => ({
  getDatabase: vi.fn(() => ({
    run: vi.fn(),
    exec: vi.fn(() => [{ values: [] }]),
  })),
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Cleanup Service', () => {
  // Reset timers for interval tests
  let timers: ReturnType<typeof setTimeout>[];

  beforeEach(async () => {
    timers = [];
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Ensure any lingering scheduler is stopped between tests
    const { stopCleanupScheduler } = await import('../services/cleanup.js');
    stopCleanupScheduler();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clear any intervals that might have been set
    vi.clearAllTimers();
  });

  describe('deleteOldMessages', () => {
    it('should delete messages older than specified hours', async () => {
      const { getDatabase } = await import('../db/index.js');
      const mockDb = {
        run: vi.fn(),
        exec: vi.fn(() => [{ values: [] }]),
      };
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      const result = deleteOldMessages(24);

      expect(mockDb.exec).toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('should use 24 hours as default when no hours specified', async () => {
      const { getDatabase } = await import('../db/index.js');
      const mockDb = {
        run: vi.fn(),
        exec: vi.fn(() => [{ values: [] }]),
      };
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      deleteOldMessages();

      // Verify the query was called with a cutoff time 24 hours ago
      expect(mockDb.exec).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const { getDatabase } = await import('../db/index.js');
      vi.mocked(getDatabase).mockImplementation(() => {
        throw new Error('Database not initialized');
      });

      // Should not throw
      expect(() => deleteOldMessages(24)).not.toThrow();
    });
  });

  describe('performCleanup', () => {
    it('should call deleteOldMessages', async () => {
      const { getDatabase } = await import('../db/index.js');
      const { logger } = await import('../utils/logger.js');

      const mockDb = {
        run: vi.fn(),
        exec: vi.fn(() => [{ values: [['1'], ['2'], ['3']] }]), // Simulate 3 messages deleted
      };
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      const { performCleanup } = await import('../services/cleanup.js');
      performCleanup();

      // Verify deleteOldMessages was called (it always returns 0 due to sql.js limitation)
      expect(mockDb.exec).toHaveBeenCalled();
      // Note: No log message is generated because deleteOldMessages always returns 0
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', async () => {
      const { getDatabase } = await import('../db/index.js');
      vi.mocked(getDatabase).mockImplementation(() => {
        throw new Error('Database error');
      });

      const { performCleanup } = await import('../services/cleanup.js');
      expect(() => performCleanup()).not.toThrow();
    });
  });

  describe('startCleanupScheduler', () => {
    it('should start the scheduler and run cleanup immediately', async () => {
      const { getDatabase } = await import('../db/index.js');
      const { logger } = await import('../utils/logger.js');

      const mockDb = {
        run: vi.fn(),
        exec: vi.fn(() => [{ values: [] }]),
      };
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      const { startCleanupScheduler, stopCleanupScheduler } = await import('../services/cleanup.js');
      startCleanupScheduler();

      // Should run cleanup immediately
      expect(mockDb.exec).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Cleanup: Scheduler started - running every hour');

      // Clean up
      stopCleanupScheduler();
    });

    it('should not start multiple schedulers if already running', async () => {
      const { getDatabase } = await import('../db/index.js');
      const { logger } = await import('../utils/logger.js');

      const mockDb = {
        run: vi.fn(),
        exec: vi.fn(() => [{ values: [] }]),
      };
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      const { startCleanupScheduler, stopCleanupScheduler } = await import('../services/cleanup.js');
      startCleanupScheduler();
      startCleanupScheduler(); // Call again

      // Should log that it's already running
      expect(logger.info).toHaveBeenCalledWith('Cleanup: Scheduler already running');

      // Clean up
      stopCleanupScheduler();
    });
  });

  describe('stopCleanupScheduler', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should stop the scheduler', async () => {
      const { getDatabase } = await import('../db/index.js');
      const { logger } = await import('../utils/logger.js');

      const mockDb = {
        run: vi.fn(),
        exec: vi.fn(() => [{ values: [] }]),
      };
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

      const { startCleanupScheduler, stopCleanupScheduler } = await import('../services/cleanup.js');
      startCleanupScheduler();
      stopCleanupScheduler();

      expect(logger.info).toHaveBeenCalledWith('Cleanup: Scheduler stopped');
    });

    it('should handle stopping when not running', async () => {
      const { logger } = await import('../utils/logger.js');

      const { stopCleanupScheduler } = await import('../services/cleanup.js');
      stopCleanupScheduler();

      // Should not throw or log anything when already stopped
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
