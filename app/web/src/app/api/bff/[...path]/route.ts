import { configFromEnv, proxyToBff } from '@/lib/bff-proxy';

// Same-origin proxy to the BFF (docs/05-bff-frontend-plan.md, decision D7). The BFF address and the Access service
// token are read here, on the server, and never reach the browser. All the logic lives in
// lib/bff-proxy.ts so it can be tested without Next.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  return proxyToBff(req, path, configFromEnv());
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
