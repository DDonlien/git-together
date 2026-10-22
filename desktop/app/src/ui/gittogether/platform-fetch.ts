import type { Repository } from '../../models/repository'

export const platformFetchMinimumInterval = 5 * 60_000
type Attempt = { nextAt: number; failures: number; error?: string; pending?: Promise<void> }

/** Admission for the existing UI freshness request on non-GitHub platforms.
 * No timers or Git implementation: execution remains in Dispatcher.fetch.
 */
export class PlatformFetchGate {
  private readonly attempts = new Map<string, Attempt>()
  public constructor(private readonly now = Date.now) {}

  public async run(key: string, repo: Repository, native: {
    lastFetched: () => number
    busy: () => boolean
    fetch: () => Promise<void>
  }): Promise<{ error?: string; retryAt?: number }> {
    if (repo.gitHubRepository || repo.missing) return {}
    const previous = this.attempts.get(key)
    if (previous?.pending) await previous.pending
    const attempt = this.attempts.get(key)
    if (attempt && attempt.nextAt > this.now()) return { error: attempt.error, retryAt: attempt.error ? attempt.nextAt : undefined }
    const before = native.lastFetched()
    if (before > 0 && this.now() - before < platformFetchMinimumInterval || native.busy()) return {}
    const current: Attempt = { failures: attempt?.failures || 0, nextAt: this.now() + platformFetchMinimumInterval }
    this.attempts.set(key, current)
    current.pending = (async () => {
      try {
        await native.fetch()
        // Upstream deliberately handles some background errors internally.
        // Only a newly completed FETCH_HEAD confirms a successful fetch.
        if (native.lastFetched() <= before) throw new Error('自动 Fetch 未能完成，请检查网络、远端地址及 Git 凭据；上次同步数量已保留。')
        current.failures = 0
      } catch (problem) {
        current.failures++
        current.error = problem instanceof Error ? problem.message : '自动 Fetch 失败。'
      } finally {
        current.pending = undefined
        current.nextAt = this.now() + Math.min(30 * 60_000, platformFetchMinimumInterval * 2 ** Math.min(current.failures, 3))
      }
    })()
    await current.pending
    return { error: current.error, retryAt: current.error ? current.nextAt : undefined }
  }
}
