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
    onInterim,
    onFinal,
    onStart,
    onEnd,
    onError,
  } = options;

  const recognitionRef = useRef(null);
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

    rec.onstart = () => {
      setError(null);
      setListening(true);
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
      cbRef.current.onError?.(e);
    };

    rec.onend = () => {
      setListening(false);
      setInterimTranscript("");
      cbRef.current.onEnd?.();
    };

    recognitionRef.current = rec;

    return () => {
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
  }, [lang, interimResults, continuous]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return false;

    try {
      setFinalTranscript("");
      setInterimTranscript("");
      rec.start();
      return true;
    } catch (e) {
      // start() throws if called twice quickly
      setError(e);
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // noop
    }
  }, []);

  const abort = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
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
