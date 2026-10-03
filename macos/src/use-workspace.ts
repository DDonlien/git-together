import { useEffect, useRef, useState } from 'react';
import { createWorkspace } from './data';
import { applyOperation, commitWorktree, generateDraft, operationProblem, readWorkspace, updateWorktree, worktreesOf, type Draft, type Operation, type Outcome, type Preferences, type Repository, type Worktree, type Workspace } from './domain';

const STORAGE_KEY = 'gittogether.standalone.v1';
const delay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const cancelled = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', cancelled); resolve(); }, ms);
  signal.addEventListener('abort', cancelled, { once: true });
});

export function useWorkspace() {
  const [storageError, setStorageError] = useState('');
  const [state, setState] = useState<Workspace>(() => {
    try { return readWorkspace(localStorage.getItem(STORAGE_KEY), createWorkspace); }
    catch (error) { queueMicrotask(() => setStorageError(error instanceof Error ? error.message : '本地数据读取失败')); return createWorkspace(); }
  });
  const liveState = useRef(state); liveState.current = state;
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [commitResult, setCommitResult] = useState<Record<string, { kind: 'success' | 'error'; message: string }>>({});
  const [busy, setBusy] = useState<Record<string, 'ai' | 'commit'>>({});
  const tasks = useRef(new Map<string, AbortController>());
  const generation = useRef(0);
  const amend = (id: string, update: (w: Worktree) => Worktree) => setState(s => ({ ...s, repositories: updateWorktree(s.repositories, id, update) }));
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { setStorageError(error instanceof Error ? error.message : '无法保存本地数据'); }
  }, [state]);
  useEffect(() => () => tasks.current.forEach(t => t.abort()), []);
  const preferences = (change: Partial<Preferences>) => setState(s => ({ ...s, preferences: { ...s.preferences, ...change } }));
  const draft = (id: string, change: Partial<Draft>) => amend(id, w => ({ ...w, draft: { ...w.draft, ...change } }));
  const selectFile = (id: string, fileId: string) => amend(id, w => ({ ...w, files: w.files.map(f => f.id === fileId ? { ...f, selected: !f.selected } : f) }));
  const selectGroup = (id: string, tracked: boolean) => amend(id, w => {
    const all = w.files.filter(f => f.tracked === tracked).every(f => f.selected);
    return { ...w, files: w.files.map(f => f.tracked === tracked ? { ...f, selected: !all } : f) };
  });
  const cancel = (id: string) => tasks.current.get(id)?.abort();
  const clearBusy = (id: string) => setBusy(s => { const next = { ...s }; delete next[id]; return next; });
  async function ai(id: string) {
    if (tasks.current.has(id)) return;
    const currentGeneration = generation.current;
    const w = worktreesOf(liveState.current.repositories).find(w => w.id === id)!;
    const controller = new AbortController(); tasks.current.set(id, controller);
    setBusy(s => ({ ...s, [id]: 'ai' })); setCommitResult(s => { const next = { ...s }; delete next[id]; return next; });
    try { const generated = generateDraft(w); await delay(2400, controller.signal); if (currentGeneration === generation.current) draft(id, generated); }
    catch (error) { if (currentGeneration === generation.current && !(error instanceof DOMException && error.name === 'AbortError')) setCommitResult(s => ({ ...s, [id]: { kind: 'error', message: error instanceof Error ? error.message : '生成失败' } })); }
    finally { if (tasks.current.get(id) === controller) { tasks.current.delete(id); clearBusy(id); } }
  }
  async function commit(id: string) {
    if (tasks.current.has(id)) return;
    const currentGeneration = generation.current;
    const snapshot = worktreesOf(liveState.current.repositories).find(w => w.id === id)!;
    const controller = new AbortController(); tasks.current.set(id, controller); setBusy(s => ({ ...s, [id]: 'commit' }));
    setCommitResult(s => { const next = { ...s }; delete next[id]; return next; });
    try {
      const hash = crypto.randomUUID().replaceAll('-', '').slice(0, 7);
      const next = commitWorktree(snapshot, hash, '刚刚');
      await delay(1000, controller.signal);
      if (currentGeneration !== generation.current) return;
      if (liveState.current.preferences.failCommit) throw new Error('演示提交检查未通过。你的概要、描述和文件选择已保留。');
      amend(id, () => next);
      setCommitResult(s => ({ ...s, [id]: { kind: 'success', message: `本地演示提交 ${hash} 已创建 · 未推送` } }));
    } catch (error) {
      if (currentGeneration === generation.current && !(error instanceof DOMException && error.name === 'AbortError')) setCommitResult(s => ({ ...s, [id]: { kind: 'error', message: error instanceof Error ? error.message : '提交失败' } }));
    } finally { if (tasks.current.get(id) === controller) { tasks.current.delete(id); clearBusy(id); } }
  }
  async function batch(ids: string[], action: Operation) {
    const currentGeneration = generation.current;
    const targets = worktreesOf(liveState.current.repositories).filter(w => ids.includes(w.id) && !tasks.current.has(w.id));
    targets.forEach(w => setOutcomes(s => ({ ...s, [w.id]: { phase: 'running', action, message: `${action} 正在执行…` } })));
    await Promise.all(targets.map(async (w, i) => {
      const controller = new AbortController(); tasks.current.set(w.id, controller);
      try {
        await delay(900 + i * 700, controller.signal);
        if (currentGeneration !== generation.current) return;
        const problem = operationProblem(w, action, liveState.current.preferences.failBatch);
        if (problem) {
          // Submit has two observable steps: a local commit can survive a failed push.
          if (action === 'Submit' && w.id === 'lebab-main' && !w.conflict && w.files.some(f => f.selected)) {
            amend(w.id, current => commitWorktree({ ...current, draft: current.draft.summary ? current.draft : generateDraft(current) }, crypto.randomUUID().slice(0, 7), '刚刚'));
          }
          throw new Error(problem);
        }
        amend(w.id, current => applyOperation(current, action, crypto.randomUUID().slice(0, 7), '刚刚'));
        setOutcomes(s => ({ ...s, [w.id]: { phase: 'success', action, message: `${action} 演示完成` } }));
      } catch (error) {
        if (currentGeneration !== generation.current) return;
        const cancelled = error instanceof DOMException && error.name === 'AbortError';
        setOutcomes(s => ({ ...s, [w.id]: { phase: cancelled ? 'cancelled' : 'error', action, message: cancelled ? '操作已取消' : error instanceof Error ? error.message : '操作失败' } }));
      } finally { if (tasks.current.get(w.id) === controller) tasks.current.delete(w.id); }
    }));
  }
  const load = (next: Workspace) => { generation.current++; tasks.current.forEach(t => t.abort()); tasks.current.clear(); liveState.current = next; setState(next); setOutcomes({}); setCommitResult({}); setBusy({}); setStorageError(''); };
  const reset = () => load(createWorkspace());
  const addRepository = (name: string, path: string) => {
    const id = crypto.randomUUID().slice(0, 8);
    const repo: Repository = { id, name, description: '本地演示仓库', color: '#778ba6', source: 'local', branches: ['main'], worktrees: [{ ...createWorkspace().repositories[2].worktrees[0], id: `${id}-main`, path, files: [], draft: { summary: '', description: '' } }] };
    setState(s => ({ ...s, repositories: [...s.repositories, repo] }));
  };
  return { state, setState, load, storageError, outcomes, setOutcomes, commitResult, setCommitResult, busy, amend, preferences, draft, selectFile, selectGroup, cancel, ai, commit, batch, reset, addRepository };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
