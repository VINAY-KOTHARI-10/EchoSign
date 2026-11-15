// src/utils/transcriptStream.js
// Streams a class's COMPLETE transcript as TXT, SRT or print-ready HTML through `write`, one database page at a time, so
// memory stays bounded however long the lecture is. `write(chunk)` may return a promise (backpressure).
'use strict';

const tx = require('./transcriptExport');
const { pageCaptions, firstCaption } = require('./captionPages');

const SELECT = { speakerName: true, text: true, source: true };

// kind: 'txt' | 'srt' | 'html'. Returns { captions } (how many captions were written).
async function streamTranscript({ prisma, classroom, kind, write, pageSize = 1000, summary = null }) {
  const [total, first] = await Promise.all([
    prisma.caption.count({ where: { classroomId: classroom.id } }),
    firstCaption(prisma, classroom.id),
  ]);
  const t0 = first ? new Date(first.createdAt).getTime() : 0;

  if (kind === 'txt') await write(tx.txtHead(classroom, total));
  if (kind === 'html') await write(tx.htmlHead(classroom, total, summary));

  let prev = null; let index = 0; let written = 0;
  for await (const page of pageCaptions(prisma, classroom.id, { select: SELECT, pageSize })) {
    let out = '';
    for (const c of page) {
      written += 1;
      if (kind === 'txt') out += tx.txtLine(c, t0);
      else if (kind === 'html') out += tx.htmlRow(c, t0);
      else {
        // An SRT cue needs the next caption's start time, so each cue is written when its successor is seen.
        if (prev) { index += 1; out += (index > 1 ? '\n' : '') + tx.srtCue(prev, index, t0, new Date(c.createdAt).getTime() - t0); }
        prev = c;
      }
    }
    if (out) await write(out);
  }
  if (kind === 'srt' && prev) { index += 1; await write((index > 1 ? '\n' : '') + tx.srtCue(prev, index, t0, null)); }
  if (kind === 'html') await write(tx.htmlTail());
  return { captions: written, expected: total };
}

module.exports = { streamTranscript };
