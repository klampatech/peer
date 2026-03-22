import type { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { generateTurnCredentials } from '../services/turn-credentials.js';
import { logger } from '../utils/logger.js';
import { isPeerInRoom } from '../rooms.js';
import { TurnRequestSchema, validatePayload, createRoomToken, type TurnRequestInput } from '@peer/shared';

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
    // Generate traceId if not already set by another handler
    if (!socket.data.traceId) {
      socket.data.traceId = uuidv4();
    }

    /**
     * Handle TURN credentials request.
     * Socket.IO v4 acknowledgement: callback is the THIRD argument (after payload).
     * Uses consistent SocketResponse format with { success, data, error }.
     */
    socket.on('turn:request', (payload: unknown, callback?: (response: {
      success: boolean;
      data?: TurnCredentials;
      error?: { code: string; message: string };
    }) => void) => {
      try {
        // Validate payload (optional - accepts empty or valid roomToken)
        const validation = validatePayload<TurnRequestInput>(TurnRequestSchema, payload);

        if (!validation.success) {
          const errorResponse = {
            success: false,
            error: {
              code: validation.error!.code,
              message: validation.error!.message,
            },
          };

          if (typeof callback === 'function') {
            callback(errorResponse);
          } else {
            socket.emit('turn:credentials', errorResponse);
          }
          return;
        }

        // Verify room membership if roomToken is provided
        const roomToken = validation.data?.roomToken ? createRoomToken(validation.data.roomToken) : undefined;
        const peerId = socket.data.peerId;

        if (roomToken && !isPeerInRoom(roomToken, peerId)) {
          const errorResponse = {
            success: false,
            error: {
              code: 'NOT_IN_ROOM',
              message: 'You must be in the room to request TURN credentials',
            },
          };

          if (typeof callback === 'function') {
            callback(errorResponse);
          } else {
            socket.emit('turn:credentials', errorResponse);
          }
          return;
        }

        const credentials = generateTurnCredentials();

        logger.info({ traceId: socket.data.traceId, socketId: socket.id }, 'TURN credentials generated');

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
        logger.error({ traceId: socket.data.traceId, err: error, socketId: socket.id }, 'Error generating TURN credentials');

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
