import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import VideoTile from '../components/VideoTile';

// Mock MediaStream for testing
const createMockStream = (hasVideo = true, hasEnabledVideo = true) => {
  const mockVideoTrack = {
    enabled: hasEnabledVideo,
    kind: 'video',
  };
  const mockAudioTrack = {
    enabled: true,
    kind: 'audio',
  };

  return {
    getVideoTracks: vi.fn(() => (hasVideo ? [mockVideoTrack] : [])),
    getAudioTracks: vi.fn(() => [mockAudioTrack]),
    getTracks: vi.fn(() => [mockVideoTrack, mockAudioTrack]),
  } as unknown as MediaStream;
};

describe('VideoTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Video rendering', () => {
    it('should render video element when stream with video track is provided', () => {
      const stream = createMockStream(true, true);
      render(
        <VideoTile
          stream={stream}
          displayName="John Doe"
        />
      );

      const videoElement = document.querySelector('video');
      expect(videoElement).toBeInTheDocument();
    });

    it('should not render video element when stream has no video tracks', () => {
      const stream = createMockStream(false);
      render(
        <VideoTile
          stream={stream}
          displayName="John Doe"
        />
      );

      const videoElements = document.querySelectorAll('video');
      expect(videoElements).toHaveLength(0);
    });

    it('should not render video element when no stream is provided', () => {
      render(
        <VideoTile
          displayName="John Doe"
        />
      );

      const videoElements = document.querySelectorAll('video');
      expect(videoElements).toHaveLength(0);
    });
  });

  describe('Avatar rendering', () => {
    it('should show avatar when no video stream is provided', () => {
      render(
        <VideoTile
          displayName="John Doe"
        />
      );

      // Avatar shows initials
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should show avatar when stream has no video tracks', () => {
      const stream = createMockStream(false);
      render(
        <VideoTile
          stream={stream}
          displayName="Alice Smith"
        />
      );

      expect(screen.getByText('AS')).toBeInTheDocument();
    });

    it('should display correct initials from display name', () => {
      render(
        <VideoTile
          displayName="Bob Wilson"
        />
      );

      expect(screen.getByText('BW')).toBeInTheDocument();
    });
  });

  describe('Name display', () => {
    it('should display "You" for local user', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isLocal={true}
        />
      );

      expect(screen.getByText('You')).toBeInTheDocument();
    });

    it('should display actual name for remote user', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isLocal={false}
        />
      );

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  describe('Muted indicator', () => {
    it('should show muted indicator when isMuted is true', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isMuted={true}
          audioEnabled={true}
        />
      );

      expect(screen.getByLabelText('Muted')).toBeInTheDocument();
    });

    it('should show muted indicator when audio is disabled', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isMuted={false}
          audioEnabled={false}
        />
      );

      expect(screen.getByLabelText('Muted')).toBeInTheDocument();
    });

    it('should not show muted indicator when audio is enabled and not muted', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isMuted={false}
          audioEnabled={true}
        />
      );

      expect(screen.queryByLabelText('Muted')).not.toBeInTheDocument();
    });

    it('should not show muted indicator for local user who is not muted', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isLocal={true}
          isMuted={false}
          audioEnabled={true}
        />
      );

      expect(screen.queryByLabelText('Muted')).not.toBeInTheDocument();
    });
  });

  describe('Speaking indicator', () => {
    it('should show speaking indicator when isSpeaking is true', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isSpeaking={true}
        />
      );

      // Check for the speaking indicator bar at the bottom
      const speakingIndicator = document.querySelector('.bg-success\\/80');
      expect(speakingIndicator).toBeInTheDocument();
    });

    it('should not show speaking indicator when isSpeaking is false', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isSpeaking={false}
        />
      );

      const speakingIndicators = document.querySelectorAll('.bg-success\\/80');
      expect(speakingIndicators).toHaveLength(0);
    });

    it('should apply speaking ring style when isSpeaking is true', () => {
      const { container } = render(
        <VideoTile
          displayName="John Doe"
          isSpeaking={true}
        />
      );

      // Check that the root element has the speaking ring class
      const rootElement = container.firstChild;
      expect(rootElement).toHaveClass('ring-2');
      expect(rootElement).toHaveClass('ring-success');
    });
  });

  describe('Audio enabled indicator', () => {
    it('should show speaking indicator for remote user with audio enabled and not muted', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isLocal={false}
          isMuted={false}
          audioEnabled={true}
        />
      );

      expect(screen.getByLabelText('Speaking')).toBeInTheDocument();
    });

    it('should not show speaking indicator for local user', () => {
      render(
        <VideoTile
          displayName="John Doe"
          isLocal={true}
          isMuted={false}
          audioEnabled={true}
        />
      );

      expect(screen.queryByLabelText('Speaking')).not.toBeInTheDocument();
    });
  });
});
