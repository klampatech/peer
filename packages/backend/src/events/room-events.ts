import type { Server, Socket } from 'socket.io';
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  getPeersInRoom,
  type Room,
} from '../rooms.js';

/**
 * Type guard for RoomToken - validates UUID v4 format
 */
function isRoomToken(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Sets up room-related Socket.IO event handlers
 */
export function setupRoomEvents(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // eslint-disable-next-line no-console
    console.log(`Client connected: ${socket.id}`);

    // Handle room creation
    socket.on('room:create', (data: { displayName: string }, callback) => {
      try {
        if (!data.displayName || data.displayName.trim().length === 0) {
          callback({
            success: false,
            error: { code: 'INVALID_DISPLAY_NAME', message: 'Display name is required' },
          });
          return;
        }

        if (data.displayName.length > 50) {
          callback({
            success: false,
            error: { code: 'DISPLAY_NAME_TOO_LONG', message: 'Display name must be 50 characters or less' },
          });
          return;
        }

        const room = createRoom();
        joinRoom(room.token, socket.id, data.displayName.trim());

        socket.join(room.token);

        callback({
          success: true,
          data: { token: room.token },
        });

        // eslint-disable-next-line no-console
        console.log(`Room created: ${room.token} by ${socket.id}`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error creating room:', error);
        callback({
          success: false,
          error: { code: 'ROOM_CREATE_FAILED', message: 'Failed to create room' },
        });
      }
    });

    // Handle room joining
    socket.on('room:join', (data: { token: string; displayName: string }, callback) => {
      try {
        const { token, displayName } = data;

        if (!token || !isRoomToken(token)) {
          callback({
            success: false,
            error: { code: 'INVALID_TOKEN', message: 'Invalid room token' },
          });
          return;
        }

        if (!displayName || displayName.trim().length === 0) {
          callback({
            success: false,
            error: { code: 'INVALID_DISPLAY_NAME', message: 'Display name is required' },
          });
          return;
        }

        if (displayName.length > 50) {
          callback({
            success: false,
            error: { code: 'DISPLAY_NAME_TOO_LONG', message: 'Display name must be 50 characters or less' },
          });
          return;
        }

        const room = getRoom(token as Room['token']);
        if (!room) {
          callback({
            success: false,
            error: { code: 'ROOM_NOT_FOUND', message: 'Room does not exist' },
          });
          return;
        }

        joinRoom(token as Room['token'], socket.id, displayName.trim());
        socket.join(token);

        // Notify existing peers about new peer
        const peers = getPeersInRoom(token as Room['token']);
        const otherPeers = peers.filter(p => p.id !== socket.id);

        if (otherPeers.length > 0) {
          socket.emit('peer-list', otherPeers.map(p => ({ id: p.id, displayName: p.displayName })));
        }

        socket.to(token).emit('peer-joined', {
          peerId: socket.id,
          displayName: displayName.trim(),
        });

        callback({
          success: true,
          data: { token, peers: otherPeers.map(p => ({ id: p.id, displayName: p.displayName })) },
        });

        // eslint-disable-next-line no-console
        console.log(`Peer ${socket.id} joined room ${token}`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error joining room:', error);
        callback({
          success: false,
          error: { code: 'ROOM_JOIN_FAILED', message: 'Failed to join room' },
        });
      }
    });

    // Handle leaving room
    socket.on('room:leave', (data: { token: string }, callback) => {
      try {
        const { token } = data;

        if (!token || !isRoomToken(token)) {
          callback?.({
            success: false,
            error: { code: 'INVALID_TOKEN', message: 'Invalid room token' },
          });
          return;
        }

        const room = getRoom(token as Room['token']);
        if (room) {
          leaveRoom(token as Room['token'], socket.id);
          socket.to(token).emit('peer-left', { peerId: socket.id });
          // eslint-disable-next-line no-console
          console.log(`Peer ${socket.id} left room ${token}`);
        }

        socket.leave(token);
        callback?.({ success: true });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error leaving room:', error);
        callback?.({
          success: false,
          error: { code: 'ROOM_LEAVE_FAILED', message: 'Failed to leave room' },
        });
      }
    });

    // Handle WebRTC signaling - SDP offer
    socket.on('sdp:offer', (data: { targetPeerId: string; sdp: object }) => {
      const { targetPeerId, sdp } = data;
      socket.to(targetPeerId).emit('sdp:offer', {
        peerId: socket.id,
        sdp,
      });
    });

    // Handle WebRTC signaling - SDP answer
    socket.on('sdp:answer', (data: { targetPeerId: string; sdp: object }) => {
      const { targetPeerId, sdp } = data;
      socket.to(targetPeerId).emit('sdp:answer', {
        peerId: socket.id,
        sdp,
      });
    });

    // Handle WebRTC signaling - ICE candidate
    socket.on('ice-candidate', (data: { targetPeerId: string; candidate: object }) => {
      const { targetPeerId, candidate } = data;
      socket.to(targetPeerId).emit('ice-candidate', {
        peerId: socket.id,
        candidate,
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log(`Client disconnected: ${socket.id}`);

      // Find and clean up any rooms this socket was in
      const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);

      for (const token of rooms) {
        if (isRoomToken(token)) {
          const room = getRoom(token as Room['token']);
          if (room && room.peers.has(socket.id)) {
            leaveRoom(token as Room['token'], socket.id);
            socket.to(token).emit('peer-left', { peerId: socket.id });
            // eslint-disable-next-line no-console
            console.log(`Peer ${socket.id} removed from room ${token} (disconnect)`);
          }
        }
      }
    });
  });
}
