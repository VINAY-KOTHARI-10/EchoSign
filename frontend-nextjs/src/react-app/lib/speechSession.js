// Lifecycle of the browser's Web Speech recognizer, kept free of React so it can be tested with a fake recognizer.
//
// The rules this enforces:
//  - Every recognizer belongs to a numbered "generation". Events from any recognizer that is not the current one
//    (an old one that was replaced after a language change, or one that was aborted) are ignored. In particular an
//    old recognizer's `onend` can never start another recognizer.
//  - Changing the language while listening replaces the recognizer: the old one is detached and aborted, and exactly
//    one new one is started.
//  - stop() is definitive: after it, nothing restarts automatically, even if the browser reports `onend` late.
//  - A runaway restart loop (browser ends recognition straight away, over and over) is cut off.
//  - The same final sentence delivered twice in quick succession (some browsers do this after a restart) is dropped.

export const RESTART_WINDOW_MS = 4000;
export const MAX_RESTARTS = 6;
export const DUPLICATE_FINAL_MS = 1500;

// Plain-language messages for the Web Speech API's error codes. `null` = harmless, ignore it.
export const ERROR_TEXT = {
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

const detach = (rec) => {
  if (!rec) return;
  rec.onresult = null; rec.onerror = null; rec.onend = null;
};

// deps: { getSR() -> constructor|null, now() }.  opts: { lang, keepAlive } (changeable through configure()).
// events: { onListening(bool), onTranscript(text), onError(message), onResult({text,isFinal}), onFinal(text) }
export function createSpeechController({ getSR, now = () => Date.now() }, opts = {}, events = {}) {
  let lang = opts.lang || 'en-US';
  let keepAlive = Boolean(opts.keepAlive);
  let handlers = events;

  let generation = 0;        // increases whenever a recognizer is created, replaced or discarded
  let current = null;        // the one live recognizer
  let wanted = false;        // the person asked to listen and has not stopped
  let finalText = '';
  let restarts = [];
  let lastFinal = { text: '', at: 0 };

  const emit = (name, ...args) => { try { handlers[name]?.(...args); } catch { /* a handler's failure must not break recognition */ } };

  // Detach and abort whatever recognizer exists, and invalidate its events.
  const discardCurrent = () => {
    generation += 1;
    const old = current;
    current = null;
    if (old) { detach(old); try { old.abort(); } catch { /* already stopped */ } }
  };

  function begin() {
    const SR = getSR();
    if (!SR) throw new Error('Speech recognition is not supported in this browser');
    discardCurrent();                    // never two recognizers at once
    const mine = generation;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    const live = () => mine === generation && current === rec;

    rec.onresult = (e) => {
      if (!live()) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          const clean = text.trim();
          const t = now();
          const dup = clean && clean === lastFinal.text && t - lastFinal.at < DUPLICATE_FINAL_MS;
          lastFinal = { text: clean, at: t };
          if (dup) continue;
          finalText = `${finalText} ${text}`.trim();
          emit('onResult', { text: clean, isFinal: true });
        } else {
          interim += text;
        }
      }
      if (interim) emit('onResult', { text: interim.trim(), isFinal: false });
      emit('onTranscript', `${finalText} ${interim}`.trim());
    };

    rec.onerror = (e) => {
      if (!live()) return;
      const message = speechErrorText(e.error);
      if (message === null) return;      // normal during pauses
      wanted = false;
      emit('onError', message);
      emit('onListening', false);
    };

    rec.onend = () => {
      if (!live()) return;               // an old or aborted recognizer: never restarts anything
      current = null;
      if (keepAlive && wanted) {
        // The browser ends recognition after a stretch of silence; start it again. If it keeps ending straight away
        // something is wrong, so stop instead of spinning.
        const t = now();
        restarts = [...restarts.filter((x) => t - x < RESTART_WINDOW_MS), t];
        if (restarts.length <= MAX_RESTARTS) {
          try { begin(); return; } catch { /* fall through to the stopped state */ }
        } else {
          wanted = false;
          emit('onError', 'Speech recognition keeps stopping. Check that your microphone works, then start captioning again.');
        }
      }
      wanted = false;
      emit('onListening', false);
      if (finalText) emit('onFinal', finalText);
    };

    current = rec;
    try {
      rec.start();
    } catch (err) {
      current = null; generation += 1; detach(rec);
      throw err;
    }
  }

  return {
    configure(next = {}, nextEvents) {
      if (next.keepAlive !== undefined) keepAlive = Boolean(next.keepAlive);
      if (nextEvents) handlers = nextEvents;
    },

    get supported() { return Boolean(getSR()); },
    get active() { return Boolean(current); },
    get wanted() { return wanted; },

    start() {
      if (!getSR()) return false;
      finalText = ''; restarts = []; lastFinal = { text: '', at: 0 };
      emit('onError', '');
      emit('onTranscript', '');
      wanted = true;
      try {
        begin();
        emit('onListening', true);
        return true;
      } catch (err) {
        wanted = false;
        emit('onError', `Could not start speech recognition: ${err.message}`);
        return false;
      }
    },

    // Definitive: nothing restarts after this. The recognizer is allowed to finish so its last words arrive, and the
    // final text is delivered from its `onend`.
    stop() {
      wanted = false;
      if (current) { try { current.stop(); } catch { /* already stopped */ } }
    },

    // The spoken language changed. While listening, replace the recognizer (exactly one new one).
    setLang(next) {
      if (next === lang) return;
      lang = next;
      if (!wanted) return;
      try { begin(); } catch { wanted = false; emit('onListening', false); }
    },

    // Unmount: stop everything and ignore any event still in flight. Safe to start again afterwards (StrictMode).
    destroy() {
      wanted = false;
      discardCurrent();
    },
  };
}
