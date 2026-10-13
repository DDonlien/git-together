import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RepositoryActionTarget } from './repository-action-model';
import type { RepositoryTask } from './repository-model';
import { LinearProgress } from './material-inputs';

type PushTarget = { taskId: string; path: string };
export type PushRun = { id: string; targets: PushTarget[]; pending: string[]; completed: string[]; visible: string[] };
export type PushState = { phase: 'pushing' | 'success'; full: boolean };
type Batch = { id: string; repositoryIds: string[] };
type PushActivity = {
  runs: Record<string, PushRun[]>;
  begin: (targets: RepositoryActionTarget[]) => Batch;
  complete: (batch: Batch, target: RepositoryActionTarget) => void;
  finish: (batch: Batch) => void;
};
const PushContext = createContext<PushActivity | null>(null);
const successDuration = 2600;

export function PushFeedbackProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [runs, setRuns] = useState<Record<string, PushRun[]>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    setRuns({});
    return () => { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); };
  }, [sessionId]);
  const later = useCallback((key: string, callback: () => void) => {
    const previous = timers.current.get(key); if (previous) clearTimeout(previous);
    timers.current.set(key, setTimeout(() => { timers.current.delete(key); callback(); }, successDuration));
  }, []);
  const begin = useCallback((targets: RepositoryActionTarget[]): Batch => {
    const id = crypto.randomUUID(), grouped: Record<string, PushRun> = {};
    for (const target of targets) {
      const run = grouped[target.repositoryId] ||= { id, targets: [], pending: [], completed: [], visible: [] };
      run.targets.push({ taskId: target.task.id, path: target.task.path! }); run.pending.push(target.task.id);
    }
    setRuns(current => { const next = { ...current }; for (const [repositoryId, run] of Object.entries(grouped)) next[repositoryId] = [...(current[repositoryId] || []), run]; return next; });
    return { id, repositoryIds: Object.keys(grouped) };
  }, []);
  const complete = useCallback((batch: Batch, target: RepositoryActionTarget) => {
    const repositoryId = target.repositoryId, taskId = target.task.id;
    setRuns(current => {
      const runs = current[repositoryId]; if (!runs?.some(run => run.id === batch.id)) return current;
      return { ...current, [repositoryId]: runs.map(run => run.id !== batch.id ? run : { ...run, pending: run.pending.filter(id => id !== taskId), completed: [...new Set([...run.completed, taskId])], visible: [...new Set([...run.visible, taskId])] }) };
    });
    later(`${batch.id}:${repositoryId}:${taskId}`, () => setRuns(current => {
      const runs = current[repositoryId]; if (!runs?.some(run => run.id === batch.id)) return current;
      return { ...current, [repositoryId]: runs.map(run => run.id !== batch.id ? run : { ...run, visible: run.visible.filter(id => id !== taskId) }) };
    }));
  }, [later]);
  const finish = useCallback((batch: Batch) => {
    setRuns(current => {
      const next = { ...current };
      for (const repositoryId of batch.repositoryIds) {
        const runs = next[repositoryId]; if (!runs) continue;
        const remaining = runs.filter(run => run.id !== batch.id || run.completed.length).map(run => run.id !== batch.id ? run : { ...run, pending: [] });
        if (remaining.length) next[repositoryId] = remaining; else delete next[repositoryId];
      }
      return next;
    });
    for (const repositoryId of batch.repositoryIds) later(`${batch.id}:${repositoryId}`, () => setRuns(current => {
      if (!current[repositoryId]?.some(run => run.id === batch.id)) return current;
      const next = { ...current }, remaining = next[repositoryId].filter(run => run.id !== batch.id);
      if (remaining.length) next[repositoryId] = remaining; else delete next[repositoryId]; return next;
    }));
  }, [later]);
  const value = useMemo(() => ({ runs, begin, complete, finish }), [runs, begin, complete, finish]);
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePushActivity(): PushActivity {
  const context = useContext(PushContext);
  if (!context) throw new Error('Push feedback provider is missing.');
  return context;
}
function localTargets(run: PushRun, tasks: RepositoryTask[]) {
  return run.targets.filter(target => tasks.some(task => !task.remote && task.path === target.path && task.id === target.taskId));
}
export function repositoryPushState(runs: PushRun[] | undefined, tasks: RepositoryTask[]): PushState | undefined {
  if (!runs?.length) return;
  const local = tasks.filter(task => !task.remote && task.path);
  const pushing = runs.some(run => localTargets(run, tasks).some(target => run.pending.includes(target.taskId)));
  const covered = runs.flatMap(run => localTargets(run, tasks).filter(target => run.pending.includes(target.taskId) || run.completed.includes(target.taskId)));
  if (!covered.length) return;
  return { phase: pushing ? 'pushing' : 'success', full: local.length > 0 && local.every(task => covered.some(target => target.taskId === task.id)) };
}
export function branchPushState(runs: PushRun[] | undefined, tasks: RepositoryTask[]): PushState | undefined {
  if (!runs?.length) return;
  if (runs.some(run => localTargets(run, tasks).some(target => run.pending.includes(target.taskId)))) return { phase: 'pushing', full: true };
  if (runs.some(run => localTargets(run, tasks).some(target => run.visible.includes(target.taskId)))) return { phase: 'success', full: true };
}

export function PushFeedbackIcon({ state, size = 16 }: { state: PushState | undefined; size?: number }) {
  if (!state) return null;
  return <span className={`push-feedback-icon is-${state.phase}${state.full ? ' is-full' : ' is-partial'}`} role="img" aria-label={`${state.full ? '全部' : '部分'}工作目录${state.phase === 'pushing' ? '正在推送' : '推送完成'}`} style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {state.phase === 'pushing' ? state.full
        ? <path fill="currentColor" d="M11 21a1 1 0 0 0 2 0V7.4l4.3 4.3a1 1 0 0 0 1.4-1.4l-6-6a1 1 0 0 0-1.4 0l-6 6a1 1 0 0 0 1.4 1.4L11 7.4Z" />
        : <path d="M12 21V5m-6 6 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2 2.5" strokeLinecap="round" strokeLinejoin="round" />
        : <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 12 4 4L17 6" />{state.full && <path d="m12 15 1 1L23 6" />}</g>}
    </svg>
  </span>;
}
export function PushProgress({ completed = 0, total = 1 }: { completed?: number; total?: number }) {
  return <div className="push-progress" role="status"><small>正在推送{total > 1 ? ` · ${completed} / ${total} 个工作目录` : '…'}</small><LinearProgress indeterminate aria-label="推送进度" /></div>;
}
