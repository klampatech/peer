import { useEffect, useCallback, useRef } from 'react';
import { useRoomStore } from '../stores/room-store';
import { peerManager } from '../lib/webrtc/peer-manager';
import { getUserMedia, getDisplayMedia, toggleAudio, toggleVideo } from '../lib/webrtc/media';
import type { MediaStreamOptions } from '../lib/webrtc/media';

// Refs for callbacks to avoid dependency issues
const callbacksRef = {
  onPeerConnected: null as ((peerId: string, stream: MediaStream) => void) | null,
  onPeerDisconnected: null as ((peerId: string) => void) | null,
};

export interface UseWebRTCOptions {
  /** Automatically request media on mount */
  autoRequestMedia?: boolean;
  /** Media options for getUserMedia */
  mediaOptions?: MediaStreamOptions;
  /** Callback when remote peer connects */
  onPeerConnected?: (peerId: string, stream: MediaStream) => void;
  /** Callback when remote peer disconnects */
  onPeerDisconnected?: (peerId: string) => void;
}

export interface UseWebRTCReturn {
  /** Local media stream */
  localStream: MediaStream | null;
  /** Whether media is initialized */
  isMediaReady: boolean;
  /** Error if any */
  error: Error | null;
  /** Toggle audio */
  toggleMute: () => void;
  /** Toggle video */
  toggleCamera: () => void;
  /** Start screen sharing */
  startScreenShare: () => Promise<void>;
  /** Stop screen sharing */
  stopScreenShare: () => void;
  /** Reconnect to a specific peer */
  reconnectPeer: (peerId: string) => Promise<void>;
}

/**
 * React hook for managing WebRTC connections
 */
export function useWebRTC(options: UseWebRTCOptions = {}): UseWebRTCReturn {
  const {
    autoRequestMedia = false,
    mediaOptions = {},
    onPeerConnected,
    onPeerDisconnected,
  } = options;

  const errorRef = useRef<Error | null>(null);
  const stopScreenShareRef = useRef<() => void>(() => {});
  // Store previous stream to properly clean up tracks
  const previousStreamRef = useRef<MediaStream | null>(null);

  const {
    localStream,
    audioEnabled,
    videoEnabled,
    screenSharing,
    peers,
    isConnected,
    setLocalStream,
    setAudioEnabled,
    setVideoEnabled,
    setScreenSharing,
  } = useRoomStore();

  // Request media on mount if autoRequestMedia is true
  // Intentional empty deps - this should only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (autoRequestMedia && !localStream) {
      initializeMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.onPeerConnected = onPeerConnected ?? null;
    callbacksRef.onPeerDisconnected = onPeerDisconnected ?? null;
  }, [onPeerConnected, onPeerDisconnected]);

  // Initialize peer manager when connected
  useEffect(() => {
    if (isConnected && localStream) {
      peerManager.initialize(
        localStream,
        callbacksRef.onPeerConnected ?? undefined,
        callbacksRef.onPeerDisconnected ?? undefined
      );

      // Connect to existing peers
      peers.forEach((peer) => {
        peerManager.connectToPeer(peer.id);
      });
    }

    return () => {
      // Cleanup when disconnecting
      if (!isConnected) {
        peerManager.cleanup();
      }
    };
  }, [isConnected, localStream, peers]);

  // Note: New peers joining are handled via the peer-joined event in the store
  // No additional effect needed here

  /**
   * Initialize local media
   */
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await getUserMedia({
        audio: mediaOptions.audio ?? true,
        video: mediaOptions.video ?? true,
        resolution: mediaOptions.resolution ?? 'hd',
        noiseSuppression: mediaOptions.noiseSuppression ?? true,
        echoCancellation: mediaOptions.echoCancellation ?? true,
      });
      setLocalStream(stream);
      errorRef.current = null;
    } catch (err) {
      console.error('Failed to initialize media:', err);
      errorRef.current = err instanceof Error ? err : new Error('Failed to initialize media');
    }
  }, [mediaOptions, setLocalStream]);

  /**
   * Toggle mute (audio)
   */
  const toggleMute = useCallback(() => {
    const newState = !audioEnabled;
    toggleAudio(localStream, newState);
    setAudioEnabled(newState);
  }, [audioEnabled, localStream, setAudioEnabled]);

  /**
   * Toggle camera (video)
   */
  const toggleCamera = useCallback(() => {
    const newState = !videoEnabled;
    toggleVideo(localStream, newState);
    setVideoEnabled(newState);
  }, [videoEnabled, localStream, setVideoEnabled]);

  /**
   * Start screen sharing
   */
  const startScreenShare = useCallback(async () => {
    if (screenSharing) return;

    try {
      // Store current stream to stop its tracks when screen share ends
      if (localStream) {
        previousStreamRef.current = localStream;
      }

      const displayStream = await getDisplayMedia();

      // Replace video track in all peer connections
      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        await peerManager.replaceVideoTrack(videoTrack);

        // Handle when user stops sharing via browser UI
        videoTrack.onended = () => {
          stopScreenShareRef.current();
        };
      }

      // Update local store
      setLocalStream(displayStream);
      setScreenSharing(true);
    } catch (err) {
      console.error('Failed to start screen share:', err);
      throw err;
    }
  }, [screenSharing, localStream, setLocalStream, setScreenSharing]);

  /**
   * Stop screen sharing
   */
  const stopScreenShare = useCallback(async () => {
    if (!screenSharing) return;

    // Stop the display stream tracks to release resources
    // localStream is the display stream when screenSharing is true
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // Also stop the previous camera stream if it exists
    if (previousStreamRef.current) {
      previousStreamRef.current.getTracks().forEach((track) => track.stop());
      previousStreamRef.current = null;
    }

    // Get camera stream again
    const cameraStream = await getUserMedia({
      video: true,
      audio: false, // Keep audio from previous stream
    });

    // Replace screen share track with camera
    const videoTrack = cameraStream.getVideoTracks()[0];
    if (videoTrack) {
      await peerManager.replaceVideoTrack(videoTrack);
    }

    // Update local store
    setLocalStream(cameraStream);
    setScreenSharing(false);
  }, [screenSharing, localStream, setLocalStream, setScreenSharing]);

  // Update ref for stopScreenShare
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

  /**
   * Reconnect to a peer
   */
  const reconnectPeer = useCallback(async (peerId: string) => {
    peerManager.disconnectFromPeer(peerId);
    await peerManager.connectToPeer(peerId);
  }, []);

  return {
    localStream,
    isMediaReady: !!localStream,
    error: errorRef.current,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    reconnectPeer,
  };
}
