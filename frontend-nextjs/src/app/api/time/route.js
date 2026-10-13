// The time on the server, for the client-side rendering example (/rendering/csr).
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ time: `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC` }, { headers: { 'Cache-Control': 'no-store' } });
}
