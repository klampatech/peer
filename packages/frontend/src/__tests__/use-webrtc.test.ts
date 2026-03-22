import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWebRTC } from '../hooks/use-webrtc';

// Create mock stream factory
const createMockStream = () => ({
  getVideoTracks: () => [{ enabled: true, kind: 'video' }],
  getAudioTracks: () => [{ enabled: true, kind: 'audio' }],
  getTracks: () => [],
});

// Mutable store state
let storeState = {
  localStream: null as ReturnType<typeof createMockStream> | null,
  audioEnabled: true,
  videoEnabled: true,
  screenSharing: false,
  peers: [] as Array<{ id: string; displayName: string }>,
  isConnected: false,
  setLocalStream: vi.fn(),
  setAudioEnabled: vi.fn(),
  setVideoEnabled: vi.fn(),
  setScreenSharing: vi.fn(),
};

vi.mock('../stores/room-store', () => ({
  useRoomStore: vi.fn(() => storeState),
}));

vi.mock('../lib/webrtc/peer-manager', () => ({
  peerManager: {
    initialize: vi.fn(),
    cleanup: vi.fn(),
    connectToPeer: vi.fn().mockResolvedValue(undefined),
    disconnectFromPeer: vi.fn(),
    replaceVideoTrack: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../lib/webrtc/media', () => ({
  getUserMedia: vi.fn().mockResolvedValue({
    getVideoTracks: () => [{ enabled: true, kind: 'video' }],
    getAudioTracks: () => [{ enabled: true, kind: 'audio' }],
    getTracks: () => [],
  }),
  getDisplayMedia: vi.fn().mockResolvedValue({
    getVideoTracks: () => [{ onended: null, kind: 'video' }],
    getAudioTracks: () => [],
    getTracks: () => [],
  }),
  toggleAudio: vi.fn(),
  toggleVideo: vi.fn(),
}));

import { useRoomStore } from '../stores/room-store';
import { peerManager } from '../lib/webrtc/peer-manager';
import { getUserMedia, toggleAudio, toggleVideo } from '../lib/webrtc/media';

describe('useWebRTC', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store state
    storeState = {
      localStream: null,
      audioEnabled: true,
      videoEnabled: true,
      screenSharing: false,
      peers: [],
      isConnected: false,
      setLocalStream: vi.fn(),
      setAudioEnabled: vi.fn(),
      setVideoEnabled: vi.fn(),
      setScreenSharing: vi.fn(),
    };

    vi.mocked(useRoomStore).mockImplementation(() => storeState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial state', () => {
    it('should return null stream and not ready media initially', () => {
      const { result } = renderHook(() => useWebRTC());
      expect(result.current.localStream).toBeNull();
      expect(result.current.isMediaReady).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return all control functions', () => {
      const { result } = renderHook(() => useWebRTC());
      expect(typeof result.current.toggleMute).toBe('function');
      expect(typeof result.current.toggleCamera).toBe('function');
      expect(typeof result.current.startScreenShare).toBe('function');
      expect(typeof result.current.stopScreenShare).toBe('function');
      expect(typeof result.current.reconnectPeer).toBe('function');
    });
  });

  describe('autoRequestMedia', () => {
    it('should not request media when autoRequestMedia is false (default)', () => {
      renderHook(() => useWebRTC());
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('should request media when autoRequestMedia is true', async () => {
      renderHook(() => useWebRTC({ autoRequestMedia: true }));
      await waitFor(() => {
        expect(getUserMedia).toHaveBeenCalled();
      });
    });
  });

  describe('Peer manager initialization', () => {
    it('should initialize peer manager when connected and stream is available', () => {
      const mockStream = createMockStream();
      storeState.isConnected = true;
      storeState.localStream = mockStream;

      renderHook(() => useWebRTC());
      expect(peerManager.initialize).toHaveBeenCalled();
    });

    it('should not initialize peer manager when not connected', () => {
      storeState.isConnected = false;

      renderHook(() => useWebRTC());
      expect(peerManager.initialize).not.toHaveBeenCalled();
    });

    it('should connect to existing peers when connected', () => {
      const mockStream = createMockStream();
      const peers = [
        { id: 'peer1', displayName: 'Alice' },
        { id: 'peer2', displayName: 'Bob' },
      ];
      storeState.isConnected = true;
      storeState.localStream = mockStream;
      storeState.peers = peers;

      renderHook(() => useWebRTC());
      expect(peerManager.connectToPeer).toHaveBeenCalledWith('peer1');
      expect(peerManager.connectToPeer).toHaveBeenCalledWith('peer2');
    });
  });

  describe('toggleMute', () => {
    it('should call toggleAudio with false when enabling mute', () => {
      const mockStream = createMockStream();
      storeState.audioEnabled = false;
      storeState.localStream = mockStream;

      const { result } = renderHook(() => useWebRTC());
      result.current.toggleMute();

      expect(toggleAudio).toHaveBeenCalled();
    });

    it('should call toggleAudio when disabling mute', () => {
      const mockStream = createMockStream();
      storeState.audioEnabled = true;
      storeState.localStream = mockStream;

      const { result } = renderHook(() => useWebRTC());
      result.current.toggleMute();

      expect(toggleAudio).toHaveBeenCalled();
    });
  });

  describe('toggleCamera', () => {
    it('should call toggleVideo with false when disabling camera', () => {
      const mockStream = createMockStream();
      storeState.videoEnabled = true;
      storeState.localStream = mockStream;

      const { result } = renderHook(() => useWebRTC());
      result.current.toggleCamera();

      expect(toggleVideo).toHaveBeenCalled();
    });

    it('should call toggleVideo when enabling camera', () => {
      const mockStream = createMockStream();
      storeState.videoEnabled = false;
      storeState.localStream = mockStream;

      const { result } = renderHook(() => useWebRTC());
      result.current.toggleCamera();

      expect(toggleVideo).toHaveBeenCalled();
    });
  });

  describe('reconnectPeer', () => {
    it('should disconnect and reconnect to a peer', async () => {
      const { result } = renderHook(() => useWebRTC());
      const reconnectPeer = result.current.reconnectPeer;

      await reconnectPeer('peer123');

      expect(peerManager.disconnectFromPeer).toHaveBeenCalledWith('peer123');
      expect(peerManager.connectToPeer).toHaveBeenCalledWith('peer123');
    });
  });
});
