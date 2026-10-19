/**
 * Author data for /authors. Public profile links only: no phone number, no email.
 * Server-safe, so the page can emit schema.org JSON-LD without client code.
 */
export const AUTHOR = {
  name: 'Mohamed Moughamir',
  github: 'https://github.com/moughamir',
  zawia: 'https://zawia.tech',
} as const;

/** schema.org Person for the author card. `role` is the localized job title. */
export function authorJsonLd({ role }: { role: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: AUTHOR.name,
    jobTitle: role,
    url: AUTHOR.github,
    sameAs: [AUTHOR.github],
    affiliation: {
      '@type': 'Organization',
      name: 'Zawia.tech',
      url: AUTHOR.zawia,
    },
  } as const;
}
