/**
 * BullMQ job queue — Redis-backed implementation of IJobQueue.
 */

import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { IJobQueue, JobHandler, JobHandle, JobOptions } from '../../domain/ports/index.js';

export class BullMqJobQueue implements IJobQueue {
  private readonly connection: Redis;
  private readonly queue: Queue;
  private readonly handlers = new Map<string, JobHandler>();
  private worker: Worker | undefined;

  constructor(
    url: string,
    private readonly prefix: string,
    private readonly concurrency: number,
  ) {
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(`${prefix}-jobs`, { connection: this.connection });
  }

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async enqueue<T>(name: string, data: T, options: JobOptions = {}): Promise<JobHandle> {
    const job = await this.queue.add(name, data, {
      delay: options.delayMs,
      attempts: options.attempts,
      backoff:
        options.backoffMs === undefined
          ? undefined
          : { type: 'exponential', delay: options.backoffMs },
      jobId: options.jobId,
    });
    return { id: job.id ?? '', name };
  }

  async start(): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker(
      `${this.prefix}-jobs`,
      async (job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) throw new Error(`No handler registered for job: ${job.name}`);
        await handler(job.data);
      },
      { connection: this.connection, concurrency: this.concurrency },
    );
  }

  async close(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
    await this.queue.close();
    await this.connection.quit();
  }

  async health(): Promise<boolean> {
    try {
      return (await this.connection.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async counts(): Promise<Record<string, number>> {
    return this.queue.getJobCounts();
  }
}
