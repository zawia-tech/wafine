/**
 * Workflow toggles — `/api/workflows`, authenticated, scoped to the caller's tenant.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import type { IWorkflowStore, WorkflowRuleId } from '../../../domain/ports/index.js';
import { BUILTIN_RULES } from '../../../domain/workflows/rules.js';

const toggleSchema = z.object({ enabled: z.boolean() });

export function registerWorkflowRoutes(app: Hono, store: IWorkflowStore): void {
  const view = (settings: Awaited<ReturnType<IWorkflowStore['getSettings']>>) => ({
    workflows: BUILTIN_RULES.map((rule) => ({
      id: rule.id,
      description: rule.description,
      enabled: settings.rules[rule.id],
    })),
  });

  app.get('/api/workflows', async (c) => {
    const { tenantId } = c.get('auth');
    return c.json(view(await store.getSettings(tenantId)));
  });

  app.put('/api/workflows/:ruleId', async (c) => {
    const { tenantId } = c.get('auth');
    const ruleId = c.req.param('ruleId');
    if (!BUILTIN_RULES.some((rule) => rule.id === ruleId)) {
      return c.json({ error: 'Unknown workflow' }, 404);
    }
    const parsed = toggleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Body must be {"enabled": boolean}' }, 400);

    const settings = await store.setRuleEnabled(tenantId, ruleId as WorkflowRuleId, parsed.data.enabled);
    return c.json(view(settings));
  });
}
