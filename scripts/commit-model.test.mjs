import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ChildProcess } from 'node:child_process';
import { writeFakeCodex } from './commit-model-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'desktop/package.json'));
const fixture = mkdtempSync(join(tmpdir(), 'gittogether-model-transport-'));
const mode = join(fixture, 'mode'), log = join(fixture, 'calls.jsonl');
writeFakeCodex(join(fixture, 'bin')); writeFileSync(mode, 'success');
const savedEnv = { PATH: process.env.PATH, GITTOGETHER_MODEL_MODE: process.env.GITTOGETHER_MODEL_MODE, GITTOGETHER_MODEL_LOG: process.env.GITTOGETHER_MODEL_LOG };
Object.assign(process.env, { PATH: join(fixture, 'bin') + delimiter + process.env.PATH, GITTOGETHER_MODEL_MODE: mode, GITTOGETHER_MODEL_LOG: log });
require('esbuild').buildSync({ entryPoints: [join(root, 'desktop/app/src/ui/gittogether/codex-commit-message.ts')], outfile: join(fixture, 'transport.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const { generateWithCodex } = require(join(fixture, 'transport.cjs'));
const calls = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
const savedLog = globalThis.log, warnings = [];
globalThis.log = { warn: message => warnings.push(message) };
test.beforeEach(() => { writeFileSync(mode, 'success'); warnings.length = 0; });

function denyGroupSignals(t) {
  const kill = process.kill;
  t.mock.method(process, 'kill', function(pid, ...args) {
    if (pid < 0) throw Object.assign(new Error('fixture group signal denied'), { code: 'EPERM' });
    return kill.call(this, pid, ...args);
  });
  return kill;
}

test('Codex model transport preserves prompts, selects available fast model and disables configured tools', async () => {
  const system = 'Original system prompt with "quotes"\nand JSON output.', user = '<diff-fixture>\n中文.diff\n</diff-fixture>';
  assert.deepEqual(await generateWithCodex(system, user, new AbortController().signal), { title: '生成测试提交说明', description: '保留可编辑的提交草稿。' });
  const call = calls().at(-1);
  assert.equal(call.input, user);
  assert.ok(call.args.includes('developer_instructions=' + JSON.stringify(system)));
  assert.equal(call.args[call.args.indexOf('--model') + 1], 'gpt-6-luna');
  assert.ok(call.args.includes('mcp_servers={"fixture_required"={enabled=false}}'));
  assert.ok(call.args.includes('model_reasoning_effort="low"'));
  for (const flag of ['--ephemeral', '--ignore-rules', '--skip-git-repo-check']) assert.ok(call.args.includes(flag));
  assert.equal(call.args[call.args.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(existsSync(call.cwd), false);
});
test('Codex uses the CLI recommended model when no Luna is available', async () => {
  writeFileSync(mode, 'no-luna');
  await generateWithCodex('system', 'diff', new AbortController().signal);
  assert.equal(calls().at(-1).args[calls().at(-1).args.indexOf('--model') + 1], 'fixture-default');
});
test('invalid model output and authentication failures preserve actionable errors without raw diagnostics', async () => {
  writeFileSync(mode, 'invalid');
  await assert.rejects(generateWithCodex('system', 'diff', new AbortController().signal), /格式无效/);
  writeFileSync(mode, 'auth');
  await assert.rejects(generateWithCodex('system', 'diff', new AbortController().signal), error => /登录/.test(error.message) && !/fixture-private-diagnostic/.test(error.message));
});
test('cancellation terminates only the model process and cleans its temporary output', async () => {
  writeFileSync(mode, 'hang');
  const count = calls().length, controller = new AbortController();
  const generation = generateWithCodex('system', 'diff', controller.signal);
  const rejected = assert.rejects(generation, error => error.name === 'AbortError');
  for (let i = 0; i < 100 && calls().length === count; i++) await delay(20);
  assert.equal(calls().length, count + 1);
  const call = calls().at(-1); controller.abort(); await rejected;
  assert.equal(existsSync(call.cwd), false);
  assert.throws(() => process.kill(call.pid, 0), /ESRCH/);
});
test('successful settings reads close stdin without signalling a process group', async t => {
  denyGroupSignals(t);
  assert.equal((await generateWithCodex('system', 'diff', new AbortController().signal)).title, '生成测试提交说明');
  assert.deepEqual(warnings, []);
});
test('cancellation recovers from EPERM by terminating the owned child', async t => {
  denyGroupSignals(t); writeFileSync(mode, 'hang');
  const count = calls().length, controller = new AbortController();
  const rejected = assert.rejects(generateWithCodex('system', 'diff', controller.signal), error => error.name === 'AbortError');
  for (let i = 0; i < 100 && calls().length === count; i++) await delay(20);
  assert.equal(calls().length, count + 1);
  const call = calls().at(-1); controller.abort(); await rejected;
  assert.equal(existsSync(call.cwd), false);
  assert.throws(() => process.kill(call.pid, 0), /ESRCH/);
  assert.ok(warnings.some(message => /group.*denied/.test(message)));
});
test('settings and generation timeouts remain request failures when group signals are denied', async t => {
  denyGroupSignals(t);
  const timeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => timeout(callback, ms === 20_000 || ms === 150_000 ? 300 : ms, ...args));
  for (const value of ['settings-hang', 'hang']) {
    writeFileSync(mode, value);
    await assert.rejects(generateWithCodex('system', 'diff', new AbortController().signal), /生成超时/);
  }
  const call = calls().at(-1);
  assert.equal(existsSync(call.cwd), false);
  assert.throws(() => process.kill(call.pid, 0), /ESRCH/);
  assert.equal(warnings.filter(message => /group.*denied/.test(message)).length, 2);
});
for (const kind of ['throw', 'error-event']) test(`a child termination ${kind} rejects the request without an uncaught exception`, async t => {
  const kill = denyGroupSignals(t);
  t.mock.method(ChildProcess.prototype, 'kill', function() {
    const error = Object.assign(new Error('fixture child signal denied'), { code: 'EPERM' });
    if (kind === 'throw') throw error;
    this.emit('error', error); return false;
  });
  writeFileSync(mode, 'hang');
  const count = calls().length, controller = new AbortController();
  const rejected = assert.rejects(generateWithCodex('system', 'diff', controller.signal), /无法停止 Codex CLI（EPERM）/);
  for (let i = 0; i < 100 && calls().length === count; i++) await delay(20);
  assert.equal(calls().length, count + 1);
  const call = calls().at(-1);
  t.after(() => { kill.call(process, call.pid, 'SIGKILL'); });
  controller.abort(); await rejected;
  assert.equal(existsSync(call.cwd), false);
  assert.ok(warnings.some(message => /unable to stop.*EPERM/.test(message)));
});
test.after(() => {
  if (savedLog === undefined) delete globalThis.log; else globalThis.log = savedLog;
  for (const [key, value] of Object.entries(savedEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  rmSync(fixture, { recursive: true, force: true });
});
