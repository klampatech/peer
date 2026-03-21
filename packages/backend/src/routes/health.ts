import { Router, type Request, type Response } from 'express';

const router: Router = Router();

const startTime = Date.now();
const VERSION = process.env.npm_package_version || '1.0.0';

/**
 * Health check endpoint
 * Returns service status, uptime, and version
 */
router.get('/', (_req: Request, res: Response) => {
  const uptime = Date.now() - startTime;

  res.json({
    status: 'ok',
    uptime,
    version: VERSION,
  });
});

export default router;
