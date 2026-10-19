/**
 * BFF entry point — Bun.serve with Hono.
 */

import { createApp } from './adapters/http/app.js';
import { env } from './config/env.js';
import { XChaCha20Poly1305Service } from './infrastructure/crypto/xchacha20.js';
import { HmacBlindIndexService } from './infrastructure/crypto/blind-index.js';
import { Argon2idKeyDerivationService } from './infrastructure/crypto/argon2id.js';
import { R2StorageAdapter } from './infrastructure/storage/r2-client.js';
import { S3MediaUrlSigner } from './infrastructure/storage/s3-media-signer.js';
import { TokenBucketRateLimiter } from './infrastructure/auth/rate-limit.js';
import { InMemorySessionCache } from './adapters/cache/in-memory-session-cache.js';
import { InMemoryAccountsRepository } from './adapters/persistence/in-memory-accounts.js';
import { InMemoryWaitlistRepository } from './adapters/persistence/in-memory-waitlist.js';
import { createDb } from './infrastructure/db/client.js';
import { DrizzleAccountsRepository } from './infrastructure/db/drizzle-accounts.js';
import { DrizzleWaitlistRepository } from './infrastructure/db/drizzle-waitlist.js';
import { DrizzleWaTenancyRepository } from './infrastructure/db/drizzle-wa-tenancy.js';
import { InMemoryWaTenancyRepository } from './adapters/persistence/in-memory-wa-tenancy.js';
import { DrizzleOAuthRepository } from './infrastructure/db/drizzle-oauth.js';
import { InMemoryOAuthRepository } from './adapters/persistence/in-memory-oauth.js';
import { SecretBox } from './infrastructure/crypto/secret-box.js';
import { SupabaseIdentityProvider } from './infrastructure/auth/supabase-identity.js';
import { normalizeE164 } from './domain/value-objects/phone.js';
import { OpenWaHttpClient } from './infrastructure/gateway/openwa-http-client.js';
import { McpClientFactory } from './infrastructure/mcp/mcp-client-factory.js';
import { defaultMcpServers } from './infrastructure/mcp/server-registry.js';
import { createJobQueue } from './infrastructure/queue/create-queue.js';
import { loadSkillsFromDirs } from './adapters/skills/markdown-skill-loader.js';
import { SkillRegistry, SkillEngine } from './adapters/skills/skill-engine.js';
import { HealthAggregator } from './infrastructure/health/health-aggregator.js';
import { buildHealthProbes } from './infrastructure/health/probes.js';
import { HmacWebhookVerifier } from './infrastructure/gateway/webhook-verifier.js';
import { PacedReplySender, DEFAULT_PACING } from './infrastructure/workflows/paced-sender.js';
import {
  InMemoryIdempotencyStore,
  InMemoryWorkflowStore,
} from './infrastructure/workflows/memory-stores.js';
import {
  StaticWorkflowDirectory,
  parseBindings,
} from './infrastructure/workflows/static-directory.js';
import { WorkflowEngine } from './domain/workflows/engine.js';
import { Redis } from 'ioredis';
import {
  CountingSendBudget,
  MemoryCounterStore,
  RedisCounterStore,
} from './infrastructure/send-budget/send-budget.js';
import { RuntimeSettingsService } from './infrastructure/settings/runtime-settings.js';
import { DrizzleAdminRepository } from './infrastructure/db/drizzle-admin.js';
import { InMemoryAdminRepository } from './adapters/persistence/in-memory-admin.js';

// ── Dependency injection (manual, no framework) ───────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _cryptoService = new XChaCha20Poly1305Service();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _blindIndexService = new HmacBlindIndexService();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keyDerivationService = new Argon2idKeyDerivationService(
  env.argon2MemoryKb,
  env.argon2Iterations,
  env.argon2Parallelism,
);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _storageAdapter = new R2StorageAdapter();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _rateLimiter = new TokenBucketRateLimiter();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _sessionCache = new InMemorySessionCache();

// ── Agentic core ──────────────────────────────────────────────
const gateway = new OpenWaHttpClient();
const mcpFactory = new McpClientFactory(defaultMcpServers());
const jobQueue = createJobQueue();

const { skills, warnings } = await loadSkillsFromDirs(env.skillsDirs);
for (const warning of warnings) {
  console.warn(`skill skipped: ${warning.path} (${warning.reason})`);
}
const skillRegistry = new SkillRegistry(skills);
const skillEngine = new SkillEngine(skillRegistry);

jobQueue.register('agent.run', async (data: unknown) => {
  const payload = data as { text?: string; tenantId?: string; sessionId?: string; chatId?: string };
  const text = payload.text ?? '';
  const matches = skillRegistry.match(text);
  const best = matches[0];
  if (!best) return;
  await skillEngine.run(best.skillName, text, {
    tenantId: payload.tenantId ?? '',
    sessionId: payload.sessionId ?? '',
    chatId: payload.chatId ?? '',
    mcp: mcpFactory,
    metadata: {},
  });
});
await jobQueue.start();

const health = new HealthAggregator(
  buildHealthProbes({
    gateway,
    queue: jobQueue,
    mcp: mcpFactory,
    skillCount: skills.length,
  }),
);

// ── Create and start the app ──────────────────────────────────

// ── Workflows (webhook → rules → paced reply) ─────────────────
const workflowDirectory = new StaticWorkflowDirectory(parseBindings(env.workflowBindings));
const workflowStore = new InMemoryWorkflowStore(env.workflowDefaultEnabled);

// ── Accounts: allowlist + user→number binding, Supabase Auth ──
let accounts: InMemoryAccountsRepository | DrizzleAccountsRepository;
let tenancy: InMemoryWaTenancyRepository | DrizzleWaTenancyRepository;
let oauthRepo: InMemoryOAuthRepository | DrizzleOAuthRepository;
let adminRepo: InMemoryAdminRepository | DrizzleAdminRepository;
let waitlistRepo: InMemoryWaitlistRepository | DrizzleWaitlistRepository;
let closeDb: () => Promise<void> = async () => {};
if (env.databaseUrl) {
  const conn = createDb(env.databaseUrl, env.databaseCaFile || undefined);
  accounts = new DrizzleAccountsRepository(conn.db);
  tenancy = new DrizzleWaTenancyRepository(conn.db);
  oauthRepo = new DrizzleOAuthRepository(conn.db);
  adminRepo = new DrizzleAdminRepository(conn.db);
  waitlistRepo = new DrizzleWaitlistRepository(conn.db);
  closeDb = () => conn.close();
} else {
  console.warn('DATABASE_URL not set: allowlist and bindings are in memory and lost on restart');
  accounts = new InMemoryAccountsRepository();
  tenancy = new InMemoryWaTenancyRepository();
  oauthRepo = new InMemoryOAuthRepository(tenancy);
  adminRepo = new InMemoryAdminRepository(accounts, tenancy);
  waitlistRepo = new InMemoryWaitlistRepository();
}
if (!env.oauthEncKey) console.warn('OAUTH_ENC_KEY not set: the OAuth server for MCP connectors (Claude) is off');
for (const raw of env.allowlistSeed) {
  const phone = normalizeE164(raw);
  if (!phone) {
    console.warn(`ALLOWLIST_SEED entry ignored (not E.164): ${raw}`);
    continue;
  }
  await accounts.addAllowlisted(phone, 'seed:env');
}
// Presigned links into the private media bucket; off until the object-store token is set.
const media =
  env.s3Endpoint && env.s3AccessKeyId && env.s3SecretAccessKey
    ? {
        signer: new S3MediaUrlSigner({
          endpoint: env.s3Endpoint,
          region: env.s3Region,
          forcePathStyle: env.s3ForcePathStyle,
          accessKeyId: env.s3AccessKeyId,
          secretAccessKey: env.s3SecretAccessKey,
          bucket: env.s3BucketMedia,
          keyPrefix: env.s3KeyPrefix,
        }),
        ttlSeconds: env.mediaUrlTtlSeconds,
      }
    : undefined;
if (!media) console.warn('S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY not set: media-url links are off');

const identity = new SupabaseIdentityProvider({
  url: env.supabaseUrl,
  anonKey: env.supabaseAnonKey,
  serviceRoleKey: env.supabaseServiceRoleKey,
});

// ── Admin-managed runtime settings + the API send budget ──────
const runtimeSettings = new RuntimeSettingsService(adminRepo, {
  sendLimits: { perDay: env.apiSendPerDay, perMinute: env.apiSendPerMinute },
  workflow: {
    minGapMs: env.workflowMinGapMs,
    maxPerMinuteSession: env.workflowMaxPerMinuteSession,
    maxPerMinuteContact: env.workflowMaxPerMinuteContact,
    backoffMs: env.workflowBackoffMs,
  },
});
if (!env.redisUrl) console.warn('REDIS_URL not set: API send counters are in memory and reset on restart');
const sendBudget = new CountingSendBudget(
  env.redisUrl ? new RedisCounterStore(new Redis(env.redisUrl)) : new MemoryCounterStore(),
  (sessionId) => runtimeSettings.limitsFor(sessionId),
);

const replySender = new PacedReplySender(
  gateway,
  new TokenBucketRateLimiter(),
  async () => {
    const w = (await runtimeSettings.current()).workflow;
    return {
      ...DEFAULT_PACING,
      minGapMs: w.minGapMs,
      maxPerMinutePerSession: w.maxPerMinuteSession,
      maxPerMinutePerContact: w.maxPerMinuteContact,
      defaultBackoffMs: w.backoffMs,
    };
  },
  undefined,
  sendBudget,
);

const app = createApp({
  health,
  accounts,
  identity,
  // Same Supabase adapter: e-mail/password changes, global sign-out, reset links.
  selfService: identity,
  webUrl: env.webUrl,
  adminEmails: env.adminEmails,
  authRateLimit: { limit: env.authRateLimit, windowSeconds: 60 },
  waitlist: waitlistRepo,
  wa: {
    gateway,
    tenancy,
    openwaBaseUrl: env.openwaBaseUrl,
    publicApiUrl: env.publicApiUrl,
    sendBudget,
    ...(media ? { media } : {}),
    ...(env.oauthEncKey
      ? { oauth: { repo: oauthRepo, box: new SecretBox(env.oauthEncKey), webUrl: env.webUrl } }
      : {}),
  },
  backoffice: { repo: adminRepo, settings: runtimeSettings, budget: sendBudget },
  workflows: {
    verifier: new HmacWebhookVerifier(env.openwaWebhookSecret),
    engine: new WorkflowEngine(workflowDirectory, workflowDirectory, workflowStore, replySender),
    store: workflowStore,
    replayGuard: new InMemoryIdempotencyStore(),
  },
});

const server = Bun.serve({
  port: env.port,
  fetch: app.fetch,
});

console.log(`BFF listening on http://localhost:${server.port}`);

// ── Graceful shutdown ─────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down`);
  await jobQueue.close();
  await mcpFactory.closeAll();
  await closeDb();
  await server.stop();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
