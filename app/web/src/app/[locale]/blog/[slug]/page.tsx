import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import type { ComponentProps } from 'react';
import { getBlogPost } from '@/lib/blog';
import { localeAlternates, localizedHref } from '@/lib/locale-urls';

/**
 * MDX element map for blog bodies. No `@tailwindcss/typography` plugin on this
 * branch, so every element carries its own Tailwind classes — keeps the blog
 * self-contained and the bundle light.
 */
const mdxComponents = {
  h1: (props: ComponentProps<'h1'>) => (
    <h1 className="mt-10 text-3xl font-bold tracking-tight" {...props} />
  ),
  h2: (props: ComponentProps<'h2'>) => (
    <h2 className="mt-10 text-2xl font-semibold tracking-tight" {...props} />
  ),
  h3: (props: ComponentProps<'h3'>) => (
    <h3 className="mt-8 text-xl font-semibold tracking-tight" {...props} />
  ),
  p: (props: ComponentProps<'p'>) => (
    <p className="mt-4 text-base leading-7 text-base-content/80" {...props} />
  ),
  a: (props: ComponentProps<'a'>) => <a className="link-primary" {...props} />,
  ul: (props: ComponentProps<'ul'>) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-base-content/80" {...props} />
  ),
  ol: (props: ComponentProps<'ol'>) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6 text-base leading-7 text-base-content/80" {...props} />
  ),
  li: (props: ComponentProps<'li'>) => <li className="mt-1" {...props} />,
  blockquote: (props: ComponentProps<'blockquote'>) => (
    <blockquote
      className="mt-4 border-l-4 pl-4 italic text-base-content/75"
      {...props}
    />
  ),
  code: (props: ComponentProps<'code'>) => (
    <code className="rounded-sm bg-base-200 px-1.5 py-0.5 text-sm" {...props} />
  ),
  pre: (props: ComponentProps<'pre'>) => (
    <pre
      className="mt-4 overflow-x-auto rounded-field bg-base-200 p-4 text-sm"
      {...props}
    />
  ),
  strong: (props: ComponentProps<'strong'>) => <strong className="font-semibold" {...props} />,
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params & { locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  const postPath = localeAlternates(locale, `/blog/${post.slug}`);
  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author }],
    alternates: postPath,
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      publishedTime: post.date.toISOString(),
      authors: [post.author],
      tags: post.tags,
      url: localizedHref(locale, `/blog/${post.slug}`),
    },
    // Draft posts must not be advertised to crawlers even in a dev mirror.
    robots: post.draft ? { index: false, follow: false } : undefined,
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  // next-mdx-remote 6 strips JavaScript expressions ({...}) from MDX by default. Posts are
  // plain Markdown plus the element map above, so the safe defaults stay on, spelled out
  // here so a post that needs an expression fails visibly in review instead of silently.
  const { content } = await compileMDX({
    source: post.body,
    components: mdxComponents,
    options: { blockJS: true, blockDangerousJS: true },
  });

  return (
    <article>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Blog</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{post.title}</h1>
        <p className="mt-3 text-sm text-base-content/75">
          {post.author}
          {' · '}
          <time dateTime={post.date.toISOString().slice(0, 10)}>
            {dateFormatter.format(post.date)}
          </time>
          {' · '}
          {post.readingMinutes} min read
          {post.draft ? ' · Draft' : ''}
        </p>
        {post.tags.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tags">
            {post.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full px-3 py-1 text-xs font-medium text-primary"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div className="mt-8">{content}</div>

      <footer className="mt-12 border-t border-base-300 pt-6">
        <p className="text-sm text-base-content/75">
          WaFine, sponsored by Ai4x Academy, built by ZawIA.Tech, open-core on OpenWA.
        </p>
        <p className="mt-2">
          <Link href="/blog" className="link-primary text-sm">
            ← All posts
          </Link>
        </p>
      </footer>
    </article>
  );
}
