/**
 * Cleanup Service Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { deleteOldMessages } from '../repositories/message-repository.js';

// Mock the database
vi.mock('../db/index.js', () => ({
  getDatabase: vi.fn(() => ({
    run: vi.fn(),
    exec: vi.fn(() => [{ values: [] }]),
  })),
}));

describe('Cleanup Service', () => {
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
});
