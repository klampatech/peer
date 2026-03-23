import VideoTile from './VideoTile';

interface Peer {
  id: string;
  displayName: string;
  stream?: MediaStream;
  audioEnabled?: boolean;
}

interface VideoGridProps {
  /** Local user's media stream */
  localStream?: MediaStream;
  /** List of remote peers */
  peers: Peer[];
  /** Whether local audio is enabled */
  isMuted?: boolean;
  /** Whether the local user is currently speaking (audio level detection) */
  isLocalSpeaking?: boolean;
}

/**
 * VideoGrid displays the local video and all remote peer videos in a responsive grid.
 * The grid layout automatically adjusts based on the number of participants.
 */
export default function VideoGrid({
  localStream,
  peers,
  isMuted = false,
  isLocalSpeaking = false,
}: VideoGridProps) {
  const participantCount = peers.length + (localStream ? 1 : 0);

  // Determine grid columns based on participant count
  const getGridColumns = () => {
    if (participantCount <= 1) return 'grid-cols-1';
    if (participantCount === 2) return 'grid-cols-1 md:grid-cols-2';
    if (participantCount === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  // Empty state - waiting for others
  if (participantCount === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
        <div className="text-center">
          {/* Animated ring spinner */}
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-2 border-primary/30 rounded-full" />
            <div className="absolute inset-0 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-textSecondary text-lg">Waiting for others to join...</p>
          <p className="text-textMuted text-sm mt-2">Share the link to invite others</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid ${getGridColumns()} gap-4 p-4 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-purple-500/5`} role="region" aria-label="Video grid">
      {/* Local Video Tile */}
      {localStream && (
        <VideoTile
          stream={localStream}
          displayName="You"
          isLocal={true}
          isMuted={isMuted}
          audioEnabled={!isMuted}
          isSpeaking={isLocalSpeaking}
        />
      )}

      {/* Remote Peer Video Tiles */}
      {peers.map((peer) => (
        <VideoTile
          key={peer.id}
          stream={peer.stream}
          displayName={peer.displayName}
          isMuted={!peer.audioEnabled}
          audioEnabled={peer.audioEnabled}
        />
      ))}
    </div>
  );
}
