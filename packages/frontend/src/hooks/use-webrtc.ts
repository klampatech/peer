import { useEffect, useCallback, useRef } from 'react';
import { useRoomStore } from '../stores/room-store';
import { peerManager } from '../lib/webrtc/peer-manager';
import { getUserMedia, getDisplayMedia, toggleAudio, toggleVideo } from '../lib/webrtc/media';
import type { MediaStreamOptions } from '../lib/webrtc/media';

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
  useEffect(() => {
    if (autoRequestMedia && !localStream) {
      initializeMedia();
    }
  }, []);

  // Initialize peer manager when connected
  useEffect(() => {
    if (isConnected && localStream) {
      peerManager.initialize(
        localStream,
        onPeerConnected ?? undefined,
        onPeerDisconnected ?? undefined
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

  // Handle new peers joining
  useEffect(() => {
    if (isConnected && localStream) {
      // New peers are handled via the peer-joined event in the store
      // We need to initiate connection to them
    }
  }, [peers]);

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
      const displayStream = await getDisplayMedia();

      // Replace video track in all peer connections
      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        await peerManager.replaceVideoTrack(videoTrack);

        // Handle when user stops sharing via browser UI
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }

      // Update local store
      setLocalStream(displayStream);
      setScreenSharing(true);
    } catch (err) {
      console.error('Failed to start screen share:', err);
      throw err;
    }
  }, [screenSharing, setLocalStream, setScreenSharing]);

  /**
   * Stop screen sharing
   */
  const stopScreenShare = useCallback(async () => {
    if (!screenSharing) return;

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
  }, [screenSharing, setLocalStream, setScreenSharing]);

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
