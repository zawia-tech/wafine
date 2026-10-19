import { contentType, renderOgSafe, size } from '@/lib/og';
import { SITE, siteHostname } from '@/lib/site';

export const runtime = 'nodejs';
export const alt = 'Sign in to WaFine — invite-only access.';
export { size, contentType };

export default async function Image() {
  return renderOgSafe({
    eyebrow: 'Sign in',
    title: 'Sign in to WaFine',
    subtitle: 'Invite-only access for the Zawia Tech community and invited teams.',
    badge: `Need an invite? ${SITE.contact}`,
    host: siteHostname(),
  });
}
