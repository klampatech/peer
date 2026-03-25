import { v4 as uuidv4 } from 'uuid';
import type { RoomToken } from '../../shared/src/index.js';
import { softDeleteRoomMessages } from './repositories/message-repository.js';

export interface Peer {
  id: string;
  displayName: string;
  joinedAt: Date;
}

export interface Room {
  token: RoomToken;
  peers: Map<string, Peer>;
  createdAt: Date;
}

// In-memory room storage
const rooms = new Map<RoomToken, Room>();

/**
 * Creates a new room with a unique UUID v4 token
 * @returns The created room
 */
export function createRoom(): Room {
  const token = uuidv4() as RoomToken;
  const room: Room = {
    token,
    peers: new Map(),
    createdAt: new Date(),
  };

  rooms.set(token, room);
  return room;
}

/**
 * Gets a room by its token
 * @param token - The room token
 * @returns The room if found, undefined otherwise
 */
export function getRoom(token: RoomToken): Room | undefined {
  return rooms.get(token);
}

/**
 * Gets all rooms
 * @returns Map of all rooms
 */
export function getAllRooms(): Map<RoomToken, Room> {
  return rooms;
}

/**
 * Adds a peer to a room
 * @param token - The room token
 * @param peerId - The peer ID
 * @param displayName - The peer's display name
 * @returns The updated room, or undefined if room doesn't exist
 */
export function joinRoom(token: RoomToken, peerId: string, displayName: string): Room | undefined {
  const room = rooms.get(token);
  if (!room) {
    return undefined;
  }

  const peer: Peer = {
    id: peerId,
    displayName,
    joinedAt: new Date(),
  };

  room.peers.set(peerId, peer);
  return room;
}

/**
 * Removes a peer from a room without destroying the room.
 * The room persists even when empty to allow peers to rejoin.
 * Use deleteRoom() explicitly when the room should be destroyed.
 * @param token - The room token
 * @param peerId - The peer ID
 * @returns The updated room, or undefined if room doesn't exist
 */
export function leaveRoom(token: RoomToken, peerId: string): Room | undefined {
  const room = rooms.get(token);
  if (!room) {
    return undefined;
  }

  room.peers.delete(peerId);
  return room;
}

/**
 * Removes a peer from a room and destroys the room if no peers are left.
 * This should only be called when a peer actually disconnects, not for intentional leaves.
 * @param token - The room token
 * @param peerId - The peer ID
 * @returns The updated room, or undefined if room was destroyed
 */
export function leaveRoomAndDestroyIfEmpty(token: RoomToken, peerId: string): Room | undefined {
  const room = rooms.get(token);
  if (!room) {
    return undefined;
  }

  room.peers.delete(peerId);

  if (room.peers.size === 0) {
    softDeleteRoomMessages(token);
    rooms.delete(token);
    return undefined;
  }

  return room;
}

/**
 * Deletes a room
 * @param token - The room token
 */
export function deleteRoom(token: RoomToken): void {
  rooms.delete(token);
}

/**
 * Gets all peers in a room
 * @param token - The room token
 * @returns Array of peers in the room
 */
export function getPeersInRoom(token: RoomToken): Peer[] {
  const room = rooms.get(token);
  if (!room) {
    return [];
  }
  return Array.from(room.peers.values());
}

/**
 * Gets a specific peer in a room
 * @param token - The room token
 * @param peerId - The peer ID
 * @returns The peer if found
 */
export function getPeer(token: RoomToken, peerId: string): Peer | undefined {
  const room = rooms.get(token);
  return room?.peers.get(peerId);
}

/**
 * Checks if a room exists
 * @param token - The room token
 * @returns True if room exists
 */
export function roomExists(token: RoomToken): boolean {
  return rooms.has(token);
}

/**
 * Checks if a peer is in a room
 * @param token - The room token
 * @param peerId - The peer ID (socket.id)
 * @returns True if peer is in the room
 */
export function isPeerInRoom(token: RoomToken, peerId: string | undefined): boolean {
  if (!peerId) return false;
  const room = rooms.get(token);
  if (!room) {
    return false;
  }
  return room.peers.has(peerId);
}

/**
 * Gets the number of active rooms
 * @returns Number of rooms
 */
export function getRoomCount(): number {
  return rooms.size;
}
