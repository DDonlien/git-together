import { useCallback, useRef, useState } from 'react';
import { importAPI } from './import-api';
import { syncIntervals } from './auto-refresh';
import { useAutoRefresh } from './use-auto-refresh';
import type { RemoteRepository } from './import-model';
import type { RemoteRepositoryState } from './remote-repository-model';
import { preserveRemoteWorkspace } from './remote-repository-model';

// Only an open workspace or visible expanded Dashboard repository owns a HEAD
// heartbeat. SHA-based content is cached by the service; disabling or unmounting
// a reader cancels its HTTP read without discarding its last successful state.
export function useRemoteRepository(repository: RemoteRepository | undefined, instanceId: string, enabled: boolean) {
  const resource = repository && instanceId ? JSON.stringify([instanceId, repository.id, repository.fullName, repository.defaultBranch]) : '';
  const active = enabled && !!repository?.available && !!resource;
  const current = useRef(''); current.current = active ? resource : '';
  const [states, setStates] = useState<Record<string, RemoteRepositoryState>>({});
  useAutoRefresh({ resources: active ? [resource] : [], intervalMs: syncIntervals.remote,
    onReading: (key, loading) => setStates(previous => {
      const state = previous[key] || { workspace: null, error: '', loading: false };
      return state.loading === loading ? previous : { ...previous, [key]: { ...state, loading } };
    }),
    run: async (key, signal) => {
      const [serviceId, repositoryId] = JSON.parse(key) as [string, string];
      try {
        const workspace = await importAPI('remoteWorkspace', { repositoryId }, signal);
        if (signal.aborted || current.current !== key) return;
        setStates(previous => {
          // A new service cannot inherit a prior session's contents. Bound
          // retained repositories without resetting task selections or drafts.
          const retained = Object.entries(previous).filter(([id]) => JSON.parse(id)[0] === serviceId && id !== key).slice(-15);
          return { ...Object.fromEntries(retained), [key]: { workspace: preserveRemoteWorkspace(previous[key]?.workspace || null, workspace), loading: false, error: '' } };
        });
      } catch (problem) {
        if (signal.aborted || current.current !== key) return;
        setStates(previous => ({ ...previous, [key]: { workspace: previous[key]?.workspace || null, loading: false, error: problem instanceof Error ? problem.message : '读取远端仓库失败。' } }));
        throw problem;
      }
    },
  });
  const repositoryId = repository?.id || '';
  const readCommit = useCallback(async (commitId: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (current.current !== resource) throw new DOMException('仓库已切换。', 'AbortError');
    const result = await importAPI('remoteCommit', { repositoryId, commitId }, signal);
    signal.throwIfAborted();
    if (current.current !== resource) throw new DOMException('仓库已切换。', 'AbortError');
    return result;
  }, [resource, repositoryId]);
  const state = states[resource] || { workspace: null, loading: active, error: repository && !repository.available ? '访问账号目前无权读取此仓库。' : '' };
  return { state: !active && state.loading ? { ...state, loading: false } : state, readCommit: active ? readCommit : undefined };
}
