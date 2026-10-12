import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const repository = 'DDonlien/git-together';
const workflow = 'windows-package.yml';

export interface WindowsPackage {
  version: string; sourceCommit: string; architecture: 'x86' | 'x64';
  platform: 'windows-i686' | 'windows-x86_64'; installerPath: string;
  signaturePath: string; signature: string; sha256: string; size: number;
  applicationMachine: number; applicationSha256: string;
  nativeValidationPassed: true; installerVerified: true; interfaceStarted: true; runId: number;
  authenticodeSigned: boolean;
}
interface Run { id: number; head_sha: string; display_title?: string; status: string; conclusion: string | null; html_url: string; event: string }
function transient(error: unknown) {
  return !!(error as { killed?: boolean } | null)?.killed || /TLS handshake timeout|i\/o timeout|connection reset|temporary failure|\bEOF\b|HTTP 50[234]/i.test(error instanceof Error ? error.message : String(error));
}
async function cli(cwd: string, args: string[]) {
  for (let attempt = 0; ; attempt++) {
    try { return (await execute('gh', args, { cwd, timeout: args[0] === 'run' && args[1] === 'download' ? 600_000 : 120_000, maxBuffer: 1024 * 1024 })).stdout; }
    catch (error) {
      // Only read-only API calls retry here. Artifact retries use fresh output
      // directories below; an uncertain dispatch is never sent a second time.
      if (args[0] !== 'api' || args.length !== 2 || attempt === 2 || !transient(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}
async function tool(cwd: string, command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${basename(command)}校验失败（${code}）。`)));
  });
}
export function verifyWindowsPackages(packages: WindowsPackage[] | undefined, version: string, commit: string) {
  if (!packages || packages.length !== 2) throw new Error('正式发布需要Windows x86和x64两个已验证安装包。');
  for (const arch of ['x86', 'x64'] as const) {
    const matches = packages.filter(p => p.architecture === arch);
    const platform = arch === 'x86' ? 'windows-i686' : 'windows-x86_64';
    const expected = `GitTogether-${version}-Windows-${arch}-setup.exe`;
    if (matches.length !== 1 || matches[0].version !== version || matches[0].sourceCommit !== commit ||
      matches[0].platform !== platform || basename(matches[0].installerPath) !== expected ||
      matches[0].applicationMachine !== (arch === 'x86' ? 0x14c : 0x8664) || !matches[0].nativeValidationPassed ||
      !matches[0].installerVerified || !matches[0].interfaceStarted || !matches[0].signature || matches[0].size <= 0 || !/^[a-f0-9]{64}$/.test(matches[0].sha256)) throw new Error(`Windows ${arch}安装包来源、架构或实际验收不符合发布要求。`);
  }
}

/** CI builds without secrets; final updater signing remains on the release Mac. */
export async function buildWindowsPackages(clientRoot: string, version: string, sourceCommit: string, output: string, signingKey: string, verifier: string): Promise<WindowsPackage[]> {
  const matchesSource = (run: Run) => run.event === 'workflow_dispatch' && (run.head_sha === sourceCommit || run.display_title === `Windows ${sourceCommit}`);
  const runsPath = `repos/${repository}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=20`;
  const recent = async () => (JSON.parse(await cli(clientRoot, ['api', runsPath])) as { workflow_runs: Run[] }).workflow_runs
    .filter(matchesSource);
  const available = await recent();
  let run = available.find(run => run.conclusion === 'success') ?? available.find(run => ['queued', 'in_progress', 'waiting', 'pending'].includes(run.status));
  if (!run) {
    await cli(clientRoot, ['workflow', 'run', workflow, '--repo', repository, '--ref', 'main', '-f', 'source_commit=' + sourceCommit]);
    for (let attempt = 0; attempt < 12 && !run; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      run = (await recent())[0];
    }
    if (!run) throw new Error('Windows构建已请求，但没有找到本次main源码的工作流。');
  }
  console.log(`Windows双架构构建：${run.html_url}`);
  const deadline = Date.now() + 60 * 60_000;
  let previous = '';
  while (run.status !== 'completed') {
    if (Date.now() >= deadline) throw new Error('Windows双架构构建超时，停止正式发布；可以在原构建完成后重试。');
    const jobs = JSON.parse(await cli(clientRoot, ['api', `repos/${repository}/actions/runs/${run.id}/jobs`])) as { jobs: { name: string; status: string; steps: { name: string; status: string }[] }[] };
    const state = jobs.jobs.map(job => `${job.name}：${job.steps.find(step => step.status === 'in_progress')?.name ?? job.status}`).join('；');
    if (state !== previous) { console.log(state); previous = state; }
    await new Promise(resolve => setTimeout(resolve, 15_000));
    run = JSON.parse(await cli(clientRoot, ['api', `repos/${repository}/actions/runs/${run.id}`])) as Run;
  }
  if (run.conclusion !== 'success' || !matchesSource(run)) throw new Error(`Windows原生构建未通过（${run.conclusion}）：${run.html_url}`);
  const packages: WindowsPackage[] = [];
  for (const architecture of ['x86', 'x64'] as const) {
    const downloaded = join(output, 'windows-build', architecture);
    for (let attempt = 0; ; attempt++) {
      await rm(downloaded, { recursive: true, force: true });
      await mkdir(downloaded, { recursive: true });
      try { await cli(clientRoot, ['run', 'download', String(run.id), '--repo', repository, '--name', `gittogether-windows-${architecture}`, '--dir', downloaded]); break; }
      catch (error) {
        if (attempt === 2 || !transient(error)) throw error;
        console.log(`Windows ${architecture}构建产物下载暂时失败，重试完整下载（${attempt + 1}/2）。`);
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
    const info = JSON.parse(await readFile(join(downloaded, 'build-info.json'), 'utf8')) as WindowsPackage & { filename: string; sourceBranch: string; target: string; validation: { architecture: string; version: string; nativeValidationPassed: boolean } };
    const filename = `GitTogether-${version}-Windows-${architecture}-setup.exe`;
    const target = architecture === 'x86' ? 'i686-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
    if (info.filename !== filename || info.sourceCommit !== sourceCommit || info.sourceBranch !== 'main' || info.target !== target || info.version !== version || info.architecture !== architecture || !info.nativeValidationPassed || !info.installerVerified || !info.interfaceStarted || info.validation.version !== version || !info.validation.nativeValidationPassed || info.validation.architecture !== (architecture === 'x86' ? 'x86' : 'x86_64')) throw new Error(`Windows ${architecture}原生构建报告与本次源码不一致。`);
    const installerPath = join(output, filename); await cp(join(downloaded, filename), installerPath);
    const bytes = await readFile(installerPath);
    if (bytes.length !== info.size || createHash('sha256').update(bytes).digest('hex') !== info.sha256) throw new Error(`Windows ${architecture}安装包完整性校验失败。`);
    await tool(clientRoot, join(clientRoot, 'node_modules/.bin/tauri'), ['signer', 'sign', '--private-key-path', signingKey, '--password', '', '--app-version', version, installerPath]);
    const signaturePath = installerPath + '.sig'; const signature = (await readFile(signaturePath, 'utf8')).trim();
    await tool(clientRoot, verifier, [join(clientRoot, 'src-tauri/tauri.conf.json'), installerPath, signaturePath, version, info.platform]);
    packages.push({ version, sourceCommit, architecture, platform: info.platform, installerPath, signaturePath, signature, size: bytes.length, sha256: info.sha256, applicationMachine: info.applicationMachine, applicationSha256: info.applicationSha256, nativeValidationPassed: true, installerVerified: true, interfaceStarted: true, runId: run.id, authenticodeSigned: info.authenticodeSigned });
  }
  verifyWindowsPackages(packages, version, sourceCommit);
  return packages;
}
