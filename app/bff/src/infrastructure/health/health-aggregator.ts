/**
 * Health aggregator — runs dependency probes with a timeout and derives readiness.
 */

import type { DependencyHealth, IHealthProbe } from '../../domain/ports/index.js';
import { env } from '../../config/env.js';

export interface AggregateHealth {
  ok: boolean;
  deps: Record<string, DependencyHealth>;
}

export class HealthAggregator {
  constructor(
    private readonly probes: IHealthProbe[],
    private readonly timeoutMs: number = env.healthTimeoutMs,
  ) {}

  private async run(probe: IHealthProbe): Promise<DependencyHealth> {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('probe timeout')), this.timeoutMs);
      });
      const result = await Promise.race([probe.probe(), timeout]);
      return { ...result, latencyMs: Date.now() - started };
    } catch (error) {
      return {
        name: probe.name,
        status: 'down',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'probe failed',
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async check(): Promise<AggregateHealth> {
    const entries = await Promise.all(
      this.probes.map(async (probe): Promise<[string, DependencyHealth]> => [
        probe.name,
        await this.run(probe),
      ]),
    );
    const deps = Object.fromEntries(entries);
    const ok = this.probes.every((probe) => {
      if (!probe.required) return true;
      const status = deps[probe.name]?.status;
      return status === 'up' || status === 'degraded';
    });
    return { ok, deps };
  }
}
