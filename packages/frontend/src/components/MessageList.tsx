import { useRef, useEffect } from 'react';
import { useRoomStore } from '../stores/room-store';

export function MessageList() {
  const messages = useRoomStore((state) => state.messages);
  const peerId = useRoomStore((state) => state.peerId);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const formatTime = (timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(timestamp);
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-4" role="status" aria-live="polite">
        No messages yet. Start the conversation!
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3" role="log" aria-label="Chat messages" aria-live="polite">
      {messages.map((msg) => {
        const isOwnMessage = msg.peerId === peerId;

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-gray-300">
                {isOwnMessage ? 'You' : msg.displayName}
              </span>
              <span className="text-xs text-gray-500">
                {formatTime(msg.timestamp)}
              </span>
            </div>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                isOwnMessage
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-100'
              }`}
            >
              {msg.message}
            </div>
          </div>
        );
      })}
    </div>
  );
}
