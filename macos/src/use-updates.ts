import { useEffect, useRef, useState } from 'react';
import type { UpdateStatus } from './update-model';
import { productVersion } from './product-version';

type Action = 'check' | 'download' | 'install';
const phases = { check: 'checking', download: 'downloading', install: 'installing' } as const;

export function useUpdates() {
  const bridge = typeof window === 'undefined' ? undefined : window.gittogether?.updates;
  const [status, setStatus] = useState<UpdateStatus>({ phase: bridge ? 'idle' : 'unavailable', currentVersion: productVersion });
  const installingRef = useRef(false);
  const installationRef = useRef(0);
  const pending = useRef<Action | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    if (!bridge) return;
    let mounted = true;
    const read = () => {
      const started = revision.current;
      void bridge.status().then(value => {
        if (!mounted || started !== revision.current || (pending.current && value.phase !== phases[pending.current])) return;
        if (value.phase === 'installing' && !installingRef.current) installationRef.current += 1;
        installingRef.current = value.phase === 'installing';
        setStatus(current => value.phase !== 'downloading' && JSON.stringify(current) === JSON.stringify(value) ? current : value);
      }).catch(() => {
        if (mounted && !pending.current && !installingRef.current && started === revision.current) {
          const message = '无法读取应用更新状态，请重启 App 后重试。';
          setStatus(value => value.phase === 'error' && value.message === message ? value : { ...value, phase: 'error', message });
        }
      });
    };
    read();
    // This local status reader stays mounted across page changes. It never polls the release feed.
    const timer = setInterval(read, 1000);
    return () => { mounted = false; clearInterval(timer); };
  }, [bridge]);
  async function action(kind: Action) {
    if (!bridge || pending.current) return;
    pending.current = kind;
    revision.current += 1;
    if (kind === 'install') { installationRef.current += 1; installingRef.current = true; }
    setStatus(value => ({ ...value, phase: phases[kind], message: undefined }));
    try {
      const value = await bridge[kind]();
      installingRef.current = value.phase === 'installing';
      setStatus(value);
    } catch {
      installingRef.current = false;
      setStatus(value => ({ ...value, phase: kind === 'install' ? 'ready' : 'error', message: kind === 'install' ? '无法安装更新，已下载的更新已保留，请重试。' : '无法执行更新操作，请重试。' }));
    } finally {
      pending.current = null;
      revision.current += 1;
    }
  }
  return { status, supported: !!bridge, installing: status.phase === 'installing', installingRef, installationRef, action };
}
export type UpdatesController = ReturnType<typeof useUpdates>;
