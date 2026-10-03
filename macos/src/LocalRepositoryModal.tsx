import { useState } from 'react';
import type { RemoteRepository } from './import-model';
import type { WorkspaceController } from './use-workspace';
import { Button, Icon, Modal, Notice, TextField } from './ui';

export function LocalRepositoryModal({ repository, controller, onClose }: { repository: RemoteRepository; controller: WorkspaceController; onClose: () => void }) {
  const link = controller.catalog.links.find(l => l.repositoryId === repository.id);
  const [path, setPath] = useState(link?.path || '');
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false);
  const busy = !!controller.busy[repository.id] || choosing;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('');
    try {
      await controller.link(repository.id, path);
      controller.updatePreferences({ collapsedAccounts: controller.preferences.collapsedAccounts.filter(id => id !== repository.accountId) });
      onClose();
    } catch (problem) { setError(problem instanceof Error ? problem.message : '关联失败。'); }
  }
  async function choose() {
    setChoosing(true); setError('');
    try { const chosen = await window.gittogether?.chooseDirectory(); if (chosen) setPath(chosen); }
    catch { setError('无法打开目录选择器，请手动输入目录。'); }
    finally { setChoosing(false); }
  }
  return <Modal title="配置本地仓库" onClose={() => { if (!busy) onClose(); }}><div className="local-repo-identity"><Icon name="folder" size={24} /><div><strong>{repository.fullName}</strong><small>{new URL(repository.url).host}</small></div></div><p>关联已有的 Git 工作目录。仅检查本地目录和远端是否匹配，不会克隆、拉取或修改文件。</p><form onSubmit={event => void save(event)}><TextField label="本地仓库目录" value={path} onChange={event => setPath(event.target.value)} placeholder="~/Projects/my-repository" required disabled={busy} autoComplete="off" />{window.gittogether && <Button className="directory-picker" leadingIcon={<Icon name="folder" size={15} />} onClick={() => void choose()} disabled={busy}>选择目录…</Button>}<p className="field-help">可以输入绝对路径或 ~/ 开头的路径。子目录会自动识别到 Git 仓库根目录；其他仓库的目录不会被接受。</p>{error && <Notice kind="error">{error}</Notice>}{!repository.available && <Notice kind="info">账号目前无权访问此仓库。可以解除关联，重新获得权限后再关联。</Notice>}<div className="modal-actions">{link && <Button variant="quiet" className="danger-text unlink-button" disabled={busy} onClick={() => { setError(''); void controller.unlink(repository.id).then(onClose).catch(problem => setError(problem instanceof Error ? problem.message : '解除关联失败。')); }}>解除关联</Button>}<Button disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" type="submit" disabled={busy || !path.trim() || !repository.available} leadingIcon={busy ? <Icon name="spinner" className="spin" size={15} /> : undefined}>{busy ? '正在验证…' : '保存关联'}</Button></div>{link && <p className="field-help">解除关联只移除应用记录，不删除本地目录。</p>}</form></Modal>;
}
