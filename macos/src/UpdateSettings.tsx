import { useState } from 'react';
import { Button, Modal, Notice } from './ui';
import {
  updateDescription,
  updateProgressPercent,
  updateTransferDescription,
} from './update-model';
import type { UpdatesController } from './use-updates';

export function UpdateSettings({ busy, updates }: { busy: boolean; updates: UpdatesController }) {
  const { status, supported, action } = updates;
  const [confirm, setConfirm] = useState(false);
  const waiting = ['checking', 'downloading', 'installing'].includes(status.phase);
  const showProgress =
    status.phase === 'downloading' ||
    (status.phase === 'ready' && status.downloadedBytes !== undefined);
  const percent = updateProgressPercent(status);
  return <section className="settings-section" aria-labelledby="update-settings-title">
    <h2 id="update-settings-title">应用更新</h2>
    <div className="settings-group">
      <div className="setting-row update-setting-row"><span>GitTogether {status.currentVersion}</span>
        {status.phase === 'available' ? <Button onClick={() => void action('download')}>下载更新</Button>
          : status.phase === 'ready' ? <Button disabled={busy} onClick={() => setConfirm(true)}>{status.message ? '重试安装' : '重启并更新'}</Button>
            : <Button disabled={!supported || status.phase === 'unavailable' || waiting} onClick={() => void action('check')}>{status.phase === 'checking' ? '检查中…' : status.phase === 'downloading' ? '下载中…' : status.phase === 'installing' ? '安装中…' : '检查更新'}</Button>}
      </div>
      <div className="update-feedback" aria-live="polite">
        {status.phase === 'error' || (status.phase === 'ready' && status.message) ? <Notice kind="error">{updateDescription(status)}</Notice> : <p>{updateDescription(status)}</p>}
        {showProgress && <>
          <progress aria-label="更新下载进度" max={100} {...(percent === undefined ? {} : { value: percent })} />
          <small className="update-transfer">{updateTransferDescription(status)}</small>
        </>}
        {status.checkedAt && !waiting && <small>上次检查：{new Date(status.checkedAt).toLocaleString()}</small>}
      </div>
    </div>
    {confirm && <Modal title="重启并安装更新？" onClose={() => setConfirm(false)}><p>应用将立即安装更新并重启。请先保存正在输入的内容。</p><div className="modal-actions"><Button onClick={() => setConfirm(false)}>取消</Button><Button disabled={busy || waiting} onClick={() => { setConfirm(false); void action('install'); }}>重启并更新</Button></div></Modal>}
  </section>;
}
