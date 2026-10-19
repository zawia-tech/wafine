import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { BRAND_BUBBLE_PATH, BRAND_WORD_PATH, BRAND_WORD_TRANSFORM } from './brand-paths';
import { SITE } from './site';
/** Card geometry, exported so every image route can declare the same `size`. */
export const size = { width: 1200, height: 630 } as const;
export const contentType = 'image/png';

export type OgArgs = {
  /** Small clay label above the title (e.g. "SIGN IN"). */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Pill in the bottom-left (e.g. "Invite-only · Built in Morocco"). */
  badge?: string;
  /**
   * Host label bottom-right, e.g. `siteHostname()`. Omit it on pre-rendered
   * static cards so no hostname is ever baked into a committed PNG.
   */
  host?: string;
};

// Fonts and the fallback card are read from `public/` through filesystem paths, not
// `new URL(…, import.meta.url)`: the bundler rewrites the latter into its own asset URL
// class, which `readFileSync` rejects ("path argument must be … an instance of URL").
// `next.config.ts` lists these files in `outputFileTracingIncludes` so serverless builds
// ship them next to the function; if a read ever fails, `renderOgSafe` serves the
// committed fallback PNG instead of erroring.
// The fonts are static Inter latin instances (65 KB each, weight pinned to 400/700 with
// `fonttools varLib.instancer`) because the Satori parser in `next/og` accepts neither
// WOFF2 nor variable (fvar) TTFs.
const fontDir = join(process.cwd(), 'public', 'fonts');
const regularFontPath = join(fontDir, 'Inter-Regular.ttf');
const boldFontPath = join(fontDir, 'Inter-Bold.ttf');
const fallbackPath = join(process.cwd(), 'public', 'og', 'fallback.png');

const palette = {
  ink: '#1a211d',
  muted: '#5b6560',
  pine: '#1c5c42',
  pineDeep: '#14442f',
  clay: '#a5562f',
  pineSoft: '#e7f0ea',
  markCream: '#fcfaf6',
  markInk: '#123a2b',
} as const;

/** The chat-bubble mark: same geometry as `public/icon.svg` and src/lib/brand-paths.ts. */
function Mark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path d={BRAND_BUBBLE_PATH} fill={palette.markCream} />
      <path d={BRAND_WORD_PATH} fill={palette.markInk} transform={BRAND_WORD_TRANSFORM} />
    </svg>
  );
}

/**
 * Single source of truth for every social card (rebrand-plan §2.2):
 * 1200×630, warm paper background, pine/clay palette, readable at thumbnail width.
 */
export async function renderOg({ eyebrow, title, subtitle, badge, host }: OgArgs): Promise<ImageResponse> {
  const regular = readFileSync(regularFontPath);
  const bold = readFileSync(boldFontPath);

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: 'flex',
          flexDirection: 'column',
          padding: 64,
          background: 'linear-gradient(135deg, #fcfaf6 0%, #f4efe6 55%, #e8efe9 100%)',
          color: palette.ink,
          fontFamily: 'Inter',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 12,
            height: size.height,
            background: `linear-gradient(180deg, ${palette.pine} 0%, ${palette.clay} 100%)`,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: palette.pine,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Mark size={38} />
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 1 }}>WaFine</div>
          </div>
          {/* One text child: Satori counts `by {x}` as two nodes and demands display:flex. */}
          <div style={{ fontSize: 26, fontWeight: 400, color: palette.muted }}>{`by ${SITE.parent}`}</div>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingTop: 24,
            paddingBottom: 24,
          }}
        >
          {eyebrow ? (
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: palette.clay,
                letterSpacing: 4,
                textTransform: 'uppercase',
                marginBottom: 24,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.06,
              letterSpacing: -1.5,
              maxWidth: 1010,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontSize: 30,
                fontWeight: 400,
                lineHeight: 1.35,
                color: palette.muted,
                marginTop: 28,
                maxWidth: 980,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {badge ? (
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: palette.pine,
                backgroundColor: palette.pineSoft,
                borderRadius: 999,
                padding: '12px 28px',
              }}
            >
              {badge}
            </div>
          ) : (
            <div />
          )}
          {host ? (
            <div style={{ fontSize: 24, fontWeight: 400, color: palette.muted }}>{host}</div>
          ) : (
            <div />
          )}
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: bold, weight: 700, style: 'normal' },
      ],
    },
  );
}

/**
 * Like `renderOg`, but never 500s: a missing font or a renderer crash serves
 * the pre-rendered `public/og/fallback.png` (plan §2.2 "Fallback").
 */
export async function renderOgSafe(args: OgArgs): Promise<Response> {
  try {
    return await renderOg(args);
  } catch (err) {
    console.error('og: render failed, serving the static fallback card', err);
    const fallback = readFileSync(fallbackPath);
    return new Response(new Uint8Array(fallback), {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
    });
  }
}
