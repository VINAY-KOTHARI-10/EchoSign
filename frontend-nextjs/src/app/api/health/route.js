// A small health check that runs on the Edge Runtime (INT257: Edge Runtime). The Edge Runtime is a lighter engine that
// starts instantly and runs close to the visitor, with fewer Node.js features. (Next.js 16 marks it as deprecated for
// new work, but it is still part of the syllabus, so this one route shows how it is selected.)
export const runtime = 'edge';

export async function GET() {
  return Response.json({ status: 'ok', runtime: 'edge', time: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
