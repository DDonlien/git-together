import { useRef, useState } from 'react';
import { useAutoRefresh } from './use-auto-refresh';
import { syncIntervals } from './auto-refresh';
import type { RepositoryTask } from './repository-model';
import type { LocalCommitDetails, LocalCommitState, ReadLocalCommit } from './local-commit-model';

export function useLocalCommits(tasks: RepositoryTask[], selected: Record<string, string>, read: ReadLocalCommit) {
  const [states, setStates] = useState<Record<string, LocalCommitState>>({});
  const cache = useRef(new Map<string, LocalCommitDetails>());
  const resources = tasks.filter(task => !task.remote && selected[task.id]).map(task => JSON.stringify([task.id, selected[task.id]]));
  useAutoRefresh({ resources, intervalMs: syncIntervals.remote,
    run: async (resource, signal) => {
      const [taskId, commitId] = JSON.parse(resource) as [string, string];
      try {
        const details = cache.current.get(resource) || await read(tasks.find(task => task.id === taskId)!, commitId, signal);
        if (signal.aborted) return;
        cache.current.set(resource, details);
        if (cache.current.size > 64) cache.current.delete(cache.current.keys().next().value!);
        setStates(previous => previous[taskId]?.details === details && !previous[taskId]?.error ? previous : { ...previous, [taskId]: { id: commitId, details, error: '' } });
      } catch (problem) {
        if (signal.aborted) return;
        setStates(previous => ({ ...previous, [taskId]: { id: commitId, details: previous[taskId]?.id === commitId ? previous[taskId].details : null, error: problem instanceof Error ? problem.message : '读取本地提交失败。' } }));
        throw problem;
      }
    },
  });
  return states;
}
