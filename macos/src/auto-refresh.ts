// Remote reads run every five minutes and once on newly observed local Git
// changes; the inexpensive five-second local scan keeps unchanged snapshots.
export const syncIntervals = { service: 10_000, remote: 300_000, local: 5_000, maxBackoff: 300_000 } as const;

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
  onReading?: (reading: boolean) => void;
  onRetry?: (failures: number, retryMs: number) => void;
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
  let triggerPending = false;
  let failures = 0;
  let lastStart = -Infinity;
  let lastSuccess = -Infinity;
  let retryNotBefore = -Infinity;

  function schedule(delay: number) {
    cancelTimer?.(); cancelTimer = undefined;
    if (!stopped && active()) cancelTimer = time.schedule(() => { cancelTimer = undefined; void run(); }, delay);
  }
  async function run() {
    if (stopped || !active() || request) return;
    const triggered = triggerPending; triggerPending = false;
    const current = new AbortController(); request = current; lastStart = time.now();
    options.onReading?.(true);
    try { await options.run(current.signal); if (!current.signal.aborted) { failures = 0; lastSuccess = time.now(); retryNotBefore = -Infinity; } }
    catch (problem) {
      if (!current.signal.aborted) {
        failures = Math.min(failures + 1, 10);
        const retryMs = Math.min(maximum, options.intervalMs * 2 ** failures);
        retryNotBefore = time.now() + retryMs;
        options.onRetry?.(failures, retryMs);
        options.onError?.(problem);
      }
    } finally {
      request = undefined;
      // An interrupted change-triggered read still needs a check on resume.
      if (current.signal.aborted && triggered) triggerPending = true;
      if (!stopped) options.onReading?.(false);
      if (triggerPending) { resumePending = false; schedule(triggerDelay()); }
      else if (resumePending) { resumePending = false; schedule(wakeDelay()); }
      else schedule(Math.min(maximum, options.intervalMs * 2 ** failures));
    }
  }
  function pause() { cancelTimer?.(); cancelTimer = undefined; resumePending = false; if (request) { request.abort(); options.onReading?.(false); } }
  // Focus and online events resume the existing cadence. They do not make a
  // successfully checked resource stale or defeat a failure's retry deadline.
  function wakeDelay() { return Math.max(0, minimumWake - (time.now() - lastStart), options.intervalMs - (time.now() - lastSuccess), retryNotBefore - time.now()); }
  function triggerDelay() { return Math.max(0, minimumWake - (time.now() - lastStart), retryNotBefore - time.now()); }
  function wake() {
    if (stopped) return;
    if (!active()) { pause(); return; }
    if (request) { if (request.signal.aborted) resumePending = true; return; }
    schedule(triggerPending ? triggerDelay() : wakeDelay());
  }
  // A change may check a fresh result, but cannot overlap an existing read or
  // bypass provider backoff. Multiple changes during one read share a follow-up.
  function trigger() {
    if (stopped) return;
    triggerPending = true;
    if (active() && !request) schedule(triggerDelay());
  }
  function stop() { stopped = true; pause(); }
  schedule(options.initialDelayMs ?? 0);
  return { wake, trigger, pause, stop };
}
