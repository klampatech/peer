import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';

/**
 * Security middleware configuration using Helmet
 */
export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      mediaSrc: ["'self'", 'blob:'],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
});

/**
 * Permissions-Policy middleware
 * Restricts camera, microphone, and display-capture to same-origin only
 * Spec Section 8.4: camera=(), microphone=(), display-capture=()
 */
export function permissionsPolicyMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=()'
  );
  next();
}

/**
 * CORS middleware
 */
export function corsMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';

  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (_req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
}
