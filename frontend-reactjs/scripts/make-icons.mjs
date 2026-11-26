// Draws the EchoSign app icons (PNG) with no dependencies, so they can be regenerated: node scripts/make-icons.mjs
// Same artwork as src/components/Logo.jsx: violet gradient tile with a white sound wave.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]);
};
// The wave from the logo (64-unit space): three cubic segments.
const SEGMENTS = [
  [[10, 34], [16, 20], [20, 20], [26, 34]],
  [[26, 34], [32, 48], [36, 48], [42, 34]],
  [[42, 34], [48, 20], [50, 24], [54, 30]],
];
const WAVE = SEGMENTS.flatMap((s) => Array.from({ length: 40 }, (_, i) => bez(...s, i / 40))).concat([[54, 30]]);

const distToSeg = (px, py, a, b) => {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
};

function render(size, { maskable }) {
  const SS = 3; // supersampling for smooth edges
  const scale = maskable ? 0.62 : 1;
  const px = new Uint8Array(size * size * 4);
  const waveAt = (x, y) => { // x,y in 64-unit space, returns distance to the wave centre line
    const wx = 32 + (x - 32) / scale; const wy = 32 + (y - 32) / scale;
    let d = Infinity;
    for (let i = 0; i < WAVE.length - 1; i += 1) d = Math.min(d, distToSeg(wx, wy, WAVE[i], WAVE[i + 1]));
    return d * scale;
  };
  const inTile = (x, y) => {
    if (maskable) return true;
    const r = 18; const cx = Math.min(Math.max(x, r), 64 - r); const cy = Math.min(Math.max(y, r), 64 - r);
    return Math.hypot(x - cx, y - cy) <= r;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let tile = 0; let wave = 0;
      for (let sy = 0; sy < SS; sy += 1) for (let sx = 0; sx < SS; sx += 1) {
        const ux = ((x + (sx + 0.5) / SS) / size) * 64; const uy = ((y + (sy + 0.5) / SS) / size) * 64;
        if (inTile(ux, uy)) { tile += 1; if (waveAt(ux, uy) <= 2.5) wave += 1; }
      }
      const g = ((x + y) / (2 * size)); // diagonal gradient 0..1
      const base = [0x4b + (0x7a - 0x4b) * g, 0x2c + (0x5c - 0x2c) * g, 0xd6 + (0xff - 0xd6) * g];
      const a = tile / (SS * SS); const w = wave / Math.max(1, tile);
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c += 1) px[o + c] = Math.round(base[c] * (1 - w) + 255 * w);
      px[o + 3] = Math.round(a * 255);
    }
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) { raw[y * (size * 4 + 1)] = 0; Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
const out = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
for (const [name, size, maskable] of out) {
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), png(size, render(size, { maskable })));
  console.log(`wrote public/icons/${name}`);
}
