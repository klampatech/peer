import type { Server, Socket } from 'socket.io';
import { generateTurnCredentials } from '../services/turn-credentials.js';
import { logger } from '../utils/logger.js';

interface TurnCredentials {
  username: string;
  password: string;
  urls: string[];
  ttl: number;
}

/**
 * Sets up TURN-related Socket.IO event handlers
 */
export function setupTurnEvents(io: Server): void {
  io.on('connection', (socket: Socket) => {
    /**
     * Handle TURN credentials request.
     * Socket.IO v4 acknowledgement: callback is the THIRD argument (after payload).
     * Uses consistent SocketResponse format with { success, data, error }.
     */
    socket.on('turn:request', (_payload: unknown, callback?: (response: {
      success: boolean;
      data?: TurnCredentials;
      error?: { code: string; message: string };
    }) => void) => {
      try {
        const credentials = generateTurnCredentials();

        logger.info({ socketId: socket.id }, 'TURN credentials generated');

        const response = {
          success: true,
          data: credentials,
        };

        // Prefer acknowledgement callback if the client sent one
        if (typeof callback === 'function') {
          callback(response);
        } else {
          // Fallback: emit as a named event with same format
          socket.emit('turn:credentials', response);
        }
      } catch (error) {
        logger.error({ err: error, socketId: socket.id }, 'Error generating TURN credentials');

        const errorResponse = {
          success: false,
          error: {
            code: 'TURN_GENERATION_FAILED',
            message: 'Failed to generate TURN credentials',
          },
        };

        if (typeof callback === 'function') {
          callback(errorResponse);
        } else {
          socket.emit('turn:credentials', {
            success: false,
            data: {
              username: '',
              password: '',
              urls: [],
              ttl: 0,
            },
            error: errorResponse.error,
          });
        }
      }
    });
  });
}
