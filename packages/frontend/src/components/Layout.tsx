import { useParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import ControlBar from './ControlBar';

interface LayoutProps {
  children: React.ReactNode;
  onLeave: () => void;
}

export default function Layout({ children, onLeave }: LayoutProps) {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-surface flex items-center px-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-textPrimary">Peer</span>
          <span className="text-textMuted">|</span>
          <span className="text-sm text-textSecondary font-mono">{token?.slice(0, 8)}...</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Video Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>

        {/* Chat Panel (placeholder) */}
        <aside className="w-80 border-l border-border bg-surface hidden lg:flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="font-medium text-textPrimary">Chat</h2>
          </div>
          <div className="flex-1 p-4 text-textMuted text-sm">
            <p>Chat messages will appear here.</p>
          </div>
          <div className="p-4 border-t border-border">
            <input
              type="text"
              className="input"
              placeholder="Type a message..."
              disabled
            />
          </div>
        </aside>
      </div>

      {/* Control Bar */}
      <ControlBar onLeave={onLeave} />
    </div>
  );
}
