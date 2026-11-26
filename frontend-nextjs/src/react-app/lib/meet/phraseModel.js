// A small trained model that recognises twelve phrase signs (HELLO, HELP, I LOVE YOU, NO, PAIN, PEACE, PLEASE, SORRY,
// STOP, SUPERB, THANK YOU, YES) from the 21 hand landmarks MediaPipe finds in one video frame.
//
// It is a random forest trained elsewhere (scikit-learn) and exported to plain JSON, so it runs in the browser: nothing
// is sent to a server, and the camera picture never leaves the device. `predictProba` reproduces scikit-learn's maths
// exactly (tests compare it with scikit-learn's own answers), but how often it is RIGHT depends on the training data,
// which has not been measured here. So the meeting screen shows its guesses with a confidence and only commits a
// phrase after it has been seen steadily.

export const LANDMARKS = 21;

// Same preparation the model was trained with: wrist at the origin, then scaled so the largest absolute value is 1.
export function normalizeLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length !== LANDMARKS) return null;
  const pts = landmarks.map((p) => [Number(p.x), Number(p.y), Number(p.z) || 0]);
  if (pts.some((p) => p.some((v) => !Number.isFinite(v)))) return null;
  const [wx, wy, wz] = pts[0];
  const out = [];
  let max = 0;
  pts.forEach(([x, y, z]) => {
    const v = [x - wx, y - wy, z - wz];
    v.forEach((n) => { max = Math.max(max, Math.abs(n)); });
    out.push(...v);
  });
  return max > 0 ? out.map((n) => n / max) : out;
}

// The same hand as seen in a mirror (left hand <-> right hand): flip the left-right axis of every landmark.
export const mirrorFeatures = (features) => features.map((v, i) => (i % 3 === 0 ? -v : v));

// Average of every tree's class distribution (scikit-learn's predict_proba). Features are compared as 32-bit numbers,
// exactly as scikit-learn does.
export function predictProba(model, features) {
  const k = model.classes.length;
  const sum = new Array(k).fill(0);
  for (const tree of model.trees) {
    let node = 0;
    while (tree.l[node] !== -1) node = Math.fround(features[tree.f[node]]) <= tree.t[node] ? tree.l[node] : tree.r[node];
    const leaf = tree.p[node];
    for (let c = 0; c < k; c += 1) sum[c] += leaf[c];
  }
  return sum.map((v) => v / model.trees.length);
}

// The most likely phrase, or null when the model is not confident enough. Both the hand as seen and its mirror image
// are tried, so a left hand works as well as a right hand; the more confident reading wins.
export function predictPhrase(model, landmarks, { minProbability = 0.6 } = {}) {
  const features = normalizeLandmarks(landmarks);
  if (!features || features.length !== model.features) return null;
  let best = null;
  for (const f of [features, mirrorFeatures(features)]) {
    const proba = predictProba(model, f);
    const i = proba.indexOf(Math.max(...proba));
    if (!best || proba[i] > best.probability) best = { label: model.classes[i], probability: proba[i] };
  }
  return best.probability >= minProbability ? best : { label: null, probability: best.probability };
}

export async function loadPhraseModel(url = '/models/phrase-signs.json', fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error('Could not load the phrase model.');
  const model = await res.json();
  if (!model || model.kind !== 'random-forest' || !Array.isArray(model.trees) || !Array.isArray(model.classes)) throw new Error('The phrase model file is not valid.');
  return model;
}
