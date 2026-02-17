import { useCallback, useEffect, useRef, useState } from "react";

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Minimal Web Speech API wrapper (Chrome/Edge via webkitSpeechRecognition).
 *
 * Design goals:
 * - Safe: no auto-start; caller must invoke start().
 * - Audio-first: default to single-utterance mode (continuous=false) so a final result
 *   typically corresponds to one spoken request.
 * - UI-friendly: emits interim + final transcripts.
 */
export default function useSpeechRecognition(options = {}) {
  const {
    lang = "en-US",
    interimResults = true,
    continuous = false,
    autoRestart = false,
    onInterim,
    onFinal,
    onStart,
    onEnd,
    onError,
  } = options;

  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const restartAttemptsRef = useRef(0);
  const shouldKeepListeningRef = useRef(false);
  const cbRef = useRef({ onInterim, onFinal, onStart, onEnd, onError });

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    cbRef.current = { onInterim, onFinal, onStart, onEnd, onError };
  }, [onInterim, onFinal, onStart, onEnd, onError]);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }

    setSupported(true);

    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = interimResults;
    rec.continuous = continuous;
    rec.maxAlternatives = 1;

    const scheduleRestart = () => {
      if (!continuous || !autoRestart || !shouldKeepListeningRef.current) return;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

      const attempts = restartAttemptsRef.current;
      const delayMs = Math.min(2000, 180 + (attempts * 120));

      restartTimerRef.current = setTimeout(() => {
        if (!shouldKeepListeningRef.current) return;
        try {
          rec.start();
          restartAttemptsRef.current = 0;
        } catch {
          restartAttemptsRef.current = Math.min(20, restartAttemptsRef.current + 1);
          scheduleRestart();
        }
      }, delayMs);
    };

    rec.onstart = () => {
      setError(null);
      setListening(true);
      restartAttemptsRef.current = 0;
      cbRef.current.onStart?.();
    };

    rec.onresult = (event) => {
      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const t = String(res?.[0]?.transcript || "");
        if (res.isFinal) finalText += t;
        else interim += t;
      }

      const interimClean = interim.trim();
      if (interimClean) {
        setInterimTranscript(interimClean);
        cbRef.current.onInterim?.(interimClean);
      }

      const finalClean = finalText.trim();
      if (finalClean) {
        setFinalTranscript(finalClean);
        setInterimTranscript("");
        cbRef.current.onFinal?.(finalClean);
      }
    };

    rec.onerror = (e) => {
      setError(e);
      const code = String(e?.error || '');
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        shouldKeepListeningRef.current = false;
      }
      cbRef.current.onError?.(e);
    };

    rec.onend = () => {
      setListening(false);
      setInterimTranscript("");
      cbRef.current.onEnd?.();
      scheduleRestart();
    };

    recognitionRef.current = rec;

    return () => {
      shouldKeepListeningRef.current = false;
      restartAttemptsRef.current = 0;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      try {
        rec.onresult = null;
        rec.onstart = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort?.();
      } catch {
        // noop
      }
      if (recognitionRef.current === rec) recognitionRef.current = null;
    };
  }, [lang, interimResults, continuous, autoRestart]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return false;

    try {
      shouldKeepListeningRef.current = true;
      restartAttemptsRef.current = 0;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      setFinalTranscript("");
      setInterimTranscript("");
      rec.start();
      return true;
    } catch (e) {
      // start() throws if called twice quickly
      setError(e);
      if (continuous && autoRestart && shouldKeepListeningRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (!shouldKeepListeningRef.current) return;
          try {
            rec.start();
          } catch {
            // noop, retried on next onend/error cycle
          }
        }, 220);
      }
      return false;
    }
  }, [continuous, autoRestart]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    shouldKeepListeningRef.current = false;
    restartAttemptsRef.current = 0;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      rec.stop();
    } catch {
      // noop
    }
  }, []);

  const abort = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    shouldKeepListeningRef.current = false;
    restartAttemptsRef.current = 0;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      rec.abort();
    } catch {
      // noop
    }
  }, []);

  return {
    supported,
    listening,
    interimTranscript,
    finalTranscript,
    error,
    start,
    stop,
    abort,
  };
}
