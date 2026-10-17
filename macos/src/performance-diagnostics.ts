import type { DiagnosticInput } from './diagnostics-model';

type RenderPhase = 'dashboard-render' | 'branch-render';
type RenderSample = { renders: number; renderTotalMs: number; renderMaxMs: number; items: number };
let sampleRender: ((phase: RenderPhase, duration: number, items: number) => void) | undefined;
let requests = 0;
let peakRequests = 0;
export function performanceRequestStarted() { requests++; peakRequests = Math.max(peakRequests, requests); }
export function performanceRequestFinished() { requests = Math.max(0, requests - 1); }
export function recordUIRender(phase: RenderPhase, started: number, items: number) { sampleRender?.(phase, performance.now() - started, items); }

// No React state, DOM geometry reads, per-frame IPC, content or target names.
// rAF runs only during interaction; a 1s heartbeat covers main-thread stalls.
export function installPerformanceDiagnostics(send: (value: DiagnosticInput) => void): () => void {
  let started = performance.now(), heartbeatAt = started;
  let frames = 0, slowFrames = 0, frameMaxMs = 0, lagMaxMs = 0, inputMaxMs = 0, nextFrameMaxMs = 0, longTasks = 0, longTaskMaxMs = 0;
  let frame = 0, until = 0, previousFrame = 0, inputAt = 0;
  const renders = new Map<RenderPhase, RenderSample>();
  const render = (phase: RenderPhase, duration: number, items: number) => {
    if (document.hidden) return;
    const value = renders.get(phase) || { renders: 0, renderTotalMs: 0, renderMaxMs: 0, items: 0 };
    value.renders++; value.renderTotalMs += duration; value.renderMaxMs = Math.max(value.renderMaxMs, duration); value.items = Math.max(value.items, items); renders.set(phase, value);
  };
  sampleRender = render;
  const tick = (now: number) => {
    frame = 0;
    if (document.hidden) return;
    if (previousFrame) { const gap = now - previousFrame; frames++; frameMaxMs = Math.max(frameMaxMs, gap); if (gap > 50) slowFrames++; }
    if (inputAt) { nextFrameMaxMs = Math.max(nextFrameMaxMs, now - inputAt); inputAt = 0; }
    previousFrame = now;
    if (now < until) frame = requestAnimationFrame(tick); else previousFrame = 0;
  };
  const interaction = (event: Event) => {
    if (document.hidden || !(event.target instanceof Element)) return;
    const dashboard = event.target.closest('.dashboard-view') || (event.type === 'scroll' && event.target.querySelector('.dashboard-view'));
    if (!dashboard) return;
    if (event instanceof KeyboardEvent && !['Enter', ' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
    const now = performance.now();
    const stamp = event.timeStamp > performance.timeOrigin ? event.timeStamp - performance.timeOrigin : event.timeStamp;
    if (stamp > 0 && stamp <= now && now - stamp < 60_000) inputMaxMs = Math.max(inputMaxMs, now - stamp);
    until = now + 800;
    if (!frame) { inputAt = now; previousFrame = 0; frame = requestAnimationFrame(tick); }
  };
  const visibility = () => { heartbeatAt = performance.now(); previousFrame = 0; inputAt = 0; if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; } };
  let observer: PerformanceObserver | undefined;
  const longTaskSupported = typeof PerformanceObserver !== 'undefined' && !!PerformanceObserver.supportedEntryTypes?.includes('longtask');
  if (longTaskSupported) {
    observer = new PerformanceObserver(list => { if (!document.hidden) for (const entry of list.getEntries()) { longTasks++; longTaskMaxMs = Math.max(longTaskMaxMs, entry.duration); } });
    observer.observe({ type: 'longtask', buffered: false });
  }
  const flush = () => {
    const now = performance.now();
    if (frames || longTasks || inputMaxMs || lagMaxMs >= 100 || renders.size || requests || peakRequests) send({ event: 'performance', phase: 'ui-window', outcome: document.hidden ? 'hidden' : slowFrames || lagMaxMs >= 100 || inputMaxMs >= 100 || nextFrameMaxMs >= 100 || longTaskMaxMs >= 100 ? 'partial' : 'success', durationMs: Math.round(now - started), frames, slowFrames, frameMaxMs: Math.round(frameMaxMs), lagMaxMs: Math.round(lagMaxMs), inputMaxMs: Math.round(inputMaxMs), nextFrameMaxMs: Math.round(nextFrameMaxMs), longTasks, longTaskSupported: Number(longTaskSupported), longTaskMaxMs: Math.round(longTaskMaxMs), activeRequests: requests, peakRequests });
    for (const [phase, value] of renders) send({ event: 'performance', phase, outcome: value.renderMaxMs >= 50 ? 'partial' : 'success', ...value, renderMaxMs: Math.round(value.renderMaxMs), renderTotalMs: Math.round(value.renderTotalMs) });
    started = now; frames = slowFrames = frameMaxMs = lagMaxMs = inputMaxMs = nextFrameMaxMs = longTasks = longTaskMaxMs = 0; renders.clear(); peakRequests = requests;
  };
  const timer = setInterval(() => { const now = performance.now(); if (!document.hidden) lagMaxMs = Math.max(lagMaxMs, Math.max(0, now - heartbeatAt - 1000)); heartbeatAt = now; if (now - started >= 10_000) flush(); }, 1000);
  for (const type of ['wheel', 'scroll', 'click', 'keydown']) document.addEventListener(type, interaction, { capture: true, passive: true });
  document.addEventListener('visibilitychange', visibility);
  return () => { clearInterval(timer); if (frame) cancelAnimationFrame(frame); observer?.disconnect(); for (const type of ['wheel', 'scroll', 'click', 'keydown']) document.removeEventListener(type, interaction, true); document.removeEventListener('visibilitychange', visibility); if (sampleRender === render) sampleRender = undefined; flush(); };
}
