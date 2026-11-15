// Camera + hand-tracking lifecycle, kept free of React and of the browser so it can be tested with doubles.
//
// Starting takes several awaited steps (camera permission, attaching the video, loading the hand model). The person can
// press Stop, leave the page or switch mode during any of them. Every start therefore carries a generation number;
// when a step finishes and its generation is no longer current, whatever that step produced is released and nothing else
// happens. This guarantees:
//  - no camera stream, frame loop or recognizer is left running after Stop or unmount;
//  - Stop during the permission prompt or during the model download is respected (no loop starts afterwards);
//  - pressing Start twice never opens two streams or runs two loops;
//  - an old, abandoned start can never overwrite the state of a newer one;
//  - the hand model is loaded once and shared, and closed only when no session is using it.

// Plain-language reasons for the errors people actually hit.
export const cameraMessage = (err, secure = true) => {
  if (secure === false) return 'The camera only works on a secure (https) page.';
  switch (err && err.name) {
    case 'NotAllowedError': case 'SecurityError': return 'Camera access was blocked. Allow it with the camera icon in the address bar, then try again.';
    case 'NotFoundError': case 'OverconstrainedError': return 'No camera was found on this device.';
    case 'NotReadableError': case 'AbortError': return 'The camera is being used by another app. Close it and try again.';
    default: return (err && err.message) || 'Could not start sign recognition.';
  }
};

// Loads the MediaPipe gesture recognizer, trying the GPU first and falling back to the CPU (slower, but works).
// Returns { recognizer, vision, close() }.
export async function loadGestureEngine({ importVision, wasmUrl, modelUrl }) {
  let vision;
  let recognizer;
  try {
    vision = await importVision();
    const fileset = await vision.FilesetResolver.forVisionTasks(wasmUrl);
    const make = (delegate) => vision.GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl, delegate }, runningMode: 'VIDEO', numHands: 1,
    });
    try { recognizer = await make('GPU'); } catch { recognizer = await make('CPU'); }
  } catch (err) {
    throw new Error(`Could not load hand tracking (it needs an internet connection the first time). ${err.message || ''}`.trim());
  }
  return { recognizer, vision, close: () => { try { recognizer.close(); } catch { /* already closed */ } } };
}

const releaseStream = (stream) => {
  if (!stream) return;
  try { stream.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
};

// deps:
//   hasCamera() -> bool                      getUserMedia(constraints) -> Promise<MediaStream>
//   attachVideo(stream) -> Promise           detachVideo()
//   loadEngine() -> Promise<{ close() }>     startLoop(engine) -> stopFn (cancels its frame loop)
//   secure() -> bool                         (optional) is the page a secure context
// events: { onStatus(status), onError(message), onReset() }
export function createSignController(deps, events = {}) {
  let status = 'idle';
  let generation = 0;      // bumped by every start and every stop
  let starting = false;
  let stream = null;       // the stream of the current session
  let stopLoop = null;     // stops the current session's frame loop
  let removeEnded = null;
  let engine = null;       // the loaded hand model, shared between sessions
  let loading = null;      // the model download in flight, shared so it is never started twice

  const emit = (name, ...args) => { try { events[name]?.(...args); } catch { /* a handler's failure must not break cleanup */ } };
  const setStatus = (next) => { status = next; emit('onStatus', next); };

  // Everything a session owns. Safe to call any number of times.
  const releaseSession = () => {
    if (stopLoop) { try { stopLoop(); } catch { /* ignore */ } stopLoop = null; }
    if (removeEnded) { removeEnded(); removeEnded = null; }
    releaseStream(stream); stream = null;
    try { deps.detachVideo(); } catch { /* the element may be gone */ }
    emit('onReset');
  };

  const getEngine = () => {
    if (engine) return Promise.resolve(engine);
    if (!loading) {
      const mine = deps.loadEngine().then((e) => {
        if (loading === mine) { engine = e; loading = null; } else e.close(); // disposed while loading: nobody wants it
        return e;
      }, (err) => { if (loading === mine) loading = null; throw err; });
      loading = mine;
    }
    return loading;
  };

  async function start() {
    if (starting || stream || stopLoop) return false;        // already starting or running
    const id = (generation += 1);
    starting = true;
    const alive = () => id === generation;
    emit('onError', '');
    setStatus('loading');
    let mine = null;                                          // the stream this start opened
    try {
      if (!deps.hasCamera()) throw new Error('This browser cannot use the camera. Try a recent Chrome, Edge or Safari.');
      try {
        mine = await deps.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      } catch (err) {
        if (!alive() || err.name !== 'OverconstrainedError') throw err;
        mine = await deps.getUserMedia({ video: true, audio: false }); // camera cannot do 640x480
      }
      if (!alive()) { releaseStream(mine); return false; }    // Stop / unmount while the permission prompt was open

      stream = mine;
      // If the camera is unplugged or taken by another app, say so instead of freezing silently.
      const track = mine.getVideoTracks()[0];
      if (track && track.addEventListener) {
        const onEnded = () => {
          if (!alive()) return;
          stop();
          emit('onError', 'The camera was disconnected.');
          setStatus('error');
        };
        track.addEventListener('ended', onEnded);
        removeEnded = () => { try { track.removeEventListener('ended', onEnded); } catch { /* ignore */ } };
      }
      await deps.attachVideo(mine);
      if (!alive()) { releaseStream(mine); return false; }

      const eng = await getEngine();
      if (!alive()) { releaseStream(mine); return false; }    // Stop / unmount while the model was loading

      stopLoop = deps.startLoop(eng);
      starting = false;
      setStatus('running');
      return true;
    } catch (err) {
      if (!alive()) { releaseStream(mine); return false; }    // an abandoned start must not touch the newer state
      releaseSession();
      starting = false;
      emit('onError', cameraMessage(err, deps.secure ? deps.secure() : true));
      setStatus('error');
      return false;
    } finally {
      if (alive() && starting && !stopLoop) starting = false;
    }
  }

  // Definitive: releases the camera and the frame loop, and invalidates any start still waiting on the browser.
  function stop() {
    generation += 1;
    starting = false;
    releaseSession();
    setStatus('idle');
  }

  // Unmount. Also closes the hand model (no session can be using it now). Safe to start again afterwards (StrictMode).
  function destroy() {
    stop();
    if (engine) { engine.close(); engine = null; }
    loading = null; // a model still downloading is closed by getEngine when it arrives
  }

  // A fatal problem found by the frame loop (e.g. the recognizer failed).
  function fail(err) {
    generation += 1;
    starting = false;
    releaseSession();
    emit('onError', cameraMessage(err, deps.secure ? deps.secure() : true));
    setStatus('error');
  }

  return {
    start, stop, destroy, fail,
    get status() { return status; },
    get running() { return Boolean(stopLoop); },
    get hasStream() { return Boolean(stream); },
    get modelLoaded() { return Boolean(engine); },
  };
}
