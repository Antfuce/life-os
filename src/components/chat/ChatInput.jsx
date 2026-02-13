import React, { useState } from "react";
import { Mic } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatInput({ onSend, disabled }) {
  const [isListening, setIsListening] = useState(false);

  return (
    <div className="relative w-full h-64 flex items-center justify-center">
      {/* Central Microphone Button */}
      <button
        onClick={() => setIsListening(!isListening)}
        disabled={disabled}
        className="w-24 h-24 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors shadow-lg"
      >
        <Mic className="w-10 h-10 text-neutral-300" />
      </button>
    </div>
  );
}