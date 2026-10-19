/**
 * Env-seeded tenant bindings and allowlist (PoC).
 *
 * `WORKFLOW_BINDINGS` is a JSON array: `[{"tenantId":"…","sessionId":"…","allowlist":["+212…"]}]`.
 * The sign-up / allowlist dashboard will replace this with a database-backed
 * `ITenantDirectory` + `IContactAllowlist`; the engine only depends on those ports.
 */

import { z } from 'zod';
import type { IContactAllowlist, ITenantDirectory } from '../../domain/ports/index.js';

const bindingSchema = z.array(
  z.object({
    tenantId: z.string().min(1),
    sessionId: z.string().min(1),
    allowlist: z.array(z.string()).default([]),
  }),
);

export type WorkflowBinding = z.infer<typeof bindingSchema>[number];

export function parseBindings(raw: string): WorkflowBinding[] {
  if (!raw.trim()) return [];
  return bindingSchema.parse(JSON.parse(raw));
}

const digitsOf = (value: string): string => value.split('@')[0]?.replace(/\D/g, '') ?? '';

export class StaticWorkflowDirectory implements ITenantDirectory, IContactAllowlist {
  private readonly tenantBySession = new Map<string, string>();
  private readonly allowedByTenant = new Map<string, Set<string>>();

  constructor(bindings: readonly WorkflowBinding[]) {
    for (const binding of bindings) {
      this.tenantBySession.set(binding.sessionId, binding.tenantId);
      const allowed = this.allowedByTenant.get(binding.tenantId) ?? new Set<string>();
      for (const number of binding.allowlist) {
        const digits = digitsOf(number);
        if (digits) allowed.add(digits);
      }
      this.allowedByTenant.set(binding.tenantId, allowed);
    }
  }

  async tenantForSession(sessionId: string): Promise<string | null> {
    return this.tenantBySession.get(sessionId) ?? null;
  }

  async isAllowed(tenantId: string, chatId: string): Promise<boolean> {
    const digits = digitsOf(chatId);
    return digits !== '' && (this.allowedByTenant.get(tenantId)?.has(digits) ?? false);
  }
}
