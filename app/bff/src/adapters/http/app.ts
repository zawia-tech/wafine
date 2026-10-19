/**
 * Hono + oRPC application assembly.
 * Wires middleware, routers, and error handling.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { CodedHTTPException } from './errors.js';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { createAuthMiddleware } from '../../infrastructure/auth/middleware.js';
import { loadAdminRole } from '../../infrastructure/auth/admin-authorization.js';
import { TokenBucketRateLimiter } from '../../infrastructure/auth/rate-limit.js';
import type {
  IAccountsRepository,
  ISelfServiceIdentity,
  IIdentityProvider,
  IWaTenancyRepository,
  IWaitlistRepository,
  IWhatsAppGateway,
} from '../../domain/ports/index.js';
import type { HealthAggregator } from '../../infrastructure/health/health-aggregator.js';
import type { IIdempotencyStore, IWebhookVerifier, IWorkflowStore } from '../../domain/ports/index.js';
import type { WorkflowEngine } from '../../domain/workflows/engine.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerWebhookRoutes } from './routes/webhook.js';
import { registerWorkflowRoutes } from './routes/workflows.js';
import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/account.js';
import { waitlistRoutes } from './routes/waitlist.js';
import { meRoutes } from './routes/me.js';
import { adminRoutes } from './routes/admin.js';
import { waRoutes } from './routes/wa.js';
import { registerGatewayProxy } from './routes/gateway-proxy.js';
import type { MediaUrlDeps } from './routes/media-url.js';
import {
  oauthUserRoutes,
  protectedResourceMetadataUrl,
  registerOAuthPublic,
} from './routes/oauth.js';
import type { IAdminRepository, IOAuthRepository, ISendBudget } from '../../domain/ports/index.js';
import type { RuntimeSettingsService } from '../../infrastructure/settings/runtime-settings.js';
import type { SecretBox } from '../../infrastructure/crypto/secret-box.js';
import { env } from '../../config/env.js';

export interface WorkflowDeps {
  verifier: IWebhookVerifier;
  engine: WorkflowEngine;
  store: IWorkflowStore;
  replayGuard: IIdempotencyStore;
}

export interface WaDeps {
  gateway: IWhatsAppGateway;
  tenancy: IWaTenancyRepository;
  /** Private engine base URL for the key-authenticated passthrough (/wa/*, /mcp). */
  openwaBaseUrl: string;
  /** Public BFF origin shown to users. */
  publicApiUrl: string;
  fetchImpl?: typeof fetch;
  proxyRateLimit?: { limit: number; windowSeconds: number };
  /** OAuth authorization server for MCP connectors (Claude). Absent = API keys only. */
  oauth?: { repo: IOAuthRepository; box: SecretBox; webUrl: string };
  /** Per-session outbound send cap on `/wa/*` and `/mcp`. Absent = not budgeted. */
  sendBudget?: ISendBudget;
  /** Presigned links to archived media in the private bucket. Absent = no media-url routes. */
  media?: MediaUrlDeps;
}

export interface AppDeps {
  health: HealthAggregator;
  accounts: IAccountsRepository;
  identity: IIdentityProvider;
  adminEmails: readonly string[];
  /** Webhook-driven auto-reply workflows; the routes are mounted only when provided. */
  workflows?: WorkflowDeps;
  /** Per-user WhatsApp session, API keys and the key-authenticated gateway passthrough. */
  wa?: WaDeps;
  corsOrigins?: readonly string[];
  /** Requests per window for unauthenticated `/auth/*` calls, per client IP. */
  authRateLimit?: { limit: number; windowSeconds: number };
  /** Requests per window for the public waitlist form, per client IP. */
  waitlistRateLimit?: { limit: number; windowSeconds: number };
  /** Landing-page waitlist storage. Absent = the route is not mounted. */
  waitlist?: IWaitlistRepository;
  rateLimit?: { limit: number; windowSeconds: number };
  /**
   * Admin backoffice (settings, per-session send caps, users). Needs `wa`. When present, disabled
   * users are refused on /api/* and on the key/OAuth passthrough.
   */
  backoffice?: { repo: IAdminRepository; settings: RuntimeSettingsService; budget: ISendBudget };
  /**
   * Account self-service on Supabase Auth (e-mail, password, sessions, reset). Absent: the
   * /api/account e-mail/password/session routes and /auth/forgot + /auth/reset are not mounted.
   */
  selfService?: ISelfServiceIdentity;
  /** Web origin for links in auth e-mails. Defaults to WEB_URL. */
  webUrl?: string;
}

function clientIp(c: { req: { header(name: string): string | undefined } }): string {
  // Traffic arrives through the Cloudflare tunnel; the BFF is not otherwise reachable.
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export function createApp(deps: AppDeps) {
  const { health, accounts, identity, adminEmails, workflows } = deps;
  const app = new Hono();
  const rateLimiter = new TokenBucketRateLimiter();
  const authLimit = deps.authRateLimit ?? { limit: 10, windowSeconds: 60 };
  const waitlistLimit = deps.waitlistRateLimit ?? { limit: 5, windowSeconds: 60 };
  const apiLimit = deps.rateLimit ?? { limit: env.rateLimitDefault, windowSeconds: env.rateLimitWindowSeconds };

  // Global middleware
  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: [...(deps.corsOrigins ?? env.corsOrigins)],
      credentials: true,
    }),
  );

  // Health checks (no auth)
  registerHealthRoutes(app, health);

  // OpenWA webhook ingress (HMAC-authenticated, no bearer token): mounted before the
  // bearer auth below, and never reads a tenant from the request.
  if (workflows) registerWebhookRoutes(app, workflows);

  // Public auth (sign-up / login / refresh): throttled per client IP, no bearer token
  app.use('/auth/*', async (c, next) => {
    const allowed = await rateLimiter.isAllowed(
      `auth:${clientIp(c)}`,
      authLimit.limit,
      authLimit.windowSeconds,
    );
    if (!allowed) return c.json({ error: 'Rate limit exceeded', code: 'rate_limited' }, 429);
    await next();
  });
  const webUrl = deps.webUrl ?? env.webUrl;
  app.route(
    '/auth',
    authRoutes({ accounts, identity, adminEmails, ...(deps.selfService ? { selfService: deps.selfService, webUrl } : {}) }),
  );

  // Public waitlist (landing form): throttled per client IP, no bearer token. Mounted only when
  // storage is wired, so a BFF without a database simply does not expose it.
  if (deps.waitlist) {
    app.use('/waitlist', async (c, next) => {
      const allowed = await rateLimiter.isAllowed(
        `waitlist:${clientIp(c)}`,
        waitlistLimit.limit,
        waitlistLimit.windowSeconds,
      );
      if (!allowed) return c.json({ error: 'Rate limit exceeded' }, 429);
      await next();
    });
    app.route('/waitlist', waitlistRoutes({ waitlist: deps.waitlist }));
  }

  // OAuth authorization server for MCP connectors (Claude): metadata, register, authorize, token
  const wa = deps.wa;
  const oauthDeps = wa?.oauth
    ? {
        oauth: wa.oauth.repo,
        tenancy: wa.tenancy,
        gateway: wa.gateway,
        box: wa.oauth.box,
        publicApiUrl: wa.publicApiUrl,
        webUrl: wa.oauth.webUrl,
      }
    : undefined;
  const oauthFlows = oauthDeps ? registerOAuthPublic(app, oauthDeps) : undefined;

  // Key- or OAuth-authenticated passthrough to the private engine (not Supabase sessions)
  if (wa) {
    registerGatewayProxy(app, {
      tenancy: wa.tenancy,
      openwaBaseUrl: wa.openwaBaseUrl,
      ...(wa.fetchImpl ? { fetchImpl: wa.fetchImpl } : {}),
      ...(wa.proxyRateLimit ? { rateLimit: wa.proxyRateLimit } : {}),
      ...(wa.sendBudget ? { sendBudget: wa.sendBudget } : {}),
      ...(deps.backoffice
        ? { isUserDisabled: (userId: string) => deps.backoffice!.settings.isUserDisabled(userId) }
        : {}),
      ...(wa.media ? { media: wa.media } : {}),
      ...(wa.oauth
        ? {
            oauth: {
              repo: wa.oauth.repo,
              box: wa.oauth.box,
              resourceMetadataUrl: protectedResourceMetadataUrl(wa.publicApiUrl),
            },
          }
        : {}),
    });
  }

  // Everything under /api requires a valid Supabase session
  app.use('/api/*', createAuthMiddleware(identity, adminEmails));
  if (deps.backoffice) {
    const { settings } = deps.backoffice;
    app.use('/api/*', async (c, next) => {
      const auth = c.get('auth');
      if (!auth.isAdmin && (await settings.isUserDisabled(auth.userId))) {
        return c.json({ error: 'This account is disabled. Contact an administrator.' }, 403);
      }
      await next();
    });
  }
  app.use('/api/*', async (c, next) => {
    const key = `${c.get('auth').userId}:${c.req.path}`;
    if (!(await rateLimiter.isAllowed(key, apiLimit.limit, apiLimit.windowSeconds))) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    await next();
  });

  app.route('/api', meRoutes(accounts));
  if (deps.selfService) {
    const settings = deps.backoffice?.settings;
    app.route(
      '/api/account',
      accountRoutes({
        accounts,
        identity,
        selfService: deps.selfService,
        adminEmails,
        webUrl,
        ...(settings ? { disableUser: (userId: string) => settings.setUserDisabled(userId, true) } : {}),
      }),
    );
  }
  // Resolves the caller's role (403 for `user`); each admin route then checks its permission.
  app.use('/api/admin/*', loadAdminRole(accounts));
  app.route(
    '/api/admin',
    adminRoutes(
      accounts,
      deps.backoffice && deps.wa
        ? {
            ...deps.backoffice,
            tenancy: deps.wa.tenancy,
            gateway: deps.wa.gateway,
            adminEmails,
            ...(deps.wa.oauth ? { oauth: deps.wa.oauth.repo } : {}),
          }
        : undefined,
      // Same rule as the public form: no waitlist storage, no waitlist routes.
      deps.waitlist,
      adminEmails,
    ),
  );

  if (deps.wa) {
    app.route(
      '/api/wa',
      waRoutes({
        gateway: deps.wa.gateway,
        tenancy: deps.wa.tenancy,
        accounts,
        publicApiUrl: deps.wa.publicApiUrl,
        ...(deps.wa.oauth ? { oauth: deps.wa.oauth.repo } : {}),
        ...(deps.wa.media ? { media: deps.wa.media } : {}),
      }),
    );
  }
  if (oauthDeps && oauthFlows) app.route('/api/oauth', oauthUserRoutes(oauthDeps, oauthFlows));

  // Workflow toggles are scoped to the caller's tenant (`auth.tenantId`, see middleware).
  if (workflows) registerWorkflowRoutes(app, workflows.store);

  // TODO: Mount oRPC routers here
  // app.route('/api', messageRouter);
  // app.route('/api', contactRouter);
  // app.route('/api', tenantRouter);

  // Error handler: HTTPException keeps its status (401/403/…); anything else is a 500
  // whose details stay in the log.
  app.onError((err, c) => {
    if (err instanceof CodedHTTPException) {
      return c.json({ error: err.message, code: err.code }, err.status);
    }
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error('Unhandled error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
