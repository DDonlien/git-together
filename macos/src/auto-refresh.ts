// Local observation stays independent of the much slower remote read budget.
export const syncIntervals = { service: 10_000, remote: 300_000, catalog: 1_800_000, local: 5_000, remoteChange: 120_000, maxBackoff: 300_000, remoteMaxBackoff: 1_800_000 } as const;

export function repositoryRefreshInterval(lastUsed: number | undefined, active: boolean, pinned: boolean, now = Date.now()): number {
  if (active) return syncIntervals.remote;
  const age = lastUsed === undefined ? Infinity : Math.max(0, now - lastUsed);
  const interval = age < 3_600_000 ? 600_000 : age < 86_400_000 ? 1_800_000 : age < 604_800_000 ? 7_200_000 : 21_600_000;
  return pinned ? Math.min(interval, 1_800_000) : interval;
}

export interface RefreshClock {
  now: () => number;
  schedule: (callback: () => void, delay: number) => () => void;
}
const clock: RefreshClock = {
  now: () => Date.now(),
  schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
};

// Admission is shared by resource timers; queued reads use the latest priority
// when a slot opens, and cancelling one waiter leaves other resources alone.
export function createRefreshQueue(limit: () => number, priority: (key: string) => number) {
  let running = 0;
  const active = new Set<string>();
  const waiting: { key: string; start: () => void }[] = [];
  const drain = () => {
    waiting.sort((a, b) => priority(a.key) - priority(b.key));
    while (running < limit() && waiting.length) {
      const next = waiting[0];
      // Negative priority is the open repository. Keep one slot available for
      // it while the background walks large repositories with many branches.
      const background = [...active].filter(key => priority(key) >= 0).length;
      if (priority(next.key) >= 0 && background >= Math.max(1, limit() - 1)) break;
      running++; active.add(next.key); waiting.shift()!.start();
    }
  };
  return {
    wake: drain,
    acquire: (key: string, signal: AbortSignal): Promise<() => void> => {
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        const abort = () => { waiting.splice(waiting.indexOf(item), 1); reject(signal.reason); };
        const item = { key, start: () => { signal.removeEventListener('abort', abort); resolve(() => { running--; active.delete(key); drain(); }); } };
        signal.addEventListener('abort', abort, { once: true });
        waiting.push(item); drain();
      });
    },
  };
}

// One resource owns one timer and one in-flight request. A timer is scheduled
// after settlement, not on an interval that can accumulate overlapping work.
export function createAutoRefresh(options: {
  run: (signal: AbortSignal) => Promise<void>;
  intervalMs: number | (() => number);
  initialDelayMs?: number;
  maxBackoffMs?: number;
  retryIntervalMs?: number;
  minTriggerIntervalMs?: number;
  acquire?: (signal: AbortSignal) => Promise<() => void>;
  isActive?: () => boolean;
  onError?: (problem: unknown) => void;
  onReading?: (reading: boolean) => void;
  onRetry?: (failures: number, retryMs: number) => void;
  clock?: RefreshClock;
}) {
  const time = options.clock || clock;
  const active = options.isActive || (() => true);
  const interval = () => typeof options.intervalMs === 'number' ? options.intervalMs : options.intervalMs();
  const retryDelay = () => failures === 0 ? interval() : Math.min(options.maxBackoffMs ?? syncIntervals.maxBackoff, (options.retryIntervalMs ?? interval()) * 2 ** failures);
  const minimumWake = () => Math.min(1_000, interval());
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
    let triggered = triggerPending; triggerPending = false;
    const current = new AbortController(); request = current;
    let release: (() => void) | undefined;
    try {
      release = await options.acquire?.(current.signal);
      current.signal.throwIfAborted();
      triggered ||= triggerPending; triggerPending = false;
      lastStart = time.now(); options.onReading?.(true);
      await options.run(current.signal);
      if (!current.signal.aborted) { failures = 0; lastSuccess = time.now(); retryNotBefore = -Infinity; }
    }
    catch (problem) {
      if (!current.signal.aborted) {
        failures = Math.min(failures + 1, 10);
        const providerDeadline = typeof problem === 'object' && problem !== null && 'retryAt' in problem && typeof problem.retryAt === 'number' && Number.isFinite(problem.retryAt) ? problem.retryAt : 0;
        const retryMs = Math.max(retryDelay(), providerDeadline - time.now());
        retryNotBefore = time.now() + retryMs;
        options.onRetry?.(failures, retryMs);
        options.onError?.(problem);
      }
    } finally {
      release?.();
      request = undefined;
      // An interrupted change-triggered read still needs a check on resume.
      if (current.signal.aborted && triggered) triggerPending = true;
      if (!stopped) options.onReading?.(false);
      if (triggerPending) { resumePending = false; schedule(triggerDelay()); }
      else if (resumePending) { resumePending = false; schedule(wakeDelay()); }
      else schedule(Math.max(retryDelay(), retryNotBefore - time.now()));
    }
  }
  function pause() { cancelTimer?.(); cancelTimer = undefined; resumePending = false; if (request) { request.abort(); options.onReading?.(false); } }
  // Focus and online events resume the existing cadence. They do not make a
  // successfully checked resource stale or defeat a failure's retry deadline.
  function wakeDelay() { return Math.max(0, minimumWake() - (time.now() - lastStart), interval() - (time.now() - lastSuccess), retryNotBefore - time.now()); }
  function triggerDelay() { return Math.max(0, Math.max(minimumWake(), options.minTriggerIntervalMs ?? 0) - (time.now() - lastStart), retryNotBefore - time.now()); }
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
