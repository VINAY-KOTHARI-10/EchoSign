// src/utils/chatAttachment.js
// Files sent in the Community chat: only a few safe types, checked by what the bytes really are (not by what the browser
// claims), at most 2 MB, with a cleaned-up file name. SVG and HTML are not allowed because they can carry scripts.
'use strict';

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const ascii = (b, from, to) => b.subarray(from, to).toString('latin1');
const SIGNATURES = {
  'image/png': (b) => b.length > 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG',
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => b.length > 6 && ascii(b, 0, 4) === 'GIF8',
  'image/webp': (b) => b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  'application/pdf': (b) => b.length > 5 && ascii(b, 0, 5) === '%PDF-',
};
const ALLOWED_TYPES = Object.keys(SIGNATURES);
const EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** The bytes are a real file of the claimed (allowed) type and within the size limit. */
function checkAttachment(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, status: 400, message: 'No file was received.' };
  if (buffer.length > MAX_ATTACHMENT_BYTES) return { ok: false, status: 413, message: 'That file is too large. The limit is 2 MB.' };
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  if (!SIGNATURES[type]) return { ok: false, status: 415, message: 'Only images (PNG, JPG, GIF, WebP) and PDFs can be sent.' };
  if (!SIGNATURES[type](buffer)) return { ok: false, status: 415, message: 'That file does not match its type.' };
  return { ok: true, type };
}

/** A plain file name: no folders, no control characters, not too long, and an extension that matches the type. */
function cleanFileName(raw, type) {
  let name = '';
  try { name = decodeURIComponent(String(raw || '')); } catch { name = String(raw || ''); }
  name = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '').replace(/\s+/g, ' ').trim();
  const ext = EXTENSION[type];
  if (!name) name = `file.${ext}`;
  if (name.length > 100) { const dot = name.lastIndexOf('.'); name = dot > 0 && name.length - dot <= 8 ? name.slice(0, 100 - (name.length - dot)) + name.slice(dot) : name.slice(0, 100); }
  if (!new RegExp(`\\.${ext === 'jpg' ? '(jpe?g)' : ext}$`, 'i').test(name)) name = `${name}.${ext}`;
  return name;
}

/** A header-safe version of the name for Content-Disposition. */
const asciiName = (name) => name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");

module.exports = { MAX_ATTACHMENT_BYTES, ALLOWED_TYPES, checkAttachment, cleanFileName, asciiName };
