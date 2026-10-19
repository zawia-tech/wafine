/**
 * Health routes — liveness (`/health`) and readiness (`/health/ready`).
 */

import type { Hono } from 'hono';
import type { HealthAggregator } from '../../../infrastructure/health/health-aggregator.js';

export function registerHealthRoutes(app: Hono, aggregator: HealthAggregator): void {
  app.get('/health', (c) => c.json({ ok: true, timestamp: new Date().toISOString() }));

  app.get('/health/ready', async (c) => {
    const health = await aggregator.check();
    return c.json(health, health.ok ? 200 : 503);
  });
}
