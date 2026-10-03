import { useState } from 'react';
import { accountLabel, providerName, type Account, type Provider } from './import-model';
import type { WorkspaceController } from './use-workspace';
import { Button, Icon, Modal, Notice, Segmented, Select, Switch, TextField } from './ui';
import pkg from '../package.json';

export function SettingsView({ controller, nativeMaterial, onDashboard }: { controller: WorkspaceController; nativeMaterial: boolean; onDashboard: () => void }) {
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<Provider>('github');
  const [host, setHost] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [removing, setRemoving] = useState<Account | null>(null);
  const busy = !!controller.busy.connect;
  async function connect(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const catalog = await controller.connect({ provider, host: provider === 'github' ? 'https://github.com' : host, token, name });
      setToken(''); setHost(''); setName(''); setAdding(false);
      const account = catalog.accounts.at(-1);
      setMessage(account?.error ? '账号已添加，但仓库加载失败。请在 Dashboard 重新加载。' : '账号已连接，仓库已经读取。去 Dashboard 关联本地目录。');
    } catch (problem) { setError(problem instanceof Error ? problem.message : '连接失败。'); }
  }
  return <main className="settings-view">
    <div className="settings-heading"><h1>设置</h1><span className="muted">GitTogether {pkg.version}</span></div>
    <section className="settings-section"><div className="section-title"><div><h2>账号</h2><p>连接账号后，在 Dashboard 为仓库关联本地目录。</p></div><Button leadingIcon={<Icon name="plus" size={15} />} onClick={() => { setAdding(true); setError(''); setMessage(''); }} disabled={adding}>添加账号</Button></div>
      <div className="settings-group account-settings-list">{controller.catalog.accounts.length ? controller.catalog.accounts.map(account => <div className="account-setting" key={account.id}><span className={`provider-mark ${account.provider}`}><Icon name="branch" size={17} /></span><div><strong>{account.name}</strong><small>{providerName(account.provider)} · {account.login} · {new URL(account.host).host}</small>{account.error && <span className="account-warning">仓库加载失败，可在 Dashboard 重试</span>}</div><Button variant="quiet" className="danger-text" disabled={!!controller.busy[account.id]} onClick={() => { setRemoving(account); setError(''); }}>移除</Button></div>) : <div className="settings-empty"><Icon name="users" size={24} /><strong>还没有连接账号</strong><p>支持同一服务上的多个账号。请为每个账号分别提供令牌。</p></div>}</div>
      {adding && <form className="account-connect-form flat-group" onSubmit={event => void connect(event)} aria-label="添加账号"><div className="section-title"><h3>连接新账号</h3><Button variant="quiet" disabled={busy} onClick={() => { setAdding(false); setToken(''); setError(''); }}>取消</Button></div><Segmented<Provider> aria-label="账号服务" value={provider} onValueChange={value => { setProvider(value); setToken(''); setError(''); }} disabled={busy} items={[{ value: 'github', label: 'GitHub' }, { value: 'gitea', label: 'Gitea' }]} />
        {provider === 'gitea' && <TextField label="Gitea 域名" placeholder="https://git.example.com" value={host} onChange={event => setHost(event.target.value)} required disabled={busy} autoComplete="url" />}
        <TextField label="账号名称（选填）" placeholder="例如：工作账号 / 个人账号" value={name} onChange={event => setName(event.target.value)} disabled={busy} maxLength={120} />
        <TextField label="访问令牌" type="password" autoComplete="off" spellCheck={false} placeholder={provider === 'github' ? 'GitHub Personal Access Token' : 'Gitea Access Token'} value={token} onChange={event => setToken(event.target.value)} required disabled={busy} maxLength={4096} />
        <p className="field-help">{provider === 'github' ? <>在 GitHub Settings → Developer settings → Personal access tokens 创建令牌。仓库列表只包含令牌获准访问的范围（Metadata 读取权限）；组织账号还可能需要 SSO 授权。</> : <>在 Gitea 用户设置 → 应用 → 访问令牌中创建；需要 read:user、read:repository 权限。域名默认使用 HTTPS。</>}</p>
        {error && <Notice kind="error">{error}</Notice>}<div className="account-form-actions"><span className="muted">只读取身份与仓库列表</span><Button variant="primary" type="submit" disabled={busy || !token.trim() || (provider === 'gitea' && !host.trim())} leadingIcon={busy ? <Icon name="spinner" className="spin" size={15} /> : undefined}>{busy ? '验证账号并读取仓库…' : '连接账号'}</Button></div>
      </form>}
      {message && <Notice kind="success">{message}<Button variant="quiet" onClick={onDashboard}>打开 Dashboard</Button></Notice>}
      <p className="field-help storage-help"><Icon name="desktop" size={14} />{controller.catalog.credentialStorage === 'encrypted' ? '账号与令牌由系统安全存储加密保存，不进入网页存储。' : '本地浏览器预览：账号与令牌仅在服务会话中保存；重启服务后需要重新连接。桌面版使用系统加密存储。'}</p>
    </section>
    <section className="settings-section"><h2>外观</h2><div className="settings-group"><div className="setting-row"><span>颜色方案<small>跟随系统，或选择亮色与暗色</small></span><Select label={<span className="sr-only">颜色方案</span>} options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '亮色' }, { value: 'dark', label: '暗色' }]} value={controller.preferences.theme} onChange={event => controller.updatePreferences({ theme: event.target.value as 'light' | 'dark' | 'system' })} /></div><Switch className="setting-row" label="减少透明度" description="使用更实的导航与控制层" checked={controller.preferences.reducedGlass} onCheckedChange={checked => controller.updatePreferences({ reducedGlass: checked })} /></div><div className="setting-material"><Icon name="desktop" size={15} />{nativeMaterial ? '原生 Liquid Glass 已启用' : 'OpenGlass UI · 浏览器材质'}</div></section>
    <section className="settings-section"><h2>使用指南</h2><div className="settings-group import-guide"><ol><li><strong>连接账号</strong><p>在此添加 GitHub 或指定域名的 Gitea 账号。多个账号可以共享一个 host，但各自的仓库与凭据独立。</p></li><li><strong>选择仓库</strong><p>Dashboard 自动列出所有令牌可访问的仓库，包含组织或协作仓库。可以搜索、筛选账号和重新加载。</p></li><li><strong>关联本地目录</strong><p>在具体仓库行打开弹窗，选择已有 Git 目录。验证远端匹配后，仓库才会出现在该账号的侧栏中。不会自动克隆。</p></li></ol><p>解除关联或移除账号只移除应用记录，磁盘上的仓库完整保留。当前仓库查看为只读；不执行提交、推送或模拟 AI。Presence 接入后会显示在对应仓库图标上。</p><span><kbd>⌘ K</kbd> 搜索 <kbd>Esc</kbd> 关闭弹窗</span></div></section>
    {removing && <Modal title={`移除 ${removing.name}？`} onClose={() => { if (!controller.busy[removing.id]) setRemoving(null); }}><p>{accountLabel(removing)}</p><p>移除这个账号的凭据、仓库列表与应用内的本地关联。不会删除任何本地文件。</p>{error && <Notice kind="error">{error}</Notice>}<div className="modal-actions"><Button disabled={!!controller.busy[removing.id]} onClick={() => setRemoving(null)}>取消</Button><Button variant="danger" disabled={!!controller.busy[removing.id]} onClick={() => { setError(''); void controller.removeAccount(removing.id).then(() => setRemoving(null)).catch(problem => setError(problem instanceof Error ? problem.message : '移除失败。')); }}>移除账号</Button></div></Modal>}
  </main>;
}
