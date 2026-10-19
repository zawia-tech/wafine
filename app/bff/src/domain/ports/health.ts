/**
 * Health port — dependency probes aggregated by the readiness endpoint.
 */

export type DependencyStatus = 'up' | 'down' | 'degraded' | 'unknown';

export interface DependencyHealth {
  name: string;
  status: DependencyStatus;
  latencyMs?: number;
  detail?: string;
}

export interface IHealthProbe {
  name: string;
  /** A down required probe makes the aggregate not-ready. */
  required: boolean;
  probe(): Promise<DependencyHealth>;
}
