import { useCallback, useEffect, useRef, useState } from 'react';
import { createSpeechController } from '../lib/speechSession.js';

export { SPEECH_PRIVACY, speechErrorText } from '../lib/speechSession.js';

// Looked up when needed (not once at import) so it reflects the browser the page is really running in.
const getSR = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);

// Wraps the browser Web Speech API. `supported` is false in browsers without it (e.g. Firefox).
//   onFinal(text)            – once, with the whole utterance, when recognition ends (practice pages)
//   onResult({text,isFinal}) – on every interim / final result (live captions)
//   keepAlive                – restart automatically when the browser ends recognition after silence
// The recognizer lifecycle (generations, restarts, language changes) lives in lib/speechSession.js, where it is tested.
export default function useSpeech(lang = 'en-US', { onFinal, onResult, keepAlive = false } = {}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const onFinalRef = useRef(onFinal);
  const onResultRef = useRef(onResult);
  onFinalRef.current = onFinal;
  onResultRef.current = onResult;

  const ctrlRef = useRef(null);
  if (!ctrlRef.current) {
    ctrlRef.current = createSpeechController({ getSR }, { lang, keepAlive }, {
      onListening: setListening,
      onTranscript: setTranscript,
      onError: setError,
      onResult: (r) => onResultRef.current?.(r),
      onFinal: (t) => onFinalRef.current?.(t),
    });
  }
  const ctrl = ctrlRef.current;
  ctrl.configure({ keepAlive });

  const start = useCallback(() => ctrl.start(), [ctrl]);
  const stop = useCallback(() => ctrl.stop(), [ctrl]);

  // Changing the spoken language while listening restarts recognition in the new language (exactly one recognizer).
  useEffect(() => { ctrl.setLang(lang); }, [ctrl, lang]);
  useEffect(() => () => ctrl.destroy(), [ctrl]);

  return { supported: Boolean(getSR()), listening, transcript, setTranscript, error, start, stop };
}

// Speaks text aloud. `handlers` ({ onStart, onEnd }) let the UI show a "speaking" state.
export const speak = (text, bcp, handlers = {}) => {
  if (!('speechSynthesis' in window)) { handlers.onEnd?.(); return false; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp;
  u.onstart = () => handlers.onStart?.();
  u.onend = () => handlers.onEnd?.();
  u.onerror = () => handlers.onEnd?.();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
};

export const stopSpeaking = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
