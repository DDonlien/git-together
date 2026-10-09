import { useEffect, useState } from 'react';
import { Button, Modal, Notice } from './ui';
import { updateDescription, type UpdateStatus } from './update-model';
import pkg from '../package.json';

export function UpdateSettings({ busy }: { busy: boolean }) {
  const bridge = typeof window === 'undefined' ? undefined : window.gittogether?.updates;
  const [status, setStatus] = useState<UpdateStatus>({ phase: bridge ? 'idle' : 'unavailable', currentVersion: pkg.version });
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let mounted = true;
    const read = () => { void bridge.status().then(value => { if (mounted) setStatus(value); }).catch(() => { if (mounted) setStatus(value => ({ ...value, phase: 'error', message: '无法读取应用更新状态，请重启 App 后重试。' })); }); };
    read();
    // Poll only finite local IPC, never the release feed; persists across navigation.
    const timer = setInterval(read, 1000);
    return () => { mounted = false; clearInterval(timer); };
  }, [bridge]);
  const waiting = ['checking', 'downloading', 'installing'].includes(status.phase);
  async function action(kind: 'check' | 'download' | 'install') {
    if (!bridge) return;
    if (kind === 'install') setConfirm(false);
    setStatus(value => ({ ...value, phase: kind === 'check' ? 'checking' : kind === 'download' ? 'downloading' : 'installing', message: undefined }));
    try { setStatus(await bridge[kind]()); }
    catch { setStatus(value => ({ ...value, phase: 'error', message: '无法执行更新操作，请重试。' })); }
  }
  return <section className="settings-section" aria-labelledby="update-settings-title">
    <h2 id="update-settings-title">应用更新</h2>
    <div className="settings-group">
      <div className="setting-row update-setting-row"><span>GitHub Releases<small>更新保留已连接账号和本地仓库关联，不修改仓库文件。</small></span>
        {status.phase === 'available' ? <Button onClick={() => void action('download')}>下载更新</Button>
          : status.phase === 'ready' ? <Button disabled={busy} onClick={() => setConfirm(true)}>重启并更新</Button>
            : <Button disabled={!bridge || status.phase === 'unavailable' || waiting} onClick={() => void action('check')}>{status.phase === 'checking' ? '检查中…' : '检查更新'}</Button>}
      </div>
      <div className="update-feedback" aria-live="polite">
        {status.phase === 'error' ? <Notice kind="error">{updateDescription(status)}</Notice> : <p>{updateDescription(status)}</p>}
        {status.phase === 'downloading' && <progress aria-label="更新下载进度" value={status.percent ?? 0} max={100} />}
        {status.checkedAt && !waiting && <small>上次检查：{new Date(status.checkedAt).toLocaleString()}</small>}
      </div>
    </div>
    {confirm && <Modal title="重启并安装更新？" onClose={() => setConfirm(false)}><p>应用将重启。已配置的账号和本地仓库关联会保留；请先完成当前操作并保存未提交的输入。</p><div className="modal-actions"><Button onClick={() => setConfirm(false)}>取消</Button><Button disabled={busy} onClick={() => void action('install')}>重启并更新</Button></div></Modal>}
  </section>;
}
