import React, { useState } from "react";
import { Mic, Send } from "lucide-react";

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (text.trim()) {
      onSend(text);
      setText("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative w-full flex items-center gap-3 justify-center py-2 px-4">
      {/* Text Input */}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type or speak..."
        disabled={disabled}
        className="flex-1 px-4 py-2 rounded-lg bg-neutral-200 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 text-sm"
      />

      {/* Send Button */}
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 transition-colors"
      >
        <Send className="w-4 h-4 text-neutral-300" />
      </button>

      {/* Microphone Button */}
      <button
        onClick={() => onSend("voice")}
        disabled={disabled}
        className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 transition-colors"
      >
        <Mic className="w-4 h-4 text-neutral-300" />
      </button>
    </div>
  );
}