import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { X, MessageSquare, Users } from 'lucide-react';
import Sidebar from './Sidebar';
import ControlBar from './ControlBar';
import { ChatPanel } from './ChatPanel';

interface LayoutProps {
  children: React.ReactNode;
  onLeave: () => void;
}

export default function Layout({ children, onLeave }: LayoutProps) {
  const { token } = useParams<{ token: string }>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-surface flex items-center px-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-textPrimary">Peer</span>
          <span className="text-textMuted">|</span>
          <span className="text-sm text-textSecondary font-mono">{token?.slice(0, 8)}...</span>
        </div>

        {/* Mobile toggle buttons */}
        <div className="ml-auto flex items-center gap-2 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-surfaceHover text-textSecondary"
            aria-label="Open participants"
          >
            <Users className="w-5 h-5" />
          </button>
          <button
            onClick={() => setChatOpen(true)}
            className="p-2 rounded-lg hover:bg-surfaceHover text-textSecondary"
            aria-label="Open chat"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Desktop */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Mobile Sidebar Drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Drawer */}
            <div className="absolute left-0 top-0 bottom-16 w-72 bg-surface animate-slide-in">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-medium text-textPrimary">Menu</h2>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded-lg hover:bg-surfaceHover text-textSecondary"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <Sidebar />
            </div>
          </div>
        )}

        {/* Video Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>

        {/* Chat Panel - Desktop */}
        <aside className="w-80 border-l border-border bg-surface hidden lg:flex flex-col">
          <ChatPanel />
        </aside>

        {/* Mobile Chat Drawer */}
        {chatOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setChatOpen(false)}
            />
            {/* Drawer */}
            <div className="absolute right-0 top-0 bottom-16 w-80 bg-surface animate-slide-in">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-medium text-textPrimary">Chat</h2>
                <button
                  onClick={() => setChatOpen(false)}
                  className="p-2 rounded-lg hover:bg-surfaceHover text-textSecondary"
                  aria-label="Close chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatPanel />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <ControlBar onLeave={onLeave} onToggleChat={() => setChatOpen(true)} />
    </div>
  );
}
