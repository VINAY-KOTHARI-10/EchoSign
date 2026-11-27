'use strict';
const { checkAttachment, cleanFileName, asciiName, MAX_ATTACHMENT_BYTES } = require('../src/utils/chatAttachment');
const { shapeMessage } = require('../src/utils/chatShape');

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(40)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);

describe('chat attachments: what is accepted', () => {
  test('real PNG, JPEG, WebP and PDF files pass', () => {
    expect(checkAttachment(png, 'image/png').ok).toBe(true);
    expect(checkAttachment(jpg, 'image/jpeg').ok).toBe(true);
    expect(checkAttachment(webp, 'image/webp').ok).toBe(true);
    expect(checkAttachment(pdf, 'application/pdf').ok).toBe(true);
  });

  test('the bytes must match the claimed type (a renamed file is refused)', () => {
    const r = checkAttachment(pdf, 'image/png');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(415);
  });

  test('SVG, HTML and other types are refused', () => {
    expect(checkAttachment(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml').status).toBe(415);
    expect(checkAttachment(Buffer.from('<html></html>'), 'text/html').status).toBe(415);
  });

  test('empty and oversized files are refused', () => {
    expect(checkAttachment(Buffer.alloc(0), 'image/png').status).toBe(400);
    expect(checkAttachment({}, 'image/png').status).toBe(400);
    const big = Buffer.concat([png, Buffer.alloc(MAX_ATTACHMENT_BYTES)]);
    expect(checkAttachment(big, 'image/png').status).toBe(413);
  });

  test('a content type with parameters is understood', () => {
    expect(checkAttachment(png, 'image/png; charset=binary').ok).toBe(true);
  });
});

describe('chat attachments: file names', () => {
  test('folders, control characters and quotes are removed', () => {
    expect(cleanFileName('..%2F..%2Fetc%2Fpasswd', 'application/pdf')).toBe('passwd.pdf');
    expect(cleanFileName('notes "final".pdf', 'application/pdf')).toBe('notes final.pdf');
    expect(cleanFileName('C:\\Users\\x\\photo.JPG', 'image/jpeg')).toBe('photo.JPG');
  });

  test('a missing name or a wrong extension gets one that matches the type', () => {
    expect(cleanFileName('', 'image/png')).toBe('file.png');
    expect(cleanFileName('holiday', 'image/webp')).toBe('holiday.webp');
    expect(cleanFileName('scan.txt', 'application/pdf')).toBe('scan.txt.pdf');
  });

  test('long names are shortened but keep their extension, and header names are plain ASCII', () => {
    const n = cleanFileName(`${'a'.repeat(300)}.png`, 'image/png');
    expect(n.length).toBeLessThanOrEqual(100);
    expect(n.endsWith('.png')).toBe(true);
    expect(asciiName('café "x".pdf')).toBe("caf_ 'x'.pdf");
  });
});

describe('message shape with roles and files', () => {
  const base = { id: 'm1', roomId: 'global', content: '', createdAt: new Date(), deletedAt: null, user: { id: 'u1', username: 'Ms Rao', role: 'TEACHER' }, replyTo: null, reactions: [] };

  test('the sender role is passed on, and a file is described without its bytes', () => {
    const m = shapeMessage({ ...base, attachment: { id: 'a1', name: 'plan.pdf', mime: 'application/pdf', size: 1234, data: Buffer.from('secret') } });
    expect(m.user.role).toBe('TEACHER');
    expect(m.attachment).toEqual({ id: 'a1', name: 'plan.pdf', mime: 'application/pdf', size: 1234, isImage: false });
    expect(JSON.stringify(m)).not.toContain('secret');
  });

  test('images are flagged, and a deleted message shows no file', () => {
    const img = shapeMessage({ ...base, attachment: { id: 'a2', name: 'x.png', mime: 'image/png', size: 5 } });
    expect(img.attachment.isImage).toBe(true);
    const gone = shapeMessage({ ...base, deletedAt: new Date(), attachment: { id: 'a2', name: 'x.png', mime: 'image/png', size: 5 } });
    expect(gone.attachment).toBeNull();
  });
});
