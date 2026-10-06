export const syncIntervals = { service: 10_000, remote: 60_000, local: 5_000, maxBackoff: 300_000 } as const;

export interface RefreshClock {
  now: () => number;
  schedule: (callback: () => void, delay: number) => () => void;
}
const clock: RefreshClock = {
  now: () => Date.now(),
  schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
};

// One resource owns one timer and one in-flight request. A timer is scheduled
// after settlement, not on an interval that can accumulate overlapping work.
export function createAutoRefresh(options: {
  run: (signal: AbortSignal) => Promise<void>;
  intervalMs: number;
  initialDelayMs?: number;
  maxBackoffMs?: number;
  isActive?: () => boolean;
  onError?: (problem: unknown) => void;
  clock?: RefreshClock;
}) {
  const time = options.clock || clock;
  const active = options.isActive || (() => true);
  const maximum = Math.max(options.intervalMs, options.maxBackoffMs ?? syncIntervals.maxBackoff);
  const minimumWake = Math.min(1_000, options.intervalMs);
  let stopped = false;
  let cancelTimer: (() => void) | undefined;
  let request: AbortController | undefined;
  let resumePending = false;
  let failures = 0;
  let lastStart = -Infinity;
  let retryNotBefore = -Infinity;

  function schedule(delay: number) {
    cancelTimer?.(); cancelTimer = undefined;
    if (!stopped && active()) cancelTimer = time.schedule(() => { cancelTimer = undefined; void run(); }, delay);
  }
  async function run() {
    if (stopped || !active() || request) return;
    const current = new AbortController(); request = current; lastStart = time.now();
    try { await options.run(current.signal); if (!current.signal.aborted) { failures = 0; retryNotBefore = -Infinity; } }
    catch (problem) {
      if (!current.signal.aborted) {
        failures = Math.min(failures + 1, 10);
        retryNotBefore = time.now() + Math.min(maximum, options.intervalMs * 2 ** failures);
        options.onError?.(problem);
      }
    } finally {
      request = undefined;
      if (resumePending) { resumePending = false; schedule(wakeDelay()); }
      else schedule(Math.min(maximum, options.intervalMs * 2 ** failures));
    }
  }
  function pause() { cancelTimer?.(); cancelTimer = undefined; resumePending = false; request?.abort(); }
  function wakeDelay() { return Math.max(0, minimumWake - (time.now() - lastStart), retryNotBefore - time.now()); }
  function wake() {
    if (stopped) return;
    if (!active()) { pause(); return; }
    if (request) { if (request.signal.aborted) resumePending = true; return; }
    schedule(wakeDelay());
  }
  function stop() { stopped = true; pause(); }
  schedule(options.initialDelayMs ?? 0);
  return { wake, pause, stop };
}
