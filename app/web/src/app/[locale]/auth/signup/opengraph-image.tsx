import { contentType, renderOgSafe, size } from '@/lib/og';
import { SITE, siteHostname } from '@/lib/site';

export const runtime = 'nodejs';
export const alt = 'Create your WaFine account — access by invitation.';
export { size, contentType };

export default async function Image() {
  return renderOgSafe({
    eyebrow: 'Sign up',
    title: 'Create your WaFine account',
    subtitle: 'Access is by invitation — sign up with the email and WhatsApp number you were invited with.',
    badge: `Need an invite? ${SITE.contact}`,
    host: siteHostname(),
  });
}
