// Supported sign gestures. MediaPipe's built-in gesture model recognises these hand shapes;
// each is mapped to a classroom phrase that is sent as a caption.
export const GESTURES = [
  { id: 'Open_Palm', emoji: '🖐️', label: 'Open palm', phrase: 'Hello' },
  { id: 'Thumb_Up', emoji: '👍', label: 'Thumbs up', phrase: 'Yes, I understand' },
  { id: 'Thumb_Down', emoji: '👎', label: 'Thumbs down', phrase: "No, I don't understand" },
  { id: 'Pointing_Up', emoji: '☝️', label: 'Point up', phrase: 'I have a question' },
  { id: 'Closed_Fist', emoji: '✊', label: 'Closed fist', phrase: 'Please wait' },
  { id: 'Victory', emoji: '✌️', label: 'Victory / peace', phrase: 'Please repeat that' },
  { id: 'ILoveYou', emoji: '🤟', label: 'I love you', phrase: 'Thank you' },
];

export const gestureById = (id) => GESTURES.find((g) => g.id === id);

// Pinned runtime + model. The wasm runtime and model are fetched from these CDNs on first use.
export const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm';
export const GESTURE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

// A gesture must be held for this many consecutive detections before it counts,
// then the same gesture is ignored for the cooldown, so a held hand isn't repeated.
export const HOLD_FRAMES = 10;
export const MIN_SCORE = 0.6;
export const COOLDOWN_MS = 2500;
