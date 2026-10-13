// On-demand revalidation (INT257: Caching and Revalidation). POST /api/revalidate with the header
// "x-revalidate-secret: <REVALIDATE_SECRET>" and a JSON body such as { "tag": "languages" } refreshes cached data right away,
// for example after an admin changes the language list in EchoSign.
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function POST(request) {
  if (!env.REVALIDATE_SECRET || request.headers.get('x-revalidate-secret') !== env.REVALIDATE_SECRET) {
    return NextResponse.json({ success: false, error: 'Not allowed.' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body.tag === 'string') revalidateTag(body.tag.slice(0, 100), 'max');
  else if (typeof body.path === 'string') revalidatePath(body.path.slice(0, 200));
  else return NextResponse.json({ success: false, error: 'Send { "tag": "..." } or { "path": "..." }.' }, { status: 400 });
  return NextResponse.json({ success: true, revalidated: true, at: Date.now() });
}
