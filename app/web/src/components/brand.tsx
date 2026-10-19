import { Link } from '@/i18n/navigation';
import { BRAND_BUBBLE_PATH, BRAND_WORD_PATH, BRAND_WORD_TRANSFORM } from '@/lib/brand-paths';

/**
 * WaFine brand lockup: the chat-bubble mark carrying the Arabic wordmark وافين.
 *
 * The geometry lives once in src/lib/brand-paths.ts (shared with the OG card). The
 * mark recolours through the primary/primary-content theme roles, so light, dark and
 * white-label tenants keep their own contrast without a second asset.
 */

/**
 * The mark inverts its two theme roles (`inverted`) so it still reads on the dark
 * brand bands — footer, waitlist — where the usual pine-on-paper pairing would sink.
 */
export function BrandMark({
  size = 24,
  className,
  inverted = false,
}: {
  size?: number;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={BRAND_BUBBLE_PATH} className={inverted ? 'fill-neutral-content' : 'fill-primary'} />
      <path
        d={BRAND_WORD_PATH}
        className={inverted ? 'fill-neutral' : 'fill-primary-content'}
        transform={BRAND_WORD_TRANSFORM}
      />
    </svg>
  );
}

/** Mark + wordmark. Renders as plain text inside a link unless `href` is given. */
export function Brand({
  href,
  size = 24,
  className,
  inverted = false,
}: {
  href?: string;
  size?: number;
  className?: string;
  inverted?: boolean;
}) {
  const body = (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <BrandMark size={size} inverted={inverted} className="shrink-0" />
      {/* font-semibold is Fredoka 600; font-display supplies the Arabic glyph fallback. */}
      <span className="font-display text-base font-semibold tracking-tight">WaFine</span>
    </span>
  );

  if (!href) return body;
  return (
    <Link href={href} className="inline-flex min-h-11 items-center rounded-field px-2" aria-label="WaFine home">
      {body}
    </Link>
  );
}
