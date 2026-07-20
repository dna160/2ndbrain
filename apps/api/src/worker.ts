/**
 * Worker bootstrap (MODE=worker) — same image as the api, different entrypoint (docs/01 §1).
 * BullMQ queue consumers + repeatable cron jobs register here from Phase 2 onward. Phase 0
 * ships a heartbeat so the worker service deploys and stays healthy on Railway.
 */
import { loadConfig } from './config';

function main(): void {
  const config = loadConfig();

  if (config.MODE !== 'worker') {
    console.warn(`[worker] started with MODE=${config.MODE}; expected 'worker'.`);
  }

  console.log('[worker] booted — no queues registered yet (added in Phase 2+).');

  const shutdown = (signal: string): void => {
    console.log(`[worker] received ${signal}, shutting down.`);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep the process alive until BullMQ workers own the event loop.
  setInterval(() => undefined, 1 << 30);
}

try {
  main();
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
