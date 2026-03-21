export interface MediaConstraints {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
}

export interface MediaStreamOptions {
  audio?: boolean;
  video?: boolean;
  /**
   * Preferred video resolution
   * @default 'hd'
   */
  resolution?: 'qvga' | 'vga' | 'hd' | 'hd+' | 'fullhd';
  /**
   * Enable noise suppression
   * @default true
   */
  noiseSuppression?: boolean;
  /**
   * Enable echo cancellation
   * @default true
   */
  echoCancellation?: boolean;
}

/**
 * Get video constraints based on resolution preset
 */
function getVideoConstraints(resolution: MediaStreamOptions['resolution'] = 'hd'): MediaTrackConstraints {
  const defaultConstraints: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };

  const constraints: Record<string, MediaTrackConstraints> = {
    qqvga: { width: { ideal: 160 }, height: { ideal: 120 } },
    vga: { width: { ideal: 640 }, height: { ideal: 480 } },
    hd: defaultConstraints,
    'hd+': { width: { ideal: 1600 }, height: { ideal: 900 } },
    fullhd: { width: { ideal: 1920 }, height: { ideal: 1080 } },
  };

  return constraints[resolution] ?? defaultConstraints;
}

/**
 * Get audio constraints
 */
function getAudioConstraints(options: MediaStreamOptions = {}): MediaTrackConstraints | boolean {
  if (options.audio === false) return false;

  return {
    echoCancellation: options.echoCancellation ?? true,
    noiseSuppression: options.noiseSuppression ?? true,
    autoGainControl: true,
  };
}

/**
 * Get user media stream with specified options
 */
export async function getUserMedia(options: MediaStreamOptions = {}): Promise<MediaStream> {
  const constraints: MediaConstraints = {
    audio: options.audio !== false ? getAudioConstraints(options) : false,
    video: options.video !== false ? getVideoConstraints(options.resolution) : false,
  };

  console.log('Requesting media with constraints:', constraints);

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('Got local media stream:', stream.id);
    return stream;
  } catch (error) {
    console.error('Failed to get user media:', error);
    throw error;
  }
}

/**
 * Detect if running on iOS (iPhone, iPad, iPod)
 */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua);
}

/**
 * Get display media (screen sharing)
 * Handles iOS Safari limitations gracefully
 */
export async function getDisplayMedia(): Promise<MediaStream> {
  const isIOSDevice = isIOS();

  try {
    // On iOS Safari, only 'browser' surface is supported
    // On desktop, prefer 'monitor' for full screen capture
    const displaySurface = isIOSDevice ? 'browser' : 'monitor';

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    console.log('Got display media stream:', stream.id);

    // Handle user stopping screen share via browser UI
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        console.log('Screen share stopped via browser UI');
      };
    }

    return stream;
  } catch (error) {
    // Check if user denied permission
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
        console.log('Screen share cancelled or denied by user');

        // On iOS, provide more helpful message
        if (isIOSDevice) {
          console.log('Note: iOS Safari has limited screen sharing support');
        }
      }
    }

    console.error('Failed to get display media:', error);
    throw error;
  }
}

/**
 * Check if screen sharing is supported on current platform
 */
export function isScreenShareSupported(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}

/**
 * Check if screen sharing is fully supported (not limited on iOS)
 */
export function isScreenShareFullySupported(): boolean {
  // iOS has limited support
  if (isIOS()) {
    return false;
  }
  return isScreenShareSupported();
}

/**
 * Stop all tracks in a media stream
 */
export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return;

  stream.getTracks().forEach((track) => {
    track.stop();
  });

  console.log('Stopped media stream:', stream.id);
}

/**
 * Toggle audio track
 */
export function toggleAudio(stream: MediaStream | null, enabled: boolean): void {
  if (!stream) return;

  stream.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });

  console.log('Audio', enabled ? 'enabled' : 'disabled');
}

/**
 * Toggle video track
 */
export function toggleVideo(stream: MediaStream | null, enabled: boolean): void {
  if (!stream) return;

  stream.getVideoTracks().forEach((track) => {
    track.enabled = enabled;
  });

  console.log('Video', enabled ? 'enabled' : 'disabled');
}

/**
 * Check if media permissions are granted
 */
export async function checkMediaPermissions(): Promise<{
  audio: PermissionState;
  video: PermissionState;
}> {
  try {
    const [audioPermission, videoPermission] = await Promise.all([
      navigator.permissions.query({ name: 'microphone' as PermissionName }),
      navigator.permissions.query({ name: 'camera' as PermissionName }),
    ]);

    return {
      audio: audioPermission.state,
      video: videoPermission.state,
    };
  } catch {
    // Permissions API not supported, return unknown
    return {
      audio: 'prompt',
      video: 'prompt',
    };
  }
}

/**
 * Enumerate available media devices
 */
export async function getAvailableDevices(): Promise<{
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
}> {
  const devices = await navigator.mediaDevices.enumerateDevices();

  return {
    audioInputs: devices.filter((d) => d.kind === 'audioinput'),
    videoInputs: devices.filter((d) => d.kind === 'videoinput'),
    audioOutputs: devices.filter((d) => d.kind === 'audiooutput'),
  };
}
