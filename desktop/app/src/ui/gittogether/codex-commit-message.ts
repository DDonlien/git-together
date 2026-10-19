import { spawn } from 'child_process'
import * as fs from 'fs/promises'
import { constants } from 'fs'
import * as Path from 'path'
import { homedir, tmpdir } from 'os'
import { parseCopilotCommitMessage, ICopilotCommitMessage } from '../../lib/copilot-commit-message'

const disabledFeatures = ['shell_tool', 'unified_exec', 'multi_agent', 'apps', 'plugins', 'hooks']
const featureArgs = disabledFeatures.flatMap(feature => ['--disable', feature])

async function codexBinary(): Promise<string> {
  const executable = process.platform === 'win32' ? 'codex.exe' : 'codex'
  const candidates = (process.env.PATH || '').split(Path.delimiter).filter(Boolean).map(path => Path.join(path, executable))
  candidates.push(...[
    Path.join(homedir(), '.local/bin', executable),
    '/opt/homebrew/bin/codex', '/usr/local/bin/codex',
    '/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
  ])
  if (process.platform === 'win32') {
    const cache = Path.join(homedir(), '.codex/bin')
    try {
      for (const entry of await fs.readdir(cache)) candidates.push(Path.join(cache, entry, executable))
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  for (const candidate of candidates) {
    try { await fs.access(candidate, constants.X_OK); return candidate }
    catch (error) { if (!['ENOENT', 'EACCES', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) throw error }
  }
  throw new Error('未找到 Codex CLI，请安装并在本机登录 Codex 后重试；也可手工填写说明。')
}

function cliFailure(diagnostic: string): Error {
  if (/unauthorized|unauthenticated|not logged|authentication|401|login required/i.test(diagnostic)) return new Error('Codex CLI 尚未登录或登录已失效，请在本机重新登录 Codex 后重试。')
  if (/usage limit|rate.limit|quota|429|insufficient_quota/i.test(diagnostic)) return new Error('Codex 当前额度或请求频率受限，请稍后重试或手工填写说明。')
  if (/model.*(?:not found|not supported|not available|access)|unsupported.*model/i.test(diagnostic)) return new Error('Codex 当前账号无法使用所选模型，请更新 CLI 或检查模型权限后重试。')
  if (/unexpected argument|unrecognized|unknown variant|unknown field/i.test(diagnostic)) return new Error('本机 Codex CLI 版本不支持提交说明接口，请更新 CLI 后重试。')
  return new Error('Codex CLI 未能生成提交说明，请检查本机登录和网络后重试；原草稿已保留。')
}

/** No shell command or renderer-controlled executable can enter this transport. */
function invoke(binary: string, args: string[], directory: string, input: string, signal: AbortSignal, timeout: number, complete?: (stdout: string) => boolean): Promise<string> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: directory, env: process.env, stdio: 'pipe', windowsHide: true, detached: process.platform !== 'win32' })
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    let stdout = '', stderr = '', size = 0, completed = false, stopping = false, settled = false, failure: unknown
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer); signal.removeEventListener('abort', abort)
      if (failure) reject(failure)
      else if (completed || code === 0) resolve(stdout)
      else reject(cliFailure(stderr))
    }
    const stopFailed = (error: unknown) => {
      if (settled) return
      const code = (error as NodeJS.ErrnoException).code || 'unknown'
      log.warn(`GitTogether: unable to stop the Codex CLI (${code}).`)
      failure = new Error(`无法停止 Codex CLI（${code}），请重启 GitTogether 后重试；原草稿已保留。`)
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy()
      finish(null)
    }
    const stopChild = () => {
      try { child.kill('SIGKILL') }
      catch (error) { stopFailed(error) }
    }
    const stop = () => {
      if (stopping || settled || !child.pid) return
      stopping = true
      if (process.platform === 'win32') {
        try {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          killer.once('error', stopChild)
          killer.once('exit', code => { if (code !== 0) stopChild() })
        } catch { stopChild() }
      } else {
        try { process.kill(-child.pid, 'SIGKILL') }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          // A native host can deny group signals even for our own child. Its
          // process handle still permits terminating this specific request.
          if (code === 'EPERM' || code === 'ESRCH') {
            if (code === 'EPERM') log.warn('GitTogether: Codex process-group signal denied; stopping the child directly.')
            stopChild()
          } else stopFailed(error)
        }
      }
    }
    const abort = () => { failure = signal.reason; stop() }
    const timer = setTimeout(() => { failure = new Error('Codex 提交说明生成超时，请稍后重试；原草稿已保留。'); stop() }, timeout)
    signal.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (text: string) => {
      if (stopping || settled) return
      size += Buffer.byteLength(text)
      if (size > 2_000_000) { failure = new Error('Codex 返回内容过大，原草稿已保留。'); stop(); return }
      stdout += text
      if (complete && !completed) {
        // app-server exits on EOF; successful reads need no process signal.
        try { if (complete(stdout)) { completed = true; child.stdin.end() } }
        catch (error) { failure = error; stop() }
      }
    })
    child.stderr.on('data', (text: string) => { if (stopping || settled) return; size += Buffer.byteLength(text); stderr += text; if (size > 2_000_000) { failure = new Error('Codex 返回内容过大，原草稿已保留。'); stop() } })
    child.stdin.on('error', error => { if (completed || stopping || settled) return; failure = error; stop() })
    child.on('error', error => {
      if (stopping) { stopFailed(error); return }
      failure = (error as NodeJS.ErrnoException).code === 'ENOENT' ? new Error('无法启动 Codex CLI，请检查安装后重试。') : error
      finish(null)
    })
    child.once('close', finish)
    if (complete) child.stdin.write(input)
    else child.stdin.end(input)
    if (signal.aborted) abort()
  })
}

async function settings(binary: string, directory: string, signal: AbortSignal): Promise<{ model: string; servers: string[] }> {
  const input = [
    { id: 0, method: 'initialize', params: { clientInfo: { name: 'gittogether_commit', version: '1' } } },
    { method: 'initialized', params: {} },
    { id: 1, method: 'config/read', params: { includeLayers: false } },
    { id: 2, method: 'model/list', params: { limit: 100, includeHidden: false } },
  ].map(message => JSON.stringify(message) + '\n').join('')
  type Response = { id?: number; error?: unknown; result?: { config?: { mcp_servers?: Record<string, unknown> }; data?: { model: string; isDefault?: boolean }[] } }
  const responses = (stdout: string): Response[] => stdout.split('\n').slice(0, -1).filter(Boolean).map(line => JSON.parse(line) as Response)
  const stdout = await invoke(binary, ['app-server', ...featureArgs], directory, input, signal, 20_000, text => {
    const messages = responses(text)
    if (messages.some(message => message.error)) throw new Error('Codex 无法读取可用模型或配置，请更新 CLI 后重试。')
    return messages.some(message => message.id === 1) && messages.some(message => message.id === 2)
  })
  const messages = responses(stdout)
  const config = messages.find(message => message.id === 1)?.result?.config
  const models = messages.find(message => message.id === 2)?.result?.data
  if (!config || !Array.isArray(models)) throw new Error('Codex CLI 模型或配置返回格式无效，请更新 CLI 后重试。')
  const version = (model: string) => model.match(/^gpt-(\d+)(?:\.(\d+))?(?:\.(\d+))?-luna(?:-|$)/)?.slice(1).map(part => Number(part || 0))
  const luna = models.filter(model => version(model.model)).sort((a, b) => {
    const left = version(a.model)!, right = version(b.model)!
    return right[0] - left[0] || right[1] - left[1] || right[2] - left[2]
  })[0]
  const model = luna?.model || models.find(model => model.isDefault)?.model
  if (!model) throw new Error('Codex CLI 未提供可用模型，请检查本机登录后重试。')
  return { model, servers: Object.keys(config.mcp_servers || {}) }
}

export async function generateWithCodex(systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<ICopilotCommitMessage> {
  const binary = await codexBinary()
  const directory = await fs.mkdtemp(Path.join(tmpdir(), 'gittogether-commit-model-'))
  try {
    const { model, servers } = await settings(binary, directory, signal)
    signal.throwIfAborted()
    const schema = Path.join(directory, 'schema.json'), output = Path.join(directory, 'message.json')
    await fs.writeFile(schema, JSON.stringify({ type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, description: { type: 'string' } }, required: ['title', 'description'] }), { mode: 0o600 })
    // Empty table overrides merge with config; disable every configured server.
    const disabledServers = servers.map(server => `${JSON.stringify(server)}={enabled=false}`).join(',')
    await invoke(binary, ['exec', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', ...featureArgs,
      '-c', 'web_search="disabled"', '-c', `mcp_servers={${disabledServers}}`, '-c', 'model_reasoning_effort="low"',
      '-c', `developer_instructions=${JSON.stringify(systemPrompt)}`, '--model', model,
      '--cd', directory, '--output-schema', schema, '--output-last-message', output, '--color', 'never', '-'], directory, userPrompt, signal, 150_000)
    signal.throwIfAborted()
    try {
      if ((await fs.stat(output)).size > 32_768) throw new Error('Generated message exceeds the response limit.')
      return parseCopilotCommitMessage(await fs.readFile(output, 'utf8'))
    } catch {
      throw new Error('Codex 返回的提交说明格式无效，请重试或手工填写；原草稿已保留。')
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
}
