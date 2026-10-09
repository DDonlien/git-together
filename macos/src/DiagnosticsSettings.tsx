import { useEffect, useState } from 'react';
import { diagnosticsStatus, openDiagnostics } from './diagnostics-api';
import type { DiagnosticsStatus } from './diagnostics-model';
import { Button, Notice } from './ui';

export function DiagnosticsSettings() {
  const [status, setStatus] = useState<DiagnosticsStatus | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    const read = () => { void diagnosticsStatus().then(value => { if (mounted) { setStatus(value); setError(''); } }).catch(() => { if (mounted) setError('无法读取本地日志状态，请检查程序与服务是否为最新版本。'); }); };
    read(); const timer = setInterval(read, 10_000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  async function open() { setBusy(true); setError(''); try { await openDiagnostics(); } catch (problem) { setError(problem instanceof Error ? problem.message : '无法打开日志目录。'); } finally { setBusy(false); } }
  return <section className="settings-section" aria-labelledby="diagnostics-settings-title"><h2 id="diagnostics-settings-title">诊断日志</h2><div className="settings-group">
    <div className="setting-row"><span>本地记录<small>自动保留最近 24 小时，空间上限 128 MB；不上传日志，不记录密码、令牌或文件内容。</small></span><Button disabled={!status || busy || !!status.error} onClick={() => void open()}>{busy ? '正在打开…' : '打开日志目录'}</Button></div>
    {status && <p className="diagnostics-path">{status.directory}</p>}
    <div aria-live="polite">{(error || status?.error) && <Notice kind="error">{error || status?.error}</Notice>}{status?.limited && <Notice kind="info">日志达到空间上限，已移除较早记录；当前记录可能不足 24 小时。</Notice>}</div>
  </div></section>;
}
