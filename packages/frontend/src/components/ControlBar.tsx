import { useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  MessageSquare,
} from 'lucide-react';
import { useRoomStore, initializeMedia, cleanupMedia } from '../stores/room-store';

interface ControlBarProps {
  onLeave: () => void;
}

export default function ControlBar({ onLeave }: ControlBarProps) {
  const {
    audioEnabled,
    videoEnabled,
    screenSharing,
    setAudioEnabled,
    setVideoEnabled,
    setScreenSharing,
    localStream,
  } = useRoomStore();

  const [showChat, setShowChat] = useState(false);

  const handleToggleAudio = async () => {
    if (!localStream) {
      try {
        await initializeMedia(true, videoEnabled);
      } catch (err) {
        console.error('Failed to get audio:', err);
      }
    }
    setAudioEnabled(!audioEnabled);
  };

  const handleToggleVideo = async () => {
    if (!localStream) {
      try {
        await initializeMedia(audioEnabled, true);
      } catch (err) {
        console.error('Failed to get video:', err);
      }
    }
    setVideoEnabled(!videoEnabled);
  };

  const handleToggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen share
      setScreenSharing(false);
      // Re-initialize camera
      try {
        cleanupMedia();
        await initializeMedia(audioEnabled, videoEnabled);
      } catch (err) {
        console.error('Failed to re-initialize camera:', err);
      }
    } else {
      // Start screen share
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        setScreenSharing(true);

        // Handle user stopping screen share via browser UI
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            setScreenSharing(false);
            initializeMedia(audioEnabled, videoEnabled);
          };
        }
      } catch (err) {
        console.error('Failed to start screen share:', err);
      }
    }
  };

  return (
    <div className="h-16 border-t border-border bg-surface flex items-center justify-center px-4 gap-4">
      {/* Mute Button */}
      <button
        onClick={handleToggleAudio}
        className={`btn ${audioEnabled ? 'bg-surfaceHover text-textPrimary' : 'bg-error text-white'} rounded-full w-12 h-12`}
        aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      {/* Video Button */}
      <button
        onClick={handleToggleVideo}
        className={`btn ${videoEnabled ? 'bg-surfaceHover text-textPrimary' : 'bg-error text-white'} rounded-full w-12 h-12`}
        aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
      >
        {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </button>

      {/* Screen Share Button */}
      <button
        onClick={handleToggleScreenShare}
        className={`btn ${screenSharing ? 'bg-primary text-white' : 'bg-surfaceHover text-textPrimary'} rounded-full w-12 h-12`}
        aria-label={screenSharing ? 'Stop screen share' : 'Share screen'}
      >
        <Monitor className="w-5 h-5" />
      </button>

      {/* Chat Button */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="btn bg-surfaceHover text-textPrimary rounded-full w-12 h-12"
        aria-label="Toggle chat"
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      {/* Leave Button */}
      <button
        onClick={onLeave}
        className="btn bg-error text-white rounded-full w-12 h-12"
        aria-label="Leave call"
      >
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  );
}
