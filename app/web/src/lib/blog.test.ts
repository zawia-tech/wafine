import { describe, expect, test } from 'bun:test';
import { getBlogPost, isValidSlug, publishedPosts } from './blog';

describe('blog content', () => {
  test('the launch post exists with valid frontmatter', () => {
    const post = getBlogPost('introducing-wafine');
    expect(post).not.toBeNull();
    expect(post?.title).toBe('Introducing WaFine');
    expect(post?.draft).toBe(true);
    expect(post?.author).toBe('Mohamed Moughamir with the WaFine agents');
    expect(post?.tags).toContain('announcement');
    expect(post?.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(post?.body.length).toBeGreaterThan(100);
  });

  test('posts sort newest first', () => {
    const posts = publishedPosts();
    for (let i = 1; i < posts.length; i += 1) {
      const prev = posts[i - 1];
      const cur = posts[i];
      if (prev && cur) {
        expect(prev.date.getTime()).toBeGreaterThanOrEqual(cur.date.getTime());
      }
    }
  });

  test('the launch-day, Claude/MCP guide and open-core posts are published', () => {
    for (const slug of ['wafine-launch-day', 'how-wafine-works-with-claude-and-mcp', 'privacy-by-design-open-core']) {
      const post = getBlogPost(slug);
      expect(post).not.toBeNull();
      expect(post?.draft).toBe(false);
      expect(post?.title.length).toBeGreaterThan(0);
      expect(post?.description.length).toBeGreaterThan(0);
      expect(post?.author).toBe('Mohamed Moughamir');
      expect(post?.tags.length).toBeGreaterThanOrEqual(1);
      expect(post?.body.length).toBeGreaterThan(500);
      expect(post?.readingMinutes).toBeGreaterThanOrEqual(1);
    }
  });

  test('slugs are validated before touching the filesystem', () => {
    expect(isValidSlug('introducing-wafine')).toBe(true);
    expect(isValidSlug('../secrets')).toBe(false);
    expect(isValidSlug('UPPER')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(getBlogPost('../package')).toBeNull();
  });
});

describe('future-dated posts in production', () => {
  // Frozen clock: 19 Oct 2026 UTC — launch-day (10-20), claude/mcp (10-21) and
  // privacy (10-22) are all future-dated on this instant, introducing-wafine is not.
  const frozen = new Date('2026-10-19T06:00:00Z');

  function withNodeEnv<T>(env: string, fn: () => T): T {
    const previous = process.env.NODE_ENV;
    // @ts-expect-error bun:test runs outside Next's typedefs; NODE_ENV is writable at runtime
    process.env.NODE_ENV = env;
    try {
      return fn();
    } finally {
      // @ts-expect-error restoring the ambient environment after the case
      process.env.NODE_ENV = previous;
    }
  }

  test('development keeps future-dated posts listed and reachable', () => {
    withNodeEnv('development', () => {
      expect(publishedPosts(frozen).map((p) => p.slug)).toContain('wafine-launch-day');
      expect(getBlogPost('how-wafine-works-with-claude-and-mcp', frozen)).not.toBeNull();
    });
  });

  test('production hides posts dated after today from the index and 404s the route', () => {
    withNodeEnv('production', () => {
      const slugs = publishedPosts(frozen).map((p) => p.slug);
      expect(slugs).not.toContain('wafine-launch-day');
      expect(slugs).not.toContain('how-wafine-works-with-claude-and-mcp');
      expect(slugs).not.toContain('privacy-by-design-open-core');
      expect(slugs).not.toContain('introducing-wafine'); // draft, hidden already
      expect(getBlogPost('wafine-launch-day', frozen)).toBeNull();
    });
  });

  test('production keeps the direct-URL draft preview reachable', () => {
    withNodeEnv('production', () => {
      expect(getBlogPost('introducing-wafine', frozen)).not.toBeNull();
      expect(getBlogPost('introducing-wafine', frozen)?.draft).toBe(true);
    });
  });

  test('a post dated exactly today (UTC) is visible in production', () => {
    const nowOnLaunchDay = new Date('2026-10-20T15:00:00Z');
    withNodeEnv('production', () => {
      expect(publishedPosts(nowOnLaunchDay).map((p) => p.slug)).toContain('wafine-launch-day');
      expect(getBlogPost('wafine-launch-day', nowOnLaunchDay)).not.toBeNull();
    });
  });

  test('late-UTC-evening never surfaces a tomorrow post early', () => {
    const justBeforeMidnight = new Date('2026-10-19T23:59:59Z');
    withNodeEnv('production', () => {
      expect(publishedPosts(justBeforeMidnight).map((p) => p.slug)).not.toContain('wafine-launch-day');
      expect(getBlogPost('wafine-launch-day', justBeforeMidnight)).toBeNull();
    });
  });
});
