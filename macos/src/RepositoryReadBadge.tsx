import { Icon } from './ui';

export function RepositoryReadBadge({ reading, error }: { reading: boolean; error: string }) {
  if (!reading && !error) return null;
  const label = reading ? '正在刷新仓库…' : `仓库访问异常：${error}`;
  return <span className={`repository-read-badge ${reading ? 'reading' : 'error'}`} role="img" aria-label={label} data-action-name={reading ? undefined : label} tabIndex={reading ? undefined : 0}>
    {reading ? <Icon name="spinner" className="spin" size={12} /> : '!'}
  </span>;
}
