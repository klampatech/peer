import { useParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import ControlBar from './ControlBar';
import { ChatPanel } from './ChatPanel';

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

        {/* Chat Panel */}
        <aside className="w-80 border-l border-border bg-surface hidden lg:flex flex-col">
          <ChatPanel />
        </aside>
      </div>

      {/* Control Bar */}
      <ControlBar onLeave={onLeave} />
    </div>
  );
}
