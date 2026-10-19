#!/usr/bin/env node
// Render an on-brand WaFine card to PNG (design system v2: pine, clay, paper).
// Usage: node render_card.mjs --lang en --size linkedin --theme pine --headline "..." --out card.png
// See references/visuals.md. Needs `playwright` and a Chromium (PLAYWRIGHT_BROWSERS_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..'); // repo root
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const nxt = process.argv[i + 1];
  if (!nxt || nxt.startsWith('--')) args[k] = true; else { args[k] = nxt; i++; }
}
const lang = args.lang || 'en';
const rtl = lang === 'ar';
const size = { og: [1200, 630], linkedin: [1080, 1350], square: [1080, 1080] }[args.size || 'og'];
if (!size) { console.error('--size must be og, linkedin or square'); process.exit(2); }
const theme = args.theme || 'light';
// Colours come from the design-system copy shipped inside this skill (assets/design-system/tokens.json),
// so the card matches the brand book even when the skill is packaged away from the repo.
const SKILL_DIR = path.resolve(here, '..');
const TOKENS = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'assets/design-system/tokens.json'), 'utf8'));
const tok = (name, mode) => {
  const t = TOKENS.color.tokens.find((x) => x.name === name);
  if (!t) throw new Error('token missing from tokens.json: ' + name);
  return t.value[mode];
};
const MODE = theme === 'dark' ? 'dark' : 'light';
if (!['light', 'pine', 'dark'].includes(theme)) { console.error('--theme must be light, pine or dark'); process.exit(2); }
// light: paper ground. pine: neutral ink band with inverted text. dark: dark tokens on paper-ink ground.
const T = theme === 'pine' ? {
  bg: tok('neutral', 'light'), fg: tok('neutral-content', 'light'), muted: 'rgba(244,239,230,.75)',
  primary: tok('neutral-content', 'light'), pc: tok('neutral', 'light'), clay: tok('secondary', 'dark'),
  b2: 'rgba(244,239,230,.1)', b3: 'rgba(244,239,230,.2)', bubble: tok('neutral-content', 'light'),
  markBubble: tok('neutral-content', 'light'), markWord: tok('neutral', 'light'),
} : {
  bg: tok('base-100', MODE), fg: tok('base-content', MODE), muted: tok('text-muted', MODE),
  primary: tok('primary', MODE), pc: tok('primary-content', MODE), clay: tok('secondary', MODE),
  b2: tok('base-200', MODE), b3: tok('base-300', MODE), bubble: tok('primary', MODE),
  markBubble: tok('primary', MODE), markWord: tok('primary-content', MODE),
};

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// keep Latin runs (WaFine, API, MCP, URLs, numbers) isolated inside Arabic text
const iso = s => rtl ? esc(s).replace(/([A-Za-z0-9][A-Za-z0-9 .:/+_@#'-]*[A-Za-z0-9+])/g, '<bdi>$1</bdi>') : esc(s);

let mark = fs.readFileSync(path.join(SKILL_DIR, 'assets/design-system/assets/Logos/wafine-mark.svg'), 'utf8')
  .replace(/width="512" height="512"/, 'width="64" height="64"')
  .replace(/#1C5C42/gi, '@B').replace(/#FCFAF6/gi, '@W').replace(/@B/g, T.markBubble).replace(/@W/g, T.markWord);

let legalText = 'WaFine is an independent, unofficial gateway, not affiliated with WhatsApp LLC or Meta Platforms, Inc. WhatsApp is a trademark of WhatsApp LLC; Claude is a trademark of Anthropic, PBC.';
try { legalText = JSON.parse(fs.readFileSync(path.join(root, `app/web/messages/${lang}.json`), 'utf8')).footer.disclaimer || legalText; } catch { /* outside the repo: keep the built-in text */ }
const thread = args.thread ? JSON.parse(args.thread) : [];
const [W, H] = size;
const big = H > W;       // portrait: bigger headline
const hl = args.headline ? (big ? 76 : (W === H ? 68 : 58)) : 0;
const font = rtl ? "'Noto Sans Arabic','Inter',system-ui,sans-serif" : "'Inter','Noto Sans Arabic',system-ui,sans-serif";
const head = rtl ? "'Noto Sans Arabic','Fredoka',system-ui,sans-serif" : "'Fredoka','Noto Sans Arabic',system-ui,sans-serif";

const html = `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Inter:wght@400;500;600&family=Noto+Sans+Arabic:wght@400;500;700&display=swap">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;background:${T.bg};color:${T.fg};font-family:${font};-webkit-font-smoothing:antialiased}
.card{width:${W}px;height:${H}px;padding:${big ? 88 : 64}px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.glow{position:absolute;inset-inline-end:-${W * .2}px;top:-${H * .25}px;width:${W * .8}px;height:${W * .8}px;border-radius:50%;background:radial-gradient(circle,${theme === 'light' ? 'rgba(28,92,66,.10)' : 'rgba(110,207,166,.14)'},transparent 65%)}
.top,.mid,.bot{position:relative;z-index:1}
.lockup{display:inline-flex;align-items:center;gap:10px;direction:ltr;font:600 ${big ? 34 : 30}px/1 'Fredoka',sans-serif;letter-spacing:-.02em;color:${T.fg}}
.eyebrow{font:600 ${big ? 24 : 20}px ${font};letter-spacing:.08em;text-transform:uppercase;color:${T.clay};margin-bottom:${big ? 22 : 16}px}
h1{font:600 ${hl}px/1.12 ${head};letter-spacing:-.02em;max-width:${rtl ? '100%' : '92%'};text-wrap:balance}
.sub{margin-top:${big ? 28 : 20}px;font:400 ${big ? 32 : 27}px/1.5 ${font};color:${T.muted};max-width:${big ? '92%' : '80%'}}
.thread{margin-top:${big ? 36 : 22}px;display:flex;flex-direction:column;gap:12px;max-width:${big ? '86%' : '70%'}}
.b{padding:14px 22px;border-radius:20px;font:400 ${big ? 28 : 24}px/1.4 ${font};max-width:90%}
.b.in{background:${T.b2};border:1px solid ${T.b3};align-self:flex-start;border-end-start-radius:6px}
.b.out{background:${T.bubble};color:${T.pc};align-self:flex-end;border-end-end-radius:6px}
.bot{display:flex;align-items:center;justify-content:space-between;gap:24px}
.cta{background:${T.primary};color:${T.pc};font:600 ${big ? 28 : 24}px ${font};padding:16px 34px;border-radius:9999px}
.url{font:500 ${big ? 26 : 22}px 'Inter',sans-serif;color:${T.muted};direction:ltr}
.legal{position:relative;z-index:1;margin-top:18px;font:400 15px/1.5 ${font};color:${T.muted}}
</style></head><body><div class="card"><div class="glow"></div>
<div class="top"><div class="lockup">${mark}<span>WaFine</span></div></div>
<div class="mid">
${args.eyebrow ? `<div class="eyebrow">${iso(args.eyebrow)}</div>` : ''}
${args.headline ? `<h1>${iso(args.headline)}</h1>` : ''}
${args.sub ? `<p class="sub">${iso(args.sub)}</p>` : ''}
${thread.length ? `<div class="thread">${thread.map(m => `<div class="b ${m.side === 'out' ? 'out' : 'in'}">${iso(m.text)}</div>`).join('')}</div>` : ''}
</div>
<div class="bot">${args.cta ? `<span class="cta">${iso(args.cta)}</span>` : '<span></span>'}${args.url ? `<span class="url">${esc(args.url)}</span>` : ''}</div>
${args.legal ? `<p class="legal">${iso(legalText)}</p>` : ''}
</div></body></html>`;

const out = path.resolve(args.out || `wafine-card-${lang}-${args.size || 'og'}.png`);
if (args.html) fs.writeFileSync(out.replace(/\.png$/, '.html'), html);

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const base = process.env.PLAYWRIGHT_NODE_PATH || '/opt/node-tools/node_modules';
  ({ chromium } = createRequire(path.join(base, 'x.js'))('playwright'));
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => {});
await page.evaluate(() => document.fonts.ready).catch(() => {});
const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').length);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log(`${out} (${W}x${H}, ${fonts} web fonts loaded${fonts ? '' : ', FALLBACK fonts: no network to Google Fonts'})`);
