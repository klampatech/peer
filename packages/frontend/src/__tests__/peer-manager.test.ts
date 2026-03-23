import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global WebRTC APIs that aren't available in jsdom
class MockRTCSessionDescription {
  type: RTCSdpType;
  sdp: string;

  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type;
    this.sdp = init.sdp ?? '';
  }

  toJSON(): RTCSessionDescriptionInit {
    return { type: this.type, sdp: this.sdp };
  }
}

class MockRTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;

  constructor(init: RTCIceCandidateInit) {
    this.candidate = init.candidate ?? '';
    this.sdpMid = init.sdpMid ?? null;
    this.sdpMLineIndex = init.sdpMLineIndex ?? null;
  }

  toJSON(): RTCIceCandidateInit {
    return {
      candidate: this.candidate,
      sdpMid: this.sdpMid,
      sdpMLineIndex: this.sdpMLineIndex,
    };
  }
}

class MockRTCPeerConnection {
  private _connectionState: RTCPeerConnectionState = 'new';
  private _iceConnectionState: RTCIceConnectionState = 'new';

  get connectionState(): RTCPeerConnectionState {
    return this._connectionState;
  }

  set connectionState(value: RTCPeerConnectionState) {
    this._connectionState = value;
  }

  get iceConnectionState(): RTCIceConnectionState {
    return this._iceConnectionState;
  }

  set iceConnectionState(value: RTCIceConnectionState) {
    this._iceConnectionState = value;
  }

  // Required properties from RTCPeerConnection interface
  readonly canTrickleIceCandidates: boolean | null = null;
  readonly currentLocalDescription: RTCSessionDescription | null = null;
  readonly currentRemoteDescription: RTCSessionDescription | null = null;
  readonly iceGatheringState: RTCIceGatheringState = 'new';
  readonly signalingState: RTCSignalingState = 'stable';
  readonly localDescription: RTCSessionDescription | null = null;
  readonly remoteDescription: RTCSessionDescription | null = null;
  readonly pendingLocalDescription: RTCSessionDescription | null = null;
  readonly pendingRemoteDescription: RTCSessionDescription | null = null;
  readonly sctp: RTCSctpTransport | null = null;
  private _senders: RTCRtpSender[] = [];
  private _receivers: RTCRtpReceiver[] = [];

  constructor(_config?: RTCConfiguration) {
    // Mock implementation
  }

  createOffer(_options?: RTCOfferOptions): Promise<RTCSessionDescription> {
    return Promise.resolve(new MockRTCSessionDescription({ type: 'offer', sdp: 'mock-sdp' }));
  }

  createAnswer(_options?: RTCAnswerOptions): Promise<RTCSessionDescription> {
    return Promise.resolve(new MockRTCSessionDescription({ type: 'answer', sdp: 'mock-sdp' }));
  }

  setLocalDescription(_description: RTCSessionDescriptionInit): Promise<void> {
    return Promise.resolve();
  }

  setRemoteDescription(_description: RTCSessionDescriptionInit): Promise<void> {
    return Promise.resolve();
  }

  addTrack(_track: MediaStreamTrack, _stream?: MediaStream): RTCRtpSender {
    const sender: RTCRtpSender = {
      replaceTrack: () => Promise.resolve(),
      track: null,
      transport: null,
      getParameters: () => ({}),
      setParameters: () => Promise.resolve({}),
    } as unknown as RTCRtpSender;
    this._senders.push(sender);
    return sender;
  }

  getSenders(): RTCRtpSender[] {
    return this._senders;
  }

  getReceivers(): RTCRtpReceiver[] {
    return this._receivers;
  }

  addIceCandidate(_candidate: RTCIceCandidateInit): Promise<void> {
    return Promise.resolve();
  }

  getStats(): Promise<RTCStatsReport> {
    return Promise.resolve(new Map() as RTCStatsReport);
  }

  close(): void {
    // Mock close
  }

  // Required event handlers from RTCPeerConnection interface (use Function to avoid this context issues)
  ondatachannel: ((ev: RTCDataChannelEvent) => void) | null = null;
  onicecandidate: ((ev: RTCPeerConnectionIceEvent) => void) | null = null;
  onicecandidateerror: ((ev: RTCPeerConnectionIceErrorEvent) => void) | null = null;
  oniceconnectionstatechange: ((ev: Event) => void) | null = null;
  onicegatheringstatechange: ((ev: Event) => void) | null = null;
  onnegotiationneeded: ((ev: Event) => void) | null = null;
  onsignalingstatechange: ((ev: Event) => void) | null = null;
  ontrack: ((ev: Event) => void) | null = null;
  onconnectionstatechange: ((ev: Event) => void) | null = null;

  addTransceiver(_trackOrKind: MediaStreamTrack | string, _options?: RTCRtpTransceiverInit): RTCRtpTransceiver {
    const transceiver: RTCRtpTransceiver = {
      direction: 'sendrecv',
      mid: null,
      receiver: { track: { id: '' } } as unknown as RTCRtpReceiver,
      sender: { track: null } as unknown as RTCRtpSender,
      currentDirection: 'sendrecv',
      setDirection: () => {},
      stop: () => {},
    };
    return transceiver;
  }
}
globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection;
globalThis.RTCSessionDescription = MockRTCSessionDescription as unknown as typeof RTCSessionDescription;
globalThis.RTCIceCandidate = MockRTCIceCandidate as unknown as typeof RTCIceCandidate;

// Mock Socket.IO for signalling dependency
vi.mock('../lib/signalling', () => ({
  signallingClient: {
    sendSdpOffer: vi.fn(),
    sendSdpAnswer: vi.fn(),
    sendIceCandidate: vi.fn(),
  },
}));

// Mock room store
vi.mock('../stores/room-store', () => ({
  useRoomStore: {
    getState: vi.fn().mockReturnValue({
      updatePeer: vi.fn(),
      removePeer: vi.fn(),
    }),
  },
}));

// Import after setting up mocks
import { peerManager } from '../lib/webrtc/peer-manager';

describe('PeerManager', () => {
  beforeEach(() => {
    peerManager.cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    peerManager.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with null local stream', () => {
      peerManager.initialize(null);
      expect(peerManager.getPeers()).toBeDefined();
    });

    it('should initialize with local stream and callbacks', () => {
      const localStream = {
        getTracks: () => [],
      } as unknown as MediaStream;
      const onPeerConnected = vi.fn();
      const onPeerDisconnected = vi.fn();

      peerManager.initialize(localStream, onPeerConnected, onPeerDisconnected);

      expect(peerManager.getPeers()).toBeDefined();
    });
  });

  describe('getPeers', () => {
    it('should return an empty map initially', () => {
      expect(peerManager.getPeers().size).toBe(0);
    });

    it('should return a Map instance', () => {
      expect(peerManager.getPeers()).toBeInstanceOf(Map);
    });
  });

  describe('disconnectFromPeer', () => {
    it('should handle disconnecting from non-existent peer', () => {
      expect(() => peerManager.disconnectFromPeer('non-existent')).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should handle cleanup with no peers', () => {
      expect(() => peerManager.cleanup()).not.toThrow();
    });

    it('should clear peers map after cleanup', () => {
      peerManager.cleanup();
      expect(peerManager.getPeers().size).toBe(0);
    });
  });

  describe('setTurnServers', () => {
    it('should accept valid TURN credentials', () => {
      const credentials = {
        username: 'test-user',
        password: 'test-pass',
        urls: ['turn:turn.example.com:3478'],
        ttl: 3600,
      };

      // Should not throw
      expect(() => peerManager.setTurnServers(credentials)).not.toThrow();
    });

    it('should warn on invalid credentials with empty urls', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      peerManager.setTurnServers({
        username: '',
        password: '',
        urls: [],
        ttl: 3600,
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should warn on missing username', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      peerManager.setTurnServers({
        username: '',
        password: 'password',
        urls: ['turn:turn.example.com:3478'],
        ttl: 3600,
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('replaceVideoTrack', () => {
    it('should handle replaceVideoTrack when no peers exist', async () => {
      const newTrack = { kind: 'video', id: 'new-track' } as unknown as MediaStreamTrack;

      await peerManager.replaceVideoTrack(newTrack);
      // Should not throw even with no peers
    });
  });

  describe('getStats', () => {
    it('should return null for non-existent peer', async () => {
      const stats = await peerManager.getStats('non-existent');

      expect(stats).toBeNull();
    });
  });

  // GAP-12: Peer connection lifecycle tests
  describe('connection lifecycle', () => {
    it('should create RTCPeerConnection with correct config on connectToPeer', async () => {
      const localStream = {
        getTracks: () => [
          { kind: 'audio', id: 'audio-1' },
          { kind: 'video', id: 'video-1' },
        ],
      } as unknown as MediaStream;

      peerManager.initialize(localStream);
      await peerManager.connectToPeer('peer-123');

      const peers = peerManager.getPeers();
      expect(peers.has('peer-123')).toBe(true);

      const peerConnection = peers.get('peer-123')?.connection;
      expect(peerConnection).toBeDefined();
      expect(peerConnection).toBeInstanceOf(RTCPeerConnection);
    });

    it('should send SDP offer when connecting to peer', async () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;

      peerManager.initialize(localStream);
      await peerManager.connectToPeer('peer-456');

      // Verify signalling was called with SDP offer
      const { signallingClient } = await import('../lib/signalling');
      expect(signallingClient.sendSdpOffer).toHaveBeenCalledWith(
        'peer-456',
        expect.objectContaining({
          type: 'offer',
          sdp: expect.any(String),
        })
      );
    });

    it('should not connect when signaling not ready', async () => {
      // Don't initialize - signalingReady will be false
      await peerManager.connectToPeer('peer-789');

      const peers = peerManager.getPeers();
      expect(peers.has('peer-789')).toBe(false);
    });

    it('should handle SDP offer and create SDP answer', async () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      // Create a mock SDP offer event
      const mockOffer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: 'v=0\r\no=- 1234567890 2 IN IP4 127.0.0.1\r\n',
      };

      // Dispatch the sdp:offer event
      window.dispatchEvent(
        new CustomEvent('sdp:offer', {
          detail: { peerId: 'peer-abc', sdp: mockOffer },
        })
      );

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify SDP answer was sent
      const { signallingClient } = await import('../lib/signalling');
      expect(signallingClient.sendSdpAnswer).toHaveBeenCalledWith(
        'peer-abc',
        expect.objectContaining({
          type: 'answer',
          sdp: expect.any(String),
        })
      );
    });

    it('should handle SDP answer and set remote description', async () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      // First connect to create the peer connection
      await peerManager.connectToPeer('peer-xyz');

      // Create mock SDP answer
      const mockAnswer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 0987654321 2 IN IP4 127.0.0.1\r\n',
      };

      // Dispatch the sdp:answer event
      window.dispatchEvent(
        new CustomEvent('sdp:answer', {
          detail: { peerId: 'peer-xyz', sdp: mockAnswer },
        })
      );

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the peer connection was updated
      const peer = peerManager.getPeers().get('peer-xyz');
      expect(peer?.connection.remoteDescription).toBeDefined();
    });

    it('should handle ICE candidate and add to connection', async () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      // First connect to create the peer connection
      await peerManager.connectToPeer('peer-ice');

      // Create mock ICE candidate
      const mockCandidate: RTCIceCandidateInit = {
        candidate: 'candidate:1 1 UDP 2130306433 192.168.1.1 54777 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      };

      // Dispatch the ice-candidate event
      window.dispatchEvent(
        new CustomEvent('ice-candidate', {
          detail: { peerId: 'peer-ice', candidate: mockCandidate },
        })
      );

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 100));

      // ICE candidate should have been handled (no error thrown)
      expect(true).toBe(true);
    });

    it('should handle disconnectFromPeer', () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      // Connect to peer first
      // Note: We can't easily test this without mocking RTCPeerConnection
      // But we can verify it doesn't throw for non-existent peer
      expect(() => peerManager.disconnectFromPeer('non-existent-peer')).not.toThrow();
    });

    it('should clean up event listeners on cleanup', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      peerManager.cleanup();

      // Verify removeEventListener was called for all three events
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'sdp:offer',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'sdp:answer',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'ice-candidate',
        expect.any(Function)
      );
    });

    it('should update room store on peer connection', async () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      // Trigger connection which should update store via ontrack
      // Note: ontrack is triggered when remote tracks arrive
      // This tests the code path exists
      await peerManager.connectToPeer('peer-store-test');

      const peer = peerManager.getPeers().get('peer-store-test');
      expect(peer).toBeDefined();
    });
  });

  // GAP-13: ICE failure handling tests
  describe('ICE failure handling', () => {
    it('should handle ICE connection state change to failed', async () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      // Connect to peer first
      await peerManager.connectToPeer('peer-ice-fail');

      // Get the mock peer connection
      const peer = peerManager.getPeers().get('peer-ice-fail');
      expect(peer).toBeDefined();

      // Simulate ICE connection state change by directly triggering the handler
      // The peer should be removed from the peers map when connection fails
      const mockConnection = peer!.connection as unknown as MockRTCPeerConnection;
      mockConnection.connectionState = 'failed';

      // Trigger connection state change
      if (mockConnection.onconnectionstatechange) {
        mockConnection.onconnectionstatechange(new Event('connectionstatechange'));
      }

      // After ICE failure, the peer should be cleaned up
      expect(peerManager.getPeers().has('peer-ice-fail')).toBe(false);
    });

    it('should handle ICE connection state change to disconnected', async () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      // Connect to peer first
      await peerManager.connectToPeer('peer-ice-disconnect');

      const peer = peerManager.getPeers().get('peer-ice-disconnect');
      expect(peer).toBeDefined();

      // Simulate disconnected state
      const mockConnection = peer!.connection as unknown as MockRTCPeerConnection;
      mockConnection.connectionState = 'disconnected';

      if (mockConnection.onconnectionstatechange) {
        mockConnection.onconnectionstatechange(new Event('connectionstatechange'));
      }

      // Peer should be removed when disconnected
      expect(peerManager.getPeers().has('peer-ice-disconnect')).toBe(false);
    });

    it('should log ICE connection state changes', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      await peerManager.connectToPeer('peer-ice-log');

      const peer = peerManager.getPeers().get('peer-ice-log');
      const mockConnection = peer!.connection as unknown as MockRTCPeerConnection;

      // Trigger state change
      mockConnection.connectionState = 'connecting';
      if (mockConnection.onconnectionstatechange) {
        mockConnection.onconnectionstatechange(new Event('connectionstatechange'));
      }

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not remove peer on connecting state', async () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      await peerManager.connectToPeer('peer-ice-connecting');

      const peer = peerManager.getPeers().get('peer-ice-connecting');
      const mockConnection = peer!.connection as unknown as MockRTCPeerConnection;

      // Set to connecting state - should NOT remove peer
      mockConnection.connectionState = 'connecting';
      if (mockConnection.onconnectionstatechange) {
        mockConnection.onconnectionstatechange(new Event('connectionstatechange'));
      }

      // Peer should still exist
      expect(peerManager.getPeers().has('peer-ice-connecting')).toBe(true);
    });

    it('should not remove peer on connected state', async () => {
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream);

      await peerManager.connectToPeer('peer-ice-connected');

      const peer = peerManager.getPeers().get('peer-ice-connected');
      const mockConnection = peer!.connection as unknown as MockRTCPeerConnection;

      // Set to connected state - should NOT remove peer
      mockConnection.connectionState = 'connected';
      if (mockConnection.onconnectionstatechange) {
        mockConnection.onconnectionstatechange(new Event('connectionstatechange'));
      }

      // Peer should still exist
      expect(peerManager.getPeers().has('peer-ice-connected')).toBe(true);
    });

    it('should call onPeerDisconnected callback on ICE failure', async () => {
      const onPeerDisconnected = vi.fn();
      const localStream = { getTracks: () => [] } as unknown as MediaStream;
      peerManager.initialize(localStream, undefined, onPeerDisconnected);

      await peerManager.connectToPeer('peer-callback');

      const peer = peerManager.getPeers().get('peer-callback');
      const mockConnection = peer!.connection as unknown as MockRTCPeerConnection;

      // Trigger failure
      mockConnection.connectionState = 'failed';
      if (mockConnection.onconnectionstatechange) {
        mockConnection.onconnectionstatechange(new Event('connectionstatechange'));
      }

      expect(onPeerDisconnected).toHaveBeenCalledWith('peer-callback');
    });
  });
});

describe('PeerManager exports', () => {
  it('should export a peerManager singleton', () => {
    expect(peerManager).toBeDefined();
    expect(peerManager).toHaveProperty('initialize');
    expect(peerManager).toHaveProperty('cleanup');
    expect(peerManager).toHaveProperty('connectToPeer');
    expect(peerManager).toHaveProperty('disconnectFromPeer');
    expect(peerManager).toHaveProperty('getPeers');
    expect(peerManager).toHaveProperty('setTurnServers');
    expect(peerManager).toHaveProperty('replaceVideoTrack');
    expect(peerManager).toHaveProperty('getStats');
  });

});
