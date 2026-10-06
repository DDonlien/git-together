import { useEffect, useRef } from 'react';
import { createAutoRefresh } from './auto-refresh';

// Resource identities, not changing payload objects, control timer lifetime.
// Adding/removing an account keeps the other accounts' cadence and backoff.
export function useAutoRefresh({ resources, intervalMs, initialDelayMs = 0, run, onError }: {
  resources: string[];
  intervalMs: number;
  initialDelayMs?: number;
  run: (resource: string, signal: AbortSignal) => Promise<void>;
  onError?: (resource: string, problem: unknown) => void;
}) {
  const callbacks = useRef({ run, onError }); callbacks.current = { run, onError };
  const monitors = useRef(new Map<string, ReturnType<typeof createAutoRefresh>>());
  const timing = useRef(`${intervalMs}:${initialDelayMs}`);
  const resourceKey = JSON.stringify(resources);
  useEffect(() => {
    const nextTiming = `${intervalMs}:${initialDelayMs}`;
    if (timing.current !== nextTiming) { for (const monitor of monitors.current.values()) monitor.stop(); monitors.current.clear(); timing.current = nextTiming; }
    const wanted = new Set<string>(JSON.parse(resourceKey));
    for (const [key, monitor] of monitors.current) if (!wanted.has(key)) { monitor.stop(); monitors.current.delete(key); }
    for (const key of wanted) if (!monitors.current.has(key)) monitors.current.set(key, createAutoRefresh({
      intervalMs, initialDelayMs,
      isActive: () => document.visibilityState !== 'hidden' && navigator.onLine !== false,
      run: signal => callbacks.current.run(key, signal),
      onError: problem => callbacks.current.onError?.(key, problem),
    }));
  }, [resourceKey, intervalMs, initialDelayMs]);
  useEffect(() => {
    const resume = () => { for (const monitor of monitors.current.values()) monitor.wake(); };
    const pause = () => { for (const monitor of monitors.current.values()) monitor.pause(); };
    const visibility = () => { if (document.visibilityState === 'hidden') pause(); else resume(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', resume); window.addEventListener('online', resume); window.addEventListener('offline', pause);
    const owned = monitors.current;
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', resume); window.removeEventListener('online', resume); window.removeEventListener('offline', pause);
      for (const monitor of owned.values()) monitor.stop(); owned.clear();
    };
  }, []);
}
