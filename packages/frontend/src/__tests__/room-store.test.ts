import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useRoomStore } from '../stores/room-store';

// Mock dependencies
vi.mock('../lib/signalling', () => ({
  signallingClient: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    requestTurnCredentials: vi.fn(),
  },
}));

vi.mock('../lib/webrtc/peer-manager', () => ({
  peerManager: {
    initialize: vi.fn(),
    cleanup: vi.fn(),
    connectToPeer: vi.fn().mockResolvedValue(undefined),
    setLocalStream: vi.fn(),
  },
}));

describe('useRoomStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store to initial state
    useRoomStore.setState({
      isConnected: false,
      roomToken: null,
      peerId: null,
      localStream: null,
      audioEnabled: true,
      videoEnabled: true,
      screenSharing: false,
      peers: [],
      messages: [],
    });
  });

  describe('Initial state', () => {
    it('should have correct initial values', () => {
      const state = useRoomStore.getState();

      expect(state.isConnected).toBe(false);
      expect(state.roomToken).toBeNull();
      expect(state.peerId).toBeNull();
      expect(state.localStream).toBeNull();
      expect(state.audioEnabled).toBe(true);
      expect(state.videoEnabled).toBe(true);
      expect(state.screenSharing).toBe(false);
      expect(state.peers).toEqual([]);
      expect(state.messages).toEqual([]);
    });
  });

  describe('setConnected', () => {
    it('should update isConnected state', () => {
      const { setConnected } = useRoomStore.getState();

      act(() => {
        setConnected(true);
      });

      expect(useRoomStore.getState().isConnected).toBe(true);

      act(() => {
        setConnected(false);
      });

      expect(useRoomStore.getState().isConnected).toBe(false);
    });
  });

  describe('setRoomToken', () => {
    it('should update room token', () => {
      const { setRoomToken } = useRoomStore.getState();

      act(() => {
        setRoomToken('room-123');
      });

      expect(useRoomStore.getState().roomToken).toBe('room-123');

      act(() => {
        setRoomToken(null);
      });

      expect(useRoomStore.getState().roomToken).toBeNull();
    });
  });

  describe('setPeerId', () => {
    it('should update peer ID', () => {
      const { setPeerId } = useRoomStore.getState();

      act(() => {
        setPeerId('peer-abc');
      });

      expect(useRoomStore.getState().peerId).toBe('peer-abc');
    });
  });

  describe('setLocalStream', () => {
    it('should update local stream', () => {
      const mockStream = {
        id: 'stream-123',
        getTracks: () => [],
      } as unknown as MediaStream;

      const { setLocalStream } = useRoomStore.getState();

      act(() => {
        setLocalStream(mockStream);
      });

      expect(useRoomStore.getState().localStream).toBe(mockStream);

      act(() => {
        setLocalStream(null);
      });

      expect(useRoomStore.getState().localStream).toBeNull();
    });
  });

  describe('setAudioEnabled', () => {
    it('should update audio enabled state', () => {
      const { setAudioEnabled } = useRoomStore.getState();

      act(() => {
        setAudioEnabled(false);
      });

      expect(useRoomStore.getState().audioEnabled).toBe(false);
    });

    it('should update audio track enabled property on local stream', () => {
      const mockTrack = { enabled: true };
      const mockStream = {
        getAudioTracks: vi.fn(() => [mockTrack]),
        getTracks: vi.fn(() => [mockTrack]),
      } as unknown as MediaStream;

      useRoomStore.setState({ localStream: mockStream });

      const { setAudioEnabled } = useRoomStore.getState();

      act(() => {
        setAudioEnabled(false);
      });

      expect((mockTrack as { enabled: boolean }).enabled).toBe(false);
    });
  });

  describe('setVideoEnabled', () => {
    it('should update video enabled state', () => {
      const { setVideoEnabled } = useRoomStore.getState();

      act(() => {
        setVideoEnabled(false);
      });

      expect(useRoomStore.getState().videoEnabled).toBe(false);
    });

    it('should update video track enabled property on local stream', () => {
      const mockTrack = { enabled: true };
      const mockStream = {
        getVideoTracks: vi.fn(() => [mockTrack]),
        getTracks: vi.fn(() => [mockTrack]),
      } as unknown as MediaStream;

      useRoomStore.setState({ localStream: mockStream });

      const { setVideoEnabled } = useRoomStore.getState();

      act(() => {
        setVideoEnabled(false);
      });

      expect((mockTrack as { enabled: boolean }).enabled).toBe(false);
    });
  });

  describe('setScreenSharing', () => {
    it('should update screen sharing state', () => {
      const { setScreenSharing } = useRoomStore.getState();

      act(() => {
        setScreenSharing(true);
      });

      expect(useRoomStore.getState().screenSharing).toBe(true);
    });
  });

  describe('addPeer', () => {
    it('should add a peer to the peers array', () => {
      const { addPeer } = useRoomStore.getState();
      const peer = {
        id: 'peer-1',
        displayName: 'Alice',
        audioEnabled: true,
        videoEnabled: true,
      };

      act(() => {
        addPeer(peer);
      });

      expect(useRoomStore.getState().peers).toHaveLength(1);
      expect(useRoomStore.getState().peers[0]).toEqual(peer);
    });

    it('should append multiple peers', () => {
      const { addPeer } = useRoomStore.getState();

      act(() => {
        addPeer({ id: 'peer-1', displayName: 'Alice', audioEnabled: true, videoEnabled: true });
        addPeer({ id: 'peer-2', displayName: 'Bob', audioEnabled: true, videoEnabled: true });
      });

      expect(useRoomStore.getState().peers).toHaveLength(2);
    });
  });

  describe('removePeer', () => {
    it('should remove a peer by ID', () => {
      useRoomStore.setState({
        peers: [
          { id: 'peer-1', displayName: 'Alice', audioEnabled: true, videoEnabled: true },
          { id: 'peer-2', displayName: 'Bob', audioEnabled: true, videoEnabled: true },
        ],
      });

      const { removePeer } = useRoomStore.getState();

      act(() => {
        removePeer('peer-1');
      });

      expect(useRoomStore.getState().peers).toHaveLength(1);
      expect(useRoomStore.getState().peers[0]?.id).toBe('peer-2');
    });
  });

  describe('updatePeer', () => {
    it('should update specific peer properties', () => {
      useRoomStore.setState({
        peers: [
          { id: 'peer-1', displayName: 'Alice', audioEnabled: true, videoEnabled: true },
        ],
      });

      const { updatePeer } = useRoomStore.getState();

      act(() => {
        updatePeer('peer-1', { audioEnabled: false });
      });

      expect(useRoomStore.getState().peers[0]?.audioEnabled).toBe(false);
    });

    it('should not modify other peer properties', () => {
      useRoomStore.setState({
        peers: [
          { id: 'peer-1', displayName: 'Alice', audioEnabled: true, videoEnabled: true },
        ],
      });

      const { updatePeer } = useRoomStore.getState();

      act(() => {
        updatePeer('peer-1', { audioEnabled: false });
      });

      expect(useRoomStore.getState().peers[0]?.displayName).toBe('Alice');
      expect(useRoomStore.getState().peers[0]?.videoEnabled).toBe(true);
    });
  });

  describe('addMessage', () => {
    it('should add a message to the messages array', () => {
      const { addMessage } = useRoomStore.getState();
      const message = {
        id: 'msg-1',
        peerId: 'peer-1',
        displayName: 'Alice',
        message: 'Hello!',
        timestamp: new Date(),
      };

      act(() => {
        addMessage(message);
      });

      expect(useRoomStore.getState().messages).toHaveLength(1);
      expect(useRoomStore.getState().messages[0]).toEqual(message);
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages', () => {
      useRoomStore.setState({
        messages: [
          { id: 'msg-1', peerId: 'peer-1', displayName: 'Alice', message: 'Hello!', timestamp: new Date() },
          { id: 'msg-2', peerId: 'peer-2', displayName: 'Bob', message: 'Hi!', timestamp: new Date() },
        ],
      });

      const { clearMessages } = useRoomStore.getState();

      act(() => {
        clearMessages();
      });

      expect(useRoomStore.getState().messages).toEqual([]);
    });
  });

  describe('reset', () => {
    it('should reset state to initial values', () => {
      useRoomStore.setState({
        isConnected: true,
        roomToken: 'token-123',
        peerId: 'peer-abc',
        audioEnabled: false,
        videoEnabled: false,
        screenSharing: true,
        peers: [{ id: 'peer-1', displayName: 'Alice', audioEnabled: true, videoEnabled: true }],
        messages: [{ id: 'msg-1', peerId: 'peer-1', displayName: 'Alice', message: 'Hello!', timestamp: new Date() }],
      });

      const { reset } = useRoomStore.getState();

      act(() => {
        reset();
      });

      const state = useRoomStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.roomToken).toBeNull();
      expect(state.peerId).toBeNull();
      expect(state.audioEnabled).toBe(true);
      expect(state.videoEnabled).toBe(true);
      expect(state.screenSharing).toBe(false);
      expect(state.peers).toEqual([]);
      expect(state.messages).toEqual([]);
    });

    it('should stop all tracks on local stream during reset', () => {
      const mockTrack = { stop: vi.fn() };
      const mockStream = {
        getTracks: vi.fn(() => [mockTrack]),
      } as unknown as MediaStream;

      useRoomStore.setState({ localStream: mockStream });

      const { reset } = useRoomStore.getState();

      act(() => {
        reset();
      });

      expect(mockTrack.stop).toHaveBeenCalled();
    });
  });

  describe('Selector usage', () => {
    it('should work with selector in renderHook', () => {
      const { result } = renderHook(() =>
        useRoomStore((state) => ({ isConnected: state.isConnected, peerCount: state.peers.length }))
      );

      expect(result.current.isConnected).toBe(false);
      expect(result.current.peerCount).toBe(0);
    });
  });
});
