import { useCallback, useEffect, useRef, useState } from 'react';
import { importAPI } from './import-api';
import { syncIntervals } from './auto-refresh';
import { useAutoRefresh } from './use-auto-refresh';
import type { RemoteRepository } from './import-model';
import type { RemoteRepositoryState } from './remote-repository-model';
import { preserveRemoteWorkspace } from './remote-repository-model';

const resourceKey = (repository: RemoteRepository, instanceId: string) => JSON.stringify([instanceId, repository.id, repository.fullName, repository.defaultBranch]);

// Associated repositories are owned by useWorkspace across page/filter changes.
// Unassociated ones use the same reader on demand. Both retain successful SHA
// snapshots and share the timer/trigger serialization and cancellation rules.
export function useRemoteRepositories(repositories: RemoteRepository[], instanceId: string, enabled: boolean, changes: Record<string, number> = {}, checkParticipation = false, onFetched?: (repositoryId: string) => void, pausedRepositories: ReadonlySet<string> = new Set()) {
  const identities = repositories.map(repository => resourceKey(repository, instanceId));
  const resources = enabled && instanceId ? repositories.filter(repository => repository.available).map(repository => resourceKey(repository, instanceId)) : [];
  const current = useRef(new Set<string>()); current.current = new Set(resources);
  const known = useRef(new Set<string>()); known.current = new Set(identities);
  const [states, setStates] = useState<Record<string, RemoteRepositoryState>>({});
  const identityKey = JSON.stringify(identities);
  useEffect(() => {
    setStates(previous => {
      const retained = Object.fromEntries(Object.entries(previous).filter(([key]) => known.current.has(key)));
      return Object.keys(retained).length === Object.keys(previous).length ? previous : retained;
    });
  }, [identityKey]);
  useAutoRefresh({ resources, intervalMs: syncIntervals.remote,
    pausedResources: repositories.filter(repository => pausedRepositories.has(repository.id)).map(repository => resourceKey(repository, instanceId)),
    triggers: Object.fromEntries(repositories.map(repository => [resourceKey(repository, instanceId), (changes[repository.id] ?? 0) * 2 + Number(checkParticipation)])),
    onReading: (key, loading) => setStates(previous => {
      const state = previous[key] || { workspace: null, error: '', loading: false };
      return state.loading === loading ? previous : { ...previous, [key]: { ...state, loading } };
    }),
    run: async (key, signal) => {
      const [, repositoryId] = JSON.parse(key) as [string, string];
      let taskFailures = false;
      let readFailure: Error | undefined;
      // Provider contents do not depend on local remote-tracking refs. Keep
      // both requests owned by this refresh, but publish the API result first.
      const fetching = importAPI('fetchRepository', { repositoryId }, signal).then(
        () => null,
        problem => problem instanceof Error ? problem : new Error('本地远端引用更新失败。'),
      );
      try {
        const workspace = await importAPI('remoteWorkspace', { repositoryId, ...(checkParticipation ? { checkParticipation: true } : {}) }, signal);
        if (signal.aborted || !current.current.has(key)) return;
        setStates(previous => {
          // Removed mappings and restarted services cannot inherit old contents.
          const retained = Object.entries(previous).filter(([id]) => known.current.has(id) && id !== key);
          return { ...Object.fromEntries(retained), [key]: { workspace: preserveRemoteWorkspace(previous[key]?.workspace || null, workspace), loading: true, error: '' } };
        });
        taskFailures = workspace.tasks.some(task => !!task.error);
      } catch (problem) {
        if (signal.aborted || !current.current.has(key)) return;
        const failure = problem instanceof Error ? problem : new Error('读取远端仓库失败。');
        readFailure = failure;
        setStates(previous => ({ ...previous, [key]: { workspace: previous[key]?.workspace || null, loading: true, error: failure.message } }));
      }
      const fetchFailure = await fetching;
      if (signal.aborted || !current.current.has(key)) return;
      // Wake the existing local reader after refs/objects change. Its working
      // change fingerprint excludes tracking refs, avoiding a fetch loop.
      if (!fetchFailure) onFetched?.(repositoryId);
      setStates(previous => ({ ...previous, [key]: { ...previous[key], loading: false, error: [readFailure?.message, fetchFailure ? `${readFailure ? '' : '远端内容已读取；'}本地远端引用更新未完成：${fetchFailure.message}` : ''].filter(Boolean).join(' ') } }));
      if (readFailure) throw readFailure;
      if (fetchFailure) throw fetchFailure;
      // Partial branch failures retain their own feedback and successful
      // siblings, but new local changes must still respect the retry deadline.
      if (taskFailures) throw new Error('部分远端分支读取失败，正在等待下次检查。');
    },
  });
  return Object.fromEntries(repositories.map(repository => {
    const key = resourceKey(repository, instanceId);
    const state = states[key] || { workspace: null, loading: current.current.has(key), error: '' };
    return [repository.id, !repository.available ? { ...state, loading: false, error: '访问账号目前无权读取此仓库。' } : !current.current.has(key) && state.loading ? { ...state, loading: false } : state];
  })) as Record<string, RemoteRepositoryState>;
}

export function useRemoteRepository(repository: RemoteRepository | undefined, instanceId: string, enabled: boolean, sharedState?: RemoteRepositoryState, checkParticipation = false) {
  const states = useRemoteRepositories(repository && !sharedState ? [repository] : [], instanceId, enabled && !sharedState, {}, checkParticipation);
  const resource = repository && instanceId ? resourceKey(repository, instanceId) : '';
  const active = enabled && !!repository?.available && !!resource;
  const current = useRef(''); current.current = active ? resource : '';
  const repositoryId = repository?.id || '';
  const readCommit = useCallback(async (commitId: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (current.current !== resource) throw new DOMException('仓库已切换。', 'AbortError');
    const result = await importAPI('remoteCommit', { repositoryId, commitId }, signal);
    signal.throwIfAborted();
    if (current.current !== resource) throw new DOMException('仓库已切换。', 'AbortError');
    return result;
  }, [resource, repositoryId]);
  const state = sharedState || states[repositoryId] || { workspace: null, loading: active, error: repository && !repository.available ? '访问账号目前无权读取此仓库。' : '' };
  return { state: !active && state.loading ? { ...state, loading: false } : state, readCommit: active ? readCommit : undefined };
}
