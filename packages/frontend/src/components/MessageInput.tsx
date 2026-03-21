import { useState, type FormEvent } from 'react';
import { signallingClient } from '../lib/signalling';

const MAX_MESSAGE_LENGTH = 2000;

export function MessageInput() {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const trimmedMessage = message.trim();
    if (!trimmedMessage || trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return;
    }

    setIsSending(true);
    try {
      signallingClient.sendChatMessage(trimmedMessage);
      setMessage('');
    } finally {
      setIsSending(false);
    }
  };

  const isOverLimit = message.length > MAX_MESSAGE_LENGTH;

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          maxLength={MAX_MESSAGE_LENGTH + 100} // Allow slight overflow for UX
          disabled={isSending}
          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!message.trim() || isSending || isOverLimit}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
      {isOverLimit && (
        <p className="text-red-400 text-xs mt-1">
          Message exceeds {MAX_MESSAGE_LENGTH} characters
        </p>
      )}
    </form>
  );
}
