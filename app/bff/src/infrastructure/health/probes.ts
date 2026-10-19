/**
 * Dependency probe builders — one probe per readiness dependency.
 */

import type {
  IHealthProbe,
  IJobQueue,
  IMcpClientFactory,
  IWhatsAppGateway,
} from '../../domain/ports/index.js';

export interface HealthDeps {
  gateway: IWhatsAppGateway;
  queue: IJobQueue;
  mcp: IMcpClientFactory;
  skillCount: number;
}

export function buildHealthProbes(deps: HealthDeps): IHealthProbe[] {
  return [
    {
      name: 'openwa',
      required: true,
      async probe() {
        const up = await deps.gateway.health();
        return { name: 'openwa', status: up ? 'up' : 'down' };
      },
    },
    {
      name: 'queue',
      required: false,
      async probe() {
        const up = await deps.queue.health();
        return { name: 'queue', status: up ? 'up' : 'down' };
      },
    },
    {
      name: 'mcp',
      required: false,
      async probe() {
        const health = await deps.mcp.health();
        const down = Object.entries(health)
          .filter(([, ok]) => !ok)
          .map(([id]) => id);
        return {
          name: 'mcp',
          status: down.length === 0 ? 'up' : 'degraded',
          detail: down.length === 0 ? undefined : `down: ${down.join(', ')}`,
        };
      },
    },
    {
      name: 'skills',
      required: false,
      async probe() {
        return {
          name: 'skills',
          status: deps.skillCount > 0 ? 'up' : 'degraded',
          detail: `${deps.skillCount} skill(s) loaded`,
        };
      },
    },
  ];
}
