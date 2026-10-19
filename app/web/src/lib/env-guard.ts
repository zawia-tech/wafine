/**
 * Single source of truth for the production env contract (docs/15-launch-checklist.md §b,
 * app/web/.env.example).
 *
 * Three consumers share this list:
 *  - `next.config.ts`, via {@link shouldCheckProductionEnv} + {@link assertProductionEnv},
 *    so a production build with a missing or placeholder value fails before anything ships;
 *  - `src/lib/site.ts` and `src/lib/site-links.ts`, via {@link readRequiredEnv}, which keep
 *    a lazy per-constant fail-fast at request time as a second line of defence.
 *
 * Rules:
 *  - The guard only runs for deploy-relevant next CLI commands (`build`, `start`): the Next
 *    CLI forces NODE_ENV=production for every command except `dev` — including `lint` — so
 *    gating on NODE_ENV alone would break `bun run lint` on a machine without a local .env.
 *  - Every required name is reported at once, then the build exits non-zero.
 *  - URL vars must be parseable and https — except plain http on localhost, so CI builds
 *    (web-a11y, playwright) keep working with their localhost values.
 *  - example.com / localhost values (URL hosts and email domains) are rejected only when
 *    VERCEL_ENV=production, never in CI or a local `bun run build`.
 */

export interface EnvSpec {
  readonly name: string;
  readonly kind: 'url' | 'email';
}

/** The vars the `web` Vercel project must define in production. */
export const REQUIRED_PRODUCTION_ENV: readonly EnvSpec[] = [
  { name: 'SITE_URL', kind: 'url' },
  { name: 'NEXT_PUBLIC_API_URL', kind: 'url' },
  { name: 'NEXT_PUBLIC_DOCS_URL', kind: 'url' },
  { name: 'CONTACT_EMAIL', kind: 'email' },
  { name: 'NEXT_PUBLIC_CONTACT_EMAIL', kind: 'email' },
] as const;

const REQUIRED_PRODUCTION_ENV_NAMES = new Set(REQUIRED_PRODUCTION_ENV.map((spec) => spec.name));

export type EnvBag = Record<string, string | undefined>;

/** Hosts that are only ever valid in a non-production (CI / local) build. */
function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1';
}

/** Documentation placeholders — fine in .env.example, never in a real deployment. */
function isPlaceholderHost(hostname: string): boolean {
  return hostname === 'example.com' || hostname.endsWith('.example.com');
}

/**
 * The Next CLI sets NODE_ENV=production for every command except `dev` — `next lint`
 * included — so production env must only be enforced for deploy-relevant commands.
 */
const DEPLOY_CLI_COMMANDS = new Set(['build', 'start']);

/**
 * Should the build-time guard run? A `next build`/`next start` sets NODE_ENV=production;
 * Vercel sets VERCEL_ENV. Other CLI commands (lint, info, workers re-evaluating the
 * config) never fail the env contract.
 */
export function shouldCheckProductionEnv(env: EnvBag = process.env, argv: readonly string[] = process.argv): boolean {
  if (!(env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production')) return false;
  const command = argv[2];
  if (command === undefined || command === '') return true;
  return DEPLOY_CLI_COMMANDS.has(command);
}

/** True on Vercel's production deployment (not preview, not CI, not local). */
export function isVercelProduction(env: EnvBag = process.env): boolean {
  return env.VERCEL_ENV === 'production';
}

/**
 * Validate the required production vars. Returns every problem found (empty = ok),
 * so a failing build can print all missing names at once.
 */
export function productionEnvProblems(env: EnvBag = process.env): string[] {
  const problems: string[] = [];
  const vercelProd = isVercelProduction(env);

  for (const { name, kind } of REQUIRED_PRODUCTION_ENV) {
    const value = env[name]?.trim();
    if (!value) {
      problems.push(`${name} must be set (see app/web/.env.example)`);
      continue;
    }
    if (kind === 'email') {
      const domain = value.split('@')[1]?.toLowerCase() ?? '';
      if (vercelProd && (isPlaceholderHost(domain) || isLocalHost(domain))) {
        problems.push(`${name} must not use the placeholder domain ${domain} in Vercel production`);
      }
      continue;
    }

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      problems.push(`${name} must be a valid URL, got "${value}"`);
      continue;
    }
    if (url.protocol !== 'https:' && !isLocalHost(url.hostname)) {
      problems.push(`${name} must be an https URL, got "${value}"`);
    }
    if (vercelProd && (isLocalHost(url.hostname) || isPlaceholderHost(url.hostname))) {
      problems.push(`${name} must not point at ${url.hostname} in Vercel production, got "${value}"`);
    }
  }

  return problems;
}

/**
 * Fail a production build when the env contract is broken. Prints every problem,
 * then exits non-zero (called from next.config.ts at config-load time).
 */
export function assertProductionEnv(env: EnvBag = process.env): void {
  const problems = productionEnvProblems(env);
  if (problems.length === 0) return;
  const lines = problems.map((p) => `  - ${p}`);
  throw new Error(
    `[env-guard] production env is incomplete (${problems.length} problem(s)):\n${lines.join('\n')}`,
  );
}

/**
 * Runtime reader shared by site.ts and site-links.ts: returns the trimmed value with
 * trailing slashes stripped, a dev fallback outside production, and a fail-fast throw
 * when NODE_ENV=production and the var is missing.
 */
export function readRequiredEnv(name: string, devFallback: string, env: EnvBag = process.env): string {
  if (!REQUIRED_PRODUCTION_ENV_NAMES.has(name)) {
    throw new Error(`${name} is not in REQUIRED_PRODUCTION_ENV — add it to src/lib/env-guard.ts`);
  }
  const value = env[name]?.trim();
  if (value) return value.replace(/\/+$/, '');
  if (env.NODE_ENV === 'production') {
    throw new Error(`${name} must be set in production (see app/web/.env.example)`);
  }
  return devFallback;
}
