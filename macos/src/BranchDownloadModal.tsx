import { useState } from 'react';
import type { RemoteRepository } from './import-model';
import type { WorkspaceController } from './use-workspace';
import { branchDownloadFolderName, isDownloadFolderName } from './branch-download-model';
import { chooseLocalDirectory } from './local-directory';
import { LocalDirectoryField } from './LocalRepositoryModal';
import { Button, Icon, Modal, Notice, TextField } from './ui';

export function BranchDownloadModal({ repository, branch, controller, onClose }: { repository: RemoteRepository; branch: string; controller: WorkspaceController; onClose: () => void }) {
  const [parentPath, setParentPath] = useState('');
  const [folderName, setFolderName] = useState(branchDownloadFolderName(repository.name, branch));
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const downloading = !!controller.busy[repository.id];
  const busy = choosing || downloading;
  const validName = isDownloadFolderName(folderName.trim());
  async function choose() {
    if (busy) return;
    setChoosing(true); setError('');
    try { const selected = await chooseLocalDirectory(); if (selected !== null) setParentPath(selected); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '无法选择存放位置。'); }
    finally { setChoosing(false); }
  }
  async function download(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !parentPath || !validName || !repository.available) return;
    setError('');
    try {
      await controller.downloadBranch(repository.id, branch, parentPath, folderName.trim());
      onClose();
    } catch (problem) { setError(problem instanceof Error ? problem.message : '分支下载未完成。'); }
  }
  const target = parentPath ? `${parentPath.replace(/[\\/]$/, '')}/${folderName.trim()}` : '';
  return <Modal title={`下载分支 · ${branch}`} onClose={() => { if (!busy) onClose(); }}>
    <div className="local-repo-identity"><Icon name="branch" size={24} /><div><strong>{repository.fullName}</strong><small>{branch}</small></div></div>
    <form onSubmit={event => void download(event)} aria-busy={downloading}>
      <LocalDirectoryField label="存放位置" path={parentPath} busy={busy} choosing={choosing} onChoose={() => void choose()} />
      <TextField label="文件夹名称" value={folderName} onChange={event => setFolderName(event.target.value)} maxLength={160} required disabled={busy} autoComplete="off" spellCheck={false} />
      {target && <p className="field-help branch-download-target">下载到：{target}</p>}
      <p className="field-help">创建此分支的工作目录，下载完成后自动关联。</p>
      {error && <Notice kind="error">{error}</Notice>}
      {!repository.available && <Notice kind="error">账号目前无法访问此仓库，请检查账号权限。</Notice>}
      {downloading && <Notice kind="info">正在下载分支文件并创建工作目录…</Notice>}
      <div className="modal-actions"><Button disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" type="submit" disabled={busy || !parentPath || !validName || !repository.available} leadingIcon={<Icon name={downloading ? 'spinner' : 'download'} className={downloading ? 'spin' : undefined} size={15} />}>{downloading ? '正在下载…' : '下载并关联'}</Button></div>
    </form>
  </Modal>;
}
