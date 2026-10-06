import { useId, useState } from 'react';
import type { RemoteRepository } from './import-model';
import type { WorkspaceController } from './use-workspace';
import { chooseLocalDirectory } from './local-directory';
import { Button, Icon, Modal, Notice } from './ui';

export function LocalDirectoryField({ path, busy, choosing, onChoose }: { path: string; busy: boolean; choosing: boolean; onChoose: () => void }) {
  const labelId = useId();
  const valueId = useId();
  return <div className="local-directory-field"><span id={labelId}>本地仓库目录</span><Button type="button" className={`directory-picker${path ? ' has-path' : ''}`} aria-labelledby={`${labelId} ${valueId}`} title={path || '选择文件夹'} disabled={busy} onClick={onChoose} leadingIcon={<Icon name={choosing ? 'spinner' : 'folder'} className={choosing ? 'spin' : undefined} size={16} />}><span id={valueId} className="directory-picker-path">{choosing ? '正在打开…' : path || '选择文件夹…'}</span></Button></div>;
}

export function LocalRepositoryModal({ repository, controller, onClose }: { repository: RemoteRepository; controller: WorkspaceController; onClose: () => void }) {
  const link = controller.catalog.links.find(l => l.repositoryId === repository.id);
  const [path, setPath] = useState(link?.path || '');
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false);
  const saving = !!controller.busy[repository.id];
  const busy = saving || choosing;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !path.trim() || !repository.available) return;
    setError('');
    try {
      await controller.link(repository.id, path);
      controller.updatePreferences({ collapsedAccounts: controller.preferences.collapsedAccounts.filter(id => id !== repository.accountId) });
      onClose();
    } catch (problem) { setError(problem instanceof Error ? problem.message : '关联失败。'); }
  }
  async function choose() {
    if (busy) return;
    setChoosing(true); setError('');
    try { const chosen = await chooseLocalDirectory(); if (chosen !== null) setPath(chosen); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '无法打开系统文件夹选择器，请重试。'); }
    finally { setChoosing(false); }
  }
  return <Modal title="配置本地仓库" onClose={() => { if (!busy) onClose(); }}><div className="local-repo-identity"><Icon name="folder" size={24} /><div><strong>{repository.fullName}</strong><small>{new URL(repository.url).host}</small></div></div><form onSubmit={event => void save(event)}><LocalDirectoryField path={path} busy={busy} choosing={choosing} onChoose={() => void choose()} />{error && <Notice kind="error">{error}</Notice>}{!repository.available && <Notice kind="info">账号目前无权访问此仓库。可以解除关联，重新获得权限后再关联。</Notice>}<div className="modal-actions">{link && <Button variant="quiet" className="danger-text unlink-button" disabled={busy} onClick={() => { setError(''); void controller.unlink(repository.id).then(onClose).catch(problem => setError(problem instanceof Error ? problem.message : '解除关联失败。')); }}>解除关联</Button>}<Button disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" type="submit" disabled={busy || !path.trim() || !repository.available} leadingIcon={saving ? <Icon name="spinner" className="spin" size={15} /> : undefined}>{saving ? '正在验证…' : '保存关联'}</Button></div>{link && <p className="field-help">解除关联只移除应用记录，不删除本地目录。</p>}</form></Modal>;
}
