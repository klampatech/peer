/**
 * Shared TypeScript types for Peer P2P VoIP Application
 */

// ==================
// Room Types
// ==================

/** UUID v4 room token format */
export type RoomToken = string & { readonly __brand: 'RoomToken' };

/**
 * Creates a typed room token from a string
 * @param token - A valid UUID v4 string
 * @returns Typed RoomToken
 */
export function createRoomToken(token: string): RoomToken {
  return token as RoomToken;
}

/** Room peer information */
export interface RoomPeer {
  id: string;
  displayName: string;
  joinedAt: Date;
}

/** Room state */
export interface Room {
  token: RoomToken;
  peers: Map<string, RoomPeer>;
  createdAt: Date;
}

// ==================
// Socket.IO Event Types
// ==================

// Client → Server Events
export interface RoomCreatePayload {
  displayName: string;
}

export interface RoomJoinPayload {
  token: RoomToken;
  displayName: string;
}

export interface ChatMessagePayload {
  roomToken: RoomToken;
  message: string;
}

export interface TurnRequestPayload {
  roomToken: RoomToken;
}

// Server → Client Events
export interface RoomCreatedPayload {
  token: RoomToken;
}

export interface PeerJoinedPayload {
  peerId: string;
  displayName: string;
}

export interface PeerLeftPayload {
  peerId: string;
}

export interface ChatMessageResponsePayload {
  id: string;
  peerId: string;
  displayName: string;
  message: string;
  timestamp: string;
}

export interface TurnCredentialsPayload {
  urls: string[];
  username: string;
  password: string;
}

// WebRTC Signaling Events - using generic types for cross-platform compatibility
export interface SdpOfferPayload {
  targetPeerId: string;
  sdp: {
    type: 'offer';
    sdp: string;
  };
}

export interface SdpAnswerPayload {
  targetPeerId: string;
  sdp: {
    type: 'answer';
    sdp: string;
  };
}

export interface IceCandidatePayload {
  targetPeerId: string;
  candidate: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
  };
}

// ==================
// API Response Types
// ==================

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Standardized Socket.IO response format for all event handlers
 * Used by frontend to parse responses consistently
 */
export interface SocketResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  version: string;
}

// ==================
// Media Types
// ==================

export interface LocalMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
}

// Note: RemotePeer with MediaStream is defined in frontend-specific types
// to avoid DOM type dependencies in shared package

export interface RemotePeerState {
  id: string;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

// ==================
// Configuration Types
// ==================

export interface AppConfig {
  server: {
    port: number;
    host: string;
  };
  turn: {
    secret: string;
    port: number;
    realm: string;
  };
  cors: {
    origin: string | string[];
  };
}

// ==================
// Utility Types
// ==================

/** Type guard for RoomToken */
export function isRoomToken(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

// ==================
// Zod Validation Schemas
// ==================

import { z } from 'zod';

/**
 * Display name validation pattern: alphanumeric + common punctuation, max 50 chars
 * Allows: letters (any language), numbers, spaces, hyphens, underscores, periods, apostrophes, commas
 */
const displayNamePattern = /^[\p{L}\p{N} \-_.',]{1,50}$/u;

/**
 * Schema for room:create event payload
 */
export const RoomCreateSchema = z.object({
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be 50 characters or less')
    .regex(displayNamePattern, 'Display name contains invalid characters'),
});

export type RoomCreateInput = z.infer<typeof RoomCreateSchema>;

/**
 * Schema for room:join event payload
 */
export const RoomJoinSchema = z.object({
  token: z.string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Invalid room token format'
    ),
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be 50 characters or less')
    .regex(displayNamePattern, 'Display name contains invalid characters'),
});

export type RoomJoinInput = z.infer<typeof RoomJoinSchema>;

/**
 * Schema for room:leave event payload
 */
export const RoomLeaveSchema = z.object({
  token: z.string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Invalid room token format'
    ),
});

export type RoomLeaveInput = z.infer<typeof RoomLeaveSchema>;

/**
 * Schema for chat:message event payload
 */
export const ChatMessageSchema = z.object({
  roomToken: z.string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Invalid room token format'
    ),
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message must be 2000 characters or less'),
});

export type ChatMessageInput = z.infer<typeof ChatMessageSchema>;

/**
 * Schema for chat:history event payload
 */
export const ChatHistorySchema = z.object({
  roomToken: z.string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Invalid room token format'
    ),
});

export type ChatHistoryInput = z.infer<typeof ChatHistorySchema>;

/**
 * Schema for turn:request event payload (optional, can be empty)
 */
export const TurnRequestSchema = z.object({
  roomToken: z.string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Invalid room token format'
    ),
}).optional();

export type TurnRequestInput = z.infer<typeof TurnRequestSchema>;

/**
 * Schema for sdp:offer event payload
 */
export const SdpOfferSchema = z.object({
  targetPeerId: z.string().min(1, 'Target peer ID is required'),
  sdp: z.object({
    type: z.literal('offer'),
    sdp: z.string().min(1, 'SDP content is required').max(10240, 'SDP exceeds 10KB limit'),
  }),
});

export type SdpOfferInput = z.infer<typeof SdpOfferSchema>;

/**
 * Schema for sdp:answer event payload
 */
export const SdpAnswerSchema = z.object({
  targetPeerId: z.string().min(1, 'Target peer ID is required'),
  sdp: z.object({
    type: z.literal('answer'),
    sdp: z.string().min(1, 'SDP content is required').max(10240, 'SDP exceeds 10KB limit'),
  }),
});

export type SdpAnswerInput = z.infer<typeof SdpAnswerSchema>;

/**
 * Schema for ice-candidate event payload
 */
export const IceCandidateSchema = z.object({
  targetPeerId: z.string().min(1, 'Target peer ID is required'),
  candidate: z.object({
    candidate: z.string().min(1, 'ICE candidate is required'),
    sdpMid: z.string().nullable(),
    sdpMLineIndex: z.number().nullable(),
  }),
});

export type IceCandidateInput = z.infer<typeof IceCandidateSchema>;

/**
 * Result type for validation operations
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Derives a specific error code from Zod validation errors
 */
function deriveErrorCode(errors: z.ZodError['errors']): { code: string; message: string } {
  // Find the first error with a specific code we care about
  for (const error of errors) {
    const path = error.path.join('.');
    const message = error.message;

    // Display name errors
    if (path === 'displayName') {
      // Zod returns "too_small" when string is too short
      if (error.code === 'too_small') {
        return { code: 'INVALID_DISPLAY_NAME', message: 'Display name is required' };
      }
      // Zod returns "too_big" when string exceeds max length
      if (error.code === 'too_big') {
        return { code: 'DISPLAY_NAME_TOO_LONG', message: 'Display name must be 50 characters or less' };
      }
    }

    // Token errors (room:join, room:leave)
    if ((path === 'token' || path === 'roomToken') && error.code === 'invalid_string') {
      return { code: 'INVALID_TOKEN', message: 'Invalid room token' };
    }

    // Message errors
    if (path === 'message') {
      if (error.code === 'too_small') {
        return { code: 'INVALID_MESSAGE', message: 'Message cannot be empty' };
      }
      if (error.code === 'too_big') {
        return { code: 'MESSAGE_TOO_LONG', message: 'Message must be 2000 characters or less' };
      }
    }

    // WebRTC signaling errors
    if (path.startsWith('targetPeerId') || path.startsWith('sdp') || path.startsWith('candidate')) {
      if (error.code === 'too_small' || error.code === 'invalid_type') {
        return { code: 'INVALID_PAYLOAD', message: message };
      }
    }
  }

  // Fallback: use first error
  const firstError = errors[0];
  if (!firstError) {
    return { code: 'VALIDATION_ERROR', message: 'Invalid payload' };
  }

  return {
    code: 'VALIDATION_ERROR',
    message: `${firstError.path.join('.')}: ${firstError.message}`,
  };
}

/**
 * Validates data against a Zod schema and returns a standardized result
 */
export function validatePayload<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const { code, message } = deriveErrorCode(result.error.errors);

  return {
    success: false,
    error: { code, message },
  };
}

// Private IP patterns to reject in SDP/ICE candidates (per spec Section 8.5)
const PRIVATE_IP_PATTERNS = [
  // 10.x.x.x
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  // 172.16.x.x - 172.31.x.x
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  // 192.168.x.x
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  // 127.x.x.x (localhost)
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
];

/**
 * Validates that SDP content doesn't contain private IP addresses
 * in ICE candidates. Returns error if private IPs are found.
 */
export function validateSdpNoPrivateIPs(sdp: string): ValidationResult<true> {
  // Check for private IP addresses in candidate lines
  const lines = sdp.split('\n');
  for (const line of lines) {
    if (line.startsWith('a=candidate:') || line.startsWith('candidate:')) {
      // Extract IP from candidate line (format: candidate:...IP...)
      const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (ipMatch && ipMatch[1]) {
        const ip = ipMatch[1];
        for (const pattern of PRIVATE_IP_PATTERNS) {
          if (pattern.test(ip)) {
            return {
              success: false,
              error: { code: 'SDP_CONTAINS_PRIVATE_IP', message: `SDP contains private IP address: ${ip}` },
            };
          }
        }
      }
    }
  }

  return { success: true, data: true };
}
