// Camera and speech lifecycles. The browser (camera, MediaPipe, Web Speech) is replaced by controlled doubles, so each test
// decides exactly WHEN a permission prompt, a model download or a browser event completes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignController, loadGestureEngine, cameraMessage } from '../src/lib/signSession.js';
import {
  createSpeechController, speechErrorText, RESTART_WINDOW_MS, MAX_RESTARTS, DUPLICATE_FINAL_MS, SPEECH_PRIVACY,
} from '../src/lib/speechSession.js';

const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise((r) => setImmediate(r));

// ── camera doubles ────────────────────────────────────────────────────────────
const makeStream = () => {
  const listeners = {};
  const track = {
    stopped: false,
    stop() { this.stopped = true; },
    addEventListener(n, fn) { (listeners[n] ||= []).push(fn); },
    removeEventListener(n, fn) { listeners[n] = (listeners[n] || []).filter((f) => f !== fn); },
    fire(n) { (listeners[n] || []).slice().forEach((f) => f()); },
    listenerCount: (n) => (listeners[n] || []).length,
  };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
};

const rig = ({ manualCamera = false, manualModel = false, manualPlay = false } = {}) => {
  const r = {
    streams: [], loops: [], engines: [], events: [], gum: [], loads: [], plays: [],
    attached: null, detached: 0, cameraCalls: 0,
  };
  const deps = {
    hasCamera: () => true,
    secure: () => true,
    getUserMedia: (c) => {
      r.cameraCalls += 1;
      if (manualCamera) { const d = deferred(); r.gum.push({ d, c }); return d.promise; }
      const s = makeStream(); r.streams.push(s); return Promise.resolve(s);
    },
    attachVideo: (s) => { r.attached = s; if (manualPlay) { const d = deferred(); r.plays.push(d); return d.promise; } return Promise.resolve(); },
    detachVideo: () => { r.attached = null; r.detached += 1; },
    loadEngine: () => {
      const e = { closed: false, close() { this.closed = true; } };
      r.engines.push(e);
      if (manualModel) { const d = deferred(); r.loads.push({ d, e }); return d.promise; }
      return Promise.resolve(e);
    },
    startLoop: (engine) => { const l = { engine, stopped: false }; r.loops.push(l); return () => { l.stopped = true; }; },
  };
  const events = { onStatus: (s) => r.events.push(['status', s]), onError: (m) => r.events.push(['error', m]), onReset: () => r.events.push(['reset']) };
  r.ctrl = createSignController(deps, events);
  r.activeLoops = () => r.loops.filter((l) => !l.stopped).length;
  r.liveTracks = () => r.streams.filter((s) => !s.track.stopped).length;
  r.statuses = () => r.events.filter((e) => e[0] === 'status').map((e) => e[1]);
  return r;
};

test('start opens one camera, loads the model once, runs one loop', async () => {
  const r = rig();
  assert.equal(await r.ctrl.start(), true);
  assert.equal(r.ctrl.status, 'running');
  assert.equal(r.cameraCalls, 1); assert.equal(r.engines.length, 1); assert.equal(r.activeLoops(), 1);
  assert.deepEqual(r.statuses(), ['loading', 'running']);
});

test('pressing Start twice (even in the same tick) never opens two streams or runs two loops', async () => {
  const r = rig({ manualCamera: true });
  const a = r.ctrl.start(); const b = r.ctrl.start(); const c = r.ctrl.start();
  assert.equal(r.cameraCalls, 1);
  const s = makeStream(); r.streams.push(s); r.gum[0].d.resolve(s);
  assert.deepEqual(await Promise.all([a, b, c]), [true, false, false]);
  assert.equal(r.activeLoops(), 1);
  assert.equal(await r.ctrl.start(), false);   // already running
  assert.equal(r.cameraCalls, 1);
});

test('Stop while the permission prompt is open: the stream that arrives later is released and nothing starts', async () => {
  const r = rig({ manualCamera: true });
  const p = r.ctrl.start();
  r.ctrl.stop();
  const s = makeStream(); r.streams.push(s);
  r.gum[0].d.resolve(s);
  assert.equal(await p, false);
  assert.equal(s.track.stopped, true);
  assert.equal(r.loops.length, 0); assert.equal(r.engines.length, 0);
  assert.equal(r.ctrl.status, 'idle'); assert.equal(r.ctrl.hasStream, false);
});

test('Stop while the hand model is loading: no loop starts, the camera is released, the model is kept for next time', async () => {
  const r = rig({ manualModel: true });
  const p = r.ctrl.start();
  await tick();
  assert.equal(r.liveTracks(), 1);
  r.ctrl.stop();
  assert.equal(r.liveTracks(), 0);                       // released immediately, not when the model arrives
  r.loads[0].d.resolve(r.loads[0].e);
  assert.equal(await p, false);
  assert.equal(r.loops.length, 0);
  assert.equal(r.ctrl.status, 'idle');
  assert.equal(r.ctrl.modelLoaded, true);                // downloaded once, reused
  assert.equal(r.engines[0].closed, false);
  await r.ctrl.start();                                  // second start: no second download
  assert.equal(r.engines.length, 1);
  assert.equal(r.activeLoops(), 1);
});

test('Stop while the video is starting to play releases the stream and starts nothing', async () => {
  const r = rig({ manualPlay: true });
  const p = r.ctrl.start();
  await tick();
  r.ctrl.stop();
  r.plays[0].resolve();
  assert.equal(await p, false);
  assert.equal(r.liveTracks(), 0); assert.equal(r.loops.length, 0);
});

test('unmount during the permission prompt: stream released, no loop, no model', async () => {
  const r = rig({ manualCamera: true });
  const p = r.ctrl.start();
  r.ctrl.destroy();
  const s = makeStream(); r.streams.push(s); r.gum[0].d.resolve(s);
  assert.equal(await p, false);
  assert.equal(s.track.stopped, true);
  assert.equal(r.loops.length, 0); assert.equal(r.engines.length, 0);
});

test('unmount during the model download: the model is closed when it arrives and no loop starts', async () => {
  const r = rig({ manualModel: true });
  const p = r.ctrl.start();
  await tick();
  r.ctrl.destroy();
  r.loads[0].d.resolve(r.loads[0].e);
  assert.equal(await p, false);
  assert.equal(r.engines[0].closed, true);
  assert.equal(r.loops.length, 0); assert.equal(r.liveTracks(), 0);
  assert.equal(r.ctrl.modelLoaded, false);
});

test('unmount while running stops the loop, the camera and closes the model', async () => {
  const r = rig();
  await r.ctrl.start();
  r.ctrl.destroy();
  assert.equal(r.activeLoops(), 0); assert.equal(r.liveTracks(), 0);
  assert.equal(r.engines[0].closed, true);
  assert.equal(r.attached, null);
});

test('Stop cleans up everything: tracks, loop, video element, listeners', async () => {
  const r = rig();
  await r.ctrl.start();
  const s = r.streams[0];
  r.ctrl.stop();
  assert.equal(s.track.stopped, true);
  assert.equal(r.activeLoops(), 0);
  assert.equal(r.attached, null);
  assert.equal(s.track.listenerCount('ended'), 0);
  assert.equal(r.ctrl.running, false); assert.equal(r.ctrl.status, 'idle');
  r.ctrl.stop();                                          // stopping again is harmless
  assert.equal(r.ctrl.status, 'idle');
});

test('Stop then Start again while the first start is still waiting: only the second one runs', async () => {
  const r = rig({ manualCamera: true });
  const first = r.ctrl.start();
  r.ctrl.stop();
  const second = r.ctrl.start();
  assert.equal(r.cameraCalls, 2);
  const s1 = makeStream(); const s2 = makeStream(); r.streams.push(s1, s2);
  r.gum[0].d.resolve(s1);                                // the abandoned prompt answers first
  assert.equal(await first, false);
  assert.equal(s1.track.stopped, true);
  r.gum[1].d.resolve(s2);
  assert.equal(await second, true);
  assert.equal(s2.track.stopped, false);
  assert.equal(r.activeLoops(), 1);
  assert.equal(r.engines.length, 1);                      // one model download
  assert.equal(r.ctrl.status, 'running');
});

test('an abandoned start that fails later does not overwrite the newer, running session', async () => {
  const r = rig({ manualModel: true });
  const first = r.ctrl.start();
  await tick();
  r.ctrl.stop();
  const second = r.ctrl.start();
  await tick();
  r.loads[0].d.reject(new Error('network down'));         // the first (shared) download fails; the second start sees it too
  const results = await Promise.all([first, second]);
  assert.equal(results[0], false);
  // the failure belongs to the live session (it awaited the same download), so it reports once, cleanly
  assert.equal(r.ctrl.status, 'error');
  assert.equal(r.liveTracks(), 0); assert.equal(r.activeLoops(), 0);
  // and the person can try again
  r.ctrl.stop();
  const again = r.ctrl.start();
  await tick();
  r.loads[1].d.resolve(r.loads[1].e);
  assert.equal(await again, true);
  assert.equal(r.activeLoops(), 1);
});

test('StrictMode-style start → destroy → start leaves exactly one live camera and loop', async () => {
  const r = rig({ manualCamera: true });
  const first = r.ctrl.start();
  r.ctrl.destroy();
  const second = r.ctrl.start();
  const s1 = makeStream(); const s2 = makeStream(); r.streams.push(s1, s2);
  r.gum[0].d.resolve(s1); r.gum[1].d.resolve(s2);
  await Promise.all([first, second]);
  assert.equal(s1.track.stopped, true);
  assert.equal(r.liveTracks(), 1);
  assert.equal(r.activeLoops(), 1);
  r.ctrl.destroy();
  assert.equal(r.liveTracks(), 0); assert.equal(r.activeLoops(), 0);
});

test('a camera that is unplugged mid-session stops everything and says so', async () => {
  const r = rig();
  await r.ctrl.start();
  r.streams[0].track.fire('ended');
  assert.equal(r.ctrl.status, 'error');
  assert.equal(r.activeLoops(), 0); assert.equal(r.liveTracks(), 0);
  assert.ok(r.events.some((e) => e[0] === 'error' && e[1] === 'The camera was disconnected.'));
  await r.ctrl.start();                                    // can start again afterwards
  assert.equal(r.ctrl.status, 'running');
});

test('a late "ended" event from an old stream does not disturb the new session', async () => {
  const r = rig();
  await r.ctrl.start();
  const old = r.streams[0];
  r.ctrl.stop();
  await r.ctrl.start();
  old.track.fire('ended');
  assert.equal(r.ctrl.status, 'running');
  assert.equal(r.activeLoops(), 1);
});

test('permission denied: error message, no stream, no model, can retry', async () => {
  const r = rig();
  let calls = 0;
  const deps = { hasCamera: () => true, getUserMedia: () => { calls += 1; return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); }, attachVideo: async () => {}, detachVideo() {}, loadEngine: () => { throw new Error('should not load'); }, startLoop: () => () => {} };
  const events = [];
  const ctrl = createSignController(deps, { onStatus: (s) => events.push(s), onError: (m) => events.push(m) });
  assert.equal(await ctrl.start(), false);
  assert.equal(ctrl.status, 'error');
  assert.match(events.find((e) => /blocked/.test(e)), /Camera access was blocked/);
  assert.equal(await ctrl.start(), false);
  assert.equal(calls, 2);
  assert.equal(r.loops.length, 0);
});

test('an over-constrained camera retries with plain video, once', async () => {
  const seen = [];
  const deps = {
    hasCamera: () => true,
    getUserMedia: (c) => { seen.push(c); return seen.length === 1 ? Promise.reject(Object.assign(new Error('x'), { name: 'OverconstrainedError' })) : Promise.resolve(makeStream()); },
    attachVideo: async () => {}, detachVideo() {}, loadEngine: async () => ({ close() {} }), startLoop: () => () => {},
  };
  const ctrl = createSignController(deps, {});
  assert.equal(await ctrl.start(), true);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].video, true);
});

test('model failure releases the camera and reports a clear error', async () => {
  const r = rig();
  const failing = createSignController({
    hasCamera: () => true,
    getUserMedia: async () => { const s = makeStream(); r.streams.push(s); return s; },
    attachVideo: async () => {}, detachVideo() {}, loadEngine: async () => { throw new Error('Could not load hand tracking (offline)'); }, startLoop: () => () => {},
  }, { onError: (m) => r.events.push(['error', m]), onStatus: (s) => r.events.push(['status', s]) });
  assert.equal(await failing.start(), false);
  assert.equal(r.liveTracks(), 0);
  assert.equal(failing.status, 'error');
  assert.ok(r.events.some((e) => e[0] === 'error' && /hand tracking/.test(e[1])));
});

test('a failing frame loop (fail) releases everything and reports the error', async () => {
  const r = rig();
  await r.ctrl.start();
  r.ctrl.fail(new Error('model closed'));
  assert.equal(r.ctrl.status, 'error');
  assert.equal(r.liveTracks(), 0); assert.equal(r.activeLoops(), 0);
});

test('no camera API: clear message, nothing opened', async () => {
  const events = [];
  const ctrl = createSignController({ hasCamera: () => false, getUserMedia: () => { throw new Error('no'); }, attachVideo() {}, detachVideo() {}, loadEngine() {}, startLoop() {} }, { onError: (m) => events.push(m) });
  assert.equal(await ctrl.start(), false);
  assert.ok(events.some((m) => /cannot use the camera/.test(m)));
});

test('GPU is tried first and the CPU is used when the GPU is unavailable', async () => {
  const delegates = [];
  const vision = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    GestureRecognizer: { createFromOptions: async (_f, o) => { delegates.push(o.baseOptions.delegate); if (o.baseOptions.delegate === 'GPU') throw new Error('no webgl'); return { close() { this.closed = true; } }; } },
  };
  const engine = await loadGestureEngine({ importVision: async () => vision, wasmUrl: 'w', modelUrl: 'm' });
  assert.deepEqual(delegates, ['GPU', 'CPU']);
  engine.close();
  assert.equal(engine.recognizer.closed, true);
});

test('GPU is used when it works (no needless CPU model)', async () => {
  const delegates = [];
  const vision = { FilesetResolver: { forVisionTasks: async () => ({}) }, GestureRecognizer: { createFromOptions: async (_f, o) => { delegates.push(o.baseOptions.delegate); return { close() {} }; } } };
  await loadGestureEngine({ importVision: async () => vision, wasmUrl: 'w', modelUrl: 'm' });
  assert.deepEqual(delegates, ['GPU']);
});

test('if both GPU and CPU fail the error mentions the internet connection', async () => {
  const vision = { FilesetResolver: { forVisionTasks: async () => ({}) }, GestureRecognizer: { createFromOptions: async () => { throw new Error('boom'); } } };
  await assert.rejects(loadGestureEngine({ importVision: async () => vision, wasmUrl: 'w', modelUrl: 'm' }), /Could not load hand tracking.*internet.*boom/);
});

test('camera messages are plain language', () => {
  assert.match(cameraMessage({ name: 'NotAllowedError' }), /blocked/);
  assert.match(cameraMessage({ name: 'NotFoundError' }), /No camera/);
  assert.match(cameraMessage({ name: 'NotReadableError' }), /another app/);
  assert.match(cameraMessage(new Error('x'), false), /https/);
});

// ── speech doubles ────────────────────────────────────────────────────────────
const speechRig = ({ keepAlive = true, lang = 'en-US', startThrows = false } = {}) => {
  const r = { instances: [], clock: 1000, log: [] };
  class FakeSR {
    constructor() { this.started = false; this.stopped = false; this.aborted = false; this.lang = ''; r.instances.push(this); }
    start() { if (startThrows) throw new Error('already started'); this.started = true; }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
    // helpers used by tests to simulate the browser
    say(text, isFinal) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] }); }
    end() { this.ended = true; this.onend?.(); }
    fail(code) { this.onerror?.({ error: code }); }
  }
  r.ctrl = createSpeechController({ getSR: () => FakeSR, now: () => r.clock }, { lang, keepAlive }, {
    onListening: (v) => r.log.push(['listening', v]),
    onTranscript: (t) => r.log.push(['transcript', t]),
    onError: (m) => r.log.push(['error', m]),
    onResult: (x) => r.log.push(['result', x.text, x.isFinal]),
    onFinal: (t) => r.log.push(['final', t]),
  });
  r.live = () => r.instances.filter((i) => i.started && !i.aborted && !i.stopped && !i.ended);
  r.of = (kind) => r.log.filter((l) => l[0] === kind);
  return r;
};

test('speech: start creates one recognizer with the chosen language', () => {
  const r = speechRig({ lang: 'hi-IN' });
  assert.equal(r.ctrl.start(), true);
  assert.equal(r.instances.length, 1);
  assert.equal(r.instances[0].lang, 'hi-IN');
  assert.deepEqual(r.of('listening').at(-1), ['listening', true]);
});

test('speech: unsupported browser → start does nothing', () => {
  const ctrl = createSpeechController({ getSR: () => null }, {}, {});
  assert.equal(ctrl.start(), false);
  assert.equal(ctrl.supported, false);
});

test('speech: changing language while listening replaces the recognizer — exactly one new one', () => {
  const r = speechRig();
  r.ctrl.start();
  const old = r.instances[0];
  r.ctrl.setLang('es-ES');
  assert.equal(r.instances.length, 2);
  assert.equal(old.aborted, true);
  assert.equal(r.instances[1].lang, 'es-ES');
  assert.equal(r.live().length, 1);
});

test('speech: the OLD recognizer\'s onend (arriving after a language change) does not start another recognizer', () => {
  const r = speechRig();
  r.ctrl.start();
  const old = r.instances[0];
  r.ctrl.setLang('fr-FR');
  old.end();                                              // the browser reports the aborted one ending
  old.end();
  assert.equal(r.instances.length, 2);
  assert.equal(r.live().length, 1);
  assert.equal(r.ctrl.active, true);
  assert.equal(r.of('listening').filter((l) => l[1] === false).length, 0);   // and does not flip the UI to "stopped"
});

test('speech: a stale recognizer\'s results and errors are ignored', () => {
  const r = speechRig();
  r.ctrl.start();
  const old = r.instances[0];
  r.ctrl.setLang('de-DE');
  old.say('ghost words', true);
  old.fail('not-allowed');
  assert.equal(r.of('result').length, 0);
  assert.equal(r.of('error').filter((e) => e[1]).length, 0);
  assert.equal(r.ctrl.wanted, true);
  r.instances[1].say('hallo', true);
  assert.deepEqual(r.of('result'), [['result', 'hallo', true]]);
});

test('speech: several quick language changes still leave exactly one live recognizer', () => {
  const r = speechRig();
  r.ctrl.start();
  for (const l of ['es-ES', 'fr-FR', 'de-DE', 'it-IT', 'en-GB']) r.ctrl.setLang(l);
  assert.equal(r.live().length, 1);
  assert.equal(r.instances.at(-1).lang, 'en-GB');
  r.instances.slice(0, -1).forEach((i) => i.end());
  assert.equal(r.instances.length, 6);
});

test('speech: language change while not listening starts nothing', () => {
  const r = speechRig();
  r.ctrl.setLang('es-ES');
  assert.equal(r.instances.length, 0);
  r.ctrl.start();
  assert.equal(r.instances[0].lang, 'es-ES');
});

test('speech: stop is definitive — a late onend never restarts, and the final text is delivered once', () => {
  const r = speechRig();
  r.ctrl.start();
  const rec = r.instances[0];
  rec.say('hello there', true);
  r.ctrl.stop();
  assert.equal(rec.stopped, true);
  rec.end();
  rec.end();
  assert.equal(r.instances.length, 1);
  assert.equal(r.ctrl.wanted, false);
  assert.deepEqual(r.of('final'), [['final', 'hello there']]);
  assert.deepEqual(r.of('listening').at(-1), ['listening', false]);
});

test('speech: stop lets the last words arrive before the end', () => {
  const r = speechRig();
  r.ctrl.start();
  const rec = r.instances[0];
  r.ctrl.stop();
  rec.say('last words', true);
  rec.end();
  assert.deepEqual(r.of('final'), [['final', 'last words']]);
});

test('speech: with keepAlive the browser ending after silence restarts exactly one recognizer', () => {
  const r = speechRig();
  r.ctrl.start();
  r.instances[0].end();
  assert.equal(r.instances.length, 2);
  assert.equal(r.live().length, 1);
  assert.equal(r.of('final').length, 0);                  // not finished: it is still listening
});

test('speech: without keepAlive the end is final', () => {
  const r = speechRig({ keepAlive: false });
  r.ctrl.start();
  r.instances[0].say('one shot', true);
  r.instances[0].end();
  assert.equal(r.instances.length, 1);
  assert.deepEqual(r.of('final'), [['final', 'one shot']]);
  assert.equal(r.ctrl.wanted, false);
});

test('speech: restart-loop protection stops a recognizer that keeps ending immediately', () => {
  const r = speechRig();
  r.ctrl.start();
  for (let i = 0; i < MAX_RESTARTS; i += 1) r.instances.at(-1).end();   // 6 quick restarts are tolerated
  assert.equal(r.instances.length, MAX_RESTARTS + 1);
  r.instances.at(-1).end();                                              // the 7th inside the window stops it
  assert.equal(r.instances.length, MAX_RESTARTS + 1);
  assert.equal(r.ctrl.wanted, false);
  assert.ok(r.of('error').some((e) => /keeps stopping/.test(e[1])));
  assert.deepEqual(r.of('listening').at(-1), ['listening', false]);
});

test('speech: restarts spread over time are not a loop', () => {
  const r = speechRig();
  r.ctrl.start();
  for (let i = 0; i < 20; i += 1) { r.clock += RESTART_WINDOW_MS + 1; r.instances.at(-1).end(); }
  assert.equal(r.instances.length, 21);
  assert.equal(r.ctrl.wanted, true);
});

test('speech: a sentence delivered twice in quick succession is kept once; the same words later are kept', () => {
  const r = speechRig();
  r.ctrl.start();
  const rec = r.instances[0];
  rec.say('good morning', true);
  r.clock += 200;
  rec.say('good morning', true);
  assert.equal(r.of('result').length, 1);
  r.clock += DUPLICATE_FINAL_MS + 10;
  rec.say('good morning', true);
  assert.equal(r.of('result').length, 2);
});

test('speech: the duplicate guard also works across an automatic restart', () => {
  const r = speechRig();
  r.ctrl.start();
  r.instances[0].say('see you tomorrow', true);
  r.instances[0].end();
  r.clock += 100;
  r.instances[1].say('see you tomorrow', true);
  assert.equal(r.of('result').length, 1);
});

test('speech: interim results are passed through and not stored as final', () => {
  const r = speechRig();
  r.ctrl.start();
  r.instances[0].say('hel', false);
  r.instances[0].say('hello', false);
  r.instances[0].say('hello world', true);
  assert.deepEqual(r.of('result'), [['result', 'hel', false], ['result', 'hello', false], ['result', 'hello world', true]]);
  assert.deepEqual(r.of('transcript').at(-1), ['transcript', 'hello world']);
});

test('speech: a permission error stops without restarting; no-speech is ignored', () => {
  const r = speechRig();
  r.ctrl.start();
  r.instances[0].fail('no-speech');
  assert.equal(r.ctrl.wanted, true);
  assert.equal(r.of('error').filter((e) => e[1]).length, 0);
  r.instances[0].fail('not-allowed');
  r.instances[0].end();
  assert.equal(r.ctrl.wanted, false);
  assert.equal(r.instances.length, 1);
  assert.ok(r.of('error').some((e) => /Microphone access was blocked/.test(e[1])));
});

test('speech: starting again replaces the previous recognizer (never two at once)', () => {
  const r = speechRig();
  r.ctrl.start(); r.ctrl.start(); r.ctrl.start();
  assert.equal(r.live().length, 1);
  assert.equal(r.instances.length, 3);
});

test('speech: unmount (destroy) aborts, ignores late events, and a later start works (StrictMode)', () => {
  const r = speechRig();
  r.ctrl.start();
  const old = r.instances[0];
  r.ctrl.destroy();
  assert.equal(old.aborted, true);
  old.say('late', true); old.end(); old.fail('network');
  assert.equal(r.of('result').length, 0);
  assert.equal(r.instances.length, 1);
  assert.equal(r.ctrl.start(), true);
  assert.equal(r.live().length, 1);
});

test('speech: a recognizer that cannot start reports an error and leaves nothing running', () => {
  const r = speechRig({ startThrows: true });
  assert.equal(r.ctrl.start(), false);
  assert.equal(r.ctrl.wanted, false);
  assert.equal(r.ctrl.active, false);
  assert.ok(r.of('error').some((e) => /Could not start speech recognition: already started/.test(e[1])));
});

test('speech: error text helpers and the privacy disclosure are kept', () => {
  assert.equal(speechErrorText('no-speech'), null);
  assert.match(speechErrorText('network'), /internet/);
  assert.match(speechErrorText('weird'), /weird/);
  assert.match(SPEECH_PRIVACY, /Google or Microsoft/);
  assert.match(SPEECH_PRIVACY, /no video leaves it/);
});
