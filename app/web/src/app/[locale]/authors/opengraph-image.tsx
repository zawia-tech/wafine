import { contentType, renderOgSafe, size } from '@/lib/og';
import { siteHostname } from '@/lib/site';

export const runtime = 'nodejs';
export const alt = 'WaFine Authors';
export { size, contentType };

export default async function Image() {
  return renderOgSafe({
    eyebrow: 'Authors',
    title: 'The people behind WaFine',
    subtitle: 'Mohamed Moughamir, founder and maintainer.',
    badge: 'Open-core · Built on OpenWA',
    host: siteHostname(),
  });
}
