import { useEffect, useRef, useState } from 'react';
import { useRemoteControl } from './RemoteControlProvider';
import { controlDeviceOnline, controlJobLabel, remoteActionLabels, type ControlDevice, type ControlJob, type ControlWorkspace, type RemoteAction, type RemoteActionTarget, type ControlResult, type RemoteFile } from './remote-control-model';
import { OutlinedTextField } from './material-inputs';
import { Button, Checkbox, Modal, Notice } from './ui';

export function RemoteActionDialog({ device, workspace, action, onClose }: RemoteActionTarget & { onClose: () => void }) {
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
  const base = { serverId: device.serverId, deviceId: device.deviceId, workspaceId: workspace.id, repositoryId: workspace.repositoryId, action };
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
export function RemoteWorkspaceActions({ device, workspace, onAction, label, compact = false, actionCounts }: { device: ControlDevice; workspace: ControlWorkspace; onAction: (target: RemoteActionTarget) => void; label?: string; compact?: boolean; actionCounts?: Partial<Record<RemoteAction, number>> }) {
  const control = useRemoteControl();
  const status = control?.status;
  const [error, setError] = useState('');
  if (!control || !status?.enabled) return null;
  const jobs = status.jobs.filter(job => job.serverId === device.serverId && job.deviceId === device.deviceId && job.workspaceId === workspace.id);
  const pending = jobs.some(job => ['queued', 'running'].includes(job.status));
  const latest = jobs.find(job => !['preview', 'generate'].includes(job.kind));
  const previous = latest?.previousId ? jobs.find(job => job.id === latest.previousId) : undefined;
  const retry = latest?.status === 'failed' && latest.kind === 'retryPush' ? previous : latest;
  const recover = latest?.status === 'failed' && latest.kind === 'restore' ? previous : latest;
  const organization = status.teams.find(team => team.serverId === device.serverId && team.id === workspace.teamId);
  const online = controlDeviceOnline(status, device);
  const heading = label || `${device.name} · ${workspace.branch}${organization ? ` · ${organization.name || organization.id}` : ''}`;
  async function followup(job: ControlJob, kind: 'retryPush' | 'restore') {
    if (!control) return;
    setError('');
    if (kind === 'restore' && !window.confirm('恢复这次丢弃前的文件和暂存状态？目标有新变化时会停止。')) return;
    try { await control.enqueue({ serverId: job.serverId, deviceId: job.deviceId, workspaceId: job.workspaceId, repositoryId: job.repositoryId, action: job.action, kind, previousId: job.id }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '远端请求未完成。'); }
  }
  return <div className={'remote-target' + (compact ? ' presence-remote-target' : '')}>
    {!compact && <div className="remote-target-heading"><strong>{heading}</strong><small>{online ? '在线' : '离线'}</small></div>}
    {compact && label && <span className="presence-remote-workspace-label">{label}</span>}
    <div className={'remote-target-actions' + (pending ? ' is-pending' : '')}>{workspace.actions.map(action => {
      const count = actionCounts?.[action];
      const countDescription = count ? `，${count} ${action === 'submit' ? '个未推送提交' : action === 'abort' ? '项进行中操作' : '个未提交文件'}` : '';
      return <Button key={action} aria-label={`${heading} · ${remoteActionLabels[action]}${countDescription}`} disabled={control.busy || !online || (pending && action !== 'abort')} onClick={() => onAction({ device, workspace, action })}><span>{remoteActionLabels[action]}</span>{count !== undefined && count > 0 && <span className="presence-action-count" aria-hidden="true">{count}</span>}</Button>;
    })}</div>
    {latest && <div className={'remote-job-result' + (latest.error ? ' is-error' : '')} role="status"><span>{controlJobLabel(latest)}</span>
      {latest.result?.warning && <small>{latest.result.warning}</small>}
      {retry?.result?.phase === 'committed' && retry.action === 'submit' && <Button disabled={control.busy || !online || pending} onClick={() => void followup(retry, 'retryPush')}>重试推送</Button>}
      {recover?.result?.phase === 'discarded' && recover.result.backupId && <Button disabled={control.busy || !online || pending} onClick={() => void followup(recover, 'restore')}>恢复更改</Button>}
    </div>}
    {error && <Notice kind="error">{error}</Notice>}
  </div>;
}

export function RemoteControlProjects({ repositoryId }: { repositoryId: string }) {
  const control = useRemoteControl();
  const status = control?.status;
  const [target, setTarget] = useState<RemoteActionTarget | null>(null);
  if (!control || !status?.enabled) return null;
  const peers = status.devices.filter(device => !device.isCurrent && device.deviceId !== status.deviceId).flatMap(device => device.workspaces.filter(workspace => workspace.repositoryId === repositoryId).map(workspace => ({ device, workspace })));
  return <div className="remote-control-projects"><h3>远端控制</h3>
    {!status.registered && <p className="presence-empty">正在连接 Presence，自动登记此设备。</p>}
    {status.registered && !peers.length && <p className="presence-empty">暂无可操作的其他设备或协作成员。</p>}
    {peers.map(({ device, workspace }) => <RemoteWorkspaceActions key={(device.serverId || '') + device.deviceId + workspace.id} device={device} workspace={workspace} onAction={setTarget} />)}
    {(control.error || status.error) && <Notice kind="error">{control.error || status.error}</Notice>}
    {target && <RemoteActionDialog key={(target.device.serverId || '') + target.device.deviceId + target.workspace.id + target.action} {...target} onClose={() => setTarget(null)} />}
  </div>;
}
