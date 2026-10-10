import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { releaseBranch, updateSource } from '../src/update-model';

const execute = promisify(execFile);
const repository = `${updateSource.owner}/${updateSource.repo}`;

interface ReleaseAsset { name: string; size: number; state: string; digest: string | null }
interface Release { id: number; tag_name: string; draft: boolean; prerelease: boolean; target_commitish: string; html_url: string; assets: ReleaseAsset[] }
export interface ReleasePackage {
  version: string; sourceCommit: string; zipPath: string; updateMetadataPath: string;
  sha256: string; sha512: string; size: number; notarized: boolean;
}

export function notarizationResult(output: string): { id: string; status: 'Accepted' } {
  const result = JSON.parse(output) as { id?: string; status?: string };
  if (!result.id || result.status !== 'Accepted') throw new Error(`Apple公证未通过（${result.status ?? '没有结果'}），停止发布。`);
  return { id: result.id, status: 'Accepted' };
}

export function verifyReleaseAssets(assets: ReleaseAsset[], expected: { name: string; size: number; sha256: string }[]) {
  for (const file of expected) {
    const matches = assets.filter(asset => asset.name === file.name);
    if (matches.length !== 1 || matches[0].state !== 'uploaded' || matches[0].size !== file.size || matches[0].digest !== `sha256:${file.sha256}`) {
      throw new Error(`GitHub资产未完整上传或校验值不符：${file.name}，停止发布。`);
    }
  }
}

export function verifyUpdateMetadata(metadata: unknown, artifact: ReleasePackage) {
  const data = metadata as { version?: string; path?: string; sha512?: string; files?: { url?: string; size?: number; sha512?: string }[] } | null;
  const name = basename(artifact.zipPath);
  if (!data || data.version !== artifact.version || data.path !== name || data.sha512 !== artifact.sha512
    || !Array.isArray(data.files) || data.files.length !== 1 || data.files[0].url !== name
    || data.files[0].size !== artifact.size || data.files[0].sha512 !== artifact.sha512) {
    throw new Error('公开更新清单与最终公证安装包不一致。');
  }
}

async function githubEnvironment(cwd: string): Promise<NodeJS.ProcessEnv> {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return { ...process.env };
  // Reuse the repository's existing credential helper. The credential stays in
  // memory and the gh child environment, never in arguments or build resources.
  const credential = await new Promise<string>((resolveCredential, reject) => {
    const child = spawn('git', ['credential', 'fill'], { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.once('error', reject);
    child.once('exit', code => {
      const token = output.split('\n').find(line => line.startsWith('password='))?.slice('password='.length);
      if (code !== 0 || !token) reject(new Error('没有可用的GitHub发布凭据，请先完成GitHub CLI或Git的正常登录。'));
      else resolveCredential(token);
    });
    child.stdin.end('protocol=https\nhost=github.com\n\n');
  });
  return { ...process.env, GH_TOKEN: credential };
}

async function publicRead(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(180_000), headers: { 'Cache-Control': 'no-cache' } });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 404 && response.status !== 429) throw new Error(`公开更新源返回HTTP ${response.status}。`);
      await response.body?.cancel();
      throw new Error(`公开更新源尚未就绪（HTTP ${response.status}）。`);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolveWait => setTimeout(resolveWait, 1000 * 2 ** attempt));
    }
  }
}

export async function prepareDesktopRelease(cwd: string, version: string, sourceCommit: string) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('正式更新必须使用稳定的语义版本号。');
  const tag = `v${version}`;
  const env = await githubEnvironment(cwd);
  const gh = async (args: string[]) => (await execute('gh', args, { cwd, env, timeout: 240_000, maxBuffer: 8 * 1024 * 1024 })).stdout;
  const api = async <T>(path: string, allowMissing = false): Promise<T | null> => {
    for (let attempt = 0; ; attempt++) {
      try { return JSON.parse(await gh(['api', `repos/${repository}/${path}`])) as T; }
      catch (error) {
        const stderr = (error as { stderr?: string }).stderr ?? '';
        if (allowMissing && /HTTP 404/.test(stderr)) return null;
        if (attempt === 2 || !/EOF|connection reset|TLS handshake timeout|HTTP 50[234]/.test(stderr)) throw error;
        await new Promise(resolveWait => setTimeout(resolveWait, 1000 * 2 ** attempt));
      }
    }
  };
  const assertMain = async () => {
    const main = await api<{ object: { sha: string } }>(`git/ref/heads/${releaseBranch}`);
    if (main?.object.sha !== sourceCommit) throw new Error('打包提交必须与已推送的远端main一致，请先检查并推送源码。');
  };
  const assertTag = async (allowMissing: boolean) => {
    const commit = await api<{ sha: string }>(`commits/${tag}`, allowMissing);
    if (commit?.sha !== sourceCommit && !(allowMissing && !commit)) throw new Error('版本tag与main打包源码不一致，不能覆盖。');
  };
  await assertMain();
  await assertTag(true);
  const existing = await api<Release>(`releases/tags/${tag}`, true);
  if (existing && (!existing.draft || existing.target_commitish !== sourceCommit)) throw new Error('此版本已发布或草稿对应其他源码，请递增版本；不覆盖正式资产。');
  const latest = await api<Release>('releases/latest', true);
  if (latest) {
    const previous = latest.tag_name.replace(/^v/, '').split('.').map(Number);
    const next = version.split('.').map(Number);
    const different = next.findIndex((value, index) => value !== previous[index]);
    if (previous.length !== 3 || previous.some(value => !Number.isInteger(value)) || different < 0 || next[different] < previous[different]) {
      throw new Error('发布版本必须高于当前公共最新版本。');
    }
  }

  return {
    async publish(artifact: ReleasePackage): Promise<{ releaseUrl: string; tag: string; publicUpdateVerified: true }> {
      if (!artifact.notarized || artifact.sourceCommit !== sourceCommit || artifact.version !== version) throw new Error('只有本次main构建且通过公证的包可以发布。');
      await assertMain();
      await assertTag(true);
      const metadata = await readFile(artifact.updateMetadataPath);
      verifyUpdateMetadata(JSON.parse(metadata.toString()), artifact);
      const expected = [
        { name: basename(artifact.zipPath), size: artifact.size, sha256: artifact.sha256 },
        { name: basename(artifact.updateMetadataPath), size: metadata.length, sha256: createHash('sha256').update(metadata).digest('hex') },
      ];
      const notes = join(dirname(artifact.updateMetadataPath), 'release-notes.md');
      await writeFile(notes, `# GitTogether ${version}\n\nmacOS Apple Silicon 正式更新，已完成 Developer ID 签名及 Apple 公证。\n\n源码来自 main：${sourceCommit}。\n\n在「设置 → 应用更新」检查、下载，然后选择重启安装。\n\n[查看源码变化](https://github.com/${repository}/compare/${latest?.tag_name ?? sourceCommit}...${sourceCommit})\n`);
      let draft = await api<Release>(`releases/tags/${tag}`, true);
      if (!draft) {
        await gh(['release', 'create', tag, '--repo', repository, '--draft', '--target', sourceCommit, '--title', `GitTogether ${version}`, '--notes-file', notes]);
        draft = await api<Release>(`releases/tags/${tag}`);
      }
      if (!draft?.draft || draft.target_commitish !== sourceCommit) throw new Error('版本草稿状态或源码已改变，停止上传。');
      // Only our matching draft is replaceable, so a failed upload can be retried
      // without exposing half a release or replacing a published installation.
      await gh(['release', 'upload', tag, artifact.zipPath, artifact.updateMetadataPath, '--repo', repository, '--clobber']);
      const uploaded = await api<Release>(`releases/tags/${tag}`);
      if (!uploaded?.draft || uploaded.id !== draft.id || uploaded.target_commitish !== sourceCommit) throw new Error('发布草稿已改变，停止公开。');
      verifyReleaseAssets(uploaded.assets, expected);
      await assertMain();
      await assertTag(true);
      await gh(['release', 'edit', tag, '--repo', repository, '--draft=false', '--prerelease=false', '--latest']);
      await assertTag(false);

      console.log('正式版本已公开，正在验证无需登录的应用更新源…');
      const publicLatest = await (await publicRead(`https://api.github.com/repos/${repository}/releases/latest`)).json() as Release;
      if (publicLatest.tag_name !== tag || publicLatest.draft || publicLatest.prerelease) throw new Error('公共latest尚未指向此次正式版本。');
      verifyReleaseAssets(publicLatest.assets, expected);
      const feed = await (await publicRead(`https://github.com/${repository}/releases.atom`)).text();
      if (!feed.includes(`/releases/tag/${tag}`)) throw new Error('应用更新器使用的公开版本列表尚未包含新版。');
      const base = `https://github.com/${repository}/releases/download/${tag}`;
      verifyUpdateMetadata(await (await publicRead(`${base}/latest-mac.yml`)).json(), artifact);
      const download = await publicRead(`${base}/${basename(artifact.zipPath)}`);
      const sha256 = createHash('sha256'), sha512 = createHash('sha512');
      let size = 0;
      const reader = download.body!.getReader();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length; sha256.update(chunk.value); sha512.update(chunk.value);
      }
      if (size !== artifact.size || sha256.digest('hex') !== artifact.sha256 || sha512.digest('base64') !== artifact.sha512) throw new Error('公共安装包的大小或校验值不一致。');
      return { releaseUrl: publicLatest.html_url, tag, publicUpdateVerified: true };
    },
  };
}
