import type { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  createRoom,
  getRoom,
  getAllRooms,
  joinRoom,
  leaveRoom,
  getPeersInRoom,
  getRoomCount,
  type Room,
} from '../rooms.js';
import { logger } from '../utils/logger.js';
import { updateActiveRooms, updateConnectedPeers, incrementSocketConnections, incrementSocketDisconnections } from '../routes/metrics.js';
import {
  RoomCreateSchema,
  RoomJoinSchema,
  RoomLeaveSchema,
  SdpOfferSchema,
  SdpAnswerSchema,
  IceCandidateSchema,
  validatePayload,
  validateSdpNoPrivateIPs,
  isRoomToken,
  type RoomCreateInput,
  type RoomJoinInput,
  type RoomLeaveInput,
  type SdpOfferInput,
  type SdpAnswerInput,
  type IceCandidateInput,
} from '@peer/shared';

/**
 * Sets up room-related Socket.IO event handlers
 */
export function setupRoomEvents(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // Generate traceId for this connection and store in socket data
    const traceId = uuidv4();
    socket.data.traceId = traceId;

    logger.info({ socketId: socket.id, traceId }, 'Client connected');

    // Update metrics
    incrementSocketConnections();
    updateActiveRooms(getRoomCount());
    updateConnectedPeers(io.sockets.sockets.size);

    // Handle room creation
    socket.on('room:create', (data: unknown, callback) => {
      try {
        const validation = validatePayload<RoomCreateInput>(RoomCreateSchema, data);

        if (!validation.success) {
          callback({
            success: false,
            error: { code: validation.error!.code, message: validation.error!.message },
          });
          return;
        }

        const { displayName } = validation.data!;

        // Additional check for whitespace-only (Zod's min(1) allows whitespace)
        if (!displayName || displayName.trim().length === 0) {
          callback({
            success: false,
            error: { code: 'INVALID_DISPLAY_NAME', message: 'Display name is required' },
          });
          return;
        }

        const room = createRoom();
        joinRoom(room.token, socket.id, displayName.trim());
        socket.join(room.token);
        socket.data.peerId = socket.id;
        socket.data.displayName = displayName.trim();

        callback({
          success: true,
          data: { token: room.token },
        });

        logger.info({ traceId: socket.data.traceId, roomToken: room.token, socketId: socket.id }, 'Room created');
      } catch (error) {
        logger.error({ traceId: socket.data.traceId, err: error, socketId: socket.id }, 'Error creating room');
        callback({
          success: false,
          error: { code: 'ROOM_CREATE_FAILED', message: 'Failed to create room' },
        });
      }
    });

    // Handle room joining
    socket.on('room:join', (data: unknown, callback) => {
      try {
        const validation = validatePayload<RoomJoinInput>(RoomJoinSchema, data);

        if (!validation.success) {
          callback({
            success: false,
            error: { code: validation.error!.code, message: validation.error!.message },
          });
          return;
        }

        const { token, displayName } = validation.data!;

        // Additional check for whitespace-only (Zod's min(1) allows whitespace)
        if (!displayName || displayName.trim().length === 0) {
          callback({
            success: false,
            error: { code: 'INVALID_DISPLAY_NAME', message: 'Display name is required' },
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
        socket.data.peerId = socket.id;
        socket.data.displayName = displayName.trim();

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

        logger.info({ traceId: socket.data.traceId, peerId: socket.id, roomToken: token }, 'Peer joined room');
      } catch (error) {
        logger.error({ traceId: socket.data.traceId, err: error }, 'Error joining room');
        callback({
          success: false,
          error: { code: 'ROOM_JOIN_FAILED', message: 'Failed to join room' },
        });
      }
    });

    // Handle leaving room
    socket.on('room:leave', (data: unknown, callback) => {
      try {
        const validation = validatePayload<RoomLeaveInput>(RoomLeaveSchema, data);

        if (!validation.success) {
          callback?.({
            success: false,
            error: { code: validation.error!.code, message: validation.error!.message },
          });
          return;
        }

        const { token } = validation.data!;

        const room = getRoom(token as Room['token']);
        if (room) {
          leaveRoom(token as Room['token'], socket.id);
          socket.to(token).emit('peer-left', { peerId: socket.id });
          logger.info({ traceId: socket.data.traceId, peerId: socket.id, roomToken: token }, 'Peer left room');
        }

        socket.leave(token);
        callback?.({ success: true });
      } catch (error) {
        logger.error({ traceId: socket.data.traceId, err: error }, 'Error leaving room');
        callback?.({
          success: false,
          error: { code: 'ROOM_LEAVE_FAILED', message: 'Failed to leave room' },
        });
      }
    });

    // Handle WebRTC signaling - SDP offer
    socket.on('sdp:offer', (data: unknown) => {
      const validation = validatePayload<SdpOfferInput>(SdpOfferSchema, data);
      if (!validation.success) {
        logger.warn({ traceId: socket.data.traceId, error: validation.error }, 'Invalid SDP offer');
        return;
      }

      const { targetPeerId, sdp } = validation.data!;

      // Validate SDP doesn't contain private IP addresses
      const ipValidation = validateSdpNoPrivateIPs(sdp.sdp);
      if (!ipValidation.success) {
        logger.warn({ traceId: socket.data.traceId, error: ipValidation.error }, 'SDP contains private IP');
        return;
      }

      // Authorization: verify sender is in a room and target is in same room
      if (!socket.data.peerId) {
        logger.warn({ traceId: socket.data.traceId, targetPeerId }, 'Unauthorized SDP offer - sender not in a room');
        return;
      }

      // Find the room token from sender's rooms
      const roomToken = Array.from(socket.rooms).find(room => isRoomToken(room));
      if (!roomToken) {
        logger.warn({ traceId: socket.data.traceId, targetPeerId }, 'Unauthorized SDP offer - sender not in any room');
        return;
      }

      // Verify target peer is in the same room
      const room = getRoom(roomToken);
      if (!room || !room.peers.has(targetPeerId)) {
        logger.warn({ traceId: socket.data.traceId, targetPeerId }, 'Unauthorized SDP offer - peers not in same room');
        return;
      }

      socket.to(targetPeerId).emit('sdp:offer', {
        peerId: socket.id,
        sdp,
      });
    });

    // Handle WebRTC signaling - SDP answer
    socket.on('sdp:answer', (data: unknown) => {
      const validation = validatePayload<SdpAnswerInput>(SdpAnswerSchema, data);
      if (!validation.success) {
        logger.warn({ traceId: socket.data.traceId, error: validation.error }, 'Invalid SDP answer');
        return;
      }

      const { targetPeerId, sdp } = validation.data!;

      // Validate SDP doesn't contain private IP addresses
      const ipValidation = validateSdpNoPrivateIPs(sdp.sdp);
      if (!ipValidation.success) {
        logger.warn({ traceId: socket.data.traceId, error: ipValidation.error }, 'SDP contains private IP');
        return;
      }

      // Authorization: verify sender is in a room and target is in same room
      if (!socket.data.peerId) {
        logger.warn({ traceId: socket.data.traceId, targetPeerId }, 'Unauthorized SDP answer - sender not in a room');
        return;
      }

      // Find the room token from sender's rooms
      const roomToken = Array.from(socket.rooms).find(room => isRoomToken(room));
      if (!roomToken) {
        logger.warn({ traceId: socket.data.traceId, targetPeerId }, 'Unauthorized SDP answer - sender not in any room');
        return;
      }

      // Verify target peer is in the same room
      const room = getRoom(roomToken);
      if (!room || !room.peers.has(targetPeerId)) {
        logger.warn({ traceId: socket.data.traceId, targetPeerId }, 'Unauthorized SDP answer - peers not in same room');
        return;
      }

      socket.to(targetPeerId).emit('sdp:answer', {
        peerId: socket.id,
        sdp,
      });
    });

    // Handle WebRTC signaling - ICE candidate
    socket.on('ice-candidate', (data: unknown) => {
      const validation = validatePayload<IceCandidateInput>(IceCandidateSchema, data);
      if (!validation.success) {
        logger.warn({ traceId: socket.data.traceId, error: validation.error }, 'Invalid ICE candidate');
        return;
      }

      const { targetPeerId, candidate } = validation.data!;

      // Authorization: verify sender is in a room and target is in same room
      if (!socket.data.peerId) {
        logger.warn({ traceId: socket.data.traceId, targetPeerId }, 'Unauthorized ICE candidate - sender not in a room');
        return;
      }

      // Find the room token from sender's rooms
      const roomToken = Array.from(socket.rooms).find(room => isRoomToken(room));
      if (!roomToken) {
        logger.warn({ traceId: socket.data.traceId, targetPeerId }, 'Unauthorized ICE candidate - sender not in any room');
        return;
      }

      // Verify target peer is in the same room
      const room = getRoom(roomToken);
      if (!room || !room.peers.has(targetPeerId)) {
        logger.warn({ traceId: socket.data.traceId, targetPeerId }, 'Unauthorized ICE candidate - peers not in same room');
        return;
      }

      socket.to(targetPeerId).emit('ice-candidate', {
        peerId: socket.id,
        candidate,
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info({ traceId: socket.data?.traceId, socketId: socket.id }, 'Client disconnected');

      // Update metrics
      incrementSocketDisconnections();
      updateConnectedPeers(io.sockets.sockets.size);

      // IMPORTANT: At disconnect time, Socket.IO has already removed the socket from all rooms.
      // We need to search our room state to find where this peer was.
      // This is more reliable than relying on socket.rooms which is empty at this point.
      const allRooms = getAllRooms();
      for (const [token, room] of allRooms) {
        if (room.peers.has(socket.id)) {
          logger.info({ traceId: socket.data?.traceId, peerId: socket.id, roomToken: token, peersBefore: room.peers.size }, 'Removing peer from room (disconnect)');
          leaveRoom(token, socket.id);
          socket.to(token).emit('peer-left', { peerId: socket.id });
          logger.info({ traceId: socket.data?.traceId, peerId: socket.id, roomToken: token }, 'Peer removed from room (disconnect)');
        }
      }
    });
  });
}
