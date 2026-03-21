import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoomStore, connect, disconnect } from '../stores/room-store';
import Layout from '../components/Layout';

interface RoomPageProps {
  displayName: string;
}

export default function RoomPage({ displayName }: RoomPageProps) {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { localStream, peers, isConnected } = useRoomStore();

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }

    if (!displayName) {
      navigate('/');
      return;
    }

    // Connect to the room
    const connectToRoom = async () => {
      try {
        await connect(token, displayName);
        setIsConnecting(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect to room');
        setIsConnecting(false);
      }
    };

    connectToRoom();

    return () => {
      disconnect();
    };
  }, [token, displayName, navigate]);

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
      <div className="flex-1 p-4">
        {/* Video Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Local Video */}
          {localStream && (
            <div className="relative aspect-video bg-surface rounded-lg overflow-hidden">
              <video
                autoPlay
                muted
                playsInline
                ref={(el) => {
                  if (el) el.srcObject = localStream;
                }}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-sm">
                You {isConnected ? '' : '(Connecting...)'}
              </div>
            </div>
          )}

          {/* Remote Peers */}
          {peers.map((peer) => (
            <div key={peer.id} className="relative aspect-video bg-surface rounded-lg overflow-hidden">
              {peer.stream ? (
                <video
                  autoPlay
                  playsInline
                  ref={(el) => {
                    if (el && peer.stream) el.srcObject = peer.stream;
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-2xl font-bold">
                    {peer.displayName.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-sm">
                {peer.displayName}
              </div>
            </div>
          ))}

          {/* Empty State */}
          {peers.length === 0 && !localStream && (
            <div className="col-span-full text-center py-12 text-textMuted">
              <p>Waiting for others to join...</p>
              <p className="text-sm mt-2">Share the link to invite others</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
