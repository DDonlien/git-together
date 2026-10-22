import * as fs from 'fs/promises'
import * as Path from 'path'
import { tmpdir } from 'os'
import { API } from '../../lib/api'
import { git } from '../../lib/git'
import { getAccountForCommitMessageGeneration } from '../../lib/get-account-for-repository'
import { enableCopilotSdkCommitMessageGeneration } from '../../lib/feature-flag'
import { getBYOKSecret, parseModelKey } from '../../lib/copilot/byok'
import { CopilotStore, CopilotModelRequest, getCopilotAccountCacheKey, buildCommitMessageSystemPrompt, buildCommitMessageUserPrompt, generateCommitMessagePromptTags, getCleanedEnforcedRuleDescriptions } from '../../lib/stores/copilot-store'
import type { ApiInputs } from '../../../../../macos/src/import-model'
import type { Account } from '../../models/account'
import type { ICopilotCommitMessage } from '../../lib/copilot-commit-message'
import type { DesktopAdapter } from './adapter'
import { generateWithCodex } from './codex-commit-message'
import { CopilotCommitConsent } from './copilot-commit-consent'

type GenerateInput = ApiInputs['generateCommitMessage']
type Pending = { input: GenerateInput; controller: AbortController }

/** Model calls only. Git execution and commit/push remain in Desktop. */
export class CommitMessageGenerator {
  private readonly pending = new Map<string, Pending>()
  private readonly consent: CopilotCommitConsent
  public constructor(private readonly desktop: DesktopAdapter, public readonly copilot: CopilotStore) {
    this.consent = new CopilotCommitConsent(desktop)
    window.addEventListener('beforeunload', () => { for (const entry of this.pending.values()) entry.controller.abort() })
  }
  public cancel(input: ApiInputs['cancelCommitGeneration']) {
    const entry = this.pending.get(input.generationId)
    if (!entry || entry.input.repositoryId !== input.repositoryId || entry.input.taskId !== input.taskId) return { cancelled: false }
    entry.controller.abort()
    return { cancelled: true }
  }
  private async modelRequest(account: Account): Promise<CopilotModelRequest | null> {
    const state = this.desktop.store.getState()
    const selection = state.selectedCopilotModelsByAccount.get(getCopilotAccountCacheKey(account))?.['commit-message-generation']
    if (!selection) return null
    const key = parseModelKey(selection)
    if (key.kind === 'copilot') return { kind: 'copilot', modelId: key.modelId || null }
    const provider = state.byokProviders.find(provider => provider.id === key.providerId)
    const model = provider?.models.find(model => model.id === key.modelId)
    if (!provider || !model) return null
    const secret = provider.authKind === 'none' ? null : await getBYOKSecret(provider.id)
    if (provider.authKind !== 'none' && !secret) throw new Error('原版自定义模型凭据不可用。')
    return { kind: 'byok', modelId: model.id, reasoningEffort: model.reasoningEffort, ...(provider.requestTimeoutSeconds && provider.requestTimeoutSeconds > 0 ? { timeoutMs: provider.requestTimeoutSeconds * 1000 } : {}),
      provider: { type: provider.type, baseUrl: provider.baseUrl, ...(provider.wireApi ? { wireApi: provider.wireApi } : {}),
        ...(provider.type === 'azure' && provider.azureApiVersion ? { azure: { apiVersion: provider.azureApiVersion } } : {}),
        ...(provider.authKind === 'apiKey' && secret ? { apiKey: secret } : {}), ...(provider.authKind === 'bearer' && secret ? { bearerToken: secret } : {}) } }
  }
  public async generate(input: GenerateInput): Promise<{ summary: string; description: string }> {
    if (typeof input.generationId !== 'string' || !input.generationId || input.generationId.length > 128) throw new Error('生成请求编号无效。')
    if (this.pending.has(input.generationId) || [...this.pending.values()].some(entry => entry.input.repositoryId === input.repositoryId && entry.input.taskId === input.taskId)) throw new Error('此工作目录正在生成提交说明，请等待或取消后重试。')
    const controller = new AbortController(), { signal } = controller
    this.pending.set(input.generationId, { input, controller })
    let temporary: string | undefined
    try {
      const repo = await this.desktop.checked(input)
      signal.throwIfAborted()
      const state = this.desktop.cache.get(repo)
      const allFiles = state.changesState.workingDirectory.files
      if (input.paths && (!Array.isArray(input.paths) || input.paths.some(path => typeof path !== 'string' || !allFiles.some(file => file.path === path)))) throw new Error('选中文件已变化，请重新选择后生成。')
      const files = allFiles.filter(file => !input.paths || input.paths.includes(file.path))
      if (!files.length) throw new Error('请先选择需要生成说明的更改。')
      temporary = await fs.mkdtemp(Path.join(tmpdir(), 'gittogether-commit-diff-'))
      const env = { GIT_INDEX_FILE: Path.join(temporary, 'index'), GIT_LITERAL_PATHSPECS: '1' }
      // Upstream getFilesDiffText resets/stages the real index. Reproduce its
      // selected-file patch format in a private index so generation keeps staging.
      await git(input.expectedHead ? ['read-tree', input.expectedHead] : ['read-tree', '--empty'], repo.path, 'getFilesDiffText', { env })
      const paths = [...new Set(files.flatMap(file => 'oldPath' in file.status && file.status.oldPath ? [file.status.oldPath, file.path] : [file.path]))]
      await git(['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], repo.path, 'getFilesDiffText', { env, stdin: paths.join('\0') + '\0' })
      signal.throwIfAborted()
      const amend = state.commitToAmend?.sha
      const result = await git(['diff', '--no-ext-diff', '--patch-with-raw', '--no-color', '--staged', ...(amend ? [`${amend}^`] : [])], repo.path, 'getFilesDiffText', { env, encoding: 'buffer' })
      if (result.stdout.length > 10 * 1024 * 1024) throw new Error('选中差异超过10MB，请缩小文件范围后生成。')
      const diff = result.stdout.toString('utf8')
      if (!diff.trim()) throw new Error('选中范围没有可生成说明的差异。')
      await this.desktop.checked(input)
      signal.throwIfAborted()
      const rules = state.changesState.currentRepoRulesInfo?.commitMessagePatterns.getRules() || []
      const account = getAccountForCommitMessageGeneration(this.desktop.store.getState().accounts, repo)
      let message: ICopilotCommitMessage | undefined
      if (account) {
        if (!await this.consent.request(signal)) controller.abort()
        signal.throwIfAborted()
        try {
          message = enableCopilotSdkCommitMessageGeneration(account)
            ? await this.copilot.generateCommitMessage(account, diff, repo.path, await this.modelRequest(account), rules, signal)
            : await API.fromAccount(account).getDiffChangesCommitMessage(diff)
        } catch (error) {
          if (signal.aborted) throw error
          log.warn('GitTogether: Copilot generation unavailable; using the local Codex CLI.')
        }
      }
      signal.throwIfAborted()
      if (!message) {
        const tags = generateCommitMessagePromptTags()
        const descriptions = getCleanedEnforcedRuleDescriptions(rules)
        message = await generateWithCodex(buildCommitMessageSystemPrompt(descriptions.length > 0, tags), buildCommitMessageUserPrompt(diff, tags, descriptions), signal)
      }
      const draft = { summary: message.title.trim(), description: message.description.trim() }
      if (!draft.summary || draft.summary.length > 500 || /[\r\n\0]/.test(draft.summary) || draft.description.length > 20_000 || draft.description.includes('\0') || Buffer.byteLength(JSON.stringify(draft)) > 24_000) throw new Error('模型返回的提交说明格式无效，原草稿已保留。')
      await this.desktop.checked(input)
      signal.throwIfAborted()
      return draft
    } catch (error) {
      if (signal.aborted) throw new Error('提交说明生成已取消，原草稿已保留。')
      throw error
    } finally {
      this.pending.delete(input.generationId)
      if (temporary) await fs.rm(temporary, { recursive: true, force: true })
    }
  }
}
