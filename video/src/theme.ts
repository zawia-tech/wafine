import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadKufi } from '@remotion/google-fonts/NotoKufiArabic';
import { loadFont as loadNotoArabic } from '@remotion/google-fonts/NotoSansArabic';

const fredoka = loadFredoka('normal', { weights: ['600'], subsets: ['latin'] });
const inter = loadInter('normal', { weights: ['400', '500', '600'], subsets: ['latin'] });
// Arabic glyphs fall back to these (Latin words like "WaFine" keep Fredoka/Inter).
const kufi = loadKufi('normal', { weights: ['600'], subsets: ['arabic'] });
const notoArabic = loadNotoArabic('normal', { weights: ['400', '500', '600'], subsets: ['arabic'] });

// Brand tokens from docs/design-system (never WhatsApp green).
export const c = {
  pine: '#1c5c42',
  pineDeep: '#143f2e',
  paper: '#fcfaf6',
  paper2: '#f4efe6',
  paper3: '#e7dfd2',
  clay: '#a5562f',
  ochre: '#c08a2e',
  ink: '#0f1512',
  inkSoft: '#1a211d',
  muted: 'rgba(15, 21, 18, 0.72)',
};

export const font = {
  display: `${fredoka.fontFamily}, ${kufi.fontFamily}`,
  body: `${inter.fontFamily}, ${notoArabic.fontFamily}`,
  mono: "ui-monospace, 'DejaVu Sans Mono', 'Liberation Mono', monospace",
};

// Pine-tinted elevation, never neutral grey.
export const shadow = {
  raised: '0 6px 18px rgba(28, 92, 66, 0.12), 0 2px 4px rgba(28, 92, 66, 0.08)',
  floating: '0 24px 60px rgba(28, 92, 66, 0.22), 0 8px 18px rgba(28, 92, 66, 0.12)',
};

export const radius = { box: 20, pill: 9999 };
