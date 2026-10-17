import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importAPI } from './import-api';
import { topologicalCommits, type RepositoryCommit, type RepositoryTask, type RepositoryWorkspace } from './repository-model';

type PageState = { page: number; hasMore: boolean; loading: boolean; error: string; commits: RepositoryCommit[] };
const keyFor = (repositoryId: string, task: RepositoryTask) => JSON.stringify([repositoryId, task.id, task.head]);

// The first page remains in the normal workspace response. Older pages are
// fetched only when the graph approaches its scroll boundary and are retained
// for this mounted repository view, without a total-commit cap.
export function useRemoteHistory(workspace: RepositoryWorkspace, repositoryId: string) {
  const [pages, setPages] = useState<Record<string, PageState>>({});
  const pagesRef = useRef(pages); pagesRef.current = pages;
  const tasksRef = useRef(workspace.tasks); tasksRef.current = workspace.tasks;
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const remoteTasks = useMemo(() => workspace.tasks.filter(task => task.remote), [workspace.tasks]);
  const identity = JSON.stringify([repositoryId, remoteTasks.map(task => [task.id, task.head])]);

  useEffect(() => {
    const keys = new Set(remoteTasks.map(task => keyFor(repositoryId, task)));
    setPages(previous => {
      const next = Object.fromEntries(Object.entries(previous).filter(([key]) => keys.has(key)));
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
    return () => controller.current?.abort();
  }, [identity]);

  const loadMore = useCallback(async (branches: readonly string[], retry = false) => {
    if (pending.current) return;
    const selected = new Set(branches);
    const targets = tasksRef.current.filter(task => {
      if (!task.remote || !selected.has(task.branch)) return false;
      const state = pagesRef.current[keyFor(repositoryId, task)];
      return (state?.hasMore ?? task.historyHasMore === true) && !state?.loading && (retry || !state?.error);
    });
    if (!targets.length) return;

    pending.current = true;
    const request = new AbortController(); controller.current = request;
    setPages(previous => ({ ...previous, ...Object.fromEntries(targets.map(task => {
      const key = keyFor(repositoryId, task), state = previous[key];
      return [key, { page: state?.page || 1, hasMore: state?.hasMore ?? task.historyHasMore === true, loading: true, error: '', commits: state?.commits || [] }];
    })) }));
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
      while (cursor < targets.length && !request.signal.aborted) {
        const task = targets[cursor++]; const key = keyFor(repositoryId, task);
        const current = pagesRef.current[key]; const page = (current?.page || 1) + 1;
        try {
          const result = await importAPI('remoteHistory', { repositoryId, head: task.head, page }, request.signal);
          if (request.signal.aborted) return;
          setPages(previous => {
            const state = previous[key] || { page: 1, hasMore: true, loading: false, error: '', commits: [] };
            return { ...previous, [key]: { page: result.page, hasMore: result.hasMore, loading: false, error: '', commits: [...state.commits, ...result.commits] } };
          });
        } catch (problem) {
          if (request.signal.aborted) return;
          setPages(previous => {
            const state = previous[key] || { page: page - 1, hasMore: true, loading: false, error: '', commits: [] };
            return { ...previous, [key]: { ...state, loading: false, error: problem instanceof Error ? problem.message : '读取更早提交失败。' } };
          });
        }
      }
    }));
    pending.current = false;
    if (controller.current === request) controller.current = null;
  }, [repositoryId]);

  return useMemo(() => {
    const commits = new Map(workspace.commits.map(commit => [commit.id, commit]));
    const tasks = workspace.tasks.map(task => {
      if (!task.remote) return task;
      const state = pages[keyFor(repositoryId, task)];
      if (!state) return task;
      for (const commit of state.commits) {
        const previous = commits.get(commit.id);
        commits.set(commit.id, previous ? { ...previous, refs: [...new Set([...previous.refs, ...commit.refs])] } : commit);
      }
      return { ...task, historyHasMore: state.hasMore };
    });
    const loadingBranches = new Set(remoteTasks.filter(task => pages[keyFor(repositoryId, task)]?.loading).map(task => task.branch));
    const errorsByBranch = Object.fromEntries(remoteTasks.flatMap(task => {
      const error = pages[keyFor(repositoryId, task)]?.error;
      return error ? [[task.branch, error]] : [];
    }));
    return { workspace: { ...workspace, tasks, commits: topologicalCommits([...commits.values()]) }, loadingBranches, errorsByBranch, loadMore };
  }, [workspace, pages, repositoryId, remoteTasks, loadMore]);
}
