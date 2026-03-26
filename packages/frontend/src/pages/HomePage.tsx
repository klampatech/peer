import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Video, Copy, Check } from 'lucide-react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface HomePageProps {
  displayName: string;
  onDisplayNameChange: (name: string) => void;
}

export default function HomePage({ displayName, onDisplayNameChange }: HomePageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isCreating, setIsCreating] = useState(false);
  const [joinToken, setJoinToken] = useState('');
  const [copied, setCopied] = useState(false);

  // Check for ?room= query parameter and auto-redirect to room
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && roomParam.trim()) {
      // Auto-redirect to the room
      navigate(`/room/${roomParam.trim()}`);
    }
  }, [searchParams, navigate]);

  const handleCreateRoom = async () => {
    if (!displayName.trim()) {
      alert('Please enter your name');
      return;
    }

    setIsCreating(true);
    try {
      // Connect to Socket.IO and create the room on the server
      // Use a generous timeout for CI environments and disable reconnection
      // so we fail fast instead of retrying in the background
      const socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        timeout: 15000,
        reconnection: false,
      });

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          resolve();
        });
        socket.on('connect_error', () => {
          reject(new Error('Failed to connect'));
        });
        // Timeout after 15 seconds to match socket timeout
        setTimeout(() => reject(new Error('Connection timeout')), 15000);
      });

      // Create the room
      const token = await new Promise<string>((resolve, reject) => {
        socket.emit('room:create', { displayName }, (response: { success: boolean; data?: { token: string }; error?: { message: string } }) => {
          if (response.success && response.data?.token) {
            resolve(response.data.token);
          } else {
            reject(new Error(response.error?.message || 'Failed to create room'));
          }
        });
        // Timeout after 15 seconds for room creation
        setTimeout(() => reject(new Error('Room creation timeout')), 15000);
      });

      // Leave the room so it persists for RoomPage to join
      // Important: The creator socket was added to the room by room:create, so we must
      // leave it before disconnecting. Otherwise, the disconnect handler will remove
      // the peer and delete the room since it was the only peer.
      await new Promise<void>((resolve) => {
        socket.emit('room:leave', { token }, (response: { success: boolean; error?: { message: string } }) => {
          if (response.success) {
            resolve();
          } else {
            // Non-fatal: room might already be empty, just log and continue
            console.warn('room:leave warning:', response.error?.message);
            resolve();
          }
        });
        // Timeout after 2 seconds
        setTimeout(() => {
          console.warn('room:leave timeout, continuing anyway');
          resolve();
        }, 2000);
      });

      // Disconnect the temporary socket - RoomPage will create its own connection
      socket.disconnect();

      // Navigate to the room
      navigate(`/room/${token}`);
    } catch (error) {
      console.error('Failed to create room:', error);
      alert(error instanceof Error ? error.message : 'Failed to create room. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    if (!displayName.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!joinToken.trim()) {
      alert('Please enter a room token');
      return;
    }
    navigate(`/room/${joinToken}`);
  };

  const handleShareLink = async () => {
    const token = crypto.randomUUID();
    // Use query param format so landing page can parse and redirect
    const link = `${window.location.origin}/?room=${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-purple-500/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent animate-pulse" style={{ animationDuration: '6s' }} />

      <div className="w-full max-w-md relative z-10">
        {/* Logo/Header */}
        <div className="text-center mb-8 relative">
          {/* Pulsing ring behind logo */}
          <div className="absolute inset-0 m-auto w-20 h-20 rounded-2xl bg-primary/30 animate-ping" style={{ animationDuration: '2s' }} />
          <div className="relative inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary to-purple-500 rounded-2xl mb-4 shadow-lg shadow-primary/30">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-textPrimary mb-2">Peer</h1>
          <p className="text-textSecondary">P2P Video Calls in Your Browser</p>
        </div>

        {/* Name Input */}
        <div className="card mb-6">
          <label htmlFor="displayName" className="block text-sm font-medium text-textSecondary mb-2">
            Your Name
          </label>
          <input
            id="displayName"
            type="text"
            className="input"
            placeholder="Enter your name"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            maxLength={50}
          />
        </div>

        {/* Create Room */}
        <button
          onClick={handleCreateRoom}
          disabled={isCreating}
          className="btn btn-primary w-full mb-4 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/25 transition-all duration-200"
        >
          <Video className="w-4 h-4 mr-2" />
          {isCreating ? 'Creating...' : 'Create New Room'}
        </button>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-background text-textMuted">or</span>
          </div>
        </div>

        {/* Join Room */}
        <div className="card">
          <label htmlFor="joinToken" className="block text-sm font-medium text-textSecondary mb-2">
            Join Existing Room
          </label>
          <div className="flex gap-2">
            <input
              id="joinToken"
              type="text"
              className="input flex-1"
              placeholder="Paste room token"
              value={joinToken}
              onChange={(e) => setJoinToken(e.target.value)}
            />
            <button onClick={handleJoinRoom} className="btn btn-secondary hover:scale-105 hover:shadow-md transition-all duration-200">
              Join
            </button>
          </div>
        </div>

        {/* Copy Link */}
        <div className="mt-6 text-center">
          <button
            onClick={handleShareLink}
            className="btn btn-secondary text-sm hover:scale-105 hover:shadow-md transition-all duration-200"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Link Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy Invite Link
              </>
            )}
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-sm text-textMuted">
        <p>End-to-end encrypted • No account required • Free</p>
      </footer>
    </div>
  );
}
