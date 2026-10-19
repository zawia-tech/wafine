import { getBlogPost } from '@/lib/blog';
import { contentType, renderOgSafe, size } from '@/lib/og';
import { siteHostname } from '@/lib/site';

export const runtime = 'nodejs';
export const alt = 'WaFine blog post';
export { size, contentType };

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) {
    return new Response('Not found', { status: 404 });
  }
  const firstTag = post.tags[0];
  return renderOgSafe({
    eyebrow: 'Blog',
    title: post.title,
    subtitle: post.description,
    badge: firstTag?.toUpperCase(),
    host: siteHostname(),
  });
}
