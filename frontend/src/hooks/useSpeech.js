import { useCallback, useEffect, useRef, useState } from 'react';

// Looked up when needed (not once at import) so it reflects the browser the page is really running in.
const getSR = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);

// Plain-language messages for the Web Speech API's error codes. `null` = harmless, ignore it.
const ERROR_TEXT = {
  'not-allowed': 'Microphone access was blocked. Click the lock icon in the address bar, allow the microphone, then try again.',
  'service-not-allowed': 'This browser blocked speech recognition. Allow the microphone in the address bar, then try again.',
  'audio-capture': 'No microphone was found. Plug one in, or choose a different input in your system settings.',
  network: 'Speech recognition needs an internet connection: Chrome sends your audio to its speech service. Check your connection and try again.',
  'language-not-supported': 'This browser can’t recognise that language.',
  'no-speech': null,
  aborted: null,
};

// Wraps the browser Web Speech API. `supported` is false in browsers without it (e.g. Firefox).
//   onFinal(text)            – once, with the whole utterance, when recognition ends (practice pages)
//   onResult({text,isFinal}) – on every interim / final result (live captions)
//   keepAlive                – restart automatically when the browser ends recognition after silence
export default function useSpeech(lang = 'en-US', { onFinal, onResult, keepAlive = false } = {}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const finalRef = useRef('');
  const wantedRef = useRef(false);
  const restartsRef = useRef([]); // timestamps of automatic restarts, to stop a runaway loop
  const onFinalRef = useRef(onFinal);
  const onResultRef = useRef(onResult);
  onFinalRef.current = onFinal;
  onResultRef.current = onResult;

  const stop = useCallback(() => {
    wantedRef.current = false;
    recRef.current?.stop();
  }, []);

  const begin = useCallback(() => {
    const SR = getSR();
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalRef.current = `${finalRef.current} ${text}`.trim();
          onResultRef.current?.({ text: text.trim(), isFinal: true });
        } else {
          interim += text;
        }
      }
      if (interim) onResultRef.current?.({ text: interim.trim(), isFinal: false });
      setTranscript(`${finalRef.current} ${interim}`.trim());
    };
    rec.onerror = (e) => {
      const known = e.error in ERROR_TEXT;
      const message = known ? ERROR_TEXT[e.error] : `Speech recognition error: ${e.error}`;
      if (message === null) return; // normal during pauses
      wantedRef.current = false;
      setError(message);
      setListening(false);
    };
    rec.onend = () => {
      if (keepAlive && wantedRef.current) {
        // The browser ends recognition after a stretch of silence; start it again. If it keeps ending straight
        // away (more than 6 times in 4 seconds) something is wrong, so stop instead of spinning.
        const now = Date.now();
        restartsRef.current = [...restartsRef.current.filter((t) => now - t < 4000), now];
        if (restartsRef.current.length <= 6) {
          try { begin(); return; } catch { /* fall through to the stopped state */ }
        } else {
          wantedRef.current = false;
          setError('Speech recognition keeps stopping. Check that your microphone works, then start captioning again.');
        }
      }
      setListening(false);
      if (finalRef.current) onFinalRef.current?.(finalRef.current);
    };
    recRef.current = rec;
    rec.start();
  }, [lang, keepAlive]);

  const start = useCallback(() => {
    if (!getSR()) return;
    setError('');
    finalRef.current = '';
    restartsRef.current = [];
    setTranscript('');
    wantedRef.current = true;
    try {
      begin();
      setListening(true);
    } catch (err) {
      wantedRef.current = false;
      setError(`Could not start speech recognition: ${err.message}`);
    }
  }, [begin]);

  useEffect(() => () => { wantedRef.current = false; recRef.current?.abort(); }, []);

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
