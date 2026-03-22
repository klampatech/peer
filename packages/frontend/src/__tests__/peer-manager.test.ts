import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
