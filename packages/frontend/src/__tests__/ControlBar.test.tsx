import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ControlBar from '../components/ControlBar';

// Mock the room-store module BEFORE any imports
vi.mock('../stores/room-store', () => ({
  useRoomStore: vi.fn(),
  initializeMedia: vi.fn().mockResolvedValue({} as MediaStream),
  cleanupMedia: vi.fn(),
}));

// Mock the peer-manager module
vi.mock('../lib/webrtc/peer-manager', () => ({
  peerManager: {
    replaceVideoTrack: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the media module
vi.mock('../lib/webrtc/media', () => ({
  getUserMedia: vi.fn().mockResolvedValue({
    getVideoTracks: () => [{ kind: 'video' }],
    getAudioTracks: () => [],
    getTracks: () => [],
  }),
}));

// Import after vi.mock
import { useRoomStore } from '../stores/room-store';

describe('ControlBar', () => {
  const mockOnLeave = vi.fn();
  const mockSetAudioEnabled = vi.fn();
  const mockSetVideoEnabled = vi.fn();
  const mockSetScreenSharing = vi.fn();

  const defaultStoreState = {
    audioEnabled: true,
    videoEnabled: true,
    screenSharing: false,
    localStream: null as MediaStream | null,
    setAudioEnabled: mockSetAudioEnabled,
    setVideoEnabled: mockSetVideoEnabled,
    setScreenSharing: mockSetScreenSharing,
    setLocalStream: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRoomStore).mockReturnValue({ ...defaultStoreState });

    // Mock navigator.mediaDevices.getDisplayMedia for screen share tests
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getVideoTracks: () => [{ onended: null }],
          getAudioTracks: () => [],
          getTracks: () => [],
        }),
        getUserMedia: vi.fn().mockResolvedValue({} as MediaStream),
      },
      writable: true,
    });
  });

  describe('Mute Button', () => {
    it('should toggle audio state when clicked', async () => {
      render(<ControlBar onLeave={mockOnLeave} />);

      const muteButton = screen.getByRole('button', { name: /mute microphone/i });

      await act(async () => {
        fireEvent.click(muteButton);
      });

      expect(mockSetAudioEnabled).toHaveBeenCalledWith(false);
    });

    it('should unmute audio when clicked while muted', async () => {
      vi.mocked(useRoomStore).mockReturnValue({
        ...defaultStoreState,
        audioEnabled: false,
      });

      render(<ControlBar onLeave={mockOnLeave} />);

      const unmuteButton = screen.getByRole('button', { name: /unmute microphone/i });

      await act(async () => {
        fireEvent.click(unmuteButton);
      });

      expect(mockSetAudioEnabled).toHaveBeenCalledWith(true);
    });
  });

  describe('Camera Button', () => {
    it('should toggle video state when clicked', async () => {
      render(<ControlBar onLeave={mockOnLeave} />);

      const videoButton = screen.getByRole('button', { name: /turn off camera/i });

      await act(async () => {
        fireEvent.click(videoButton);
      });

      expect(mockSetVideoEnabled).toHaveBeenCalledWith(false);
    });

    it('should enable video when clicked while disabled', async () => {
      vi.mocked(useRoomStore).mockReturnValue({
        ...defaultStoreState,
        videoEnabled: false,
      });

      render(<ControlBar onLeave={mockOnLeave} />);

      const videoButton = screen.getByRole('button', { name: /turn on camera/i });

      await act(async () => {
        fireEvent.click(videoButton);
      });

      expect(mockSetVideoEnabled).toHaveBeenCalledWith(true);
    });
  });

  describe('Screen Share Button', () => {
    it('should toggle screen sharing when clicked', async () => {
      render(<ControlBar onLeave={mockOnLeave} />);

      const screenShareButton = screen.getByRole('button', { name: /share screen/i });

      await act(async () => {
        fireEvent.click(screenShareButton);
      });

      expect(mockSetScreenSharing).toHaveBeenCalledWith(true);
    });

    it('should stop screen sharing when clicked while sharing', async () => {
      vi.mocked(useRoomStore).mockReturnValue({
        ...defaultStoreState,
        screenSharing: true,
      });

      render(<ControlBar onLeave={mockOnLeave} />);

      const stopScreenShareButton = screen.getByRole('button', { name: /stop screen share/i });

      await act(async () => {
        fireEvent.click(stopScreenShareButton);
      });

      expect(mockSetScreenSharing).toHaveBeenCalledWith(false);
    });
  });

  describe('Leave Button', () => {
    it('should call onLeave callback when clicked', async () => {
      render(<ControlBar onLeave={mockOnLeave} />);

      const leaveButton = screen.getByRole('button', { name: /leave call/i });

      await act(async () => {
        fireEvent.click(leaveButton);
      });

      expect(mockOnLeave).toHaveBeenCalledTimes(1);
    });
  });
});
