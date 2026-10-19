import { discoverabilityUrls, humansTxt } from '@/lib/discoverability';

export const dynamic = 'force-dynamic';

/** `/humans.txt` — humanstxt.org format, the full credits block included. */
export async function GET() {
  return new Response(humansTxt(discoverabilityUrls()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
