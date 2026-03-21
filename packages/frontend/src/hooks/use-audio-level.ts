import { useEffect, useRef, useState, useCallback } from 'react';
import { useRoomStore } from '../stores/room-store';

/**
 * Configuration options for audio level detection
 */
export interface UseAudioLevelOptions {
  /** Minimum audio level (0-1) to be considered speaking */
  speakingThreshold?: number;
  /** How often to sample audio levels in ms */
  samplingInterval?: number;
  /** Smoothing factor for audio level (0 = no smoothing, 1 = maximum smoothing) */
  smoothingFactor?: number;
}

/**
 * Return type for the useAudioLevel hook
 */
export interface UseAudioLevelReturn {
  /** Whether the audio source is currently considered speaking */
  isSpeaking: boolean;
  /** Current audio level (0-1, where 1 is loudest) */
  audioLevel: number;
}

/**
 * Default configuration values
 */
const DEFAULT_SPEAKING_THRESHOLD = 0.02;
const DEFAULT_SAMPLING_INTERVAL = 50;
const DEFAULT_SMOOTHING_FACTOR = 0.8;

/**
 * React hook for detecting audio levels and speaking state from a MediaStream.
 *
 * Uses the Web Audio API to analyze audio input levels and determine if
 * the user is speaking based on a configurable threshold.
 *
 * @example
 * ```tsx
 * function MicrophoneIndicator() {
 *   const { isSpeaking, audioLevel } = useAudioLevel();
 *
 *   return (
 *     <div>
 *       <span>{isSpeaking ? 'Speaking' : 'Silent'}</span>
 *       <div style={{ width: `${audioLevel * 100}%` }} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useAudioLevel(
  options: UseAudioLevelOptions = {}
): UseAudioLevelReturn {
  const {
    speakingThreshold = DEFAULT_SPEAKING_THRESHOLD,
    samplingInterval = DEFAULT_SAMPLING_INTERVAL,
    smoothingFactor = DEFAULT_SMOOTHING_FACTOR,
  } = options;

  const localStream = useRoomStore((state) => state.localStream);

  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smoothedLevelRef = useRef<number>(0);

  /**
   * Calculate the RMS (Root Mean Square) of audio data for speaking detection
   */
  const calculateRMS = useCallback((dataArray: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const value = dataArray[i];
      if (value !== undefined) {
        sum += value * value;
      }
    }
    return Math.sqrt(sum / dataArray.length);
  }, []);

  /**
   * Analyze audio levels and update speaking state
   */
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(dataArray);

    // Calculate RMS level
    const rms = calculateRMS(dataArray);

    // Apply smoothing to avoid flickering
    const smoothedLevel =
      smoothingFactor * smoothedLevelRef.current +
      (1 - smoothingFactor) * rms;

    smoothedLevelRef.current = smoothedLevel;

    // Determine speaking state based on threshold
    const speaking = smoothedLevel > speakingThreshold;

    // Update state for React reactivity (throttled via samplingInterval)
    setAudioLevel(smoothedLevel);
    setIsSpeaking(speaking);

    // Schedule next analysis
    timeoutRef.current = setTimeout(analyzeAudio, samplingInterval);
  }, [speakingThreshold, smoothingFactor, samplingInterval, calculateRMS]);

  /**
   * Initialize audio analysis pipeline
   */
  const initializeAudio = useCallback(() => {
    if (!localStream) return;

    // Get audio track from stream
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    // Create audio context (with webkit prefix fallback for Safari)
    const AudioContextClass =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext: typeof AudioContext;
        }
      ).webkitAudioContext;
    audioContextRef.current = new AudioContextClass();

    // Create analyser node
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048;
    analyserRef.current.smoothingTimeConstant = 0.3;

    // Create source from stream
    sourceRef.current = audioContextRef.current.createMediaStreamSource(localStream);
    sourceRef.current.connect(analyserRef.current);

    // Start analysis
    analyzeAudio();
  }, [localStream, analyzeAudio]);

  /**
   * Cleanup audio analysis resources
   */
  const cleanupAudio = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    analyserRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Reset state
    smoothedLevelRef.current = 0;
    setAudioLevel(0);
    setIsSpeaking(false);
  }, []);

  // Initialize audio when stream becomes available
  useEffect(() => {
    if (localStream) {
      initializeAudio();
    } else {
      cleanupAudio();
    }

    return cleanupAudio;
  }, [localStream, initializeAudio, cleanupAudio]);

  return {
    isSpeaking,
    audioLevel,
  };
}
