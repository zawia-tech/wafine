import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';

/**
 * Blog post loading: MDX files in `content/blog/<slug>.mdx`, frontmatter validated
 * with zod, drafts hidden in production. Everything is read at request time (the
 * root layout is `force-dynamic`), so a new post needs no rebuild of the route
 * manifest — only of the deployed files.
 */

const CONTENT_DIR = join(process.cwd(), 'content', 'blog');

const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  /**
   * ISO date. The YAML parser behind gray-matter turns an unquoted
   * `2026-10-17` into a Date, so both shapes are accepted and normalised.
   */
  date: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
      z.date(),
    ])
    .transform((value) =>
      value instanceof Date
        ? value.toISOString().slice(0, 10)
        : value,
    ),
  author: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  draft: z.boolean().default(false),
});

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: Date;
  author: string;
  tags: string[];
  draft: boolean;
  /** MDX body, frontmatter stripped. */
  body: string;
  readingMinutes: number;
}

/** Slugs are lowercase kebab-case: safe in URLs, in `<a href>` and as file names. */
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return slugPattern.test(slug);
}

function readingMinutes(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function loadPost(slug: string): BlogPost | null {
  if (!isValidSlug(slug)) return null;
  let raw: string;
  try {
    raw = readFileSync(join(CONTENT_DIR, `${slug}.mdx`), 'utf8');
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const parsed = frontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`content/blog/${slug}.mdx: invalid frontmatter — ${parsed.error.message}`);
  }
  const fm = parsed.data;
  return {
    slug,
    title: fm.title,
    description: fm.description,
    date: new Date(`${fm.date}T00:00:00Z`),
    author: fm.author,
    tags: fm.tags,
    draft: fm.draft,
    body: content,
    readingMinutes: readingMinutes(content),
  };
}

/**
 * Every published post, newest first. Drafts are included in development so the
 * author can preview them, and filtered out whenever `NODE_ENV=production`.
 * Future-dated posts are also filtered out in production (owner decision):
 * each post appears on its date, so a post dated tomorrow shows nowhere until
 * its day in UTC — not in the index, RSS, sitemap, OG image or the footer.
 */
export function publishedPosts(now: Date = new Date()): BlogPost[] {
  return readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => loadPost(file.replace(/\.mdx$/, '')))
    .filter(
      (post): post is BlogPost =>
        post !== null && !isHiddenFromListings(post, now),
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Future-dated posts are hidden everywhere in production (owner decision). */
function isFutureDated(post: BlogPost, now: Date): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  const todayMidnightUtc = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return post.date.getTime() > todayMidnightUtc.getTime();
}

/** `true` for posts that production listings must not surface: drafts and future-dated posts. */
function isHiddenFromListings(post: BlogPost, now: Date): boolean {
  return post.draft || isFutureDated(post, now);
}

/**
 * One post by slug, or null when it does not exist. Drafts stay reachable by
 * their direct URL (they carry `noindex` metadata) so an editor can preview a
 * draft link; they are hidden from the index and the RSS feed instead.
 * Future-dated posts resolve to null in production (the post route 404s); in
 * development a future date renders, so the author can preview the post.
 */
export function getBlogPost(slug: string, now: Date = new Date()): BlogPost | null {
  const post = loadPost(slug);
  if (post === null) return null;
  return isFutureDated(post, now) ? null : post;
}
