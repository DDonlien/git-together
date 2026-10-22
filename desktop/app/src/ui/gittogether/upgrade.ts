import * as fs from 'fs/promises'
import * as Path from 'path'
import { AccountsStore } from '../../lib/stores/accounts-store'
import { fetchUser, getEndpointForRepository } from '../../lib/api'
import { getPath } from '../main-process-proxy'
import { DesktopAdapter } from './adapter'
import { PresenceHost } from './presence-host'

/** One-time import through original stores. The encrypted legacy file is never rewritten. */
export async function upgradeLegacy(adapter: DesktopAdapter, presence: PresenceHost, accounts: AccountsStore) {
  if (__RELEASE_CHANNEL__ === 'development') return
  const root = await getPath('userData')
  const marker = Path.join(root, 'desktop-upgrade-v1.json')
  try { await fs.access(marker); return } catch (error) { if (error.code !== 'ENOENT') throw error }
  const response = await presence.command('internal', 'legacyAccounts', {}) as { ok: boolean; value?: { version: number; accounts: { account: { provider: string; host: string; login: string; name: string }; token: string }[]; links: { path: string; worktrees?: { path: string }[] }[] }; error?: string }
  if (!response.ok) throw new Error(response.error || '旧版配置读取失败，原配置已保留。')
  const saved = response.value
  if (saved) {
    if (saved.version !== 2 || !Array.isArray(saved.accounts) || !Array.isArray(saved.links)) throw new Error('旧版配置格式无效，原配置已保留。')
    for (const entry of saved.accounts) {
      const account = entry.account
      if (account.provider === 'gitea') {
        if (!(await adapter.gitea.snapshot()).accounts.some(a => a.host === account.host && a.login === account.login)) {
          await adapter.gitea.connect({ provider: 'gitea', host: account.host, name: account.name, token: entry.token })
        }
      } else if (account.provider === 'github' || account.provider === 'github-enterprise') {
        const endpoint = getEndpointForRepository(account.host)
        if (!(await accounts.getAll()).some(a => a.endpoint === endpoint && a.login === account.login)) {
          if (!await accounts.addAccount(await fetchUser(endpoint, entry.token))) throw new Error('旧版账号无法保存，原配置已保留。')
        }
      }
    }
    const paths = [...new Set(saved.links.flatMap(link => [link.path, ...(link.worktrees || []).map(tree => tree.path)]))]
    for (const path of paths) {
      if (!Path.isAbsolute(path)) throw new Error('旧版工作目录路径无效，原配置已保留。')
      if (adapter.repositories().some(repo => repo.path === path)) continue
      try { if (!(await fs.stat(path)).isDirectory()) continue } catch (error) { if (error.code === 'ENOENT') continue; throw error }
      await adapter.dispatcher.addRepositories([path])
    }
  }
  const temporary = marker + '.tmp'
  await fs.writeFile(temporary, JSON.stringify({ version: 1, importedAt: new Date().toISOString() }), { mode: 0o600 })
  await fs.rename(temporary, marker)
}
