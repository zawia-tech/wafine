import { discoverabilityUrls, llmsFullTxt } from '@/lib/discoverability';

export const dynamic = 'force-dynamic';

/** `/llms-full.txt` — the expanded agent brief (product, J1–J7, REST/MCP, connector). */
export async function GET() {
  return new Response(llmsFullTxt(discoverabilityUrls()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
