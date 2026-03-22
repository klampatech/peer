import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import VideoTile from '../components/VideoTile';

// Helper to create mock stream
const createMockStream = (hasVideo = true, hasEnabledVideo = true) => {
  const mockVideoTrack = {
    enabled: hasEnabledVideo,
    kind: 'video',
    stop: vi.fn(),
  };
  const mockAudioTrack = {
    enabled: true,
    kind: 'audio',
    stop: vi.fn(),
  };

  return {
    getVideoTracks: vi.fn(() => (hasVideo ? [mockVideoTrack] : [])),
    getAudioTracks: vi.fn(() => [mockAudioTrack]),
    getTracks: vi.fn(() => (hasVideo ? [mockVideoTrack, mockAudioTrack] : [mockAudioTrack])),
  } as unknown as MediaStream;
};

describe('VideoTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Video element attachment', () => {
    it('should attach stream to video element via srcObject', () => {
      const stream = createMockStream(true, true);
      render(
        <VideoTile
          stream={stream}
          displayName="John Doe"
        />
      );

      const videoElement = document.querySelector('video');
      expect(videoElement).toBeInTheDocument();
      expect(videoElement?.srcObject).toBe(stream);
    });

    it('should set video element to muted for local stream', () => {
      const stream = createMockStream(true, true);
      render(
        <VideoTile
          stream={stream}
          displayName="You"
          isLocal={true}
        />
      );

      const videoElement = document.querySelector('video');
      expect(videoElement?.muted).toBe(true);
    });

    it('should not mute video element for remote streams', () => {
      const stream = createMockStream(true, true);
      render(
        <VideoTile
          stream={stream}
          displayName="Alice"
          isLocal={false}
        />
      );

      const videoElement = document.querySelector('video');
      expect(videoElement?.muted).toBe(false);
    });

    it('should have autoPlay and playsInline attributes', () => {
      const stream = createMockStream(true, true);
      render(
        <VideoTile
          stream={stream}
          displayName="John Doe"
        />
      );

      const videoElement = document.querySelector('video');
      expect(videoElement?.autoplay).toBe(true);
      expect(videoElement?.playsInline).toBe(true);
    });

    it('should have correct aria-label for local video', () => {
      const stream = createMockStream(true, true);
      render(
        <VideoTile
          stream={stream}
          displayName="You"
          isLocal={true}
        />
      );

      const videoElement = document.querySelector('video');
      expect(videoElement?.getAttribute('aria-label')).toBe('Your video');
    });

    it('should have correct aria-label for remote video', () => {
      const stream = createMockStream(true, true);
      render(
        <VideoTile
          stream={stream}
          displayName="Alice"
          isLocal={false}
        />
      );

      const videoElement = document.querySelector('video');
      expect(videoElement?.getAttribute('aria-label')).toBe("Alice's video");
    });
  });

  describe('Stream reactivity', () => {
    it('should update video element when stream prop changes', () => {
      const stream1 = createMockStream(true, true);
      const stream2 = createMockStream(true, true);

      const { rerender } = render(
        <VideoTile
          stream={stream1}
          displayName="John Doe"
        />
      );

      expect(document.querySelector('video')?.srcObject).toBe(stream1);

      rerender(
        <VideoTile
          stream={stream2}
          displayName="John Doe"
        />
      );

      expect(document.querySelector('video')?.srcObject).toBe(stream2);
    });

    it('should clear video when stream becomes null', () => {
      const stream = createMockStream(true, true);

      const { rerender } = render(
        <VideoTile
          stream={stream}
          displayName="John Doe"
        />
      );

      expect(document.querySelector('video')?.srcObject).toBe(stream);

      rerender(
        <VideoTile
          stream={undefined}
          displayName="John Doe"
        />
      );

      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  describe('Initials generation', () => {
    it('should generate initials from single word name', () => {
      render(<VideoTile displayName="Alice" />);
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('should generate initials from two word name', () => {
      render(<VideoTile displayName="John Doe" />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should generate initials from three word name (first two letters)', () => {
      render(<VideoTile displayName="John Michael Doe" />);
      expect(screen.getByText('JM')).toBeInTheDocument();
    });

    it('should limit initials to two characters', () => {
      render(<VideoTile displayName="Alice Bob Charlie" />);
      expect(screen.getByText('AB')).toBeInTheDocument();
    });

    it('should convert initials to uppercase', () => {
      render(<VideoTile displayName="john doe" />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  describe('Speaking indicator', () => {
    it('should apply ring styling for speaking', () => {
      const { container } = render(
        <VideoTile displayName="John Doe" isSpeaking={true} />
      );

      const rootElement = container.firstChild;
      expect(rootElement).toHaveClass('ring-2');
      expect(rootElement).toHaveClass('ring-success');
      expect(rootElement).toHaveClass('ring-offset-2');
      expect(rootElement).toHaveClass('ring-offset-background');
    });

    it('should not apply speaking styles when not speaking', () => {
      const { container } = render(
        <VideoTile displayName="John Doe" isSpeaking={false} />
      );

      const rootElement = container.firstChild;
      expect(rootElement).not.toHaveClass('ring-2');
    });

    it('should show speaking indicator bar at bottom', () => {
      render(<VideoTile displayName="John Doe" isSpeaking={true} />);

      const indicatorBar = document.querySelector('.bg-success\\/80');
      expect(indicatorBar).toBeInTheDocument();
    });
  });

  describe('Audio indicators', () => {
    it('should show MicOff icon when muted', () => {
      render(
        <VideoTile displayName="John Doe" isMuted={true} audioEnabled={true} />
      );

      expect(screen.getByLabelText('Muted')).toBeInTheDocument();
    });

    it('should show Mic icon for remote peer with audio enabled', () => {
      render(
        <VideoTile displayName="Alice" isLocal={false} isMuted={false} audioEnabled={true} />
      );

      expect(screen.getByLabelText('Speaking')).toBeInTheDocument();
    });

    it('should not show Mic icon for local user', () => {
      render(
        <VideoTile displayName="You" isLocal={true} isMuted={false} audioEnabled={true} />
      );

      expect(screen.queryByLabelText('Speaking')).not.toBeInTheDocument();
    });

    it('should show muted indicator when audioEnabled is false even if isMuted is false', () => {
      render(
        <VideoTile displayName="Bob" isMuted={false} audioEnabled={false} />
      );

      expect(screen.getByLabelText('Muted')).toBeInTheDocument();
    });
  });

  describe('Default props', () => {
    it('should default isLocal to false', () => {
      render(<VideoTile displayName="John Doe" />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('should default isMuted to false', () => {
      render(<VideoTile displayName="John Doe" audioEnabled={true} />);
      expect(screen.queryByLabelText('Muted')).not.toBeInTheDocument();
    });

    it('should default audioEnabled to true', () => {
      render(<VideoTile displayName="John Doe" isMuted={false} />);
      expect(screen.queryByLabelText('Muted')).not.toBeInTheDocument();
    });
  });

  describe('Conditional rendering', () => {
    it('should show avatar when no video tracks are enabled', () => {
      const stream = {
        getVideoTracks: vi.fn(() => [{ enabled: false }]),
      } as unknown as MediaStream;

      render(<VideoTile stream={stream} displayName="John Doe" />);
      expect(screen.getByText('JD')).toBeInTheDocument();
      expect(document.querySelectorAll('video')).toHaveLength(0);
    });

    it('should show avatar when video track is disabled', () => {
      const stream = {
        getVideoTracks: vi.fn(() => [{ enabled: false, kind: 'video' }]),
        getAudioTracks: vi.fn(() => []),
      } as unknown as MediaStream;

      render(<VideoTile stream={stream} displayName="Alice Smith" />);
      expect(screen.getByText('AS')).toBeInTheDocument();
      expect(document.querySelectorAll('video')).toHaveLength(0);
    });
  });
});
