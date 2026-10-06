import { useId } from 'react';
import type { RemoteRepository } from './import-model';
import { Icon, IconButton, Menu, MenuItem } from './ui';

interface RepositoryActionProps {
  repository: RemoteRepository;
  hasLocalDirectory: boolean;
  onOpen: (id: string) => void;
  onConfigure: (repository: RemoteRepository) => void;
}

export function RepositoryActionItems({ repository, hasLocalDirectory, onOpen, onConfigure }: RepositoryActionProps) {
  const id = useId();
  return <div className="repository-action-items">
    <div role="group" aria-labelledby={`${id}-git`}>
      <div className="repository-action-heading"><span id={`${id}-git`}>Git</span><small>尚未接入</small></div>
      <MenuItem disabled title="Git Fetch 尚未接入"><Icon name="refresh" size={16} />Fetch</MenuItem>
      <MenuItem disabled title="Git Pull 尚未接入"><Icon name="download" size={16} />Pull</MenuItem>
      <MenuItem disabled title="Git Push 尚未接入"><Icon name="upload" size={16} />Push</MenuItem>
      <MenuItem disabled title="Git 提交尚未接入"><Icon name="commit" size={16} />提交</MenuItem>
    </div>
    <div className="repository-action-separator" role="separator" />
    <div role="group" aria-labelledby={`${id}-gt`}>
      <div className="repository-action-heading"><span id={`${id}-gt`}>GitTogether</span></div>
      <MenuItem onClick={() => onOpen(repository.id)}><Icon name="dashboard" size={16} />打开工作台</MenuItem>
      <MenuItem disabled={!repository.available && !hasLocalDirectory} onClick={() => onConfigure(repository)}><Icon name="folder" size={16} />配置本地目录</MenuItem>
    </div>
  </div>;
}

export function RepositoryActions({ label, ...props }: RepositoryActionProps & { label: string }) {
  return <Menu label={label} placement="end" className="repository-actions" trigger={<IconButton icon="more" label={label} />}>
    <RepositoryActionItems {...props} />
  </Menu>;
}
