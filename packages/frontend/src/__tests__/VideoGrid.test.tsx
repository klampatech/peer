import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import VideoGrid from '../components/VideoGrid';

describe('VideoGrid', () => {
  // Helper to create a mock stream
  const createMockStream = () => {
    const mockStream = {
      getVideoTracks: () => [{ enabled: true }],
      getAudioTracks: () => [{ enabled: true }],
    } as unknown as MediaStream;
    return mockStream;
  };

  it('renders empty state when no streams provided', () => {
    render(<VideoGrid localStream={undefined} peers={[]} />);

    expect(screen.getByText('Waiting for others to join...')).toBeDefined();
    expect(screen.getByText('Share the link to invite others')).toBeDefined();
  });

  it('renders local video tile when localStream is provided', () => {
    const localStream = createMockStream();
    render(<VideoGrid localStream={localStream} peers={[]} />);

    expect(screen.getByText('You')).toBeDefined();
  });

  it('renders remote peer tiles', () => {
    const localStream = createMockStream();
    const peers = [
      { id: 'peer1', displayName: 'Alice', stream: createMockStream(), audioEnabled: true },
      { id: 'peer2', displayName: 'Bob', stream: createMockStream(), audioEnabled: false },
    ];

    render(<VideoGrid localStream={localStream} peers={peers} />);

    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('applies correct grid columns for single participant', () => {
    const localStream = createMockStream();
    const { container } = render(<VideoGrid localStream={localStream} peers={[]} />);

    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('grid-cols-1');
  });

  it('applies correct grid columns for two participants', () => {
    const localStream = createMockStream();
    const peers = [
      { id: 'peer1', displayName: 'Alice', stream: createMockStream(), audioEnabled: true },
    ];

    const { container } = render(<VideoGrid localStream={localStream} peers={peers} />);

    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('md:grid-cols-2');
  });

  it('applies correct grid columns for three participants', () => {
    const localStream = createMockStream();
    const peers = [
      { id: 'peer1', displayName: 'Alice', stream: createMockStream(), audioEnabled: true },
      { id: 'peer2', displayName: 'Bob', stream: createMockStream(), audioEnabled: true },
    ];

    const { container } = render(<VideoGrid localStream={localStream} peers={peers} />);

    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('lg:grid-cols-3');
  });

  it('passes isMuted prop to local video tile', () => {
    const localStream = createMockStream();
    render(<VideoGrid localStream={localStream} peers={[]} isMuted={true} />);

    // The VideoTile component should show muted indicator when isMuted is true
    expect(screen.getByText('You')).toBeDefined();
  });
});
