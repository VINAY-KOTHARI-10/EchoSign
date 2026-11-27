// Temporal decision layer for sign recognition. A single camera frame is noisy: one wrong frame must not type a
// letter, and a shape that flickers between two letters must not be forced into the caption.
// This keeps a sliding window of the last frames and only "accepts" a letter that is
//   * seen in enough of the recent frames (stable), and
//   * confident enough on average, and
//   * clearly ahead of the runner-up (not ambiguous).
// Pure logic, no camera or React, so it is unit-tested and reused by the evaluation tools.

export const WINDOW_FRAMES = 18;       // about 0.6 s at 30 fps
export const MIN_RATIO = 0.7;          // the top letter must fill at least 70% of the window
export const RUNNER_UP_MAX = 0.3;      // a second letter in 30%+ of frames makes the shape ambiguous
export const MIN_CONFIDENCE = 0.5;     // average rule confidence required to accept (the rules give 0.5 to 0.85; E, M, N, T sit at 0.5 and must still be held longer)
export const RELIABLE_VOTES = 11;      // frames needed for a well-separated letter
export const SHAKY_VOTES = 14;         // letters that look alike (A E M N S T) must be held longer
export const SHAKY = new Set(['A', 'E', 'M', 'N', 'S', 'T']);

export const votesNeeded = (letter) => (SHAKY.has(letter) ? SHAKY_VOTES : RELIABLE_VOTES);

export class VoteWindow {
  constructor({ size = WINDOW_FRAMES } = {}) {
    this.size = size;
    this.frames = []; // [{ label: string|null, conf: number }]
  }

  clear() { this.frames = []; }

  // label = the letter the classifier saw this frame (null when a hand is visible but matches no letter)
  push(label, conf = 0) {
    this.frames.push({ label, conf: label ? conf : 0 });
    if (this.frames.length > this.size) this.frames.shift();
  }

  // -> { label, votes, ratio, confidence, ambiguous: string[]|null, ready }
  get() {
    const n = this.frames.length;
    const counts = new Map();
    const conf = new Map();
    this.frames.forEach(({ label, conf: c }) => {
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
      conf.set(label, (conf.get(label) || 0) + c);
    });
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return { label: null, votes: 0, ratio: 0, confidence: 0, ambiguous: null, ready: false };

    const [label, votes] = ranked[0];
    const ratio = votes / Math.max(n, this.size * 0.6); // an almost empty window cannot reach a high ratio
    const avg = conf.get(label) / votes;
    const second = ranked[1];
    const ambiguous = second && second[1] / n >= RUNNER_UP_MAX && ratio < 0.8 ? [label, second[0]] : null;
    const ready = !ambiguous && votes >= votesNeeded(label) && ratio >= MIN_RATIO && avg >= MIN_CONFIDENCE;
    return { label, votes, ratio, confidence: Math.round(avg * ratio * 100) / 100, ambiguous, ready };
  }

  // How far toward acceptance the current best letter is, 0..1 (for the progress bar).
  progress() {
    const g = this.get();
    if (!g.label || g.ambiguous) return 0;
    return Math.min(1, g.votes / votesNeeded(g.label));
  }
}

// Plain-language wording for the confidence shown to people. Honest about what the number means.
export const confidenceLabel = (c) => (c >= 0.7 ? 'High' : c >= 0.5 ? 'Medium' : 'Low');
