/**
 * In-memory job queue — dependency-free fallback when REDIS_URL is unset.
 */

import type { IJobQueue, JobHandler, JobHandle, JobOptions } from '../../domain/ports/index.js';

interface PendingJob {
  name: string;
  data: unknown;
  options: JobOptions;
}

export class InMemoryJobQueue implements IJobQueue {
  private readonly handlers = new Map<string, JobHandler>();
  private pending: PendingJob[] = [];
  private started = false;
  private completed = 0;
  private failed = 0;
  private sequence = 0;

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  private async execute(name: string, data: unknown): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) {
      this.failed++;
      return;
    }
    try {
      await handler(data);
      this.completed++;
    } catch {
      this.failed++;
    }
  }

  async enqueue<T>(name: string, data: T, options: JobOptions = {}): Promise<JobHandle> {
    const id = options.jobId ?? `mem-${++this.sequence}`;
    if (this.started && this.handlers.has(name)) {
      await this.execute(name, data);
    } else {
      this.pending.push({ name, data, options });
    }
    return { id, name };
  }

  async start(): Promise<void> {
    this.started = true;
    const queue = this.pending;
    this.pending = [];
    for (const job of queue) {
      await this.execute(job.name, job.data);
    }
  }

  async close(): Promise<void> {
    this.started = false;
    this.handlers.clear();
    this.pending = [];
  }

  async health(): Promise<boolean> {
    return true;
  }

  async counts(): Promise<Record<string, number>> {
    return { completed: this.completed, failed: this.failed, waiting: this.pending.length };
  }
}
