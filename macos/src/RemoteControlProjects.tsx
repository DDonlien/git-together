import { useEffect, useRef, useState } from 'react';
import { useRemoteControl } from './RemoteControlProvider';
import { controlDeviceOnline, controlJobLabel, remoteActionLabels, remoteFileSelection, type ControlDevice, type ControlJob, type ControlWorkspace, type RemoteAction, type RemoteActionTarget, type ControlResult, type RemoteFile } from './remote-control-model';
import { OutlinedTextField } from './material-inputs';
import { Button, Checkbox, IconButton, Modal, Notice, type IconName } from './ui';

const remoteActionIcons: Record<RemoteAction, IconName> = { commit: 'commit', submit: 'upload', abort: 'close', discard: 'clear' };

function readFilePage(value: ControlResult | null | undefined, offset: number) {
  if (!value?.previewId || !Array.isArray(value.files)) throw new Error('目标没有返回有效预览。');
  const page = value.filePage;
  if (page && (!Number.isSafeInteger(page.total) || page.total < offset + value.files.length || page.offset !== offset || (page.nextCursor === undefined ? offset + value.files.length !== page.total : !value.files.length || page.nextCursor !== offset + value.files.length || page.nextCursor >= page.total))) throw new Error('文件分页与原预览不一致，请重新读取清单。');
  if (!page && offset !== 0) throw new Error('目标版本没有返回文件页，请更新目标端 GitTogether 后重试。');
  return value as ControlResult & { previewId: string; files: RemoteFile[] };
}
function remotePreviewError(problem: unknown) {
  const message = problem instanceof Error ? problem.message : '远端请求未完成。';
  return /^(远端文件清单过大|更改文件过多)/.test(message) ? '目标端仍使用旧版大清单限制。请更新目标端 GitTogether 和 Presence 服务器，再在此弹窗选择范围，无需到目标设备删减文件。' : message;
}

export function RemoteActionDialog({ device, workspace, action, onClose }: RemoteActionTarget & { onClose: () => void }) {
  const control = useRemoteControl()!;
  const [preview, setPreview] = useState<ControlResult | null>(null);
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [selection, setSelection] = useState({ all: true, exceptions: new Set<number>() });
  const [nextCursor, setNextCursor] = useState<number | undefined>();
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageError, setPageError] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const active = useRef(true);
  const cancel = useRef(new AbortController());
  const server = control.status?.servers?.find(value => value.serverId === device.serverId);
  const paged = server ? server.filePages === true : control.status?.filePages === true;
  const total = preview?.filePage?.total ?? files.length;
  const selectedCount = selection.all ? total - selection.exceptions.size : selection.exceptions.size;
  const base = { serverId: device.serverId, deviceId: device.deviceId, workspaceId: workspace.id, repositoryId: workspace.repositoryId, action };
  function selectedInput() {
    return preview?.filePage ? { selection: remoteFileSelection(selection.all, selection.exceptions) } : { paths: files.filter((_, index) => selection.all !== selection.exceptions.has(index)).map(file => file.path) };
  }
  async function prepare() {
    setBusy(true); setError(''); setPageError(''); setPreview(null);
    try {
      const job = await control.enqueue({ ...base, kind: 'preview', ...(paged ? { cursor: 0 } : {}) });
      const completed = await control.wait(job, cancel.current.signal);
      const value = readFilePage(completed.result, 0);
      if (!active.current) return;
      setPreview(value); setFiles(value.files); setNextCursor(value.filePage?.nextCursor);
      setSelection({ all: true, exceptions: new Set() });
      setSummary(current => current || value.summary || ''); setDescription(current => current || value.description || '');
    } catch (problem) {
      if (active.current) { setFiles([]); setError(remotePreviewError(problem)); }
    } finally { if (active.current) setBusy(false); }
  }
  useEffect(() => {
    active.current = true;
    void prepare();
    return () => { active.current = false; cancel.current.abort(); };
  }, []);
  function choose(index: number) {
    setSelection(previous => {
      const exceptions = new Set(previous.exceptions);
      if (exceptions.has(index)) exceptions.delete(index); else exceptions.add(index);
      return { ...previous, exceptions };
    });
  }
  async function loadMore() {
    if (!preview?.previewId || nextCursor === undefined || loadingPage) return;
    setLoadingPage(true); setPageError('');
    try {
      const job = await control.enqueue({ ...base, kind: 'preview', previewId: preview.previewId, cursor: nextCursor });
      const completed = await control.wait(job, cancel.current.signal);
      const value = readFilePage(completed.result, nextCursor);
      if (value.previewId !== preview.previewId || value.filePage?.total !== total) throw new Error('目标文件清单已变化，请重新预览。');
      if (active.current) { setFiles(previous => [...previous, ...value.files]); setNextCursor(value.filePage?.nextCursor); }
    } catch (problem) { if (active.current) setPageError(remotePreviewError(problem)); }
    finally { if (active.current) setLoadingPage(false); }
  }
  async function generate() {
    if (!preview?.previewId || !selectedCount) return;
    setBusy(true); setError('');
    try {
      const job = await control.enqueue({ ...base, kind: 'generate', previewId: preview.previewId, ...selectedInput() });
      const completed = await control.wait(job, cancel.current.signal);
      const value = readFilePage(completed.result, 0);
      if (!active.current) return;
      setPreview({ ...value, files: preview.files, filePage: preview.filePage });
      if (!value.aiError) { setSummary(value.summary || ''); setDescription(value.description || ''); }
    } catch (problem) { if (active.current) setError(remotePreviewError(problem)); }
    finally { if (active.current) setBusy(false); }
  }
  async function execute() {
    if (!preview?.previewId) return;
    setBusy(true); setError('');
    try {
      await control.enqueue({ ...base, kind: 'execute', previewId: preview.previewId, ...(action !== 'abort' ? selectedInput() : {}), ...(action === 'commit' || action === 'submit' ? { summary, description } : {}) });
      onClose();
    } catch (problem) { if (active.current) { setError(remotePreviewError(problem)); setBusy(false); } }
  }
  const committing = action === 'commit' || action === 'submit';
  return <Modal title={remoteActionLabels[action] + ' · ' + device.name + ' / ' + (preview?.branch || workspace.branch)} onClose={onClose}>
    <div className="remote-action-dialog">
      {busy && <p className="remote-action-pending">正在准备目标工作目录…</p>}
      {preview?.aiError && <Notice kind="error">{preview.aiError}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {committing && <>
        <OutlinedTextField label="Summary" value={summary} required maxLength={500} disabled={busy} onChange={event => setSummary(event.target.value)} />
        <OutlinedTextField type="textarea" label="Description" value={description} rows={3} maxLength={16384} disabled={busy} onChange={event => setDescription(event.target.value)} />
        <div className="remote-message-actions"><Button variant="quiet" disabled={busy || loadingPage || !!pageError || !preview || !selectedCount} onClick={() => void generate()}>AI生成说明</Button></div>
      </>}
      {action === 'abort' && preview && <p>{preview.running ? '请求目标中止当前操作；已经开始的提交会安全收尾。' : '中止目标正在进行的 ' + preview.operation + '，保留中止前的文件备份。'}</p>}
      {action === 'discard' && <p>将选中的文件恢复到目标当前提交，删除选中的新增文件，并保留恢复备份。</p>}
      <small className="remote-control-hint">仅处理已保存到磁盘的 Git 文件。未接入编辑器时，无法读取它的未保存内容。</small>
      {action !== 'abort' && <section className="remote-files-section" aria-label="更改清单"><div className="remote-files-heading"><strong>已选 {selectedCount} / {total} 个文件</strong><Button variant="quiet" disabled={busy || !preview || !total} onClick={() => setSelection({ all: selectedCount !== total, exceptions: new Set() })}>{selectedCount === total ? '取消全选' : `全选全部 ${total} 个`}</Button></div><small className="remote-file-progress" role="status">已加载 {files.length} / {total} 个文件{selection.all && nextCursor !== undefined ? '，全选包含尚未加载的文件' : ''}</small><div className="remote-action-files">{files.map((file, index) => <div className="remote-action-file" key={file.path}>
        <Checkbox label={'选择 ' + file.path} checked={selection.all !== selection.exceptions.has(index)} disabled={busy} onChange={() => choose(index)} />
        <span>{file.fromPath ? file.fromPath + ' → ' : ''}{file.path}</span><small>{file.status === '??' ? '新增' : file.status.includes('D') ? '删除' : file.status.includes('A') ? '新增' : file.status.includes('R') ? '重命名' : '修改'}</small>
      </div>)}</div>{pageError && <Notice kind="error">{pageError}</Notice>}{nextCursor !== undefined && <Button variant="quiet" disabled={busy || loadingPage} onClick={() => void loadMore()}>{loadingPage ? '正在加载…' : pageError ? '重试加载' : '加载下一批'}</Button>}</section>}
      <div className="remote-dialog-actions"><Button onClick={onClose}>取消</Button>{(error || pageError) && <Button disabled={busy || loadingPage} onClick={() => void prepare()}>重新预览</Button>}<Button variant="primary" disabled={busy || loadingPage || !!pageError || !preview || (committing && !summary.trim()) || (action !== 'abort' && !selectedCount)} onClick={() => void execute()}>{remoteActionLabels[action]}</Button></div>
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
      const actionLabel = `${heading} · ${remoteActionLabels[action]}${countDescription}`;
      const buttonProps = { disabled: control.busy || !online || (pending && action !== 'abort'), onClick: () => onAction({ device, workspace, action }) };
      const badge = count !== undefined && count > 0 && <span className="presence-action-count" aria-hidden="true">{count}</span>;
      return compact
        ? <IconButton key={action} className="presence-remote-action" icon={remoteActionIcons[action]} label={actionLabel} {...buttonProps}>{badge}</IconButton>
        : <Button key={action} aria-label={actionLabel} {...buttonProps}><span>{remoteActionLabels[action]}</span>{badge}</Button>;
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
