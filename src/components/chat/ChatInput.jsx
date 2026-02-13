import React, { useState } from "react";
import { Mic } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatInput({ onSend, disabled }) {
  const [isListening, setIsListening] = useState(false);

  return (
    <div className="relative w-full flex items-center justify-center py-2">
      {/* Central Microphone Button */}
      <button
        onClick={() => setIsListening(!isListening)}
        disabled={disabled}
        className="w-20 h-20 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors shadow-lg"
      >
        <Mic className="w-8 h-8 text-neutral-300" />
      </button>
    </div>
  );
}