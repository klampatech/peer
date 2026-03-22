import crypto from 'crypto';

const TURN_SECRET = process.env.TURN_SECRET;
if (!TURN_SECRET) {
  throw new Error('TURN_SECRET environment variable is required');
}
// TypeScript doesn't narrow type after throw at module level, so we assert it's defined
const turnSecret: string = TURN_SECRET;
const TURN_REALM = process.env.TURN_REALM || 'peer';
const TURN_TTL_SECONDS = 3600; // 1 hour

export interface TurnCredentials {
  username: string;
  password: string;
  urls: string[];
  ttl: number;
}

/**
 * Generate TURN credentials using HMAC-SHA1
 * Implements TURN REST API format compatible with coturn
 */
export function generateTurnCredentials(): TurnCredentials {
  const timestamp = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  // Format: timestamp:realm for TURN REST API
  const username = `${timestamp}:${TURN_REALM}`;

  // Generate HMAC-SHA1 password
  const hmac = crypto.createHmac('sha1', turnSecret);
  hmac.update(username);
  const password = hmac.digest('base64');

  // Build TURN URLs based on environment configuration
  const turnPort = process.env.COTURN_PORT || '3478';
  const turnTlsPort = process.env.COTURN_TLS_PORT || '5349';

  // TURN_HOST can be set to the public hostname (e.g., your-domain.com)
  // For local development, defaults to localhost
  const turnHost = process.env.TURN_HOST || 'localhost';

  const turnUrls = [
    `turn:${turnHost}:${turnPort}`,
    `turn:${turnHost}:${turnPort}/tcp`,
    // TLS-secured TURN URLs for production (port 5349)
    `turns:${turnHost}:${turnTlsPort}`,
  ];

  // Only include 127.0.0.1 fallback for localhost to avoid confusing remote peers
  if (turnHost === 'localhost' || turnHost === '127.0.0.1') {
    turnUrls.push(
      `turn:127.0.0.1:${turnPort}`,
      `turn:127.0.0.1:${turnPort}/tcp`,
    );
  }

  return {
    username,
    password,
    urls: turnUrls,
    ttl: TURN_TTL_SECONDS,
  };
}

/**
 * Validate TURN credentials (for future use with authentication)
 */
export function validateTurnCredentials(username: string, password: string): boolean {
  try {
    const timestamp = parseInt(username, 10);
    if (isNaN(timestamp)) return false;

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (timestamp < now) return false;

    // Verify HMAC
    const hmac = crypto.createHmac('sha1', turnSecret);
    hmac.update(username);
    const expectedPassword = hmac.digest('base64');

    return password === expectedPassword;
  } catch {
    return false;
  }
}
