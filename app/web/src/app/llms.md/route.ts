import { discoverabilityUrls, llmsMd } from '@/lib/discoverability';

export const dynamic = 'force-dynamic';

/** `/llms.md` — Markdown twin of llms.txt with an agent how-to section. */
export async function GET() {
  return new Response(llmsMd(discoverabilityUrls()), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
