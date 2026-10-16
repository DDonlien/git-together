import { useState } from 'react';
import type { Account } from './import-model';
import { importAPI } from './import-api';
import { useAutoRefresh } from './use-auto-refresh';
import type { AccountRepositoryAccess as AccessSnapshot, RepositoryAuthentication } from './repository-auth-model';
import type { WorkspaceController } from './use-workspace';
import { Button, Notice, Select } from './ui';

const permissionLabels = { granted: '允许', denied: '不允许', unknown: '未确认' };
const authorizationLabels = { authorized: '已授权', missing: '未授权', unknown: '未确认', 'not-required': '令牌授权' };

export function AccountRepositoryAccess({ account, controller, disabled, refreshKey }: { account: Account; controller: WorkspaceController; disabled: boolean; refreshKey: number }) {
  const [snapshot, setSnapshot] = useState<AccessSnapshot | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const repositories = controller.catalog.repositories.filter(repo => repo.accountId === account.id);
  const resource = JSON.stringify([controller.catalog.instanceId, account.id, repositories.map(repo => [repo.id, repo.available, repo.permissions])]);
  useAutoRefresh({ resources: !controller.loading && !controller.error && !disabled ? [resource] : [], intervalMs: 60_000,
    triggers: { [resource]: refresh + refreshKey },
    onReading: (_, value) => setReading(value),
    run: async (_, signal) => { const next = await importAPI('accountRepositoryAccess', { accountId: account.id }, signal); if (!signal.aborted) { setSnapshot(next); setError(next.error || ''); } if (next.error) throw new Error(next.error); },
    onError: (_, problem) => setError(problem instanceof Error ? problem.message : '仓库授权检查失败。'),
  });
  const access = new Map(snapshot?.repositories.map(row => [row.repositoryId, row]));
  const missing = repositories.filter(repo => access.get(repo.id)?.authorization === 'missing').length;
  const denied = repositories.filter(repo => access.get(repo.id)?.write === 'denied').length;
  const unknown = repositories.filter(repo => !access.has(repo.id) || access.get(repo.id)?.write === 'unknown').length;
  const summary = snapshot ? [missing ? `${missing} 个仓库未授权` : '', denied ? `${denied} 个仓库无写权限` : '', unknown ? `${unknown} 个仓库写权限未确认` : ''].filter(Boolean).join('；') || (error ? '仓库授权检查失败' : repositories.length ? `${repositories.length} 个仓库具备基础写权限` : '尚无可检查的仓库') : reading ? '正在检查仓库授权和写权限…' : '仓库授权尚未检查';
  async function change(repositoryId: string, authentication: RepositoryAuthentication) {
    setError('');
    try { await controller.setRepositoryAuthentication(repositoryId, authentication); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '认证方式保存失败。'); }
  }
  async function manage() {
    setOpening(true); setError('');
    try { await importAPI('openAccountAccessSettings', { accountId: account.id }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '无法打开授权设置。'); }
    finally { setOpening(false); }
  }
  return <div className="account-repository-access">
    <div className="account-access-heading"><span className={missing || denied || unknown || error ? 'account-warning' : ''} role="status">{summary}{reading && snapshot ? ' · 正在检查' : ''}</span><Button variant="quiet" disabled={disabled || reading} onClick={() => setRefresh(value => value + 1)}>检查权限</Button>{account.provider === 'github' && <Button variant="quiet" disabled={disabled || opening} onClick={() => void manage()}>管理 GitHub 授权</Button>}</div>
    {error && <Notice kind="error">{error}</Notice>}
    <details className="account-access-details"><summary>仓库授权与本地认证 · {repositories.length}</summary>
      <p>已有本地仓库默认使用系统 Git/SSH，沿用仓库的连接地址、凭据助手和 SSH 配置。下方权限属于应用账号，系统认证使用的账号可能不同。</p>
      {repositories.map(repo => { const link = controller.catalog.links.find(link => link.repositoryId === repo.id); const row = access.get(repo.id); return <div className="repository-access-row" key={repo.id}>
        <div className="repository-access-description"><strong>{repo.fullName}</strong><span className="repository-access-permissions"><span data-permission={row?.authorization === 'missing' ? 'denied' : row?.authorization === 'unknown' || !row ? 'unknown' : 'granted'}>应用授权：{row ? authorizationLabels[row.authorization] : '未确认'}</span><span data-permission={row?.read || 'unknown'}>读取：{row ? permissionLabels[row.read] : '未确认'}</span><span data-permission={row?.write || 'unknown'}>写入：{row ? permissionLabels[row.write] : '未确认'}</span></span><small>{row?.reason || '等待权限检查。'}</small></div>
        {link ? <Select label={`本地认证 · ${repo.fullName}`} value={link.authentication || 'system'} disabled={disabled || !!controller.busy[repo.id]} options={[{ value: 'system', label: '系统 Git/SSH（默认）' }, { value: 'account', label: `应用账号 · ${account.login}` }]} onChange={event => void change(repo.id, event.target.value as RepositoryAuthentication)} /> : <small className="repository-access-unlinked">未关联本地目录</small>}
      </div>; })}
      {snapshot && <small className="account-access-checked">检查时间：{new Date(snapshot.checkedAt).toLocaleString()} · 基础写权限不包含分支保护与工作流限制。</small>}
    </details>
  </div>;
}
