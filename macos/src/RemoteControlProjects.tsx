import { useEffect, useRef, useState } from 'react';
import { useRemoteControl } from './RemoteControlProvider';
import { controlJobLabel, remoteActionLabels, type ControlDevice, type ControlJob, type ControlWorkspace, type RemoteAction, type ControlResult, type RemoteFile } from './remote-control-model';
import { OutlinedTextField } from './material-inputs';
import { Button, Checkbox, Modal, Notice } from './ui';

function RemoteActionDialog({ device, workspace, action, onClose }: { device: ControlDevice; workspace: ControlWorkspace; action: RemoteAction; onClose: () => void }) {
  const control = useRemoteControl()!;
  const [preview, setPreview] = useState<ControlResult | null>(null);
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const active = useRef(true);
  const cancel = useRef(new AbortController());
  const manuallyEdited = useRef(false);
  const selection = useRef<string[] | undefined>(undefined);
  const revision = useRef(0);
  const preparing = useRef(false);
  const base = { deviceId: device.deviceId, workspaceId: workspace.id, repositoryId: workspace.repositoryId, action };
  async function prepare() {
    if (preparing.current) return;
    preparing.current = true;
    setBusy(true); setError('');
    try {
      let again = true;
      while (again && active.current) {
        const current = revision.current;
        const paths = selection.current;
        const job = await control.enqueue({ ...base, kind: paths ? 'generate' : 'preview', ...(paths ? { paths } : {}) });
        const completed = await control.wait(job, cancel.current.signal);
        const value = completed.result;
        if (!value?.previewId || !Array.isArray(value.files)) throw new Error('目标没有返回有效预览。');
        again = current !== revision.current;
        if (again || !active.current) continue;
        setPreview(value);
        if (selection.current === undefined) {
          setFiles(value.files); setSelected(value.files.map(file => file.path)); selection.current = value.files.map(file => file.path);
        }
        if (!manuallyEdited.current) { setSummary(value.summary || ''); setDescription(value.description || ''); }
      }
    } catch (problem) {
      if (active.current) { setPreview(null); setError(problem instanceof Error ? problem.message : '远端预览失败。'); }
    } finally { preparing.current = false; if (active.current) setBusy(false); }
  }
  useEffect(() => {
    active.current = true;
    void prepare();
    return () => { active.current = false; cancel.current.abort(); };
  }, []);
  function choose(paths: string[]) {
    setSelected(paths); selection.current = paths; revision.current++;
    if (!paths.length) { setPreview(null); return; }
    void prepare();
  }
  async function execute() {
    if (!preview?.previewId) return;
    setBusy(true); setError('');
    try {
      await control.enqueue({ ...base, kind: 'execute', previewId: preview.previewId, paths: selected, ...(action === 'commit' || action === 'submit' ? { summary, description } : {}) });
      onClose();
    } catch (problem) { if (active.current) { setError(problem instanceof Error ? problem.message : '远端操作未受理。'); setBusy(false); } }
  }
  const committing = action === 'commit' || action === 'submit';
  return <Modal title={remoteActionLabels[action] + ' · ' + device.name + ' / ' + (preview?.branch || workspace.branch)} onClose={onClose}>
    <div className="remote-action-dialog">
      {busy && <p className="remote-action-pending">正在准备目标工作目录…</p>}
      {preview?.aiError && <Notice kind="error">{preview.aiError}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {committing && <>
        <OutlinedTextField label="Summary" value={summary} required maxLength={500} disabled={busy} onChange={event => { manuallyEdited.current = true; setSummary(event.target.value); }} />
        <OutlinedTextField type="textarea" label="Description" value={description} rows={3} maxLength={16384} disabled={busy} onChange={event => { manuallyEdited.current = true; setDescription(event.target.value); }} />
      </>}
      {action === 'abort' && preview && <p>{preview.running ? '请求目标中止当前操作；已经开始的提交会安全收尾。' : '中止目标正在进行的 ' + preview.operation + '，保留中止前的文件备份。'}</p>}
      {action === 'discard' && <p>将选中的文件恢复到目标当前提交，删除选中的新增文件，并保留恢复备份。</p>}
      <small className="remote-control-hint">仅处理已保存到磁盘的 Git 文件。未接入编辑器时，无法读取它的未保存内容。</small>
      {action !== 'abort' && <div className="remote-action-files"><div className="remote-files-heading"><strong>更改清单 · {selected.length}</strong><Button variant="quiet" disabled={busy || !files.length} onClick={() => choose(selected.length === files.length ? [] : files.map(file => file.path))}>{selected.length === files.length ? '取消全选' : '全选'}</Button></div>{files.map(file => <div className="remote-action-file" key={file.path}>
        <Checkbox label={'选择 ' + file.path} checked={selected.includes(file.path)} disabled={busy} onChange={() => choose(selected.includes(file.path) ? selected.filter(path => path !== file.path) : [...selected, file.path])} />
        <span>{file.fromPath ? file.fromPath + ' → ' : ''}{file.path}</span><small>{file.status === '??' ? '新增' : file.status.includes('D') ? '删除' : file.status.includes('A') ? '新增' : file.status.includes('R') ? '重命名' : '修改'}</small>
      </div>)}</div>}
      <div className="remote-dialog-actions"><Button onClick={onClose}>取消</Button>{error && <Button disabled={busy} onClick={() => void prepare()}>重新预览</Button>}<Button variant="primary" disabled={busy || !preview || (committing && !summary.trim()) || (action !== 'abort' && !selected.length)} onClick={() => void execute()}>{remoteActionLabels[action]}</Button></div>
    </div>
  </Modal>;
}
export function RemoteControlProjects({ repositoryId }: { repositoryId: string }) {
  const control = useRemoteControl();
  const status = control?.status;
  const [target, setTarget] = useState<{ device: ControlDevice; workspace: ControlWorkspace; action: RemoteAction } | null>(null);
  const [error, setError] = useState('');
  if (!control || !status?.enabled) return null;
  const peers = status.devices.filter(device => device.deviceId !== status.deviceId).flatMap(device => device.workspaces.filter(w => w.repositoryId === repositoryId).map(workspace => ({ device, workspace })));
  async function followup(job: ControlJob, kind: 'retryPush' | 'restore') {
    if (!control) return;
    setError('');
    if (kind === 'restore' && !window.confirm('恢复这次丢弃前的文件和暂存状态？目标有新变化时会停止。')) return;
    try { await control.enqueue({ deviceId: job.deviceId, workspaceId: job.workspaceId, repositoryId: job.repositoryId, action: job.action, kind, previousId: job.id }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '远端请求未完成。'); }
  }
  return <div className="remote-control-projects"><h3>远端控制</h3>
    {!status.registered && <p className="presence-empty">在设置的 Presence 中登记此设备后，可控制同账号的设备。</p>}
    {status.registered && !peers.length && <p className="presence-empty">暂无其他设备开放这个项目。目标设备需登记并启用该项目。</p>}
    {peers.map(({ device, workspace }) => {
      const jobs = status.jobs.filter(j => j.deviceId === device.deviceId && j.workspaceId === workspace.id);
      const pending = jobs.some(j => ['queued', 'running'].includes(j.status));
      const latest = jobs.find(j => !['preview', 'generate'].includes(j.kind));
      const previous = latest?.previousId ? jobs.find(j => j.id === latest.previousId) : undefined;
      const retry = latest?.status === 'failed' && latest.kind === 'retryPush' ? previous : latest;
      const recover = latest?.status === 'failed' && latest.kind === 'restore' ? previous : latest;
      return <div className="remote-target" key={device.deviceId + workspace.id}>
        <div className="remote-target-heading"><strong>{device.name} · {workspace.branch}</strong><small>{device.online && status.connection === 'connected' ? '在线' : '离线'}</small></div>
        <div className={'remote-target-actions' + (pending ? ' is-pending' : '')}>{workspace.actions.map(action => <Button key={action} disabled={!device.online || status.connection !== 'connected' || (pending && action !== 'abort')} onClick={() => setTarget({ device, workspace, action })}>{remoteActionLabels[action]}</Button>)}</div>
        {latest && <div className={'remote-job-result' + (latest.error ? ' is-error' : '')} role="status"><span>{controlJobLabel(latest)}</span>
          {latest.result?.warning && <small>{latest.result.warning}</small>}
          {retry?.result?.phase === 'committed' && retry.action === 'submit' && <Button disabled={!device.online || pending} onClick={() => void followup(retry, 'retryPush')}>重试推送</Button>}
          {recover?.result?.phase === 'discarded' && recover.result.backupId && <Button disabled={!device.online || pending} onClick={() => void followup(recover, 'restore')}>恢复更改</Button>}
        </div>}
      </div>;
    })}
    {(error || control.error || status.error) && <Notice kind="error">{error || control.error || status.error}</Notice>}
    {target && <RemoteActionDialog key={target.device.deviceId + target.workspace.id + target.action} {...target} onClose={() => setTarget(null)} />}
  </div>;
}
