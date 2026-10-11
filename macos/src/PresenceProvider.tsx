import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { presenceCommand } from './presence-api';
import type { PresenceConfiguration, PresenceStatus } from './presence-model';
import './presence.css';

type PresenceController = {
  status: PresenceStatus | null; error: string; busy: boolean;
  configure: (input: PresenceConfiguration) => Promise<void>; reconnect: () => Promise<void>;
};
const Context = createContext<PresenceController | null>(null);
export const usePresence = () => useContext(Context);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PresenceStatus | null>(null);
  const [readError, setReadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const mutating = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      const current = generation.current;
      try {
        if (!mutating.current) {
          const value = await presenceCommand('status');
          if (active && current === generation.current) { setStatus(value); setReadError(''); }
        }
      } catch (problem) { if (active && current === generation.current) {
        setReadError(problem instanceof Error ? problem.message : 'Presence 状态读取失败。');
        setStatus(previous => previous?.enabled ? { ...previous, connection: 'offline', bridge: { ...previous.bridge, connected: false }, sessions: previous.sessions.map(session => ({ ...session, alive: false })) } : previous);
      } }
      if (active) timer = setTimeout(() => void read(), 1500);
    }
    void read();
    return () => { active = false; mounted.current = false; clearTimeout(timer); };
  }, []);
  const change = useCallback(async (method: 'configure' | 'reconnect', input: PresenceConfiguration | Record<string, never> = {}) => {
    if (mutating.current) throw new Error('Presence 设置正在处理中。');
    mutating.current = true; generation.current++; setBusy(true); setActionError('');
    try {
      const value = await presenceCommand(method, input);
      if (mounted.current) setStatus(value);
    } catch (problem) { if (mounted.current) setActionError(problem instanceof Error ? problem.message : 'Presence 设置保存失败。'); throw problem; }
    finally { mutating.current = false; if (mounted.current) setBusy(false); }
  }, []);
  return <Context.Provider value={{ status, error: actionError || readError, busy, configure: input => change('configure', input), reconnect: () => change('reconnect') }}>{children}</Context.Provider>;
}
