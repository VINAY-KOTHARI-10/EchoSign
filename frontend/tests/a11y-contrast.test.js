// Accessibility: the colour tokens in the stylesheets must keep text readable (WCAG AA: 4.5:1 for normal text) in
// light, dark and both high-contrast modes. It reads the real CSS, so changing a token cannot silently break contrast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = (f) => readFileSync(new URL(`../src/styles/${f}`, import.meta.url), 'utf8');
const GLOBAL = css('global.css');
const PREMIUM = css('premium.css');

const block = (text, selector) => {
  const i = text.indexOf(selector);
  assert.ok(i >= 0, `selector not found: ${selector}`);
  return text.slice(text.indexOf('{', i) + 1, text.indexOf('}', i));
};
const tokens = (text) => Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const light = { ...tokens(block(GLOBAL, ':root {')), ...tokens(block(PREMIUM, ':root {')) };
const dark = { ...light, ...tokens(block(PREMIUM, ":root[data-theme='dark'] {")) };
const lightHigh = { ...light, ...tokens(block(GLOBAL, ":root[data-contrast='high'] {")) };
const darkHigh = { ...dark, ...tokens(block(PREMIUM, ":root[data-theme='dark'][data-contrast='high'] {")) };

const MODES = { light, dark, 'light high-contrast': lightHigh, 'dark high-contrast': darkHigh };
const PAIRS = [
  ['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface-2'],
  ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'],
  ['violet-dark', 'violet-light'], ['go', 'surface'], ['stop', 'surface'],
];

for (const [mode, t] of Object.entries(MODES)) {
  for (const [fg, bg] of PAIRS) {
    test(`${mode}: --${fg} on --${bg} is at least 4.5:1`, () => {
      assert.ok(t[fg] && t[bg], `token missing (${fg} or ${bg})`);
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${t[fg]} on ${t[bg]} is only ${r.toFixed(2)}:1`);
    });
  }
}

test('white text on the brand gradient is readable (4.5:1 on the dark stops, 3:1 for large text on the lightest)', () => {
  ['#4b2cd6', '#5b3df5'].forEach((c) => assert.ok(ratio('#ffffff', c) >= 4.5, c));
  assert.ok(ratio('#ffffff', '#7a5cff') >= 3, 'lightest gradient stop must still pass for large/bold text');
});
