/**
 * Chat Events - Socket.IO event handlers for chat functionality
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import type { RoomToken, ChatMessageResponsePayload } from '@peer/shared';
import { createMessage, getMessagesByRoom, validateMessage } from '../repositories/message-repository';
import { isPeerInRoom } from '../rooms';
import { logger } from '../utils/logger.js';
import {
  ChatMessageSchema,
  ChatHistorySchema,
  validatePayload,
  createRoomToken,
  type ChatMessageInput,
  type ChatHistoryInput,
} from '@peer/shared';

interface SocketData {
  peerId: string;
  displayName: string;
  roomToken?: RoomToken;
}

/**
 * Set up chat Socket.IO events
 */
export function setupChatEvents(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    // Generate traceId if not already set by another handler
    if (!socket.data.traceId) {
      socket.data.traceId = uuidv4();
    }

    const socketData = socket.data as SocketData;

    /**
     * Handle incoming chat messages
     * Uses push-based model: broadcasts to room, no callback needed
     */
    socket.on('chat:message', (payload: unknown) => {
      try {
        const validation = validatePayload<ChatMessageInput>(ChatMessageSchema, payload);

        if (!validation.success) {
          socket.emit('chat:error', {
            success: false,
            error: {
              code: validation.error!.code,
              message: validation.error!.message,
            },
          });
          return;
        }

        const { roomToken, message } = validation.data!;
        const roomTokenTyped = createRoomToken(roomToken);
        const peerId = socketData.peerId;
        const displayName = socketData.displayName;

        // Validate peer is in the room
        if (!roomTokenTyped || !isPeerInRoom(roomTokenTyped, peerId)) {
          socket.emit('chat:error', {
            success: false,
            error: {
              code: 'NOT_IN_ROOM',
              message: 'You must be in a room to send messages',
            },
          });
          return;
        }

        // Validate message (additional business logic validation)
        const messageValidation = validateMessage(message);
        if (!messageValidation.valid) {
          socket.emit('chat:error', {
            success: false,
            error: {
              code: 'INVALID_MESSAGE',
              message: messageValidation.error || 'Invalid message',
            },
          });
          return;
        }

        // Create message in database
        const chatMessage = createMessage({
          roomToken: roomTokenTyped,
          peerId,
          displayName,
          message: message.trim(),
        });

        // Broadcast message to all peers in the room
        io.to(roomTokenTyped).emit('chat:message', chatMessage);
      } catch (error) {
        logger.error({ traceId: socket.data.traceId, err: error }, 'Error handling chat:message');
        socket.emit('chat:error', {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: 'Failed to send message',
          },
        });
      }
    });

    /**
     * Handle request for message history
     * Uses callback pattern for consistency with room events
     */
    socket.on('chat:history', (payload: unknown, callback?: (response: {
      success: boolean;
      data?: { messages: ChatMessageResponsePayload[] };
      error?: { code: string; message: string };
    }) => void) => {
      try {
        const validation = validatePayload<ChatHistoryInput>(ChatHistorySchema, payload);

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
            socket.emit('chat:error', errorResponse);
          }
          return;
        }

        const { roomToken } = validation.data!;
        const roomTokenTyped = createRoomToken(roomToken);
        const peerId = socketData.peerId;

        // Validate peer is in the room
        if (!isPeerInRoom(roomTokenTyped, peerId)) {
          const errorResponse = {
            success: false,
            error: {
              code: 'NOT_IN_ROOM',
              message: 'You must be in a room to view history',
            },
          };
          if (typeof callback === 'function') {
            callback(errorResponse);
          } else {
            socket.emit('chat:error', errorResponse);
          }
          return;
        }

        // Get message history
        const messages = getMessagesByRoom(roomTokenTyped, 100);

        const response = {
          success: true,
          data: { messages },
        };

        if (typeof callback === 'function') {
          callback(response);
        } else {
          socket.emit('chat:history', messages);
        }
      } catch (error) {
        logger.error({ traceId: socket.data.traceId, err: error }, 'Error handling chat:history');
        const errorResponse = {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: 'Failed to retrieve message history',
          },
        };
        if (typeof callback === 'function') {
          callback(errorResponse);
        } else {
          socket.emit('chat:error', errorResponse);
        }
      }
    });
  });
}
