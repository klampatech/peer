/**
 * Cleanup Service - Scheduled job for cleaning up old chat messages
 *
 * Runs hourly to hard-delete messages that have been soft-deleted
 * for more than 24 hours.
 */

import { deleteOldMessages } from '../repositories/message-repository.js';
import { logger } from '../utils/logger.js';

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
      logger.info({ deletedCount }, 'Cleanup: Deleted old messages');
    }
  } catch (error) {
    logger.error({ err: error }, 'Cleanup: Error during cleanup');
  }
}

/**
 * Start the cleanup scheduler
 * Runs the cleanup job every hour
 */
export function startCleanupScheduler(): void {
  if (cleanupInterval !== null) {
    logger.info('Cleanup: Scheduler already running');
    return;
  }

  // Run immediately on start
  performCleanup();

  // Then run every hour
  cleanupInterval = setInterval(() => {
    performCleanup();
  }, CLEANUP_INTERVAL_MS);

  logger.info('Cleanup: Scheduler started - running every hour');
}

/**
 * Stop the cleanup scheduler
 * Useful for graceful shutdown
 */
export function stopCleanupScheduler(): void {
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Cleanup: Scheduler stopped');
  }
}
