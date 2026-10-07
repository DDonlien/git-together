import { useRef, useState } from 'react';
import { useAutoRefresh } from './use-auto-refresh';
import { syncIntervals } from './auto-refresh';
import type { RepositoryTask } from './repository-model';
import type { ReadRemoteCommit, RemoteCommitDetails } from './remote-repository-model';

export type RemoteCommitState = { id: string; details: RemoteCommitDetails | null; error: string };
export function useRemoteCommits(tasks: RepositoryTask[], focus: string | null, selected: Record<string, string>, read?: ReadRemoteCommit) {
  const [states, setStates] = useState<Record<string, RemoteCommitState>>({});
  const cache = useRef(new Map<string, RemoteCommitDetails>());
  const resources = read ? tasks.filter(task => task.remote && selected[task.id] && (!focus || focus === task.id)).map(task => JSON.stringify([task.id, selected[task.id]])) : [];
  useAutoRefresh({ resources, intervalMs: syncIntervals.remote,
    run: async (resource, signal) => {
      const [taskId, commitId] = JSON.parse(resource) as [string, string];
      try {
        const details = cache.current.get(commitId) || await read!(commitId, signal);
        if (signal.aborted) return;
        cache.current.set(commitId, details);
        if (cache.current.size > 64) cache.current.delete(cache.current.keys().next().value!);
        setStates(previous => previous[taskId]?.details === details && !previous[taskId]?.error ? previous : { ...previous, [taskId]: { id: commitId, details, error: '' } });
      } catch (problem) {
        if (signal.aborted) return;
        setStates(previous => ({ ...previous, [taskId]: { id: commitId, details: previous[taskId]?.id === commitId ? previous[taskId].details : null, error: problem instanceof Error ? problem.message : '读取远端提交失败。' } }));
        throw problem;
      }
    },
  });
  return states;
}
