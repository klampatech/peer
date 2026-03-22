import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Copy, Check } from 'lucide-react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface HomePageProps {
  displayName: string;
  onDisplayNameChange: (name: string) => void;
}

export default function HomePage({ displayName, onDisplayNameChange }: HomePageProps) {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [joinToken, setJoinToken] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCreateRoom = async () => {
    if (!displayName.trim()) {
      alert('Please enter your name');
      return;
    }

    setIsCreating(true);
    try {
      // Check if backend is available
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/health`);
      if (!response.ok) {
        alert('Server is not available. Please try again later.');
        setIsCreating(false);
        return;
      }

      // Connect to Socket.IO and create the room on the server
      const socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
      });

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          resolve();
        });
        socket.on('connect_error', () => {
          reject(new Error('Failed to connect'));
        });
        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
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
        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Room creation timeout')), 5000);
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
    const link = `${window.location.origin}/room/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4">
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
          className="btn btn-primary w-full mb-4"
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
            <button onClick={handleJoinRoom} className="btn btn-secondary">
              Join
            </button>
          </div>
        </div>

        {/* Copy Link */}
        <div className="mt-6 text-center">
          <button
            onClick={handleShareLink}
            className="btn btn-secondary text-sm"
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
