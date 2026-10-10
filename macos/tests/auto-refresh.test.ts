import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoRefresh, syncIntervals, type RefreshClock } from '../src/auto-refresh';

async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
class ManualClock implements RefreshClock {
  time = 0;
  next = 0;
  timers = new Map<number, { at: number; run: () => void }>();
  now = () => this.time;
  schedule = (run: () => void, delay: number) => {
    const id = ++this.next; this.timers.set(id, { at: this.time + delay, run });
    return () => { this.timers.delete(id); };
  };
  async advance(ms: number) {
    const end = this.time + ms; let turns = 0;
    while (true) {
      const next = [...this.timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert.ok(++turns < 200, 'timer work must stay bounded');
      this.time = next[1].at; this.timers.delete(next[0]); next[1].run(); await flush();
    }
    this.time = end; await flush();
  }
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

test('remote and local resources use separate cadence, without initial duplicate remote loading', async t => {
  const clock = new ManualClock(); let remote = 0; let local = 0;
  const a = createAutoRefresh({ clock, intervalMs: syncIntervals.remote, initialDelayMs: syncIntervals.remote, run: async () => { remote++; } });
  const b = createAutoRefresh({ clock, intervalMs: syncIntervals.local, run: async () => { local++; } });
  t.after(a.stop); t.after(b.stop);
  await clock.advance(0); assert.equal(local, 1); assert.equal(remote, 0);
  assert.equal(syncIntervals.remote, 300_000); assert.equal(syncIntervals.local, 5_000);
  await clock.advance(299_999); assert.equal(local, 60); assert.equal(remote, 0);
  await clock.advance(1); assert.equal(local, 61); assert.equal(remote, 1);
});

test('slow requests, repeated wakeups and timer ticks cannot overlap a resource', async t => {
  const clock = new ManualClock(); const pending = deferred(); let calls = 0;
  const monitor = createAutoRefresh({ clock, intervalMs: 5_000, run: async () => { calls++; await pending.promise; } }); t.after(monitor.stop);
  await clock.advance(0);
  for (let i = 0; i < 20; i++) monitor.wake();
  await clock.advance(60_000); assert.equal(calls, 1); assert.equal(clock.timers.size, 0);
  pending.resolve(); await flush();
  await clock.advance(4_999); assert.equal(calls, 1);
  await clock.advance(1); assert.equal(calls, 2);
});

test('failure backs off exponentially to a cap and success restores normal cadence', async t => {
  const clock = new ManualClock(); let calls = 0; let failed = true; const errors: unknown[] = [];
  const monitor = createAutoRefresh({ clock, intervalMs: 1_000, maxBackoffMs: 8_000, run: async () => { calls++; if (failed) throw new Error('temporary'); }, onError: error => errors.push(error) }); t.after(monitor.stop);
  await clock.advance(0); assert.equal(calls, 1);
  await clock.advance(1_999); assert.equal(calls, 1);
  await clock.advance(1); assert.equal(calls, 2);
  await clock.advance(4_000); assert.equal(calls, 3);
  await clock.advance(8_000); assert.equal(calls, 4);
  failed = false; await clock.advance(8_000); assert.equal(calls, 5); assert.equal(errors.length, 4);
  await clock.advance(1_000); assert.equal(calls, 6);
});

test('hidden or offline resources stay paused and resume promptly rather than waiting a full interval', async t => {
  const clock = new ManualClock(); let active = false; let calls = 0;
  const monitor = createAutoRefresh({ clock, intervalMs: 60_000, isActive: () => active, run: async () => { calls++; } }); t.after(monitor.stop);
  await clock.advance(120_000); assert.equal(calls, 0);
  active = true; monitor.wake(); await clock.advance(0); assert.equal(calls, 1);
  active = false; monitor.pause(); await clock.advance(120_000); assert.equal(calls, 1);
  active = true; monitor.wake(); await clock.advance(0); assert.equal(calls, 2);
});

test('pause aborts work; a fast resume waits for its settlement and ignores a late result', async t => {
  const clock = new ManualClock(); let active = true; let published = 0; let calls = 0;
  const pending = deferred(); let signal: AbortSignal | undefined;
  const monitor = createAutoRefresh({ clock, intervalMs: 5_000, isActive: () => active, run: async current => { calls++; signal = current; if (calls === 1) await pending.promise; if (!current.aborted) published++; } }); t.after(monitor.stop);
  await clock.advance(0); active = false; monitor.pause(); assert.equal(signal?.aborted, true);
  active = true; monitor.wake(); await clock.advance(10_000); assert.equal(calls, 1);
  pending.resolve(); await flush(); assert.equal(published, 0);
  await clock.advance(0); assert.equal(calls, 2); assert.equal(published, 1);
});

test('burst activation events keep a successful result fresh until its cadence expires', async t => {
  const clock = new ManualClock(); let calls = 0;
  const monitor = createAutoRefresh({ clock, intervalMs: 60_000, run: async () => { calls++; } }); t.after(monitor.stop);
  await clock.advance(0); for (let i = 0; i < 10; i++) monitor.wake();
  await clock.advance(999); assert.equal(calls, 1);
  await clock.advance(1); assert.equal(calls, 1);
  await clock.advance(59_000); assert.equal(calls, 2);
});

test('new Git changes can check a fresh result, coalescing bursts with minimum spacing', async t => {
  const clock = new ManualClock(); let calls = 0;
  const monitor = createAutoRefresh({ clock, intervalMs: syncIntervals.remote, run: async () => { calls++; } }); t.after(monitor.stop);
  await clock.advance(0); assert.equal(calls, 1);
  for (let i = 0; i < 10; i++) monitor.trigger();
  await clock.advance(999); assert.equal(calls, 1);
  await clock.advance(1); assert.equal(calls, 2);
  await clock.advance(299_999); assert.equal(calls, 2);
  await clock.advance(1); assert.equal(calls, 3);
});

test('Git changes during an in-flight check queue exactly one serialized follow-up', async t => {
  const clock = new ManualClock(); const pending = deferred(); let calls = 0;
  const monitor = createAutoRefresh({ clock, intervalMs: syncIntervals.remote, run: async () => { calls++; if (calls === 1) await pending.promise; } }); t.after(monitor.stop);
  await clock.advance(0);
  for (let i = 0; i < 10; i++) monitor.trigger();
  await clock.advance(5_000); assert.equal(calls, 1);
  pending.resolve(); await flush(); await clock.advance(0); assert.equal(calls, 2);
  await clock.advance(299_999); assert.equal(calls, 2);
});

test('paused changes and interrupted triggered checks survive until active resume', async t => {
  const clock = new ManualClock(); let active = true; let calls = 0; const pending = deferred(); let signal: AbortSignal | undefined;
  const monitor = createAutoRefresh({ clock, intervalMs: syncIntervals.remote, isActive: () => active, run: async current => { calls++; signal = current; if (calls === 3) await pending.promise; } }); t.after(monitor.stop);
  await clock.advance(0); active = false; monitor.pause(); monitor.trigger();
  await clock.advance(5_000); assert.equal(calls, 1);
  active = true; monitor.wake(); await clock.advance(0); assert.equal(calls, 2);
  monitor.trigger(); await clock.advance(1_000); assert.equal(calls, 3);
  active = false; monitor.pause(); assert.equal(signal?.aborted, true);
  pending.resolve(); await flush(); await clock.advance(5_000); assert.equal(calls, 3);
  active = true; monitor.wake(); await clock.advance(0); assert.equal(calls, 4);
});

test('Git change triggers retain provider retry deadlines and disappear after stop', async t => {
  const clock = new ManualClock(); let calls = 0;
  const monitor = createAutoRefresh({ clock, intervalMs: 5_000, run: async () => { calls++; if (calls === 1) throw new Error('HTTP 429'); } }); t.after(monitor.stop);
  await clock.advance(0);
  for (let i = 0; i < 10; i++) monitor.trigger();
  await clock.advance(9_999); assert.equal(calls, 1);
  await clock.advance(1); assert.equal(calls, 2);
  monitor.stop(); monitor.trigger(); monitor.wake(); await clock.advance(60_000);
  assert.equal(calls, 2); assert.equal(clock.timers.size, 0);
});

test('focus or reconnection events cannot bypass failure backoff and provider throttling', async t => {
  const clock = new ManualClock(); let calls = 0;
  const monitor = createAutoRefresh({ clock, intervalMs: 5_000, run: async () => { calls++; throw new Error('HTTP 429'); } }); t.after(monitor.stop);
  await clock.advance(0); monitor.wake(); await clock.advance(9_999); assert.equal(calls, 1);
  monitor.wake(); await clock.advance(1); assert.equal(calls, 2);
});

test('stopping cancels pending timers, ignores activation and aborts an in-flight request', async () => {
  const clock = new ManualClock(); const pending = deferred(); let calls = 0; let signal: AbortSignal | undefined;
  const monitor = createAutoRefresh({ clock, intervalMs: 5_000, run: async current => { calls++; signal = current; await pending.promise; } });
  await clock.advance(0); monitor.stop(); assert.equal(signal?.aborted, true);
  monitor.wake(); pending.resolve(); await flush(); await clock.advance(60_000);
  assert.equal(calls, 1); assert.equal(clock.timers.size, 0);
  const delayed = createAutoRefresh({ clock, intervalMs: 5_000, initialDelayMs: 5_000, run: async () => { calls++; } });
  delayed.stop(); await clock.advance(60_000); assert.equal(calls, 1);
});

test('account failures and removing one resource do not stop another resource', async t => {
  const clock = new ManualClock(); let good = 0; let bad = 0;
  const a = createAutoRefresh({ clock, intervalMs: 5_000, run: async () => { good++; } });
  const b = createAutoRefresh({ clock, intervalMs: 5_000, run: async () => { bad++; throw new Error('denied'); } }); t.after(a.stop); t.after(b.stop);
  await clock.advance(15_000); assert.equal(good, 4); assert.equal(bad, 2);
  b.stop(); await clock.advance(10_000); assert.equal(good, 6); assert.equal(bad, 2);
});

test('reading feedback covers only actual requests, not the retry backoff, and clears on cancellation/stop', async () => {
  const clock = new ManualClock(); const events: boolean[] = []; let failure = true;
  const monitor = createAutoRefresh({ clock, intervalMs: 5_000, onReading: reading => events.push(reading), run: async () => { if (failure) throw new Error('HTTP 503'); } });
  assert.deepEqual(events, []); await clock.advance(0); assert.deepEqual(events, [true, false]);
  await clock.advance(9_999); assert.deepEqual(events, [true, false]);
  failure = false; await clock.advance(1); assert.deepEqual(events, [true, false, true, false]); monitor.stop();
  const pending = deferred(); const cancelled: boolean[] = [];
  const slow = createAutoRefresh({ clock, intervalMs: 5_000, onReading: reading => cancelled.push(reading), run: async () => pending.promise });
  await clock.advance(0); assert.equal(cancelled.at(-1), true); slow.pause(); assert.equal(cancelled.at(-1), false);
  slow.stop(); const length = cancelled.length; pending.resolve(); await flush(); assert.equal(cancelled.length, length);
});
