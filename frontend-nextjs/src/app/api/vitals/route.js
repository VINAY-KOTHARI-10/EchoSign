// Receives the Core Web Vitals measured in real visitors' browsers (see components/WebVitals.js) and logs them.
// Only a few known fields are kept and the size is limited, so this address cannot be used to fill the logs with junk.
import { NextResponse } from 'next/server';

const NAMES = new Set(['CLS', 'FCP', 'INP', 'LCP', 'TTFB', 'FID']);

export async function POST(request) {
  const text = await request.text();
  if (text.length > 1000) return new NextResponse(null, { status: 413 });
  try {
    const m = JSON.parse(text);
    if (NAMES.has(m.name) && typeof m.value === 'number') {
      console.info(JSON.stringify({ level: 'info', type: 'web-vital', name: m.name, value: m.value, rating: String(m.rating || '').slice(0, 20), path: String(m.path || '').slice(0, 100) }));
    }
  } catch { /* ignore malformed reports */ }
  return new NextResponse(null, { status: 204 });
}
