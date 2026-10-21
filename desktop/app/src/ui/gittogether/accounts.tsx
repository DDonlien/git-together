import * as React from 'react'
import { Account, isDotComAccount } from '../../models/account'
import { getHTMLURL } from '../../lib/api'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { PasswordTextBox } from '../lib/password-text-box'
import { MaterialIcon } from './material-icon'
import { giteaAccounts } from './gitea-accounts'
import providerOptions from '../../../../../macos/src/desktop-account-providers.json'
import type { DesktopAccountProvider } from '../../../../../macos/src/desktop-account-providers'
import type { Account as CatalogAccount } from '../../../../../macos/src/import-model'

interface AccountsProps {
  readonly accounts: ReadonlyArray<Account>
  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onEnterpriseHostSignIn?: (host: string) => void
  readonly onLogout: (account: Account) => void
}
const desktopAccountProviders = providerOptions as ReadonlyArray<{ id: DesktopAccountProvider; label: string }>

/** Account presentation only. First-party callbacks still belong to the
 * original Preferences controller; Gitea is the user's explicit extension. */
export function Accounts(props: AccountsProps) {
  const [gitea, setGitea] = React.useState<CatalogAccount[]>([])
  const [adding, setAdding] = React.useState(false)
  const [provider, setProvider] = React.useState<DesktopAccountProvider>('github')
  const [host, setHost] = React.useState('')
  const [name, setName] = React.useState('')
  const [token, setToken] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    let active = true
    const reload = () => { void giteaAccounts.snapshot().then(value => { if (active) setGitea(value.accounts) }).catch(problem => { if (active) setError(problem instanceof Error ? problem.message : String(problem)) }) }
    const unsubscribe = giteaAccounts.onDidChange(reload)
    reload()
    return () => { active = false; unsubscribe() }
  }, [])
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await action(); return true }
    catch (problem) { setError(problem instanceof Error ? problem.message : String(problem)); return false }
    finally { setBusy(false) }
  }
  const reset = () => { setAdding(false); setHost(''); setName(''); setToken(''); setError('') }
  const select = (value: DesktopAccountProvider) => { setProvider(value); setHost(''); setToken(''); setError('') }
  const add = (account?: CatalogAccount) => { setAdding(true); setProvider(account ? 'gitea' : 'github'); setHost(account?.host || ''); setName(account?.name || ''); setToken(''); setError('') }
  const disabled = busy || (provider !== 'github' && !host.trim()) || (provider === 'gitea' && !token.trim())
  const connect = async () => {
    if (disabled) return
    if (provider === 'github') { props.onDotComSignIn(); return }
    if (provider === 'github-enterprise') { props.onEnterpriseHostSignIn ? props.onEnterpriseHostSignIn(host) : props.onEnterpriseSignIn(); return }
    if (await run(() => giteaAccounts.connect({ provider, host, name, token }))) reset()
  }
  return <DialogContent className="gt-accounts desktop-accounts">
    <div className="account-entry-heading"><h2>账号</h2><Button type="button" disabled={busy || adding} onClick={() => add()}>添加账号</Button></div>
    {(props.accounts.length > 0 || gitea.length > 0 || adding) && <div className="gt-account-list" role="group" aria-label="账号列表">
      {props.accounts.map(account => <div className="account-setting" key={account.endpoint + ':' + account.id}><MaterialIcon name="User" size={20} /><div><strong>{account.name || account.login}</strong><small>{isDotComAccount(account) ? 'GitHub' : 'GitHub Enterprise'} · {account.login} · {new URL(getHTMLURL(account.endpoint)).host}</small></div><div className="account-entry-actions"><Button type="button" disabled={busy} onClick={() => props.onLogout(account)}>退出登录</Button></div></div>)}
      {gitea.map(account => <div className="account-setting" key={account.id}><MaterialIcon name="User" size={20} /><div><strong>{account.name}</strong><small>Gitea · {account.login} · {new URL(account.host).host}</small>{account.error && <small role="status">{account.error}</small>}</div><div className="account-entry-actions"><Button type="button" disabled={busy || adding} onClick={() => add(account)}>重新连接</Button><Button type="button" disabled={busy} onClick={() => void run(() => giteaAccounts.refresh(account.id))}>刷新</Button><Button type="button" disabled={busy} onClick={() => void run(() => giteaAccounts.remove(account.id))}>退出登录</Button></div></div>)}
      {adding && <div className="account-entry-form" role="form" aria-label="添加账号" onKeyDown={event => {
        if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); event.stopPropagation(); void connect() }
      }}>
        <div className="account-entry-heading"><h3>添加账号</h3><Button type="button" disabled={busy} onClick={reset}>取消</Button></div>
        <div className="account-provider-tabs" role="tablist" aria-label="账号类型">{desktopAccountProviders.map((item, index) => <button type="button" key={item.id} role="tab" id={'native-account-' + item.id} aria-controls="native-account-panel" aria-selected={provider === item.id} tabIndex={provider === item.id ? 0 : -1} disabled={busy} onClick={() => select(item.id)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1
          if (next < 0) return
          event.preventDefault(); select(desktopAccountProviders[next].id)
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
        }}>{item.label}</button>)}</div>
        <div className="account-entry-fields" id="native-account-panel" role="tabpanel" aria-labelledby={'native-account-' + provider}>
          {provider !== 'github' && <TextBox label={provider === 'gitea' ? 'Gitea 服务器地址' : 'GitHub Enterprise 域名'} placeholder={provider === 'gitea' ? 'https://git.example.com' : 'https://github.company.com'} value={host} onValueChanged={value => { setHost(value); setToken(''); setError('') }} disabled={busy} />}
          {provider === 'gitea' ? <><TextBox label="账号名称（选填）" value={name} onValueChanged={setName} disabled={busy} /><PasswordTextBox label="访问令牌" value={token} onValueChanged={setToken} disabled={busy} /><p className="account-entry-help">使用 Gitea 设置 → 应用中的访问令牌，允许读取用户信息和仓库。</p></> : <p className="account-entry-help">通过系统浏览器登录 {provider === 'github' ? 'GitHub' : 'GitHub Enterprise'}。</p>}
          <div className="account-form-actions"><Button type="button" disabled={disabled} onClick={() => void connect()}>{busy ? '正在连接…' : provider === 'gitea' ? '连接账号' : provider === 'github' ? '登录 GitHub' : '登录 GitHub Enterprise'}</Button></div>
        </div>
      </div>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </DialogContent>
}
