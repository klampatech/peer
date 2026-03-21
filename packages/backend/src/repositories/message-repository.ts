/**
 * Message Repository - Data access layer for chat messages
 */

import { getDatabase } from '../db/index';
import { v4 as uuidv4 } from 'uuid';
import type { RoomToken, ChatMessageResponsePayload } from '@peer/shared';

export interface StoredMessage {
  id: string;
  roomToken: string;
  peerId: string;
  displayName: string;
  message: string;
  timestamp: number;
  deleted: boolean;
}

export interface CreateMessageParams {
  roomToken: RoomToken;
  peerId: string;
  displayName: string;
  message: string;
}

/**
 * Create a new chat message
 */
export function createMessage(params: CreateMessageParams): ChatMessageResponsePayload {
  const db = getDatabase();
  const id = uuidv4();
  const timestamp = Date.now();

  // Validate message length
  if (params.message.length > 2000) {
    throw new Error('Message exceeds maximum length of 2000 characters');
  }

  // Sanitize HTML to prevent XSS
  const sanitizedMessage = sanitizeHtml(params.message);

  db.run(
    `INSERT INTO messages (id, room_token, peer_id, display_name, message, timestamp, deleted)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [id, params.roomToken, params.peerId, params.displayName, sanitizedMessage, timestamp]
  );

  return {
    id,
    peerId: params.peerId,
    displayName: params.displayName,
    message: sanitizedMessage,
    timestamp: new Date(timestamp).toISOString(),
  };
}

/**
 * Get messages for a room
 */
export function getMessagesByRoom(roomToken: RoomToken, limit: number = 100): ChatMessageResponsePayload[] {
  const db = getDatabase();

  const results = db.exec(
    `SELECT id, peer_id, display_name, message, timestamp
     FROM messages
     WHERE room_token = ? AND deleted = 0
     ORDER BY timestamp ASC
     LIMIT ?`,
    [roomToken, limit]
  );

  if (results.length === 0) {
    return [];
  }

  const firstResult = results[0];
  if (!firstResult || firstResult.values.length === 0) {
    return [];
  }

  return firstResult.values.map((row: unknown[]) => ({
    id: row[0] as string,
    peerId: row[1] as string,
    displayName: row[2] as string,
    message: row[3] as string,
    timestamp: new Date(row[4] as number).toISOString(),
  }));
}

/**
 * Soft delete messages in a room (when room is destroyed)
 */
export function softDeleteRoomMessages(roomToken: RoomToken): void {
  try {
    const db = getDatabase();
    db.run(`UPDATE messages SET deleted = 1 WHERE room_token = ?`, [roomToken]);
  } catch {
    // Database not initialized - ignore in tests/development
  }
}

/**
 * Hard delete old messages (for cleanup job)
 */
export function deleteOldMessages(olderThanHours: number = 24): number {
  try {
    const db = getDatabase();
    const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;

    db.exec(
      `DELETE FROM messages WHERE deleted = 1 AND timestamp < ?`,
      [cutoffTime]
    );

    // sql.js doesn't return affected rows directly, so we return 0 as estimate
    // In production, you'd want to track this differently
    return 0;
  } catch {
    // Database not initialized - ignore in tests/development
    return 0;
  }
}

/**
 * Sanitize HTML to prevent XSS attacks
 */
function sanitizeHtml(input: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return input.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Validate message content
 */
export function validateMessage(message: string): { valid: boolean; error?: string } {
  if (!message || message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (message.length > 2000) {
    return { valid: false, error: 'Message exceeds maximum length of 2000 characters' };
  }

  return { valid: true };
}
