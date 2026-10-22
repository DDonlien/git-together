import { useEffect, useRef } from 'react';
import { createAutoRefresh, createRefreshQueue } from './auto-refresh';
import { logDiagnostic } from './diagnostics-api';

// Resource identities, not changing payload objects, control timer lifetime.
// Adding/removing an account keeps the other accounts' cadence and backoff.
export function useAutoRefresh({ resources, intervalMs, initialDelayMs = 0, intervals = {}, initialDelays = {}, priorities = {}, maxConcurrent = Infinity, maxBackoffMs, minTriggerIntervalMs = 0, triggers = {}, pausedResources = [], run, onError, onReading }: {
  resources: string[];
  intervalMs: number;
  initialDelayMs?: number;
  intervals?: Record<string, number>;
  initialDelays?: Record<string, number>;
  minTriggerIntervalMs?: number;
  priorities?: Record<string, number>;
  maxConcurrent?: number;
  maxBackoffMs?: number;
  triggers?: Record<string, number>;
  pausedResources?: string[];
  run: (resource: string, signal: AbortSignal) => Promise<void>;
  onError?: (resource: string, problem: unknown) => void;
  onReading?: (resource: string, reading: boolean) => void;
}) {
  const callbacks = useRef({ run, onError, onReading, intervals, intervalMs, priorities, maxConcurrent }); callbacks.current = { run, onError, onReading, intervals, intervalMs, priorities, maxConcurrent };
  const queue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  if (!queue.current) queue.current = createRefreshQueue(() => callbacks.current.maxConcurrent, key => callbacks.current.priorities[key] ?? 0);
  const monitors = useRef(new Map<string, ReturnType<typeof createAutoRefresh>>());
  const timing = useRef(`${intervalMs}:${initialDelayMs}:${minTriggerIntervalMs}:${maxBackoffMs}`);
  const cadences = useRef(new Map<string, number>());
  const observed = useRef(new Map<string, number>());
  const paused = useRef(new Set<string>()); paused.current = new Set(pausedResources);
  const previousPaused = useRef(new Set<string>());
  const resourceKey = JSON.stringify(resources);
  const pauseKey = JSON.stringify(pausedResources);
  const cadenceKey = JSON.stringify(resources.map(key => [key, intervals[key] ?? intervalMs]));
  const triggerKey = JSON.stringify(resources.map(key => [key, triggers[key] ?? 0]));
  useEffect(() => {
    const nextTiming = `${intervalMs}:${initialDelayMs}:${minTriggerIntervalMs}:${maxBackoffMs}`;
    if (timing.current !== nextTiming) { for (const monitor of monitors.current.values()) monitor.stop(); monitors.current.clear(); observed.current.clear(); cadences.current.clear(); timing.current = nextTiming; }
    const wanted = new Set<string>(JSON.parse(resourceKey));
    for (const [key, monitor] of monitors.current) if (!wanted.has(key)) { monitor.stop(); monitors.current.delete(key); observed.current.delete(key); cadences.current.delete(key); }
    for (const key of wanted) if (!monitors.current.has(key)) monitors.current.set(key, createAutoRefresh({
      intervalMs: () => callbacks.current.intervals[key] ?? callbacks.current.intervalMs,
      retryIntervalMs: intervalMs, maxBackoffMs,
      initialDelayMs: initialDelays[key] ?? initialDelayMs, minTriggerIntervalMs,
      acquire: signal => queue.current!.acquire(key, signal),
      isActive: () => !paused.current.has(key) && document.visibilityState !== 'hidden' && navigator.onLine !== false,
      run: signal => callbacks.current.run(key, signal),
      onError: problem => callbacks.current.onError?.(key, problem),
      onReading: reading => callbacks.current.onReading?.(key, reading),
      onRetry: (failures, retryMs) => logDiagnostic({ event: 'refresh', outcome: 'retry', failures, retryMs }),
    }));
  }, [resourceKey, intervalMs, initialDelayMs, minTriggerIntervalMs, maxBackoffMs]);
  useEffect(() => {
    for (const [key, next] of JSON.parse(cadenceKey) as [string, number][]) {
      const previous = cadences.current.get(key);
      cadences.current.set(key, next);
      // Changing priority keeps the successful snapshot and retry deadline.
      if (previous !== undefined && previous !== next) monitors.current.get(key)?.wake();
    }
    queue.current?.wake();
  }, [cadenceKey, intervalMs, initialDelayMs, minTriggerIntervalMs, maxBackoffMs]);
  useEffect(() => {
    for (const [key, monitor] of monitors.current) {
      if (paused.current.has(key)) monitor.pause();
      else if (previousPaused.current.has(key)) monitor.trigger();
    }
    previousPaused.current = new Set(paused.current);
  }, [pauseKey, resourceKey, intervalMs, initialDelayMs]);
  useEffect(() => {
    for (const [key, version] of JSON.parse(triggerKey) as [string, number][]) {
      const previous = observed.current.get(key);
      observed.current.set(key, version);
      // The first version is covered by the monitor's initial read.
      if (previous !== undefined && previous !== version) monitors.current.get(key)?.trigger();
    }
  }, [triggerKey, intervalMs, initialDelayMs, minTriggerIntervalMs, maxBackoffMs]);
  useEffect(() => {
    const resume = () => { logDiagnostic({ event: 'refresh', outcome: 'resumed' }); for (const monitor of monitors.current.values()) monitor.wake(); };
    const pause = () => { logDiagnostic({ event: 'refresh', outcome: 'paused' }); for (const monitor of monitors.current.values()) monitor.pause(); };
    const visibility = () => { if (document.visibilityState === 'hidden') pause(); else resume(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', resume); window.addEventListener('online', resume); window.addEventListener('offline', pause);
    const owned = monitors.current;
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', resume); window.removeEventListener('online', resume); window.removeEventListener('offline', pause);
      for (const monitor of owned.values()) monitor.stop(); owned.clear(); observed.current.clear(); cadences.current.clear();
    };
  }, []);
}
