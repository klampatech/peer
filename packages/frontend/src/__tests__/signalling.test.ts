import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock peer manager
vi.mock('../lib/webrtc/peer-manager', () => ({
  peerManager: {
    connectToPeer: vi.fn().mockResolvedValue(undefined),
    disconnectFromPeer: vi.fn(),
    setTurnServers: vi.fn(),
  },
}));

// Mock room store
vi.mock('../stores/room-store', () => ({
  useRoomStore: {
    getState: vi.fn().mockReturnValue({
      setPeerId: vi.fn(),
      setConnected: vi.fn(),
      setRoomToken: vi.fn(),
      addPeer: vi.fn(),
      removePeer: vi.fn(),
      addMessage: vi.fn(),
      clearMessages: vi.fn(),
      reset: vi.fn(),
      localStream: null,
      isConnected: false,
    }),
  },
}));

// Import after setting up mocks
import { signallingClient } from '../lib/signalling';

describe('SignallingClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    signallingClient.disconnect();
  });

  describe('disconnect', () => {
    it('should have a disconnect method', () => {
      expect(typeof signallingClient.disconnect).toBe('function');
    });
  });

  describe('sendSdpOffer', () => {
    it('should have a sendSdpOffer method', () => {
      expect(typeof signallingClient.sendSdpOffer).toBe('function');
    });

    it('should not throw when calling without socket', () => {
      expect(() => signallingClient.sendSdpOffer('peer-id', { type: 'offer' })).not.toThrow();
    });
  });

  describe('sendSdpAnswer', () => {
    it('should have a sendSdpAnswer method', () => {
      expect(typeof signallingClient.sendSdpAnswer).toBe('function');
    });

    it('should not throw when calling without socket', () => {
      expect(() => signallingClient.sendSdpAnswer('peer-id', { type: 'answer' })).not.toThrow();
    });
  });

  describe('sendIceCandidate', () => {
    it('should have a sendIceCandidate method', () => {
      expect(typeof signallingClient.sendIceCandidate).toBe('function');
    });

    it('should not throw when calling without socket', () => {
      expect(() => signallingClient.sendIceCandidate('peer-id', { candidate: 'test' })).not.toThrow();
    });
  });

  describe('getSocketId', () => {
    it('should have a getSocketId method', () => {
      expect(typeof signallingClient.getSocketId).toBe('function');
    });

    it('should return undefined when not connected', () => {
      expect(signallingClient.getSocketId()).toBeUndefined();
    });
  });

  describe('requestTurnCredentials', () => {
    it('should have a requestTurnCredentials method', () => {
      expect(typeof signallingClient.requestTurnCredentials).toBe('function');
    });

    it('should not throw when calling without socket', async () => {
      // Should reject without a socket but not throw
      await expect(signallingClient.requestTurnCredentials('12345678-1234-4567-8901-123456789012')).rejects.toBeDefined();
    });
  });

  describe('sendChatMessage', () => {
    it('should have a sendChatMessage method', () => {
      expect(typeof signallingClient.sendChatMessage).toBe('function');
    });

    it('should not throw when room token is missing', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      signallingClient.sendChatMessage('Hello');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('requestChatHistory', () => {
    it('should have a requestChatHistory method', () => {
      expect(typeof signallingClient.requestChatHistory).toBe('function');
    });

    it('should not throw when room token is missing', async () => {
      // Should reject without a socket but not throw
      await expect(signallingClient.requestChatHistory('12345678-1234-4567-8901-123456789012')).rejects.toBeDefined();
    });
  });
});

describe('SignallingClient exports', () => {
  it('should export a signallingClient singleton', () => {
    expect(signallingClient).toBeDefined();
    expect(signallingClient).toHaveProperty('connect');
    expect(signallingClient).toHaveProperty('disconnect');
    expect(signallingClient).toHaveProperty('sendSdpOffer');
    expect(signallingClient).toHaveProperty('sendSdpAnswer');
    expect(signallingClient).toHaveProperty('sendIceCandidate');
    expect(signallingClient).toHaveProperty('getSocketId');
    expect(signallingClient).toHaveProperty('requestTurnCredentials');
    expect(signallingClient).toHaveProperty('sendChatMessage');
    expect(signallingClient).toHaveProperty('requestChatHistory');
  });

});
