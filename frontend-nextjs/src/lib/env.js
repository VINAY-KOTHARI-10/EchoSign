// Environment variables, checked once with Zod (INT257: Environment Variables).
// Server-only: this file can never be imported into browser code, so secrets cannot leak into the client bundle.
// Variables that start with NEXT_PUBLIC_ are the only ones that are intentionally visible in the browser.
import 'server-only';
import { z } from 'zod';

const schema = z.object({
  BACKEND_URL: z.string().url().default('http://localhost:5000'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  REVALIDATE_SECRET: z.string().min(8).optional(),
});

const parsed = schema.safeParse({
  BACKEND_URL: (process.env.BACKEND_URL || '').replace(/\/+$/, '') || undefined,
  NEXT_PUBLIC_SITE_URL: (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '') || undefined,
  REVALIDATE_SECRET: process.env.REVALIDATE_SECRET || undefined,
});

if (!parsed.success) {
  // A clear message at start-up beats a confusing failure later.
  throw new Error(`Invalid environment variables: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
}

export const env = parsed.data;
