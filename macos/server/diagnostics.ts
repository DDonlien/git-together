import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { diagnosticCode, diagnosticFailure, sanitizeDiagnostic, uuidPattern, type DiagnosticDetails, type DiagnosticEvent, type DiagnosticInput, type DiagnosticRecord, type DiagnosticsStatus } from '../src/diagnostics-model';
import pkg from '../package.json';

const hour = 3_600_000;
const retention = 24 * hour;
const context = new AsyncLocalStorage<{ logger: LocalDiagnostics; requestId: string; spanId: string }>();
export const diagnosticsDirectory = () => join(homedir(), 'Library', 'Application Support', 'GitTogether-Standalone-Demo', 'logs');
const logName = /^diagnostics-(\d{13})-(app|preview|authorization|test)-[a-f0-9-]{36}\.jsonl$/;
const temporaryName = /^diagnostics-\d{13}-(app|preview|authorization|test)-[a-f0-9-]{36}\.jsonl\.[a-f0-9-]{36}\.tmp$/;

export class LocalDiagnostics {
  readonly session = randomUUID();
  private salt = randomBytes(32);
  private timer?: ReturnType<typeof setInterval>;
  private bytesSincePrune = 0;
  private errors: { write?: string; prune?: string } = {};
  private limited = false;
  private now: () => number;
  private maxBytes: number;
  constructor(readonly directory: string, readonly component: DiagnosticRecord['component'], options: { now?: () => number; maxBytes?: number; timer?: boolean } = {}) {
    this.now = options.now || Date.now;
    // Enforced on maintenance and every <=1 MiB of writes; process-local files
    // avoid interleaved lines. A brief <=1 MiB per-writer overshoot is possible.
    this.maxBytes = options.maxBytes ?? 128 * 1024 * 1024;
    this.prune();
    if (options.timer !== false) { this.timer = setInterval(() => this.prune(), 60_000); this.timer.unref(); }
  }
  key(value: string) { return createHmac('sha256', this.salt).update(value).digest('hex').slice(0, 24); }
  record(value: DiagnosticInput): void {
    const clean = sanitizeDiagnostic(value); if (!clean) return;
    try {
      this.prepare();
      const time = this.now();
      const record: DiagnosticRecord = { ...clean, time: new Date(time).toISOString(), version: pkg.version, component: this.component, session: this.session };
      const file = join(this.directory, `diagnostics-${Math.floor(time / hour) * hour}-${this.component}-${this.session}.jsonl`);
      if (this.exists(file)) throw Object.assign(new Error(), { code: 'ELOOP' });
      // Tiny synchronous writes preserve the last failure even if the app exits.
      const row = `${JSON.stringify(record)}\n`;
      appendFileSync(file, row, { mode: 0o600 }); chmodSync(file, 0o600);
      delete this.errors.write;
      this.bytesSincePrune += Buffer.byteLength(row);
      if (this.bytesSincePrune >= Math.min(this.maxBytes, 1_048_576)) this.prune();
    } catch (problem) { this.failure('write', problem); }
  }
  private exists(file: string) { try { return lstatSync(file).isSymbolicLink(); } catch (problem) { if (diagnosticCode(problem) === 'ENOENT') return false; throw problem; } }
  private prepare() {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    if (lstatSync(this.directory).isSymbolicLink()) throw Object.assign(new Error(), { code: 'ELOOP' });
    chmodSync(this.directory, 0o700);
  }
  private failure(stage: 'write' | 'prune', problem: unknown) {
    const code = diagnosticCode(problem);
    if (this.errors[stage] !== code) console.warn(`GitTogether diagnostics ${stage} failed: ${code}`);
    this.errors[stage] = code;
  }
  prune() {
    try {
      this.prepare(); const cutoff = this.now() - retention;
      // An interrupted boundary rewrite may leave a temporary copy. Do not
      // touch a recent copy that another process could still be renaming.
      for (const name of readdirSync(this.directory).filter(name => temporaryName.test(name))) {
        const file = join(this.directory, name); const info = lstatSync(file);
        if (info.isFile() && info.mtimeMs < this.now() - 300_000) unlinkSync(file);
      }
      const files = readdirSync(this.directory).filter(name => logName.test(name)).sort();
      for (const name of files) {
        const file = join(this.directory, name); if (lstatSync(file).isSymbolicLink()) continue;
        const start = Number(logName.exec(name)![1]);
        if (start + hour <= cutoff) { unlinkSync(file); continue; }
        // Only the 24-hour boundary hour can contain both expired and live rows.
        // It is never being appended to by a normally running writer.
        if (start <= cutoff) {
          const original = readFileSync(file, 'utf8');
          const rows = original.split('\n').filter(row => {
            if (!row) return false;
            try { const entry = JSON.parse(row); return sanitizeDiagnostic(entry) !== null && typeof entry.time === 'string' && Number.isFinite(Date.parse(entry.time)) && Date.parse(entry.time) >= cutoff; }
            catch { return false; }
          });
          const retained = rows.length ? `${rows.join('\n')}\n` : '';
          if (!retained) unlinkSync(file);
          else if (retained !== original) { const temporary = `${file}.${this.session}.tmp`; writeFileSync(temporary, retained, { mode: 0o600 }); renameSync(temporary, file); }
        }
      }
      const retained = readdirSync(this.directory).filter(name => logName.test(name)).map(name => ({ name, file: join(this.directory, name) })).filter(item => !lstatSync(item.file).isSymbolicLink()).map(item => ({ ...item, size: statSync(item.file).size })).sort((a, b) => a.name.localeCompare(b.name));
      let size = retained.reduce((sum, item) => sum + item.size, 0);
      for (const item of retained) { if (size <= this.maxBytes) break; unlinkSync(item.file); size -= item.size; this.limited = true; }
      delete this.errors.prune;
      this.bytesSincePrune = 0;
    } catch (problem) { if (diagnosticCode(problem) !== 'ENOENT') this.failure('prune', problem); /* Another writer may just have pruned the same expired file. */ }
  }
  status(): DiagnosticsStatus { this.prune(); return { directory: this.directory, retentionHours: 24, maxBytes: this.maxBytes, limited: this.limited, error: Object.entries(this.errors).map(([stage, code]) => `日志${stage === 'write' ? '写入' : '清理'}失败（${code}），记录可能不完整。`).join(' ') }; }
  files(): string[] {
    const status = this.status(); if (status.error) throw new Error(status.error);
    return readdirSync(this.directory).filter(name => logName.test(name)).sort().map(name => join(this.directory, name)).filter(file => lstatSync(file).isFile());
  }
  close() { clearInterval(this.timer); this.prune(); }
  async run<T>(event: DiagnosticEvent, details: DiagnosticDetails, action: () => Promise<T>, requestId?: string, failuresOnly = false): Promise<T> {
    const parent = context.getStore(); const id = requestId && uuidPattern.test(requestId) ? requestId : parent?.requestId || randomUUID();
    const spanId = randomUUID(); const fields = { ...details, requestId: id, spanId, ...(parent ? { parentId: parent.spanId } : {}) };
    const started = performance.now(); if (!failuresOnly) this.record({ event, outcome: 'start', ...fields });
    return context.run({ logger: this, requestId: id, spanId }, async () => {
      try { const result = await action(); if (!failuresOnly) this.record({ event, outcome: 'success', ...fields, durationMs: Math.round(performance.now() - started) }); return result; }
      catch (problem) { const failure = diagnosticFailure(problem); this.record({ event, outcome: failure.code === 'aborted' ? 'cancelled' : 'failure', ...fields, ...failure, ...(event === 'git-read' && failure.code === 'unknown' ? { code: 'git' } : {}), durationMs: Math.round(performance.now() - started) }); throw problem; }
    });
  }
}
export function traceOperation<T>(event: DiagnosticEvent, details: DiagnosticDetails, action: () => Promise<T>, failuresOnly = false): Promise<T> {
  return context.getStore()?.logger.run(event, details, action, undefined, failuresOnly) || action();
}
export function recordDiagnostic(value: DiagnosticInput) { const current = context.getStore(); current?.logger.record({ ...value, requestId: current.requestId, parentId: current.spanId }); }
export function gitDetails(path: string, args: string[]): DiagnosticDetails {
  const verb = args[0];
  return { verb: ['status', 'log', 'diff', 'worktree', 'ls-tree', 'ls-files', 'rev-parse', 'for-each-ref', 'config'].includes(verb) ? verb as DiagnosticDetails['verb'] : 'other', ...(context.getStore() ? { resource: context.getStore()!.logger.key(path) } : {}) };
}
