/**
 * Renders the static PNG cards that are committed instead of served dynamically:
 *   - app/web/public/og/fallback.png  — last resort served by `renderOgSafe`
 *   - app/docs/public/og.png          — static docs card (rebrand-plan §2.2)
 *
 * Neither card carries a hostname: a committed asset must not bake in a domain
 * that only exists in one environment (owner review on PR #38).
 *
 * Run from app/web: `bun scripts/gen-og-assets.ts`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderOg, type OgArgs } from '../src/lib/og';

async function write(path: string, args: OgArgs): Promise<void> {
  const response = await renderOg(args);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  console.log(`${path}: ${bytes.length} bytes`);
}

const webRoot = join(import.meta.dir, '..');
const docsRoot = join(webRoot, '..', 'docs');

await write(join(webRoot, 'public/og/fallback.png'), {
  title: 'WaFine',
  subtitle: 'WhatsApp gateway for teams · Invite-only · Built in Morocco',
  badge: 'by Zawia',
});

await write(join(docsRoot, 'public/og.png'), {
  eyebrow: 'Docs',
  title: 'WaFine docs',
  subtitle: 'Guides, REST API and MCP reference for WaFine — the open-core WhatsApp gateway by Zawia.',
  badge: 'Guides · REST API · MCP',
});
