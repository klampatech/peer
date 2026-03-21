import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'socket.io';

const POINTS = parseInt(process.env.RATE_LIMIT_MAX_POINTS || '100', 10);
const DURATION = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10) / 1000; // Convert to seconds

const rateLimiter = new RateLimiterMemory({
  points: POINTS,
  duration: DURATION,
  blockDuration: 0,
});

/**
 * Rate limiting middleware
 * Protects against brute-force attacks and DoS
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  rateLimiter
    .consume(clientIp)
    .then(() => {
      next();
    })
    .catch(() => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
      });
    });
}

/**
 * Socket.IO rate limiting middleware
 * @param io - Socket.IO instance
 */
export function setupSocketRateLimiter(io: ReturnType<typeof require>['socket.io']['Server']): void {
  const socketRateLimiter = new RateLimiterMemory({
    points: 30, // 30 events
    duration: 10, // per 10 seconds
    blockDuration: 0,
  });

  io.use((socket: Socket, next: (err?: Error) => void) => {
    const ip = socket.handshake.address || 'unknown';

    socketRateLimiter
      .consume(ip)
      .then(() => {
        next();
      })
      .catch(() => {
        next(new Error('Too many connection attempts'));
      });
  });
}
