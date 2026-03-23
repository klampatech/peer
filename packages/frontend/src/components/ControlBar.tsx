/* eslint-disable no-console */
import { useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  MessageSquare,
} from 'lucide-react';
import { useRoomStore, initializeMedia } from '../stores/room-store';
import { peerManager } from '../lib/webrtc/peer-manager';
import { getUserMedia } from '../lib/webrtc/media';

interface ControlBarProps {
  onLeave: () => void;
  onToggleChat?: () => void;
}

export default function ControlBar({ onLeave, onToggleChat }: ControlBarProps) {
  const {
    audioEnabled,
    videoEnabled,
    screenSharing,
    setAudioEnabled,
    setVideoEnabled,
    setScreenSharing,
    setLocalStream,
    localStream,
  } = useRoomStore();

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
    const newVideoState = !videoEnabled;

    // If enabling video and we have an existing stream without video, we need to re-enable the track
    if (newVideoState && localStream) {
      // Get the video track from the current stream
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack && !videoTrack.enabled) {
        // Enable the track and update all peer connections
        videoTrack.enabled = true;
        // Replace the track in all peer connections to ensure remote peers receive it
        await peerManager.replaceVideoTrack(videoTrack);
      }
      setVideoEnabled(true);
      return;
    }

    // If no stream exists, try to initialize media
    if (!localStream) {
      try {
        await initializeMedia(audioEnabled, true);
      } catch (err) {
        console.error('Failed to get video:', err);
      }
    }

    setVideoEnabled(newVideoState);
  };

  const cameraStreamRef = useRef<MediaStream | null>(null);

  const handleToggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen share - restore camera
      try {
        // Get camera stream
        const cameraStream = await getUserMedia({
          video: true,
          audio: false,
        });
        cameraStreamRef.current = cameraStream;

        // Replace video track in all peer connections
        const videoTrack = cameraStream.getVideoTracks()[0];
        if (videoTrack) {
          await peerManager.replaceVideoTrack(videoTrack);
        }

        // Update local store with camera stream
        setLocalStream(cameraStream);
        setScreenSharing(false);
      } catch (err) {
        console.error('Failed to stop screen share:', err);
      }
    } else {
      // Start screen share
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        // Save current camera stream for later restoration
        if (localStream) {
          cameraStreamRef.current = localStream;
        }

        // Replace video track in all peer connections
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
          await peerManager.replaceVideoTrack(videoTrack);
        }

        // Update local store with screen stream
        setLocalStream(screenStream);
        setScreenSharing(true);

        // Handle user stopping screen share via browser UI
        if (videoTrack) {
          videoTrack.onended = async () => {
          console.log('Screen share stopped via browser UI');
          // Restore camera
          try {
            const cameraStream = await getUserMedia({
              video: true,
              audio: false,
            });
            const cameraVideoTrack = cameraStream.getVideoTracks()[0];
            if (cameraVideoTrack) {
              await peerManager.replaceVideoTrack(cameraVideoTrack);
            }
            setLocalStream(cameraStream);
            setScreenSharing(false);
          } catch (err) {
            console.error('Failed to restore camera after screen share:', err);
          }
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
        onClick={onToggleChat}
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
