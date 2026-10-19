/**
 * Job queue port — workflow orchestration over Redis/BullMQ.
 */

export interface JobOptions {
  delayMs?: number;
  attempts?: number;
  backoffMs?: number;
  jobId?: string;
}

export interface JobHandle {
  id: string;
  name: string;
}

export type JobHandler<T = unknown> = (data: T) => Promise<void>;

export interface IJobQueue {
  enqueue<T>(name: string, data: T, options?: JobOptions): Promise<JobHandle>;
  register(name: string, handler: JobHandler): void;
  start(): Promise<void>;
  close(): Promise<void>;
  health(): Promise<boolean>;
  counts(): Promise<Record<string, number>>;
}
