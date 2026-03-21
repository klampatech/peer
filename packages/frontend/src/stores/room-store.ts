import { create } from 'zustand';
import { signallingClient } from '../lib/signalling';
import { peerManager } from '../lib/webrtc/peer-manager';

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

// Initialize local media stream
export async function initializeMedia(
  audio: boolean = true,
  video: boolean = true
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio,
    video,
  });
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
  // Initialize media first
  const stream = await initializeMedia(true, true);
  useRoomStore.getState().setRoomToken(token);

  // Connect to signalling server
  await signallingClient.connect(token, displayName);

  // Initialize peer manager with local stream
  peerManager.initialize(stream);

  // Connect to any existing peers in the room
  const { peers } = useRoomStore.getState();
  for (const peer of peers) {
    await peerManager.connectToPeer(peer.id);
  }

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
