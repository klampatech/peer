import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'socket.io';
import type { Server } from 'socket.io';

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
 * Limits connection attempts to prevent abuse
 * Spec: 10 joins per IP per minute (Section 8.2)
 */
export function setupSocketRateLimiter(io: ReturnType<typeof require>['socket.io']['Server']): void {
  // Configurable socket rate limiting - 10 by default for production, higher for testing
  const socketRateLimitPoints = parseInt(process.env.SOCKET_RATE_LIMIT_POINTS || '10', 10);
  const socketRateLimitDuration = parseInt(process.env.SOCKET_RATE_LIMIT_DURATION || '60', 10);

  const socketRateLimiter = new RateLimiterMemory({
    points: socketRateLimitPoints,
    duration: socketRateLimitDuration,
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

// Per-socket rate limiting configuration
const SOCKET_EVENT_RATE_LIMIT_POINTS = parseInt(process.env.SOCKET_EVENT_RATE_LIMIT_POINTS || '30', 10);
const SOCKET_EVENT_RATE_LIMIT_DURATION = parseInt(process.env.SOCKET_EVENT_RATE_LIMIT_DURATION || '10', 10);

/**
 * Per-socket event rate limiter
 * Limits the number of events a connected socket can send within a time window
 * This prevents a single compromised socket from flooding the server
 */
const socketEventRateLimiter = new RateLimiterMemory({
  points: SOCKET_EVENT_RATE_LIMIT_POINTS,
  duration: SOCKET_EVENT_RATE_LIMIT_DURATION,
  blockDuration: 0,
});

/**
 * Apply per-socket rate limiting to Socket.IO events
 * Tracks events per socket ID to limit abuse from connected clients
 */
export function setupPerSocketRateLimiter(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // Track event count for this socket
    socket.onAny((_eventName: string) => {
      // Get socket ID as the key for rate limiting
      const socketId = socket.id;

      socketEventRateLimiter
        .consume(socketId)
        .then(() => {
          // Event allowed, continue processing
        })
        .catch(() => {
          // Rate limit exceeded - disconnect the socket
          console.warn(`Per-socket rate limit exceeded for socket ${socketId}, disconnecting`);
          socket.emit('rate_limit_exceeded', {
            code: 'SOCKET_RATE_LIMIT_EXCEEDED',
            message: 'Too many events sent. Please slow down.',
          });
          socket.disconnect(true);
        });
    });
  });
}
