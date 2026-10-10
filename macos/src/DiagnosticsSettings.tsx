import { useEffect, useState } from 'react';
import { copyDiagnostics, diagnosticsStatus, openDiagnostics } from './diagnostics-api';
import type { DiagnosticsStatus } from './diagnostics-model';
import { Button, Notice } from './ui';

export function DiagnosticsSettings() {
  const [status, setStatus] = useState<DiagnosticsStatus | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'open' | 'copy' | null>(null);
  useEffect(() => {
    let mounted = true;
    const read = () => { void diagnosticsStatus().then(value => { if (mounted) { setStatus(value); setError(''); } }).catch(() => { if (mounted) setError('无法读取本地日志状态，请检查程序与服务是否为最新版本。'); }); };
    read(); const timer = setInterval(read, 10_000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  async function action(kind: 'open' | 'copy') {
    setBusy(kind); setError(''); setMessage('');
    try {
      if (kind === 'open') await openDiagnostics();
      else setMessage(`已复制 ${await copyDiagnostics()} 个日志文件。`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '日志操作失败，请重试。'); }
    finally { setBusy(null); }
  }
  return <section className="settings-section" aria-labelledby="diagnostics-settings-title"><h2 id="diagnostics-settings-title">日志</h2><div className="settings-group">
    <div className="setting-row diagnostics-setting-row">
      <Button disabled={!status || !!busy || !!status.error} onClick={() => void action('open')}>{busy === 'open' ? '正在打开…' : '打开日志文件夹'}</Button>
      <Button disabled={!status || !!busy || !!status.error} onClick={() => void action('copy')}>{busy === 'copy' ? '正在复制…' : '复制日志文件到剪贴板'}</Button>
    </div>
    <div aria-live="polite" className={error || status?.error || status?.limited || message ? 'diagnostics-feedback' : undefined}>{(error || status?.error) && <Notice kind="error">{error || status?.error}</Notice>}{status?.limited && <Notice kind="info">日志达到空间上限，已移除较早记录；当前记录可能不足 24 小时。</Notice>}{message && <p>{message}</p>}</div>
  </div></section>;
}
