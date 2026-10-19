import { randomBytes } from 'crypto'
import { TokenStore } from '../../lib/stores/token-store'

export const presenceStorageService = 'GitTogether Presence Safe Storage'

export class PresenceStorage {
  private readonly keys = new Map<boolean, Promise<string>>()
  public constructor(private readonly account: string) {}

  public async key(legacy: boolean, create: boolean): Promise<string> {
    const pending = this.keys.get(legacy)
    if (pending) return pending
    const request = (async () => {
      const service = legacy ? 'GitTogether Safe Storage' : presenceStorageService
      const account = legacy ? 'GitTogether' : this.account
      let value: string | null
      try {
        value = await TokenStore.getItem(service, account)
        if (value === null && create && !legacy) {
          value = randomBytes(32).toString('base64')
          await TokenStore.setItem(service, account, value)
        }
      } catch {
        throw new Error('无法访问 Presence 系统安全存储，请允许系统钥匙串访问后重试；原配置已保留。')
      }
      if (!value) throw new Error('Presence 加密密钥不存在；原配置已保留，请恢复系统安全存储后重试。')
      return value
    })()
    this.keys.set(legacy, request)
    try { return await request }
    catch (error) { this.keys.delete(legacy); throw error }
  }
}
