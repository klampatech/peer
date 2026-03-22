import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import VideoGrid from '../components/VideoGrid';

// Helper to create a mock stream
const createMockStream = () => {
  const mockStream = {
    getVideoTracks: () => [{ enabled: true, kind: 'video' as const }],
    getAudioTracks: () => [{ enabled: true, kind: 'audio' as const }],
    getTracks: () => [
      { enabled: true, kind: 'video' as const },
      { enabled: true, kind: 'audio' as const },
    ],
  };
  return mockStream as unknown as MediaStream;
};

describe('VideoGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty state', () => {
    it('should show empty state message when no streams and no peers', () => {
      render(<VideoGrid localStream={undefined} peers={[]} />);

      expect(screen.getByText('Waiting for others to join...')).toBeInTheDocument();
      expect(screen.getByText('Share the link to invite others')).toBeInTheDocument();
    });

    it('should show empty state with flex center layout', () => {
      const { container } = render(<VideoGrid localStream={undefined} peers={[]} />);

      const wrapper = container.querySelector('.flex-1');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper).toHaveClass('flex');
      expect(wrapper).toHaveClass('items-center');
      expect(wrapper).toHaveClass('justify-center');
    });

    it('should use muted text color for empty state', () => {
      const { container } = render(<VideoGrid localStream={undefined} peers={[]} />);

      const message = container.querySelector('.text-textMuted');
      expect(message).toBeInTheDocument();
    });
  });

  describe('Grid layout', () => {
    it('should have grid class on the grid container', () => {
      const localStream = createMockStream();
      const { container } = render(<VideoGrid localStream={localStream} peers={[]} />);

      const grid = container.querySelector('.grid');
      expect(grid).toBeInTheDocument();
    });

    it('should have gap-4 and p-4 on the grid', () => {
      const localStream = createMockStream();
      const { container } = render(<VideoGrid localStream={localStream} peers={[]} />);

      const grid = container.querySelector('.grid');
      expect(grid).toHaveClass('gap-4');
      expect(grid).toHaveClass('p-4');
    });

    it('should have correct role and aria-label', () => {
      const localStream = createMockStream();
      const { container } = render(<VideoGrid localStream={localStream} peers={[]} />);

      const grid = container.querySelector('[role="region"]');
      expect(grid).toBeInTheDocument();
      expect(grid?.getAttribute('aria-label')).toBe('Video grid');
    });
  });

  describe('Grid columns responsive', () => {
    it('should use grid-cols-1 for 1 participant (local only)', () => {
      const localStream = createMockStream();
      const { container } = render(<VideoGrid localStream={localStream} peers={[]} />);

      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('grid-cols-1');
      expect(grid?.className).not.toContain('md:grid-cols-2');
    });

    it('should use md:grid-cols-2 for 2 participants', () => {
      const localStream = createMockStream();
      const peers = [
        { id: 'peer1', displayName: 'Alice', stream: createMockStream(), audioEnabled: true },
      ];

      const { container } = render(<VideoGrid localStream={localStream} peers={peers} />);

      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('grid-cols-1');
      expect(grid?.className).toContain('md:grid-cols-2');
    });

    it('should use lg:grid-cols-3 for 3 participants', () => {
      const localStream = createMockStream();
      const peers = [
        { id: 'peer1', displayName: 'Alice', stream: createMockStream(), audioEnabled: true },
        { id: 'peer2', displayName: 'Bob', stream: createMockStream(), audioEnabled: true },
      ];

      const { container } = render(<VideoGrid localStream={localStream} peers={peers} />);

      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('lg:grid-cols-3');
    });

    it('should use xl:grid-cols-4 for 4+ participants', () => {
      const localStream = createMockStream();
      const peers = [
        { id: 'peer1', displayName: 'Alice', stream: createMockStream(), audioEnabled: true },
        { id: 'peer2', displayName: 'Bob', stream: createMockStream(), audioEnabled: true },
        { id: 'peer3', displayName: 'Charlie', stream: createMockStream(), audioEnabled: true },
      ];

      const { container } = render(<VideoGrid localStream={localStream} peers={peers} />);

      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('xl:grid-cols-4');
    });
  });

  describe('Local video tile', () => {
    it('should render local video tile when localStream is provided', () => {
      const localStream = createMockStream();
      render(<VideoGrid localStream={localStream} peers={[]} />);

      expect(screen.getByText('You')).toBeInTheDocument();
    });

    it('should pass isMuted prop to local VideoTile', () => {
      const localStream = createMockStream();
      render(<VideoGrid localStream={localStream} peers={[]} isMuted={true} />);

      expect(screen.getByLabelText('Muted')).toBeInTheDocument();
    });
  });

  describe('Remote peer tiles', () => {
    it('should render one VideoTile per remote peer', () => {
      const localStream = createMockStream();
      const peers = [
        { id: 'peer1', displayName: 'Alice', stream: createMockStream(), audioEnabled: true },
        { id: 'peer2', displayName: 'Bob', stream: createMockStream(), audioEnabled: false },
        { id: 'peer3', displayName: 'Charlie', stream: createMockStream(), audioEnabled: true },
      ];

      const { container } = render(<VideoGrid localStream={localStream} peers={peers} />);

      const tiles = container.querySelectorAll('.aspect-video');
      expect(tiles.length).toBe(4);
    });

    it('should render peer display names', () => {
      const localStream = createMockStream();
      const peers = [
        { id: 'peer1', displayName: 'Alice', stream: createMockStream(), audioEnabled: true },
        { id: 'peer2', displayName: 'Bob', stream: createMockStream(), audioEnabled: true },
      ];

      render(<VideoGrid localStream={localStream} peers={peers} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('should handle undefined peer stream', () => {
      const localStream = createMockStream();
      const peers = [
        { id: 'peer1', displayName: 'Alice', stream: undefined, audioEnabled: true },
      ];

      render(<VideoGrid localStream={localStream} peers={peers} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('should handle many peers', () => {
      const localStream = createMockStream();
      const peers = Array.from({ length: 10 }, (_, i) => ({
        id: `peer${i}`,
        displayName: `User ${i}`,
        stream: createMockStream(),
        audioEnabled: true,
      }));

      const { container } = render(<VideoGrid localStream={localStream} peers={peers} />);

      const tiles = container.querySelectorAll('.aspect-video');
      expect(tiles.length).toBe(11);
    });
  });

  describe('isMuted prop handling', () => {
    it('should default isMuted to false', () => {
      const localStream = createMockStream();
      render(<VideoGrid localStream={localStream} peers={[]} />);

      expect(screen.queryByLabelText('Muted')).not.toBeInTheDocument();
    });

    it('should apply isMuted to local tile only', () => {
      const localStream = createMockStream();
      const peers = [
        { id: 'peer1', displayName: 'Alice', stream: createMockStream(), audioEnabled: true },
      ];

      render(<VideoGrid localStream={localStream} peers={peers} isMuted={true} />);

      expect(screen.getAllByLabelText('Muted')).toHaveLength(1);
    });
  });
});
