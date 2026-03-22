import { Router, type Request, type Response } from 'express';
import { getDatabase } from '../db/index.js';

const router: Router = Router();

const startTime = Date.now();
const VERSION = process.env.npm_package_version || '1.0.0';

// Cleanup scheduler status - exported from cleanup service
let cleanupSchedulerRunning = false;

export function setCleanupSchedulerStatus(running: boolean): void {
  cleanupSchedulerRunning = running;
}

export function getCleanupSchedulerStatus(): boolean {
  return cleanupSchedulerRunning;
}

/**
 * Health check endpoint
 * Returns service status, uptime, version, and dependency health
 */
router.get('/', (_req: Request, res: Response) => {
  const uptime = Date.now() - startTime;

  // Check database connectivity
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    const db = getDatabase();
    db.exec('SELECT 1');
  } catch {
    dbStatus = 'error';
  }

  const response = {
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    uptime,
    version: VERSION,
    dependencies: {
      database: dbStatus,
      cleanupScheduler: cleanupSchedulerRunning ? 'running' : 'stopped',
    },
  };

  const statusCode = response.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(response);
});

export default router;
