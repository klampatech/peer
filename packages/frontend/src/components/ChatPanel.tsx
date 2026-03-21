import { useEffect } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { signallingClient } from '../lib/signalling';

export function ChatPanel() {
  // Request chat history when component mounts
  useEffect(() => {
    // Small delay to ensure connection is established
    const timer = setTimeout(() => {
      signallingClient.requestChatHistory();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-white">Chat</h2>
      </div>
      <MessageList />
      <MessageInput />
    </div>
  );
}
