import { useCallback, useEffect, useRef, useState } from 'react';
import { importAPI } from './import-api';
import { emptyCatalog, isRecord, type Catalog, type ConnectInput } from './import-model';

type Preferences = { theme: 'light' | 'dark' | 'system'; reducedGlass: boolean; collapsedAccounts: string[] };
const defaults: Preferences = { theme: 'system', reducedGlass: false, collapsedAccounts: [] };
const preferenceKey = 'gittogether.preferences.v2';
export function useWorkspace() {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const running = useRef(new Set<string>());
  const mounted = useRef(true);
  const preferencesChanged = useRef(false);
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      const raw = localStorage.getItem(preferenceKey); if (!raw) return defaults;
      const saved: unknown = JSON.parse(raw);
      if (!isRecord(saved) || !['light', 'dark', 'system'].includes(String(saved.theme)) || typeof saved.reducedGlass !== 'boolean' || !Array.isArray(saved.collapsedAccounts) || !saved.collapsedAccounts.every(a => typeof a === 'string')) throw new Error('外观偏好格式无效，已使用默认外观；原记录尚未覆盖。');
      return saved as Preferences;
    } catch (problem) { queueMicrotask(() => setStorageError(problem instanceof Error ? problem.message : '无法读取外观设置。')); return defaults; }
  });
  const accept = useCallback((next: Catalog) => {
    if (mounted.current) setCatalog(current => next.revision >= current.revision ? next : current);
    return next;
  }, []);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { accept(await importAPI('catalog', {})); }
    catch (problem) { if (mounted.current) setError(problem instanceof Error ? problem.message : '无法读取账号。'); }
    finally { if (mounted.current) setLoading(false); }
  }, [accept]);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, [reload]);
  useEffect(() => {
    if (!preferencesChanged.current) return;
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); setStorageError(''); }
    catch { setStorageError('无法保存外观设置；当前会话仍可使用。'); }
  }, [preferences]);
  const updatePreferences = (change: Partial<Preferences>) => { preferencesChanged.current = true; setPreferences(current => ({ ...current, ...change })); };
  async function task(key: string, run: () => Promise<Catalog>) {
    if (running.current.has(key)) throw new Error('该操作正在执行，请稍候。');
    running.current.add(key); setBusy(current => ({ ...current, [key]: true }));
    try { return accept(await run()); }
    finally { running.current.delete(key); if (mounted.current) setBusy(current => ({ ...current, [key]: false })); }
  }
  return {
    catalog, preferences, updatePreferences, loading, error, storageError, busy, reload,
    connect: (input: ConnectInput) => task('connect', () => importAPI('connect', input)),
    refresh: (accountId: string) => task(accountId, () => importAPI('refresh', { accountId })),
    removeAccount: (accountId: string) => task(accountId, () => importAPI('removeAccount', { accountId })),
    link: (repositoryId: string, path: string) => task(repositoryId, () => importAPI('link', { repositoryId, path })),
    unlink: (repositoryId: string) => task(repositoryId, () => importAPI('unlink', { repositoryId })),
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
