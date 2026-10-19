import { publishedPosts } from '@/lib/blog';
import { SITE } from '@/lib/site';

/** RSS 2.0 feed for the blog. Absolute URLs come from SITE, never hardcoded. */
export async function GET() {
  const posts = publishedPosts();
  const lastBuild = posts[0]?.date.toUTCString() ?? new Date().toUTCString();

  const items = posts
    .map((post) => {
      const url = `${SITE.url}/blog/${post.slug}`;
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${post.date.toUTCString()}</pubDate>`,
        `      <description>${escapeXml(post.description)}</description>`,
        `      <author>${escapeXml(post.author)}</author>`,
        ...post.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(SITE.name)} blog</title>`,
    `    <link>${escapeXml(`${SITE.url}/blog`)}</link>`,
    `    <atom:link href="${escapeXml(`${SITE.url}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    '    <description>Announcements and deep dives from the WaFine team.</description>',
    '    <language>en</language>',
    `    <lastBuildDate>${lastBuild}</lastBuildDate>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
