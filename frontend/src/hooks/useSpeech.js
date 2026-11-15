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

// What the person should know about where their voice goes. Shown next to the microphone button.
export const SPEECH_PRIVACY = 'Speech-to-text uses your browser’s speech service: Chrome and Edge send your microphone audio to Google or Microsoft to be turned into text. EchoSign itself only receives the resulting words. Sign recognition runs on your device and no video leaves it.';

// Message for a Web Speech error code (null = harmless pause, show nothing).
export const speechErrorText = (code) => (code in ERROR_TEXT ? ERROR_TEXT[code] : `Speech recognition error: ${code}`);

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
  const lastFinalRef = useRef({ text: '', at: 0 }); // guards against the same sentence being delivered twice
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
          const clean = text.trim();
          const dup = clean && clean === lastFinalRef.current.text && Date.now() - lastFinalRef.current.at < 1500;
          lastFinalRef.current = { text: clean, at: Date.now() };
          if (dup) continue; // some browsers re-deliver the last result after an automatic restart
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
      const message = speechErrorText(e.error);
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

  // Changing the spoken language while listening restarts recognition in the new language.
  const langRef = useRef(lang);
  useEffect(() => {
    if (langRef.current === lang) return;
    langRef.current = lang;
    if (wantedRef.current) { recRef.current?.abort(); try { begin(); } catch { /* the user can press start again */ } }
  }, [lang, begin]);

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
