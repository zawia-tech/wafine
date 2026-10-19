// Twitter/X card. Re-exports the Open Graph route's values; `runtime` is declared
// directly because Next does not follow a re-exported segment config.
export { alt, contentType, default, size } from './opengraph-image';

export const runtime = 'nodejs';
