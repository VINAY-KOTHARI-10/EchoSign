// Copies MediaPipe's WebAssembly files from the installed package into public/mediapipe/wasm, so Sign Meet can load hand
// tracking from this app (it still falls back to the public CDN if they are missing). Runs before dev and build.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const to = join(root, 'public', 'mediapipe', 'wasm');
if (!existsSync(from)) { console.warn('[copy-mediapipe] package files not found; Sign Meet will use the CDN.'); process.exit(0); }
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log('[copy-mediapipe] hand-tracking files copied to public/mediapipe/wasm');
