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
  credential: string;
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
