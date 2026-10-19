import { contentType, renderOgSafe, size } from '@/lib/og';
import { siteHostname } from '@/lib/site';

export const runtime = 'nodejs';
export const alt = 'WaFine Brand Guidelines & Media Assets';
export { size, contentType };

export default async function Image() {
  return renderOgSafe({
    eyebrow: 'Brand Assets',
    title: 'WaFine Brand Guidelines',
    subtitle: 'Official guidelines, logos, colours and media resources.',
    badge: 'Open-core · Built on OpenWA',
    host: siteHostname(),
  });
}
