import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export function ChatPanel() {
  // Chat history is now requested in the connect() flow after room join is confirmed
  // Messages are received via socket events in the signalling client

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
