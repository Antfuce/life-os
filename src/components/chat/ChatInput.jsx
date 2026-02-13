import React, { useState, useEffect, useRef } from "react";
import { Mic } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatInput({ onSend, disabled }) {
  const [isListening, setIsListening] = useState(false);
  const [amplitudes, setAmplitudes] = useState(Array(12).fill(0));
  const [isExpanding, setIsExpanding] = useState(false);
  const audioContextRef = useRef(null);
  const analyzerRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const handleMicClick = () => {
    if (!isListening) {
      // Starting conversation
      setIsListening(true);
      setIsExpanding(true);
      onSend("");
    } else {
      // Stopping
      setIsListening(false);
      setIsExpanding(false);
    }
  };

  useEffect(() => {
    if (!isListening) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      return;
    }

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;

        const analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 256;
        analyzerRef.current = analyzer;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyzer);

        const dataArray = new Uint8Array(analyzer.frequencyBinCount);

        const updateWaveform = () => {
          analyzer.getByteFrequencyData(dataArray);
          const newAmplitudes = Array(12).fill(0).map((_, i) => {
            const start = Math.floor((i / 12) * dataArray.length);
            const end = Math.floor(((i + 1) / 12) * dataArray.length);
            const sum = dataArray.slice(start, end).reduce((a, b) => a + b, 0);
            return (sum / (end - start)) / 255;
          });
          setAmplitudes(newAmplitudes);
          animationFrameRef.current = requestAnimationFrame(updateWaveform);
        };

        updateWaveform();
      } catch (error) {
        console.error("Mic access error:", error);
        setIsListening(false);
      }
    };

    initAudio();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isListening]);

  return (
    <div className="relative w-full flex items-center justify-center py-2 overflow-visible">
      {/* Expanding waveform backdrop */}
      {isExpanding && (
        <>
          {amplitudes.map((amp, i) => {
            const angle = (i / amplitudes.length) * Math.PI * 2;
            const distance = 80 + amp * 200;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;

            return (
              <motion.div
                key={`expand-${i}`}
                className="absolute w-1 h-1 bg-neutral-400/30 rounded-full"
                animate={{
                  x,
                  y,
                  opacity: 1 - amp * 0.5,
                }}
                transition={{
                  duration: 0.1,
                }}
              />
            );
          })}
        </>
      )}

      {/* Central waveform bars (old) */}
      {isListening && !isExpanding && (
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {amplitudes.map((amp, i) => (
            <motion.div
              key={i}
              className="w-1 bg-neutral-500 rounded-full"
              style={{
                height: Math.max(4, amp * 40),
              }}
            />
          ))}
        </div>
      )}

      {/* Central Microphone Button */}
      <button
        onClick={handleMicClick}
        disabled={disabled}
        className="relative z-10 w-20 h-20 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors shadow-lg"
      >
        <Mic className="w-8 h-8 text-neutral-300" />
      </button>
    </div>
  );
}