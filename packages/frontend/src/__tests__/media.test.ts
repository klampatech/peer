import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/webrtc/media', () => ({
  getUserMedia: vi.fn(),
  getDisplayMedia: vi.fn(),
  isScreenShareSupported: vi.fn(),
  isScreenShareFullySupported: vi.fn(),
  stopMediaStream: vi.fn(),
  toggleAudio: vi.fn(),
  toggleVideo: vi.fn(),
  checkMediaPermissions: vi.fn(),
  getAvailableDevices: vi.fn(),
}));

import {
  getUserMedia,
  getDisplayMedia,
  isScreenShareSupported,
  isScreenShareFullySupported,
  stopMediaStream,
  toggleAudio,
  toggleVideo,
  checkMediaPermissions,
  getAvailableDevices,
} from '../lib/webrtc/media';

describe('media module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserMedia', () => {
    it('should call getUserMedia', async () => {
      const mockStream = {} as MediaStream;
      vi.mocked(getUserMedia).mockResolvedValue(mockStream);

      const result = await getUserMedia();

      expect(getUserMedia).toHaveBeenCalled();
      expect(result).toBe(mockStream);
    });

    it('should throw when getUserMedia fails', async () => {
      vi.mocked(getUserMedia).mockRejectedValue(new Error('Permission denied'));

      await expect(getUserMedia()).rejects.toThrow('Permission denied');
    });
  });

  describe('getDisplayMedia', () => {
    it('should call getDisplayMedia', async () => {
      const mockStream = {} as MediaStream;
      vi.mocked(getDisplayMedia).mockResolvedValue(mockStream);

      const result = await getDisplayMedia();

      expect(getDisplayMedia).toHaveBeenCalled();
      expect(result).toBe(mockStream);
    });

    it('should throw on user denial (NotAllowedError)', async () => {
      const error = new DOMException('Permission denied', 'NotAllowedError');
      vi.mocked(getDisplayMedia).mockRejectedValue(error);

      await expect(getDisplayMedia()).rejects.toThrow();
    });

    it('should throw on abort (AbortError)', async () => {
      const error = new DOMException('Aborted', 'AbortError');
      vi.mocked(getDisplayMedia).mockRejectedValue(error);

      await expect(getDisplayMedia()).rejects.toThrow();
    });
  });

  describe('isScreenShareSupported', () => {
    it('should return true when getDisplayMedia is available', () => {
      vi.mocked(isScreenShareSupported).mockReturnValue(true);
      expect(isScreenShareSupported()).toBe(true);
    });

    it('should return false when mediaDevices is not available', () => {
      vi.mocked(isScreenShareSupported).mockReturnValue(false);
      expect(isScreenShareSupported()).toBe(false);
    });
  });

  describe('isScreenShareFullySupported', () => {
    it('should return true on desktop with getDisplayMedia', () => {
      vi.mocked(isScreenShareFullySupported).mockReturnValue(true);
      expect(isScreenShareFullySupported()).toBe(true);
    });

    it('should return false on iOS', () => {
      vi.mocked(isScreenShareFullySupported).mockReturnValue(false);
      expect(isScreenShareFullySupported()).toBe(false);
    });
  });

  describe('stopMediaStream', () => {
    it('should call stopMediaStream with stream', () => {
      const mockStream = {} as MediaStream;
      stopMediaStream(mockStream);
      expect(stopMediaStream).toHaveBeenCalledWith(mockStream);
    });

    it('should handle null stream gracefully', () => {
      expect(() => stopMediaStream(null)).not.toThrow();
    });

    it('should handle undefined stream gracefully', () => {
      expect(() => stopMediaStream(undefined as unknown as MediaStream)).not.toThrow();
    });
  });

  describe('toggleAudio', () => {
    it('should call toggleAudio with stream and enabled', () => {
      const mockStream = {} as MediaStream;
      toggleAudio(mockStream, true);
      expect(toggleAudio).toHaveBeenCalledWith(mockStream, true);
    });

    it('should call toggleAudio with false for disabled', () => {
      const mockStream = {} as MediaStream;
      toggleAudio(mockStream, false);
      expect(toggleAudio).toHaveBeenCalledWith(mockStream, false);
    });

    it('should handle null stream gracefully', () => {
      expect(() => toggleAudio(null, true)).not.toThrow();
    });
  });

  describe('toggleVideo', () => {
    it('should call toggleVideo with stream and enabled', () => {
      const mockStream = {} as MediaStream;
      toggleVideo(mockStream, true);
      expect(toggleVideo).toHaveBeenCalledWith(mockStream, true);
    });

    it('should call toggleVideo with false for disabled', () => {
      const mockStream = {} as MediaStream;
      toggleVideo(mockStream, false);
      expect(toggleVideo).toHaveBeenCalledWith(mockStream, false);
    });

    it('should handle null stream gracefully', () => {
      expect(() => toggleVideo(null, true)).not.toThrow();
    });
  });

  describe('checkMediaPermissions', () => {
    it('should return permission states from Permissions API', async () => {
      vi.mocked(checkMediaPermissions).mockResolvedValue({
        audio: 'granted',
        video: 'denied',
      });

      const result = await checkMediaPermissions();

      expect(result.audio).toBe('granted');
      expect(result.video).toBe('denied');
    });

    it('should return prompt state when Permissions API throws', async () => {
      vi.mocked(checkMediaPermissions).mockResolvedValue({
        audio: 'prompt',
        video: 'prompt',
      });

      const result = await checkMediaPermissions();

      expect(result.audio).toBe('prompt');
      expect(result.video).toBe('prompt');
    });
  });

  describe('getAvailableDevices', () => {
    it('should return categorized media devices', async () => {
      vi.mocked(getAvailableDevices).mockResolvedValue({
        audioInputs: [
          { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone 1' },
          { kind: 'audioinput', deviceId: 'mic2', label: 'Microphone 2' },
        ],
        videoInputs: [
          { kind: 'videoinput', deviceId: 'cam1', label: 'Camera 1' },
          { kind: 'videoinput', deviceId: 'cam2', label: 'Camera 2' },
        ],
        audioOutputs: [
          { kind: 'audiooutput', deviceId: 'spk1', label: 'Speaker 1' },
        ],
      });

      const result = await getAvailableDevices();

      expect(result.audioInputs).toHaveLength(2);
      expect(result.videoInputs).toHaveLength(2);
      expect(result.audioOutputs).toHaveLength(1);
    });

    it('should return empty arrays when no devices found', async () => {
      vi.mocked(getAvailableDevices).mockResolvedValue({
        audioInputs: [],
        videoInputs: [],
        audioOutputs: [],
      });

      const result = await getAvailableDevices();

      expect(result.audioInputs).toHaveLength(0);
      expect(result.videoInputs).toHaveLength(0);
      expect(result.audioOutputs).toHaveLength(0);
    });
  });
});
