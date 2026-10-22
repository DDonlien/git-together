import { useCallback, useEffect, useRef, useState } from 'react';
import { importAPI, RemoteReadError } from './import-api';
import { repositoryRefreshInterval, syncIntervals } from './auto-refresh';
import { useAutoRefresh } from './use-auto-refresh';
import type { RemoteRepository } from './import-model';
import type { RemoteRepositoryState } from './remote-repository-model';
import { preserveRemoteWorkspace } from './remote-repository-model';

const resourceKey = (repository: RemoteRepository, instanceId: string) => JSON.stringify([instanceId, repository.id, repository.fullName, repository.defaultBranch]);

// Workspace-owned readers retain results and retry deadlines across navigation.
export function useRemoteRepositories(repositories: RemoteRepository[], instanceId: string, enabled: boolean, changes: Record<string, number> = {}, checkParticipation = false, onFetched?: (repositoryId: string) => void, systemRepositories: ReadonlySet<string> = new Set(), priority: { activeRepositoryId?: string; lastUsed?: Record<string, number>; pinned?: readonly string[] } = {}) {
  const keyFor = (repository: RemoteRepository) => resourceKey(repository, instanceId);
  const systemModes = useRef(systemRepositories); systemModes.current = systemRepositories;
  const identities = repositories.map(keyFor);
  const intervals = Object.fromEntries(repositories.map(repository => [keyFor(repository), repositoryRefreshInterval(priority.lastUsed?.[repository.id], priority.activeRepositoryId === repository.id, priority.pinned?.includes(repository.id) === true)]));
  // Open the current repository immediately; spread background startup instead
  // of multiplying each workspace's branch requests by the repository count.
  const ordered = [...repositories].sort((a, b) => intervals[keyFor(a)] - intervals[keyFor(b)] || (priority.lastUsed?.[b.id] ?? 0) - (priority.lastUsed?.[a.id] ?? 0) || a.id.localeCompare(b.id));
  const initialDelays = Object.fromEntries(ordered.map((repository, index) => [keyFor(repository), priority.activeRepositoryId === repository.id ? 0 : Math.min(120_000, 3_000 + index * 2_000)]));
  const priorities = Object.fromEntries(ordered.map((repository, index) => [keyFor(repository), priority.activeRepositoryId === repository.id ? -1 : index]));
  const resources = enabled && instanceId ? repositories.filter(repository => repository.available || systemRepositories.has(repository.id)).map(keyFor) : [];
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
  useAutoRefresh({ resources, intervalMs: syncIntervals.remote, intervals, initialDelays, priorities, maxConcurrent: 2, maxBackoffMs: syncIntervals.remoteMaxBackoff, minTriggerIntervalMs: syncIntervals.remoteChange,
    triggers: Object.fromEntries(repositories.map(repository => [keyFor(repository), (changes[repository.id] ?? 0) * 2 + Number(checkParticipation)])),
    onReading: (key, loading) => setStates(previous => {
      const state = previous[key] || { workspace: null, error: '', loading: false };
      return state.loading === loading ? previous : { ...previous, [key]: { ...state, loading } };
    }),
    run: async (key, signal) => {
      const [, repositoryId] = JSON.parse(key) as [string, string];
      const repository = repositories.find(repository => repository.id === repositoryId)!;
      const system = systemRepositories.has(repositoryId);
      const sameAuthentication = () => current.current.has(key) && systemModes.current.has(repositoryId) === system;
      let taskFailures = false;
      let retryAt = 0;
      let readFailure: Error | undefined;
      // Provider contents do not depend on local remote-tracking refs. Keep
      // both requests owned by this refresh, but publish the API result first.
      const fetching = importAPI('fetchRepository', { repositoryId }, signal).then(
        result => result,
        problem => problem instanceof Error ? problem : new Error('本地远端引用更新失败。'),
      );
      // Desktop's remote view reads local tracking refs. Read it after the
      // platform fetch settles, otherwise a successful fetch leaves old heads
      // on screen for the entire next refresh interval.
      if (window.gittogether?.backend === 'github-desktop') {
        await fetching;
        if (signal.aborted || !sameAuthentication()) return;
      }
      if (!repository.available) {
        const result = await fetching;
        if (signal.aborted || !sameAuthentication()) return;
        const failure = result instanceof Error ? result : result.errors?.length ? new Error(result.errors.join(' ')) : null;
        if (!(result instanceof Error) && (result.branches > 0 || !failure)) onFetched?.(repositoryId);
        setStates(previous => ({ ...previous, [key]: { workspace: previous[key]?.workspace || null, loading: false, error: ['应用账号目前无权读取此仓库。', failure ? `系统 Git 引用更新未完成：${failure.message}` : '系统 Git 引用已更新。'].join(' ') } }));
        if (failure) throw failure;
        return;
      }
      try {
        const workspace = await importAPI('remoteWorkspace', { repositoryId, ...(checkParticipation ? { checkParticipation: true } : {}) }, signal);
        if (signal.aborted || !sameAuthentication()) return;
        setStates(previous => {
          // Removed mappings and restarted services cannot inherit old contents.
          const retained = Object.entries(previous).filter(([id]) => known.current.has(id) && id !== key);
          return { ...Object.fromEntries(retained), [key]: { workspace: preserveRemoteWorkspace(previous[key]?.workspace || null, workspace), loading: true, error: '' } };
        });
        taskFailures = workspace.tasks.some(task => !!task.error || !!task.participationError);
        retryAt = workspace.retryAt ?? 0;
      } catch (problem) {
        if (signal.aborted || !sameAuthentication()) return;
        const failure = problem instanceof Error ? problem : new Error('读取远端仓库失败。');
        readFailure = failure;
        setStates(previous => ({ ...previous, [key]: { workspace: previous[key]?.workspace || null, loading: true, error: failure.message } }));
      }
      const fetchResult = await fetching;
      if (signal.aborted || !sameAuthentication()) return;
      const fetchFailure = fetchResult instanceof Error ? fetchResult : fetchResult.errors?.length ? new Error(fetchResult.errors.join(' ')) : null;
      // Wake the existing local reader after refs/objects change. Its working
      // change fingerprint excludes tracking refs, avoiding a fetch loop.
      if (!(fetchResult instanceof Error) && (fetchResult.branches > 0 || !fetchFailure)) onFetched?.(repositoryId);
      setStates(previous => ({ ...previous, [key]: { ...previous[key], loading: false, error: [readFailure?.message, fetchFailure ? `${readFailure ? '' : '远端内容已读取；'}本地远端引用更新未完成：${fetchFailure.message}` : ''].filter(Boolean).join(' ') } }));
      if (readFailure) throw readFailure;
      if (fetchFailure) throw new RemoteReadError(fetchFailure.message, Math.max(retryAt, fetchResult instanceof Error ? 0 : fetchResult.retryAt || 0));
      // Partial branch failures retain their own feedback and successful
      // siblings, but new local changes must still respect the retry deadline.
      if (taskFailures || retryAt > Date.now()) throw new RemoteReadError(taskFailures ? '部分远端分支读取失败，正在等待下次检查。' : '账号远端请求正在冷却，恢复后继续检查。', retryAt);
    },
  });
  return Object.fromEntries(repositories.map(repository => {
    const key = keyFor(repository);
    const state = states[key] || { workspace: null, loading: false, error: '' };
    return [repository.id, !repository.available && !systemRepositories.has(repository.id) ? { ...state, loading: false, error: '访问账号目前无权读取此仓库。' } : !current.current.has(key) && state.loading ? { ...state, loading: false } : state];
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
