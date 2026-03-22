import type { Server, Socket } from 'socket.io';
import { generateTurnCredentials } from '../services/turn-credentials.js';
import { logger } from '../utils/logger.js';

/**
 * Sets up TURN-related Socket.IO event handlers
 */
export function setupTurnEvents(io: Server): void {
  io.on('connection', (socket: Socket) => {
    /**
     * Handle TURN credentials request
     * Generates temporary TURN credentials for the client to use in WebRTC
     */
    /**
     * Handle TURN credentials request.
     * Socket.IO v4 acknowledgement: callback is the THIRD argument (after payload).
     * We also emit 'turn:credentials' as a fallback event for non-acknowledge clients.
     */
    socket.on('turn:request', (_payload: unknown, callback?: (credentials: {
      username: string;
      password: string;
      urls: string[];
      ttl: number;
    }) => void) => {
      try {
        const credentials = generateTurnCredentials();

        logger.info({ socketId: socket.id }, 'TURN credentials generated');

        // Prefer acknowledgement callback if the client sent one
        if (typeof callback === 'function') {
          callback(credentials);
        } else {
          // Fallback: emit as a named event
          socket.emit('turn:credentials', credentials);
        }
      } catch (error) {
        logger.error({ err: error, socketId: socket.id }, 'Error generating TURN credentials');

        if (typeof callback === 'function') {
          callback({
            username: '',
            password: '',
            urls: [],
            ttl: 0,
          });
        } else {
          socket.emit('turn:credentials', {
            username: '',
            password: '',
            urls: [],
            ttl: 0,
          });
        }
      }
    });
  });
}
