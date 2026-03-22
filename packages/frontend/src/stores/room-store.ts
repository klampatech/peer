import { create } from 'zustand';
import { signallingClient } from '../lib/signalling';
import { peerManager } from '../lib/webrtc/peer-manager';

// Wrapper to ensure any async operation completes within a timeout
// Returns the result if it completes in time, otherwise returns undefined
async function withGlobalTimeout<T>(operation: () => Promise<T>, ms: number): Promise<T | undefined> {
  try {
    return await withTimeout(operation(), ms, 'Operation timed out');
  } catch {
    return undefined;
  }
}

export interface Peer {
  id: string;
  displayName: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

interface RoomState {
  // Connection state
  isConnected: boolean;
  roomToken: string | null;
  peerId: string | null;

  // Local media
  localStream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;

  // Remote peers
  peers: Peer[];

  // Chat
  messages: Array<{
    id: string;
    peerId: string;
    displayName: string;
    message: string;
    timestamp: Date;
  }>;

  // Actions
  setConnected: (connected: boolean) => void;
  setRoomToken: (token: string | null) => void;
  setPeerId: (id: string | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setVideoEnabled: (enabled: boolean) => void;
  setScreenSharing: (sharing: boolean) => void;
  addPeer: (peer: Peer) => void;
  removePeer: (peerId: string) => void;
  updatePeer: (peerId: string, updates: Partial<Peer>) => void;
  addMessage: (message: RoomState['messages'][0]) => void;
  clearMessages: () => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  roomToken: null,
  peerId: null,
  localStream: null,
  audioEnabled: true,
  videoEnabled: true,
  screenSharing: false,
  peers: [],
  messages: [],
};

export const useRoomStore = create<RoomState>((set) => ({
  ...initialState,

  setConnected: (connected) => set({ isConnected: connected }),
  setRoomToken: (token) => set({ roomToken: token }),
  setPeerId: (id) => set({ peerId: id }),
  setLocalStream: (stream) => set({ localStream: stream }),

  setAudioEnabled: (enabled) => {
    set({ audioEnabled: enabled });
    // Also update the local stream
    const state = useRoomStore.getState();
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  },

  setVideoEnabled: (enabled) => {
    set({ videoEnabled: enabled });
    // Also update the local stream
    const state = useRoomStore.getState();
    if (state.localStream) {
      state.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  },

  setScreenSharing: (sharing) => set({ screenSharing: sharing }),

  addPeer: (peer) =>
    set((state) => ({
      peers: [...state.peers, peer],
    })),

  removePeer: (peerId) =>
    set((state) => ({
      peers: state.peers.filter((p) => p.id !== peerId),
    })),

  updatePeer: (peerId, updates) =>
    set((state) => ({
      peers: state.peers.map((p) =>
        p.id === peerId ? { ...p, ...updates } : p
      ),
    })),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  clearMessages: () => set({ messages: [] }),

  reset: () => {
    // Clean up local stream
    const state = useRoomStore.getState();
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => track.stop());
    }
    set(initialState);
  },
}));

// Helper to add timeout to a promise
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), ms)
    ),
  ]);
}

// Initialize local media stream
export async function initializeMedia(
  audio: boolean = true,
  video: boolean = true
): Promise<MediaStream> {
  const stream = await withTimeout(
    navigator.mediaDevices.getUserMedia({ audio, video }),
    5000, // 5 second timeout for media initialization
    'Media initialization timed out'
  );
  useRoomStore.getState().setLocalStream(stream);
  return stream;
}

// Clean up media streams
export function cleanupMedia(): void {
  const state = useRoomStore.getState();
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => track.stop());
    useRoomStore.getState().setLocalStream(null);
  }
}

// Connect to room via signalling server
export async function connect(token: string, displayName: string): Promise<void> {
  // Wrap entire connection process in a global timeout to prevent hanging
  // This ensures the UI always becomes responsive even if media/signalling fails
  await withGlobalTimeout(async () => {
    // Initialize media if available (non-fatal if it fails)
    let stream: MediaStream | null = null;
    try {
      stream = await initializeMedia(true, true);
    } catch (err) {
      console.warn('Failed to initialize media, continuing without local stream:', err);
      // Continue without local stream - user can still join and see others
    }

    useRoomStore.getState().setRoomToken(token);

    // Connect to signalling server (non-fatal if it fails)
    try {
      await signallingClient.connect(token, displayName);
    } catch (err) {
      console.warn('Failed to connect to signalling server, continuing anyway:', err);
      // Continue without signalling - still show the room UI
    }

    // Request TURN credentials for NAT traversal (non-fatal)
    try {
      signallingClient.requestTurnCredentials();
    } catch (err) {
      console.warn('Failed to request TURN credentials:', err);
    }

    // Initialize peer manager with local stream (may be null)
    peerManager.initialize(stream);

    // Connect to any existing peers in the room (non-fatal)
    try {
      const { peers } = useRoomStore.getState();
      for (const peer of peers) {
        await peerManager.connectToPeer(peer.id);
      }
    } catch (err) {
      console.warn('Failed to connect to existing peers:', err);
    }
  }, 8000); // 8 second global timeout for entire connection process

  // Always mark as connected - even if the process timed out
  // This ensures the UI becomes responsive
  useRoomStore.getState().setConnected(true);
}

// Disconnect from room
export function disconnect(): void {
  // Clean up peer connections
  peerManager.cleanup();

  // Disconnect from signalling
  signallingClient.disconnect();

  // Clean up media
  cleanupMedia();

  useRoomStore.getState().reset();
}
