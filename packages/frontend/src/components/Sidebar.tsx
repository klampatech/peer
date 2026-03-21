import { Users, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useRoomStore } from '../stores/room-store';

export default function Sidebar() {
  const [copied, setCopied] = useState(false);
  const { peers, isConnected } = useRoomStore();

  const handleCopyLink = async () => {
    const link = window.location.href;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside className="w-full border-r border-border bg-surface flex flex-col">
      {/* Room Info */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-medium text-textSecondary mb-2">Room</h3>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-warning'}`}
            role="status"
            aria-label={isConnected ? 'Connected to room' : 'Connecting to room'}
          />
          <span className="text-sm text-textPrimary">
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Participants */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-medium text-textSecondary mb-3">
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Participants ({peers.length + 1})
          </span>
        </h3>
        <ul className="space-y-2">
          {/* You */}
          <li className="flex items-center gap-2 text-sm">
            <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-xs font-medium">
              Y
            </div>
            <span className="text-textPrimary">You</span>
          </li>
          {/* Other peers */}
          {peers.map((peer) => (
            <li key={peer.id} className="flex items-center gap-2 text-sm">
              <div className="w-6 h-6 bg-surfaceHover rounded-full flex items-center justify-center text-xs font-medium">
                {peer.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-textPrimary">{peer.displayName}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Share Link */}
      <div className="p-4 mt-auto">
        <button
          onClick={handleCopyLink}
          className="btn btn-secondary w-full text-sm"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copy Invite Link
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
