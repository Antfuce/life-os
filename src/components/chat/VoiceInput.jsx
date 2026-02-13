import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function VoiceInput({ onTranscript, onInterimTranscript, disabled, autoStart = false }) {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    // Check if browser supports Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onresult = (event) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interimTranscript += transcript;
          }
        }

        if (onInterimTranscript && interimTranscript) {
          onInterimTranscript(interimTranscript);
        }

        if (finalTranscript) {
          onTranscript(finalTranscript.trim());
        }
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === "no-speech") {
          // Restart automatically on no-speech
          if (isListening) {
            setTimeout(() => {
              try {
                recognitionInstance.start();
              } catch (e) {
                // Already started
              }
            }, 100);
          }
        }
      };

      recognitionInstance.onend = () => {
        // Auto-restart if still in listening mode
        if (isListening) {
          try {
            recognitionInstance.start();
          } catch (e) {
            // Already started
          }
        }
      };

      setRecognition(recognitionInstance);

      // Auto-start if requested
      if (autoStart) {
        setTimeout(() => {
          try {
            recognitionInstance.start();
            setIsListening(true);
          } catch (e) {
            console.error("Auto-start failed:", e);
          }
        }, 500);
      }
    }

    return () => {
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {
          // Already stopped
        }
      }
    };
  }, [autoStart]);

  const toggleListening = () => {
    if (!recognition) {
      alert('Voice input is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
      } catch (e) {
        console.error("Start failed:", e);
      }
    }
  };

  return (
    <Button
      onClick={toggleListening}
      disabled={disabled || !recognition}
      variant="ghost"
      size="icon"
      className={cn(
        "relative flex-shrink-0",
        isListening && "text-rose-500"
      )}
    >
      {isListening ? (
        <>
          <motion.div
            className="absolute inset-0 rounded-lg bg-rose-500/10"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <MicOff className="w-5 h-5 relative z-10" />
        </>
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </Button>
  );
}