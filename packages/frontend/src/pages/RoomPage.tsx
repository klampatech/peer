import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoomStore, connect, disconnect } from '../stores/room-store';
import { useAudioLevel } from '../hooks/use-audio-level';
import Layout from '../components/Layout';
import VideoGrid from '../components/VideoGrid';

interface RoomPageProps {
  displayName: string;
}

export default function RoomPage({ displayName }: RoomPageProps) {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { localStream, peers, audioEnabled } = useRoomStore();

  // Audio level detection for speaking indicator
  const { isSpeaking: isLocalSpeaking } = useAudioLevel();

  // Synchronous check at render time - before any async behavior
  // Handles direct URL navigation where App.tsx's useEffect may not have populated the prop yet
  const savedDisplayName = sessionStorage.getItem('peer_display_name');
  const effectiveDisplayName = displayName || savedDisplayName;

  useEffect(() => {
    // Guard: redirect immediately if no displayName available
    if (!effectiveDisplayName) {
      window.location.href = '/';
      return;
    }

    if (!token) {
      navigate('/');
      return;
    }

    // Connect to the room
    const connectToRoom = async () => {
      try {
        await connect(token, effectiveDisplayName);
        setIsConnecting(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect to room');
        setIsConnecting(false);
      }
    };

    connectToRoom();

    // Don't disconnect on cleanup - this handles React StrictMode double-mounting
    // The socket will be reused if already connected
    return () => {
      // Intentionally empty - let the socket persist across remounts
    };
  }, [token, effectiveDisplayName, navigate]);

  const handleLeave = () => {
    disconnect();
    navigate('/');
  };

  if (isConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-textSecondary">Connecting to room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md p-6">
          <h2 className="text-xl font-semibold text-error mb-2">Connection Error</h2>
          <p className="text-textSecondary mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout onLeave={handleLeave}>
      <VideoGrid
        localStream={localStream ?? undefined}
        peers={peers}
        isMuted={!audioEnabled}
        isLocalSpeaking={isLocalSpeaking}
      />
    </Layout>
  );
}
