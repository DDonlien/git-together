import { useCallback, useEffect, useRef, useState } from 'react';
import { connectAfterServiceCheck, importAPI, LocalServiceError, verifyServiceVersion } from './import-api';
import { emptyCatalog, isRecord, latestCatalog, type Catalog, type ConnectInput, type LocalSnapshot, type ServiceInfo, type UpdateAccountInput } from './import-model';
import { syncIntervals } from './auto-refresh';
import { useAutoRefresh } from './use-auto-refresh';
import pkg from '../package.json';
import { preserveLocalWorkspace, type RepositoryWorkspace } from './repository-model';
import { logDiagnostic } from './diagnostics-api';
import { diagnosticFailure } from './diagnostics-model';

type Preferences = { theme: 'light' | 'dark' | 'system'; reducedGlass: boolean; collapsedAccounts: string[]; hiddenEntries?: string[] };
const defaults: Preferences = { theme: 'system', reducedGlass: false, collapsedAccounts: [] };
const preferenceKey = 'gittogether.preferences.v2';
export interface LocalRepositoryState { path: string; snapshot: LocalSnapshot | null; workspace?: RepositoryWorkspace; mappingKey?: string; loading?: boolean; error: string; checkedAt: number }
export function useWorkspace() {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const catalogRef = useRef<Catalog>(emptyCatalog);
  const [localStates, setLocalStates] = useState<Record<string, LocalRepositoryState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const serviceRef = useRef<ServiceInfo | null>(null);
  const checking = useRef<Promise<ServiceInfo> | null>(null);
  const running = useRef(new Set<string>());
  const mounted = useRef(true);
  const preferencesChanged = useRef(false);
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      const raw = localStorage.getItem(preferenceKey); if (!raw) return defaults;
      const saved: unknown = JSON.parse(raw);
      if (!isRecord(saved) || !['light', 'dark', 'system'].includes(String(saved.theme)) || typeof saved.reducedGlass !== 'boolean' || !Array.isArray(saved.collapsedAccounts) || !saved.collapsedAccounts.every(a => typeof a === 'string') || (saved.hiddenEntries !== undefined && (!Array.isArray(saved.hiddenEntries) || !saved.hiddenEntries.every(entry => typeof entry === 'string')))) throw new Error('外观偏好格式无效，已使用默认外观；原记录尚未覆盖。');
      return saved as Preferences;
    } catch (problem) { logDiagnostic({ event: 'ui-action', outcome: 'failure', method: 'preferences', ...diagnosticFailure(problem) }); queueMicrotask(() => setStorageError(problem instanceof Error ? problem.message : '无法读取外观设置。')); return defaults; }
  });
  const accept = useCallback((next: Catalog) => {
    if (serviceRef.current && next.instanceId !== serviceRef.current.instanceId) throw new LocalServiceError('session', '本地账号服务已重启，请重新连接检查账号。');
    if (mounted.current) {
      const current = catalogRef.current;
      const latest = latestCatalog(current, next, serviceRef.current?.instanceId || next.instanceId);
      if (latest !== current && JSON.stringify(latest) !== JSON.stringify(current)) { catalogRef.current = latest; setCatalog(latest); }
    }
    return next;
  }, []);
  const ensureService = useCallback(async () => {
    if (checking.current) return checking.current;
    const check = (async () => {
      try {
        const info = await importAPI('status', {});
        serviceRef.current = info;
        if (mounted.current) { setService(info); setNeedsReload(info.version !== pkg.version); }
        verifyServiceVersion(info.version, pkg.version);
        if (mounted.current) {
          setError('');
          if (catalogRef.current.instanceId && catalogRef.current.instanceId !== info.instanceId) {
            catalogRef.current = { ...emptyCatalog, instanceId: info.instanceId };
            setCatalog(catalogRef.current); setLocalStates({});
          }
        }
        return info;
      } catch (problem) {
        if (mounted.current) setError(problem instanceof Error ? problem.message : '无法检查本地连接。');
        throw problem;
      }
    })();
    checking.current = check;
    try { return await check; } finally { checking.current = null; }
  }, []);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { await ensureService(); accept(await importAPI('catalog', {})); }
    catch (problem) { if (mounted.current) setError(problem instanceof Error ? problem.message : '无法读取账号。'); }
    finally { if (mounted.current) setLoading(false); }
  }, [accept, ensureService]);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  const monitoring = !loading && !needsReload;
  useAutoRefresh({ resources: monitoring ? ['catalog'] : [], intervalMs: syncIntervals.service, initialDelayMs: syncIntervals.service,
    run: async (_resource, signal) => {
      await ensureService();
      if (signal.aborted) return;
      const next = await importAPI('catalog', {}, signal);
      if (!signal.aborted) accept(next);
    },
    onError: (_resource, problem) => setError(problem instanceof Error ? problem.message : '自动检查本地连接失败，正在重试。'),
  });
  useAutoRefresh({ resources: monitoring ? catalog.accounts.map(account => JSON.stringify([catalog.instanceId, account.id])) : [], intervalMs: syncIntervals.remote, initialDelayMs: syncIntervals.remote,
    run: async (resource, signal) => {
      const [instanceId, accountId] = JSON.parse(resource) as [string, string];
      if (instanceId !== catalogRef.current.instanceId || running.current.has(accountId)) return;
      const next = await importAPI('refresh', { accountId }, signal);
      if (signal.aborted || instanceId !== catalogRef.current.instanceId) return;
      accept(next);
      const failure = next.accounts.find(account => account.id === accountId)?.error;
      if (failure) throw new Error(failure); // Account errors retain their last successful directory and back off independently.
    },
    onError: (_resource, problem) => { if (problem instanceof LocalServiceError) setError(problem.message); },
  });
  const localResources = monitoring ? catalog.links.map(link => JSON.stringify([catalog.instanceId, link.repositoryId, link.path, link.worktrees])) : [];
  useAutoRefresh({ resources: localResources, intervalMs: syncIntervals.local,
    onReading: (resource, loading) => {
      const [instanceId, repositoryId, path] = JSON.parse(resource) as [string, string, string];
      if (instanceId !== catalogRef.current.instanceId || !catalogRef.current.links.some(link => JSON.stringify([instanceId, link.repositoryId, link.path, link.worktrees]) === resource)) return;
      setLocalStates(current => {
        const previous = current[repositoryId];
        const state = previous?.mappingKey === resource ? previous : { path, mappingKey: resource, snapshot: null, error: '', checkedAt: 0 };
        return state.loading === loading ? current : { ...current, [repositoryId]: { ...state, loading } };
      });
    },
    run: async (resource, signal) => {
      const [instanceId, repositoryId, path, worktrees] = JSON.parse(resource) as [string, string, string, unknown];
      const currentLink = () => instanceId === catalogRef.current.instanceId && catalogRef.current.links.some(link => link.repositoryId === repositoryId && link.path === path && JSON.stringify(link.worktrees) === JSON.stringify(worktrees === null ? undefined : worktrees));
      if (!currentLink()) return;
      try {
        const workspace = await importAPI('localWorkspace', { repositoryId }, signal);
        if (signal.aborted || !currentLink()) return;
        setLocalStates(current => {
          const previous = current[repositoryId];
          const retained = preserveLocalWorkspace(previous?.mappingKey === resource ? previous.workspace : undefined, workspace);
          // Unchanged file/status/history payloads keep their identity and open UI state.
          const stable = previous?.path === path && JSON.stringify(previous.workspace) === JSON.stringify(retained) ? previous.workspace : retained;
          return { ...current, [repositoryId]: { path, mappingKey: resource, snapshot: null, workspace: stable, loading: false, error: '', checkedAt: Date.now() } };
        });
      } catch (problem) {
        if (signal.aborted || !currentLink()) return;
        setLocalStates(current => {
          const previous = current[repositoryId];
          const sameMapping = previous?.mappingKey === resource;
          return { ...current, [repositoryId]: { path, mappingKey: resource, snapshot: sameMapping ? previous.snapshot : null, workspace: sameMapping ? previous.workspace : undefined, loading: false, checkedAt: sameMapping ? previous.checkedAt : 0, error: problem instanceof Error ? problem.message : '读取本地状态失败，正在重试。' } };
        });
        throw problem;
      }
    },
  });
  const linkIdentities = JSON.stringify(catalog.links);
  useEffect(() => {
    setLocalStates(current => {
      const retained = Object.fromEntries(Object.entries(current).filter(([id, state]) => catalogRef.current.links.some(link => link.repositoryId === id && JSON.stringify([catalogRef.current.instanceId, id, link.path, link.worktrees]) === state.mappingKey)));
      return Object.keys(retained).length === Object.keys(current).length ? current : retained;
    });
  }, [linkIdentities]);
  useEffect(() => {
    if (!preferencesChanged.current) return;
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); setStorageError(''); logDiagnostic({ event: 'ui-action', outcome: 'success', method: 'preferences' }); }
    catch (problem) { logDiagnostic({ event: 'ui-action', outcome: 'failure', method: 'preferences', ...diagnosticFailure(problem) }); setStorageError('无法保存外观设置；当前会话仍可使用。'); }
  }, [preferences]);
  const updatePreferences = (change: Partial<Preferences>) => { logDiagnostic({ event: 'ui-action', outcome: 'start', method: 'preferences' }); preferencesChanged.current = true; setPreferences(current => ({ ...current, ...change })); };
  async function task(key: string, run: () => Promise<Catalog>) {
    if (running.current.has(key)) throw new Error('该操作正在执行，请稍候。');
    running.current.add(key); setBusy(current => ({ ...current, [key]: true }));
    try { return accept(await run()); }
    catch (problem) { if (mounted.current && problem instanceof LocalServiceError) setError(problem.message); throw problem; }
    finally { running.current.delete(key); if (mounted.current) setBusy(current => ({ ...current, [key]: false })); }
  }
  async function connectionTask<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); }
    catch (problem) { if (mounted.current && problem instanceof LocalServiceError) setError(problem.message); throw problem; }
  }
  return {
    catalog, localStates, preferences, updatePreferences, loading, error, storageError, busy, reload, service, needsReload,
    connect: (input: ConnectInput) => task('connect', () => connectAfterServiceCheck(input, ensureService)),
    updateAccount: (input: UpdateAccountInput) => task(input.accountId, async () => { await ensureService(); return importAPI('updateAccount', input); }),
    startGithubAuthorization: (name: string) => connectionTask(async () => { await ensureService(); return importAPI('githubAuthStart', { name }); }),
    pollGithubAuthorization: (sessionId: string, signal: AbortSignal) => connectionTask(async () => {
      const progress = await importAPI('githubAuthPoll', { sessionId }, signal);
      if (progress.status === 'complete') accept(progress.catalog);
      return progress;
    }),
    cancelGithubAuthorization: (sessionId: string) => connectionTask(async () => {
      const result = await importAPI('githubAuthCancel', { sessionId });
      if (!result.cancelled) accept(result.catalog);
      return result;
    }),
    refresh: (accountId: string) => task(accountId, () => importAPI('refresh', { accountId })),
    removeAccount: (accountId: string) => task(accountId, () => importAPI('removeAccount', { accountId })),
    link: (repositoryId: string, path: string, branch?: string) => task(repositoryId, () => importAPI('link', { repositoryId, path, ...(branch === undefined ? {} : { branch }) })),
    matchAccountRepositories: async (accountId: string, path: string) => {
      let matchedRepositoryIds: string[] = [];
      await task(`match:${accountId}`, async () => {
        await ensureService();
        const result = await importAPI('matchAccountRepositories', { accountId, path });
        matchedRepositoryIds = result.matchedRepositoryIds;
        return result.catalog;
      });
      return matchedRepositoryIds;
    },
    unlink: (repositoryId: string, branch?: string) => task(repositoryId, () => importAPI('unlink', { repositoryId, ...(branch === undefined ? {} : { branch }) })),
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
