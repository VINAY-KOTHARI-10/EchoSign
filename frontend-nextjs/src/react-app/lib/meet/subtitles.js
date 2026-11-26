// Turning recognised signs into subtitles for the other people in a Sign Meet.
//
// Fingerspelled letters are collected into a word and sent when the signer pauses; a recognised phrase sign is sent at
// once as a sentence. The spoken-word subtitles from the microphone arrive from the speech recogniser as final text.

export const PAUSE_MS = 1400;       // a pause this long ends a fingerspelled word
export const MAX_WORD = 24;         // a longer run is sent as it is, so nothing is held forever

const sentenceCase = (s) => { const t = String(s || '').trim().toLowerCase(); return t ? t[0].toUpperCase() + t.slice(1) : ''; };

// "THANK YOU" -> "Thank you", "I LOVE YOU" -> "I love you"
export const phraseText = (label) => sentenceCase(label).replace(/\bi\b/g, 'I');

export function createSpeller() {
  let letters = '';
  let lastAt = 0;
  return {
    get pending() { return letters; },
    // A letter was recognised. Returns a finished word if the buffer is full.
    letter(ch, now = Date.now()) {
      letters += String(ch || '').toUpperCase().slice(0, 1);
      lastAt = now;
      if (letters.length >= MAX_WORD) return this.flush();
      return null;
    },
    // Call regularly: returns the finished word once the signer has paused, else null.
    tick(now = Date.now()) {
      return letters && now - lastAt >= PAUSE_MS ? this.flush() : null;
    },
    flush() { const word = letters; letters = ''; return word || null; },
    clear() { letters = ''; },
  };
}

// Keeps the last few lines for the on-screen log; the newest is last.
export function addLine(lines, line, max = 40) {
  const next = [...lines, line];
  return next.length > max ? next.slice(next.length - max) : next;
}
