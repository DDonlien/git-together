import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ControlJob, ControlStatus } from './remote-control-model';
import './remote-control.css';

export async function controlCommand<T>(method: 'status' | 'enroll' | 'configure' | 'request' | 'cancel' | 'revoke', input: unknown = {}): Promise<T> {
  let raw: unknown;
  if (window.gittogether?.remoteControl) raw = await window.gittogether.remoteControl(method, input);
  else {
    if (window.gittogether) throw new Error('当前版本没有远端控制，请更新 GitTogether。');
    const response = await fetch('/api/control/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
    raw = await response.json();
  }
  const envelope = raw as { ok?: boolean; value?: T; error?: string };
  if (envelope.ok !== true || !envelope.value) throw new Error(envelope.error || '远端控制响应无效。');
  return envelope.value;
}
type Controller = {
  status: ControlStatus | null; error: string; busy: boolean;
  settings: (method: 'enroll' | 'configure' | 'revoke', input: unknown) => Promise<void>;
  enqueue: (input: Omit<ControlJob, 'id' | 'status' | 'expiresAt' | 'result' | 'error'> & Record<string, unknown>) => Promise<ControlJob>;
  wait: (job: ControlJob, signal: AbortSignal) => Promise<ControlJob>;
};
const Context = createContext<Controller | null>(null);
export const useRemoteControl = () => useContext(Context);
export function RemoteControlProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ControlStatus | null>(null);
  const [readError, setReadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<ControlStatus | null>(null);
  const changing = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const update = (value: ControlStatus) => { ref.current = value; setStatus(value); };
  useEffect(() => {
    let active = true;
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      const current = generation.current;
      try {
        if (!changing.current) {
          const value = await controlCommand<ControlStatus>('status');
          if (!Array.isArray(value.devices) || !Array.isArray(value.jobs) || !Array.isArray(value.localRepositories)) throw new Error('设备状态格式无效。');
          if (active && current === generation.current) { update(value); setReadError(''); }
        }
      } catch (error) {
        if (active && current === generation.current) {
          setReadError(error instanceof Error ? error.message : '设备状态读取失败。');
          if (ref.current) update({ ...ref.current, connection: 'offline', devices: ref.current.devices.map(d => ({ ...d, online: false })) });
        }
      }
      if (active) timer = setTimeout(() => void read(), 1500);
    }
    void read();
    return () => { active = false; mounted.current = false; clearTimeout(timer); };
  }, []);
  const settings = useCallback(async (method: 'enroll' | 'configure' | 'revoke', input: unknown) => {
    if (changing.current) throw new Error('设备设置正在保存。');
    changing.current = true; generation.current++; setBusy(true); setActionError('');
    try { const value = await controlCommand<ControlStatus>(method, input); if (mounted.current) update(value); }
    catch (error) { if (mounted.current) setActionError(error instanceof Error ? error.message : '设备设置失败。'); throw error; }
    finally { changing.current = false; if (mounted.current) setBusy(false); }
  }, []);
  const enqueue = useCallback(async (input: Parameters<Controller['enqueue']>[0]) => {
    const job = await controlCommand<ControlJob>('request', { ...input, id: crypto.randomUUID() });
    if (mounted.current && ref.current) update({ ...ref.current, jobs: [job, ...ref.current.jobs.filter(j => j.id !== job.id)] });
    return job;
  }, []);
  const wait = useCallback(async (initial: ControlJob, signal: AbortSignal): Promise<ControlJob> => {
    let job = initial;
    while (!['done', 'failed', 'expired'].includes(job.status)) {
      if (signal.aborted) throw new DOMException('已关闭', 'AbortError');
      if (ref.current?.connection === 'connected' && !ref.current.devices.some(d => d.deviceId === job.deviceId && d.workspaces.some(w => w.id === job.workspaceId))) throw new Error('目标已撤销此工作目录的控制权限，请重新查看设备。');
      if (Date.now() > initial.expiresAt + 180000) throw new Error('等待结果超时；可重新连接查看执行记录，请勿重复提交。');
      await new Promise<void>(resolve => setTimeout(resolve, 350));
      job = ref.current?.jobs.find(j => j.id === initial.id) || job;
    }
    if (job.status !== 'done') throw new Error(job.error || '目标操作未完成。');
    return job;
  }, []);
  return <Context.Provider value={{ status, error: actionError || readError, busy, settings, enqueue, wait }}>{children}</Context.Provider>;
}
