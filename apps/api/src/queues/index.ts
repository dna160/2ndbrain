/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/queues/index.ts
 * Role    : BullMQ connection + enqueuer (deduped from Lynkbot apps/worker/src/queues.ts —
 *           singleton Queue map, reused connection). The `Enqueuer` interface lets services
 *           enqueue without depending on BullMQ, so ingestion is unit-testable with a fake.
 * Exports : createRedisConnection(), Enqueuer, BullEnqueuer
 */
import type { QueueDepth, QueueName } from '@recall/shared';
import { QUEUE_NAMES } from '@recall/shared/constants';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export interface EnqueueOptions {
  attempts?: number;
  backoffMs?: number;
}

export interface Enqueuer {
  enqueue(queue: QueueName, jobName: string, data: unknown, opts?: EnqueueOptions): Promise<void>;
}

/** BullMQ requires `maxRetriesPerRequest: null` on the shared connection. */
export function createRedisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export class BullEnqueuer implements Enqueuer {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly connection: Redis) {}

  private getQueue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connection,
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue(
    queue: QueueName,
    jobName: string,
    data: unknown,
    opts?: EnqueueOptions,
  ): Promise<void> {
    await this.getQueue(queue).add(jobName, data, {
      attempts: opts?.attempts ?? 3,
      backoff: { type: 'exponential', delay: opts?.backoffMs ?? 5000 },
      removeOnComplete: 100,
      removeOnFail: false, // keep failed jobs for DLQ visibility
    });
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}

export interface QueueStats {
  depths(): Promise<QueueDepth[]>;
}

/** Live per-queue depth for the Pipeline view header (docs/02 §5 Pipeline). */
export function createQueueStats(connection: Redis): QueueStats {
  const queues = QUEUE_NAMES.map((name) => new Queue(name, { connection }));
  return {
    async depths() {
      return Promise.all(
        queues.map(async (q) => ({
          queue: q.name,
          waiting: await q.getWaitingCount(),
          active: await q.getActiveCount(),
          failed: await q.getFailedCount(),
        })),
      );
    },
  };
}
