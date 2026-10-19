/**
 * Queue factory — BullMQ when REDIS_URL is set, in-memory otherwise.
 */

import type { IJobQueue } from '../../domain/ports/index.js';
import { env } from '../../config/env.js';
import { InMemoryJobQueue } from './in-memory-queue.js';
import { BullMqJobQueue } from './bullmq-queue.js';

export function createJobQueue(): IJobQueue {
  if (env.redisUrl === '') return new InMemoryJobQueue();
  return new BullMqJobQueue(env.redisUrl, env.queuePrefix, env.queueConcurrency);
}
