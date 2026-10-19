import { discoverabilityUrls, llmsTxt } from '@/lib/discoverability';

export const dynamic = 'force-dynamic';

/** `/llms.txt` — llms.txt standard, URLs resolved from the deployment env. */
export async function GET() {
  return new Response(llmsTxt(discoverabilityUrls()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
