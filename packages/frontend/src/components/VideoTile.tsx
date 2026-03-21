import { useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VideoTileProps {
  /** The video/audio stream (optional) */
  stream?: MediaStream;
  /** Peer's display name */
  displayName: string;
  /** Whether this is the local user */
  isLocal?: boolean;
  /** Whether audio is muted */
  isMuted?: boolean;
  /** Whether peer is currently speaking */
  isSpeaking?: boolean;
  /** Whether audio is enabled */
  audioEnabled?: boolean;
}

/**
 * VideoTile displays a peer's video stream with avatar fallback,
 * name label, and speaking/muted indicators.
 */
export default function VideoTile({
  stream,
  displayName,
  isLocal = false,
  isMuted = false,
  isSpeaking = false,
  audioEnabled = true,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach stream to video element when stream changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream ?? null;
  }, [stream]);

  // Determine if we should show video
  const hasVideo = stream?.getVideoTracks().some((track) => track.enabled) ?? false;

  // Get initials for avatar
  const initials = displayName
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`
        relative aspect-video rounded-lg overflow-hidden
        bg-surface transition-all duration-200
        ${isSpeaking ? 'ring-2 ring-success ring-offset-2 ring-offset-background' : ''}
      `}
    >
      {/* Video Element */}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
          aria-label={isLocal ? 'Your video' : `${displayName}'s video`}
        />
      ) : (
        /* Avatar Placeholder */
        <div className="w-full h-full flex items-center justify-center bg-surface">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-white">
            {initials}
          </div>
        </div>
      )}

      {/* Name Label Overlay */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        <div className="bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-sm text-textPrimary">
          {isLocal ? 'You' : displayName}
        </div>

        {/* Muted Indicator */}
        {(isMuted || !audioEnabled) && (
          <div className="bg-error/90 backdrop-blur-sm p-1 rounded-full" aria-label="Muted">
            <MicOff className="w-3 h-3 text-white" />
          </div>
        )}

        {/* Audio Enabled but not muted indicator */}
        {audioEnabled && !isMuted && !isLocal && (
          <div className="bg-success/90 backdrop-blur-sm p-1 rounded-full" aria-label="Speaking">
            <Mic className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Speaking Indicator Overlay */}
      {isSpeaking && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-success/80">
          <div className="absolute inset-0 bg-success animate-pulse opacity-75" />
        </div>
      )}
    </div>
  );
}