/**
 * Cleanup Service - Scheduled job for cleaning up old chat messages
 *
 * Runs hourly to hard-delete messages that have been soft-deleted
 * for more than 24 hours.
 */

import { deleteOldMessages } from '../repositories/message-repository.js';

// Cleanup interval: 1 hour (in milliseconds)
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// Messages older than 24 hours will be hard-deleted
const OLD_MESSAGE_THRESHOLD_HOURS = 24;

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Perform cleanup of old messages
 * Called internally and by scheduled job
 */
export function performCleanup(): void {
  try {
    const deletedCount = deleteOldMessages(OLD_MESSAGE_THRESHOLD_HOURS);
    if (deletedCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`[Cleanup] Deleted ${deletedCount} old messages`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Cleanup] Error during cleanup:', error);
  }
}

/**
 * Start the cleanup scheduler
 * Runs the cleanup job every hour
 */
export function startCleanupScheduler(): void {
  if (cleanupInterval !== null) {
    // eslint-disable-next-line no-console
    console.log('[Cleanup] Scheduler already running');
    return;
  }

  // Run immediately on start
  performCleanup();

  // Then run every hour
  cleanupInterval = setInterval(() => {
    performCleanup();
  }, CLEANUP_INTERVAL_MS);

  // eslint-disable-next-line no-console
  console.log('[Cleanup] Scheduler started - running every hour');
}

/**
 * Stop the cleanup scheduler
 * Useful for graceful shutdown
 */
export function stopCleanupScheduler(): void {
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    // eslint-disable-next-line no-console
    console.log('[Cleanup] Scheduler stopped');
  }
}
