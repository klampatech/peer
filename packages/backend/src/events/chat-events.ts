/**
 * Chat Events - Socket.IO event handlers for chat functionality
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import type { RoomToken, ChatMessagePayload } from '@peer/shared';
import { createMessage, getMessagesByRoom, validateMessage } from '../repositories/message-repository';
import { isPeerInRoom } from '../rooms';

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
    const socketData = socket.data as SocketData;

    /**
     * Handle incoming chat messages
     */
    socket.on('chat:message', (payload: ChatMessagePayload) => {
      try {
        const { roomToken, message } = payload;
        const peerId = socketData.peerId;
        const displayName = socketData.displayName;

        // Validate peer is in the room
        if (!roomToken || !isPeerInRoom(roomToken, peerId)) {
          socket.emit('chat:error', {
            code: 'NOT_IN_ROOM',
            message: 'You must be in a room to send messages',
          });
          return;
        }

        // Validate message
        const validation = validateMessage(message);
        if (!validation.valid) {
          socket.emit('chat:error', {
            code: 'INVALID_MESSAGE',
            message: validation.error || 'Invalid message',
          });
          return;
        }

        // Create message in database
        const chatMessage = createMessage({
          roomToken,
          peerId,
          displayName,
          message: message.trim(),
        });

        // Broadcast message to all peers in the room
        io.to(roomToken).emit('chat:message', chatMessage);
      } catch (error) {
        console.error('Error handling chat:message:', error);
        socket.emit('chat:error', {
          code: 'SERVER_ERROR',
          message: 'Failed to send message',
        });
      }
    });

    /**
     * Handle request for message history
     */
    socket.on('chat:history', (payload: { roomToken: RoomToken }) => {
      try {
        const { roomToken } = payload;
        const peerId = socketData.peerId;

        // Validate peer is in the room
        if (!isPeerInRoom(roomToken, peerId)) {
          socket.emit('chat:error', {
            code: 'NOT_IN_ROOM',
            message: 'You must be in a room to view history',
          });
          return;
        }

        // Get message history
        const messages = getMessagesByRoom(roomToken, 100);

        socket.emit('chat:history', messages);
      } catch (error) {
        console.error('Error handling chat:history:', error);
        socket.emit('chat:error', {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve message history',
        });
      }
    });
  });
}
