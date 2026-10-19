/**
 * BFF environment configuration.
 * All secrets come from env vars — never hardcoded.
 */
export const env = {
  // Server
  port: parseInt(process.env['PORT'] ?? '4000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  // Supabase
  supabaseUrl: process.env['SUPABASE_URL'] ?? '',
  supabaseServiceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
  supabaseAnonKey: process.env['SUPABASE_ANON_KEY'] ?? '',

  // Postgres (Supabase session pooler) for the allowlist + user→number binding
  databaseUrl: process.env['DATABASE_URL'] ?? '',
  databaseCaFile: process.env['DATABASE_CA_FILE'] ?? '',

  // Invite-only sign-up
  adminEmails: (process.env['ADMIN_EMAILS'] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /** E.164 numbers added to the allowlist at startup (idempotent), e.g. the first invitee. */
  allowlistSeed: (process.env['ALLOWLIST_SEED'] ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean),
  authRateLimit: parseInt(process.env['AUTH_RATE_LIMIT'] ?? '10', 10),

  // R2 (E2E ciphertext-store design; the media path below is provider-neutral)
  r2AccountId: process.env['R2_ACCOUNT_ID'] ?? '',
  r2AccessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
  r2SecretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
  r2BucketMedia: process.env['R2_BUCKET_MEDIA'] ?? 'openwa-media',
  r2BucketBackups: process.env['R2_BUCKET_BACKUPS'] ?? 'openwa-backups',
  /**
   * Media archive object store: any S3-compatible endpoint (OCI Object Storage, Cloudflare R2, …).
   * Compose passes OpenWA's S3_* values; empty endpoint + keys = media links are off.
   */
  s3Endpoint: process.env['S3_ENDPOINT'] ?? '',
  /** Region the endpoint expects; OCI takes its real region, R2 takes `auto`. */
  s3Region: process.env['S3_REGION'] ?? 'auto',
  /** OCI has no virtual-host addressing; `false` only for stores that support subdomain buckets. */
  s3ForcePathStyle: process.env['S3_FORCE_PATH_STYLE'] !== 'false',
  s3AccessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? '',
  s3SecretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? '',
  s3BucketMedia: process.env['S3_BUCKET_MEDIA'] ?? 'openwa-media',
  /** OpenWA's S3_KEY_PREFIX: every engine object key starts with it. */
  s3KeyPrefix: process.env['S3_KEY_PREFIX'] ?? 'media/',
  /** Lifetime of a presigned media link (clamped to 60..3600 s). */
  mediaUrlTtlSeconds: parseInt(process.env['MEDIA_URL_TTL_SECONDS'] ?? '300', 10),

  // OpenWA gateway
  openwaBaseUrl: process.env['OPENWA_BASE_URL'] ?? 'http://localhost:2785',
  /** Public BFF origin shown to users for their REST base and MCP URL. */
  publicApiUrl: process.env['PUBLIC_API_URL'] ?? 'http://localhost:4000',
  /** Web app origin that hosts the OAuth consent page. Set WEB_URL in every non-local deployment. */
  webUrl: process.env['WEB_URL'] ?? 'http://localhost:3000',
  /**
   * 32 random bytes (base64) that encrypt the per-connection OpenWA keys held for OAuth
   * connectors (Claude). Empty disables the OAuth server. Changing it breaks existing connections.
   */
  oauthEncKey: process.env['OAUTH_ENC_KEY'] ?? '',
  openwaApiKey: process.env['OPENWA_API_KEY'] ?? '',
  openwaWebhookSecret: process.env['OPENWA_WEBHOOK_SECRET'] ?? '',
  openwaTimeoutMs: parseInt(process.env['OPENWA_TIMEOUT_MS'] ?? '10000', 10),

  // Workflows (auto-replies)
  workflowBindings: process.env['WORKFLOW_BINDINGS'] ?? '',
  workflowDefaultEnabled: (process.env['WORKFLOW_DEFAULT_ENABLED'] ?? 'false') === 'true',
  workflowMinGapMs: parseInt(process.env['WORKFLOW_MIN_GAP_MS'] ?? '3000', 10),
  workflowMaxPerMinuteSession: parseInt(process.env['WORKFLOW_MAX_PER_MINUTE_SESSION'] ?? '6', 10),
  workflowMaxPerMinuteContact: parseInt(process.env['WORKFLOW_MAX_PER_MINUTE_CONTACT'] ?? '2', 10),
  workflowBackoffMs: parseInt(process.env['WORKFLOW_BACKOFF_MS'] ?? '900000', 10),

  // API send budget (defaults; admins override them from /admin). Counts only sends made through
  // the BFF (/wa/*, /mcp, auto-replies), never what the owner types on the phone or WhatsApp Web.
  apiSendPerDay: parseInt(process.env['API_SEND_DAILY_LIMIT'] ?? '300', 10),
  apiSendPerMinute: parseInt(process.env['API_SEND_PER_MINUTE'] ?? '10', 10),

  // Agentic core
  redisUrl: process.env['REDIS_URL'] ?? '',
  queuePrefix: process.env['QUEUE_PREFIX'] ?? 'openwa',
  queueConcurrency: parseInt(process.env['QUEUE_CONCURRENCY'] ?? '2', 10),
  skillsDirs: (process.env['SKILLS_DIRS'] ?? './skills,.claude/skills,.opencode/skills')
    .split(',')
    .map((dir) => dir.trim())
    .filter(Boolean),
  mcpReadonly: (process.env['MCP_READONLY'] ?? 'true') !== 'false',
  healthTimeoutMs: parseInt(process.env['HEALTH_TIMEOUT_MS'] ?? '2000', 10),

  // Auth
  sessionTtlMinutes: parseInt(process.env['SESSION_TTL_MINUTES'] ?? '15', 10),
  kekCacheTtlSeconds: parseInt(process.env['KEK_CACHE_TTL_SECONDS'] ?? '300', 10),

  // Rate limiting
  rateLimitDefault: parseInt(process.env['RATE_LIMIT_DEFAULT'] ?? '60', 10),
  rateLimitWindowSeconds: parseInt(process.env['RATE_LIMIT_WINDOW_SECONDS'] ?? '60', 10),

  // Crypto
  argon2MemoryKb: parseInt(process.env['ARGON2_MEMORY_KB'] ?? '65536', 10), // 64 MiB
  argon2Iterations: parseInt(process.env['ARGON2_ITERATIONS'] ?? '3', 10),
  argon2Parallelism: parseInt(process.env['ARGON2_PARALLELISM'] ?? '1', 10),

  // CORS — default-deny: no origins unless explicitly configured. The web app reaches the BFF through its
  // same-origin server proxy (app/web /api/bff), so a browser origin is not normally needed here.
  corsOrigins: (process.env['CORS_ORIGINS'] ?? '').split(',').filter(Boolean),
} as const;

const REQUIRED_IN_PRODUCTION = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'ADMIN_EMAILS',
  'OPENWA_API_KEY',
] as const;

export function assertProductionEnv(
  nodeEnv: string,
  read: (key: string) => string | undefined,
): void {
  if (nodeEnv !== 'production') return;
  for (const key of REQUIRED_IN_PRODUCTION) {
    if (!read(key)) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
}

assertProductionEnv(env.nodeEnv, (key) => process.env[key]);
