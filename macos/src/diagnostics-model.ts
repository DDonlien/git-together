// Logs are a finite diagnostic protocol, not a sink for arbitrary messages.
export const diagnosticMethods = ['fetchRepository', 'prepareSync', 'applySync', 'discardSync', 'submitCommit', 'pushCommit', 'submit', 'generateCommitMessage', 'cancelCommitGeneration', 'status', 'catalog', 'connect', 'updateAccount', 'refresh', 'removeAccount', 'matchAccountRepositories', 'link', 'downloadBranch', 'unlink', 'snapshot', 'localWorkspace', 'localCommit', 'remoteWorkspace', 'remoteCommit', 'remoteFile', 'openFile', 'openDirectory', 'diff', 'githubAuthStart', 'githubAuthPoll', 'githubAuthCancel', 'start', 'poll', 'cancel', 'open', 'check', 'download', 'install', 'commit', 'fetch', 'pull', 'push', 'latest', 'reconcile', 'clear', 'hide', 'restore', 'chooseDirectory', 'preferences'] as const;
export const diagnosticEvents = ['lifecycle', 'api', 'provider-read', 'git-read', 'git-write', 'storage', 'authorization', 'update', 'refresh', 'renderer', 'ui-action'] as const;
export const diagnosticOutcomes = ['start', 'success', 'partial', 'failure', 'cancelled', 'paused', 'resumed', 'retry', 'online', 'offline', 'hidden', 'visible', 'blocked', 'received', 'accepted', 'complete', 'rejected', 'failed', 'current', 'available', 'ready', 'installing'] as const;
export const diagnosticCodes = ['unknown', 'aborted', 'timeout', 'connection', 'permission', 'rate-limit', 'certificate', 'invalid-data', 'version', 'session', 'git', 'git-lfs-missing', 'ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EIO', 'ELOOP', 'EEXIST', 'ENOTDIR', 'EADDRINUSE', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND', 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS', 'ERR_UPDATER_INVALID_RELEASE_FEED', 'ERR_XML_MISSED_ELEMENT', 'ERR_UPDATER_ZIP_FILE_NOT_FOUND', 'ERR_UPDATER_SHA512_CHECKSUM_MISMATCH', 'ERR_UPDATER_INVALID_SIGNATURE', 'ERR_UPDATER_INVALID_ZIP', 'INVALID_LOG', 'LOG_CAPACITY'] as const;
export type DiagnosticCode = typeof diagnosticCodes[number];
export type DiagnosticEvent = typeof diagnosticEvents[number];
export type DiagnosticOutcome = typeof diagnosticOutcomes[number];
export type DiagnosticDetails = { method?: typeof diagnosticMethods[number]; provider?: 'github' | 'gitea'; endpoint?: 'identity' | 'repositories' | 'branches' | 'history' | 'tree' | 'commit' | 'file' | 'classification' | 'other'; verb?: 'status' | 'log' | 'diff' | 'worktree' | 'ls-tree' | 'ls-files' | 'rev-parse' | 'for-each-ref' | 'config' | 'other'; code?: DiagnosticCode; httpStatus?: number; durationMs?: number; retryMs?: number; failures?: number; tasks?: number; exitCode?: number; signal?: 'SIGTERM' | 'SIGKILL' | 'SIGABRT' | 'SIGSEGV'; errorKind?: 'Error' | 'TypeError' | 'SyntaxError' | 'RangeError' | 'ReferenceError' | 'AbortError' | 'TimeoutError'; resource?: string; requestId?: string; spanId?: string; parentId?: string };
export type DiagnosticInput = DiagnosticDetails & { event: DiagnosticEvent; outcome: DiagnosticOutcome };
export type DiagnosticRecord = DiagnosticInput & { time: string; version: string; component: 'app' | 'preview' | 'authorization' | 'test'; session: string };
export type DiagnosticsStatus = { directory: string; retentionHours: 24; maxBytes: number; limited: boolean; error: string };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const member = (value: unknown, list: readonly string[]) => typeof value === 'string' && list.includes(value);

export function diagnosticCode(problem: unknown): DiagnosticCode {
  const object = problem && typeof problem === 'object' ? problem as Record<string, unknown> : {};
  const cause = object.cause && typeof object.cause === 'object' ? object.cause as Record<string, unknown> : object;
  if (member(cause.code, diagnosticCodes)) return cause.code as DiagnosticCode;
  if (member(object.code, diagnosticCodes)) return object.code as DiagnosticCode;
  if (object.name === 'AbortError') return 'aborted';
  if (object.name === 'SecurityError') return 'permission';
  if (object.name === 'QuotaExceededError') return 'ENOSPC';
  if (object.name === 'TimeoutError' || object.killed === true) return 'timeout';
  // Match our public, safe error categories without ever saving their text.
  const text = typeof problem === 'string' ? problem : typeof object.message === 'string' ? object.message : '';
  for (const code of diagnosticCodes) if (code.length > 3 && text.includes(`（${code}）`)) return code;
  if (/超时|timeout/i.test(text)) return 'timeout';
  if (/证书|certificate/i.test(text)) return 'certificate';
  if (/频率|限流/.test(text)) return 'rate-limit';
  if (/权限|令牌无效|已过期|拒绝读取/.test(text)) return 'permission';
  if (/版本不一致|版本不匹配/.test(text)) return 'version';
  if (/断开|无法连接|连接中断/.test(text)) return 'connection';
  if (/格式无效|无效.*数据|响应过大/.test(text)) return 'invalid-data';
  if (/Git 读取|Git 目录/.test(text)) return 'git';
  return 'unknown';
}
export function diagnosticFailure(problem: unknown): DiagnosticDetails {
  const object = problem && typeof problem === 'object' ? problem as Record<string, unknown> : {};
  return { code: diagnosticCode(problem), ...(typeof object.status === 'number' ? { httpStatus: object.status } : {}), ...(typeof object.code === 'number' ? { exitCode: object.code } : {}), ...(member(object.signal, ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV']) ? { signal: object.signal as DiagnosticDetails['signal'] } : {}), ...(member(object.name, ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'AbortError', 'TimeoutError']) ? { errorKind: object.name as DiagnosticDetails['errorKind'] } : {}) };
}

export function sanitizeDiagnostic(value: unknown): DiagnosticInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (!member(input.event, diagnosticEvents) || !member(input.outcome, diagnosticOutcomes)) return null;
  const result: DiagnosticInput = { event: input.event as DiagnosticEvent, outcome: input.outcome as DiagnosticOutcome };
  if (member(input.method, diagnosticMethods)) result.method = input.method as DiagnosticDetails['method'];
  if (member(input.provider, ['github', 'gitea'])) result.provider = input.provider as 'github' | 'gitea';
  if (member(input.endpoint, ['identity', 'repositories', 'branches', 'history', 'tree', 'commit', 'file', 'classification', 'other'])) result.endpoint = input.endpoint as DiagnosticDetails['endpoint'];
  if (member(input.verb, ['status', 'log', 'diff', 'worktree', 'ls-tree', 'ls-files', 'rev-parse', 'for-each-ref', 'config', 'other'])) result.verb = input.verb as DiagnosticDetails['verb'];
  if (member(input.code, diagnosticCodes)) result.code = input.code as DiagnosticCode;
  if (typeof input.exitCode === 'number' && Number.isInteger(input.exitCode) && input.exitCode >= 0 && input.exitCode <= 255) result.exitCode = input.exitCode;
  if (member(input.signal, ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV'])) result.signal = input.signal as DiagnosticDetails['signal'];
  if (member(input.errorKind, ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'AbortError', 'TimeoutError'])) result.errorKind = input.errorKind as DiagnosticDetails['errorKind'];
  for (const key of ['durationMs', 'retryMs', 'failures', 'tasks'] as const) if (typeof input[key] === 'number' && Number.isSafeInteger(input[key]) && input[key] >= 0 && input[key] <= 1e12) result[key] = input[key];
  if (typeof input.httpStatus === 'number' && Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599) result.httpStatus = input.httpStatus;
  if (typeof input.resource === 'string' && /^[a-f0-9]{24}$/.test(input.resource)) result.resource = input.resource;
  for (const key of ['requestId', 'spanId', 'parentId'] as const) if (typeof input[key] === 'string' && uuidPattern.test(input[key])) result[key] = input[key];
  return result;
}

export function rendererDiagnostic(value: unknown): DiagnosticInput | null {
  const input = sanitizeDiagnostic(value);
  if (!input || !['api', 'refresh', 'renderer', 'ui-action'].includes(input.event)) return null;
  // Renderer strings/IDs are not trusted resource identities or server spans.
  delete input.resource; delete input.spanId; delete input.parentId;
  return input;
}
