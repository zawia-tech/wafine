import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { publishedPosts } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Announcements and deep dives from the WaFine team.',
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export default function BlogIndexPage() {
  const posts = publishedPosts();
  return (
    <>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Blog</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          News from the WaFine team
        </h1>
        <p className="mt-3 text-base-content/75">
          Product announcements, launch notes and deep dives.{' '}
          <a href="/blog/rss.xml" className="link-primary">
            Subscribe via RSS
          </a>
          .
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="mt-12 text-base-content/75">No posts published yet — check back soon.</p>
      ) : (
        <ul className="mt-12 space-y-10">
          {posts.map((post) => (
            <li key={post.slug} className="border-t border-base-300 pt-8">
              <p className="text-sm text-base-content/75">
                <time dateTime={post.date.toISOString().slice(0, 10)}>
                  {dateFormatter.format(post.date)}
                </time>
                {' · '}
                {post.readingMinutes} min read
                {post.draft ? ' · Draft' : ''}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                <Link href={`/blog/${post.slug}`} className="hover:underline">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 text-base-content/75">{post.description}</p>
              <p className="mt-3 text-sm text-base-content/75">{post.author}</p>
              {post.tags.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Tags">
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
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
