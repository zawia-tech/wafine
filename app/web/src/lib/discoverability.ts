import { publishedPosts } from '@/lib/blog';
import { SITE } from '@/lib/site';
import { siteLinks } from '@/lib/site-links';

/**
 * Content for the discoverability endpoints (`/llms.txt`, `/llms.md`,
 * `/llms-full.txt`, `/humans.txt`). All absolute URLs are built from SITE /
 * siteLinks at request time — no hostname is hardcoded anywhere in this file or
 * its callers (owner rule). Route handlers call these builders and set the
 * content type; nothing here knows about HTTP.
 */

export interface DiscoverabilityUrls {
  siteUrl: string;
  docsUrl: string;
  connectorUrl: string;
  apiOrigin: string;
}

export function discoverabilityUrls(): DiscoverabilityUrls {
  const { docsUrl, connectorUrl, apiOrigin } = siteLinks();
  return { siteUrl: SITE.url, docsUrl, connectorUrl, apiOrigin };
}

const CREDITS_SHORT =
  'WaFine, sponsored by Ai4x Academy, built by ZawIA.Tech, open-core on OpenWA.';

const CREDITS_FULL =
  'Project sponsored by Ai4x Academy. Built by ZawIA.Tech. Developed by Mohamed Moughamir (omnizya & open anaffa), supported by the CDIWG (Bouskoura.online) org. Mentored by Youssef Ghalem (YG Consulting). Open-core on OpenWA (open source).';

const SUMMARY =
  'Turn your WhatsApp number into an AI teammate. Connect your number, build paced ' +
  'auto-reply workflows, and plug it into Claude and your apps through one REST API ' +
  'and one MCP endpoint. Invite-only. Built in Morocco.';

/** The `> …` blockquote that opens a valid llms.txt. */
function blockquote(): string {
  return `> ${SUMMARY}`;
}

/**
 * `/llms.txt` — the [llms.txt standard](https://llmstxt.org/): H1, blockquote
 * summary, then named sections of Markdown links. Absolute URLs are resolved
 * from the deployment's env at request time.
 */
export function llmsTxt(urls: DiscoverabilityUrls): string {
  const posts = publishedPosts();
  const blogLinks = posts
    .map((post) => `- [${post.title}](${urls.siteUrl}/blog/${post.slug}): ${post.description}`)
    .join('\n');

  return [
    `# ${SITE.name}`,
    '',
    blockquote(),
    '',
    `${SITE.name} is an open-core WhatsApp gateway built on OpenWA, by ZawIA.Tech with Ai4x Academy.`,
    '',
    '## Docs',
    '',
    `- [Documentation](${urls.docsUrl})`,
    '',
    '## Product',
    '',
    `- [Home](${urls.siteUrl}/)`,
    `- [Brand guidelines and assets](${urls.siteUrl}/brand)`,
    `- [Authors](${urls.siteUrl}/authors)`,
    `- [Blog](${urls.siteUrl}/blog)`,
    `- [Blog RSS feed](${urls.siteUrl}/blog/rss.xml)`,
    ...(blogLinks ? ['', '## Blog posts', '', blogLinks] : []),
    '',
    '## Claude connector',
    '',
    `- [Claude connector guide](${urls.docsUrl}) — add ${SITE.name} to Claude at \`${urls.connectorUrl}\``,
    '',
    '## Optional',
    '',
    `- [Full context for agents](${urls.siteUrl}/llms-full.txt)`,
    `- [How to use ${SITE.name} with an LLM agent](${urls.siteUrl}/llms.md)`,
    `- [Credits](${urls.siteUrl}/humans.txt)`,
    '',
    CREDITS_SHORT,
    '',
  ].join('\n');
}

/** `/llms.md` — the same overview as Markdown, plus an agent how-to section. */
export function llmsMd(urls: DiscoverabilityUrls): string {
  return [
    `# ${SITE.name}`,
    '',
    blockquote(),
    '',
    `## What it is`,
    '',
    `${SITE.name} is an open-core WhatsApp gateway built on OpenWA. You link a WhatsApp number`,
    'by scanning a QR code; WaFine stores the session on its own server, paces every outbound',
    'message (configurable gap, per-day cap, no retry storms), and exposes the number through',
    'one REST API and one MCP endpoint.',
    '',
    `## What to use it for`,
    '',
    '- Paced auto-reply workflows driven by webhooks',
    '- Letting an agent (Claude, scripts, internal tools) read chats and send messages through your number',
    '- Per-session API keys: mint, scope to one session, revoke in one click',
    '',
    `## How to use ${SITE.name} with an LLM agent`,
    '',
    '1. Join the invite-only waitlist on the site; an admin invites your number.',
    '2. Sign in, connect your WhatsApp number by scanning the QR at the sessions page.',
    '3. Mint an API key for that session (shown once, stored hashed).',
    '4. Either call the REST API with `X-API-Key: <key>` on the API origin, or add the MCP',
    `   endpoint (\`${urls.connectorUrl}\`) to your agent.`,
    '5. For Claude specifically: Settings → Connectors → Add custom connector → paste the',
    '   connector URL → sign in → Allow. The connector uses OAuth, so Claude never sees your',
    '   API key. See the connector guide in the docs.',
    '',
    'Rate limits are enforced server-side: requests per minute per key and a per-session',
    'send budget. A refused send is refunded; an over-cap send answers 429 with Retry-After.',
    '',
    '## Links',
    '',
    `- [${SITE.name} home](${urls.siteUrl}/)`,
    `- [Blog](${urls.siteUrl}/blog)`,
    `- [Blog RSS feed](${urls.siteUrl}/blog/rss.xml)`,
    `- [Documentation](${urls.docsUrl})`,
    `- [Full context for agents (llms-full.txt)](${urls.siteUrl}/llms-full.txt)`,
    '',
    CREDITS_SHORT,
    '',
  ].join('\n');
}

/**
 * `/llms-full.txt` — the expanded brief: the product, the J1–J7 journey, the REST
 * and MCP surface (summarised from docs/09) and the Claude connector (docs/10).
 */
export function llmsFullTxt(urls: DiscoverabilityUrls): string {
  return [
    `# ${SITE.name} — full context for LLM agents`,
    '',
    blockquote(),
    '',
    '## The product',
    '',
    `${SITE.name} turns a WhatsApp number into an AI teammate. It is an open-core gateway`,
    'built on the open-source OpenWA engine. The web app (this site) handles accounts,',
    'sessions, keys and the waitlist; a backend-for-frontend (BFF) owns the REST and MCP',
    'surface; the OpenWA engine keeps the WhatsApp session alive on a server in Casablanca.',
    '',
    'Audience: the Zawia Tech community first, then SMEs, C-suite, community managers and',
    'productive people who want WhatsApp agentic workflows. Access is invite-only until the',
    'public release. There is no pricing on the site at launch.',
    '',
    'Data residency: the WhatsApp session and its local data stay on a VM in Casablanca;',
    'the application database is in the EU (Supabase, Paris region). Message content is',
    'stored encrypted, not as readable text.',
    '',
    '## The user journey (J1–J7)',
    '',
    'J1 — Discover: land on the home page, read how it works and the Claude connector band.',
    'J2 — Sign up: join the waitlist; an admin invites your E.164 number; sign-up binds the',
    '     account to that invited number only.',
    'J3 — Connect a number: at the sessions page, create a session and scan its QR from',
    '     WhatsApp Web. The linked phone must equal the invited number or the BFF logs the',
    '     session out (phone_mismatch).',
    'J4 — Build a workflow: webhook in, paced auto-reply out. Every reply goes through one',
    '     paced sender: configurable gap, per-day cap, no retries.',
    'J5 — API access: mint a per-session API key (plaintext shown once, only the SHA-256 is',
    '     stored, max 5 active keys). Call the REST API with the key in `X-API-Key`.',
    'J6 — Add Claude: add the MCP endpoint as a custom connector in Claude; OAuth 2.1 with',
    '     PKCE; Claude never sees your API key; revoke from the app or by deleting the session.',
    'J7 — Docs: the documentation site covers deployment, sessions, keys, the connector and',
    '     the workflows reference.',
    '',
    '## REST surface (summary)',
    '',
    `Base: the API origin (this deployment: ${urls.apiOrigin}).`,
    'Auth: `X-API-Key: <key>` — a per-session key minted in the web app. The engine admin',
    'key never works from the internet.',
    '',
    'Exposed, confined to the caller\'s own session:',
    '- `GET  /wa/sessions` — list sessions (filtered by the engine to the key\'s scope)',
    '- `GET  /wa/sessions/<id>/...` — session detail routes of your own session',
    '- `POST /wa/messages/send-*`, `reply`, `forward`, `send-bulk` — sends, budget-charged',
    '',
    'Refused before the engine: any other session, every non-session route (auth/api-keys,',
    'settings, webhooks, config, proxy, force-kill), and any path segment containing `/`,',
    '\\, `..` or NUL. Limits: 120 requests/minute per key, 16 MiB body, 60 s timeout.',
    '',
    'Send budget per session (defaults, admin-changeable): 300 sends/day UTC, 10/min.',
    'Charged: send/reply/forward/bulk (one per item) and MCP send tools. Reads and messages',
    'the owner sends from the phone are never counted. Over the cap: HTTP 429 with',
    '`Retry-After` and code API_SEND_LIMIT; a refused send (HTTP >= 400) is refunded.',
    '',
    'A user disabled by an admin gets 403 on everything, keys and connectors included.',
    '',
    '## MCP surface (summary)',
    '',
    `Endpoint: ${urls.connectorUrl} (Streamable HTTP, POST).`,
    'Auth: either `X-API-Key` (scripts) or an OAuth 2.1 bearer token (Claude connector).',
    'Tools mirror the REST surface: list sessions, read session state and messages, and the',
    'send tools (MessageSend*, MessageReply, MessageForward), which are budget-charged like',
    'REST sends. The engine enforces the key\'s `allowedSessions` on every tool call.',
    '',
    '## Claude connector (OAuth for MCP)',
    '',
    'Claude cannot send `X-API-Key`, so the BFF is also an OAuth 2.1 authorization server',
    'per the MCP authorization spec:',
    '',
    '1. In Claude: Settings → Connectors → Add custom connector; paste',
    `   \`${urls.connectorUrl}\` as the connector URL.`,
    '2. Claude discovers the protected-resource and authorization-server metadata under',
    '   `/.well-known/…` on the API origin, registers a client (dynamic client registration)',
    '   and starts authorization code + PKCE (S256).',
    '3. The browser lands on the web app consent page (sign in first): it shows the app, the',
    '   redirect host and the exact scopes. Approve → a short-lived single-use code.',
    '4. Claude exchanges the code for opaque access (1 h) + refresh (30 d, rotating) tokens.',
    '   The BFF mints an engine key scoped to your session, seals it (AES-256-GCM, bound to',
    '   the grant) and returns tokens; Claude\'s token never reaches OpenWA.',
    '5. Every MCP call carries the bearer token; the BFF resolves it and forwards to the',
    '   engine with the sealed key.',
    '',
    'Revoke from the sessions page (Connected apps), by calling POST /oauth/revoke, or by',
    'deleting the WhatsApp session. Reusing a rotated refresh token revokes the whole grant.',
    'Registration accepts only the official Claude callbacks and http loopback redirects.',
    '',
    '## What agents must not do',
    '',
    '- Never send bulk unsolicited messages or spam; acceptable use is numbers you own and',
    '  people who expect to hear from you.',
    '- Never ask for or echo API keys, session payloads or phone numbers back to a chat.',
    '- Hostnames are deployment-specific: read them from this file\'s links, do not guess.',
    '',
    '## Links',
    '',
    `- [${SITE.name} home](${urls.siteUrl}/)`,
    `- [Brand guidelines and assets](${urls.siteUrl}/brand)`,
    `- [Authors](${urls.siteUrl}/authors)`,
    `- [Blog](${urls.siteUrl}/blog)`,
    `- [Blog RSS feed](${urls.siteUrl}/blog/rss.xml)`,
    `- [Documentation](${urls.docsUrl})`,
    `- [llms.txt](${urls.siteUrl}/llms.txt)`,
    `- [llms.md](${urls.siteUrl}/llms.md)`,
    `- [humans.txt](${urls.siteUrl}/humans.txt)`,
    '',
    '## Credits',
    '',
    CREDITS_FULL,
    '',
  ].join('\n');
}

/** `/humans.txt` — humanstxt.org format. */
export function humansTxt(urls: DiscoverabilityUrls): string {
  return [
    '/* TEAM */',
    'Developer: Mohamed Moughamir',
    'Alias: omnizya & open anaffa',
    'Site: ' + urls.siteUrl,
    '',
    'Mentor: Youssef Ghalem',
    'Company: YG Consulting',
    '',
    'Sponsor: Ai4x Academy',
    '',
    'Builder: ZawIA.Tech',
    '',
    'Supporting org: CDIWG',
    '',
    '/* THANKS */',
    'OpenWA — the open-source WhatsApp engine WaFine is built on',
    'Ai4x Academy community — Zawia Tech',
    '',
    '/* SITE */',
    'Last update: 2026/10/17',
    'Language: English, Français, العربية',
    'Doctype: HTML5',
    'Component: Next.js 15 (App Router), React 19, Tailwind CSS + daisyUI',
    'Component: Hono BFF (REST + MCP + OAuth 2.1), OpenWA engine, Supabase Postgres',
    'Standards: WCAG 2.2 AA target, RSS 2.0 at /blog/rss.xml, llms.txt for agents',
    '',
    '/* CREDITS */',
    CREDITS_FULL,
    '',
  ].join('\n');
}
