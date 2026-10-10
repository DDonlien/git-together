import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { basename, dirname, join } from 'node:path';
import { releaseBranch, updateSource } from '../src/update-model';

const repository = `${updateSource.owner}/${updateSource.repo}`;

interface ReleaseAsset { id?: number; name: string; size: number; state: string; digest: string | null }
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

function assetMatches(asset: ReleaseAsset, file: { name: string; size: number; sha256: string }) {
  return asset.name === file.name && asset.state === 'uploaded' && asset.size === file.size && asset.digest === `sha256:${file.sha256}`;
}

export function verifyReleaseAssets(assets: ReleaseAsset[], expected: { name: string; size: number; sha256: string }[]) {
  for (const file of expected) {
    const matches = assets.filter(asset => asset.name === file.name);
    if (matches.length !== 1 || !assetMatches(matches[0], file)) {
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

async function githubCredential(cwd: string): Promise<string> {
  const configured = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (configured) return configured;
  // Reuse the repository's existing credential helper. The credential stays in
  // memory and authenticated HTTPS headers, never in arguments or build resources.
  return new Promise<string>((resolveCredential, reject) => {
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
}

class GitHubRequestError extends Error {
  constructor(readonly status: number) { super(`GitHub发布接口返回HTTP ${status}。`); }
}

function transientReleaseError(error: unknown) {
  if (error instanceof GitHubRequestError) return error.status >= 500 || error.status === 429;
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return true;
  return error instanceof TypeError && error.message === 'fetch failed';
}

// A lost response does not imply that GitHub rejected the mutation. Read back
// the protected release before replaying create, upload or publication.
export async function reconcileReleaseMutation(
  operation: () => Promise<unknown>, complete: () => Promise<boolean>,
  wait: (attempt: number) => Promise<void> = attempt => new Promise(resolveWait => setTimeout(resolveWait, 1000 * 2 ** attempt)),
) {
  for (let attempt = 0; ; attempt++) {
    if (await complete()) return;
    try { await operation(); }
    catch (error) {
      if (!transientReleaseError(error)) throw error;
      if (await complete()) return;
      if (attempt === 2) throw error;
      console.log(`GitHub发布连接中断，已核对服务器结果，正在重试（${attempt + 2}/3）…`);
      await wait(attempt);
      continue;
    }
    // A successful write may precede visibility in GitHub's release listing.
    // Poll the result without replaying the acknowledged mutation.
    for (let verification = 0; !await complete(); verification++) {
      if (verification === 2) throw new Error('GitHub发布操作完成后，服务器状态未通过核对。');
      await wait(verification);
    }
    return;
  }
}

async function publicRead(url: string, ready?: (response: Response) => Promise<boolean>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const address = new URL(url);
      address.searchParams.set('noCache', Date.now().toString());
      // Use the same macOS HTTPS transport as the complete ZIP check. Node's
      // HTTP/2 connection to GitHub can close even while these URLs work in curl.
      const { stdout } = await promisify(execFile)('/usr/bin/curl', [
        '--location', '--silent', '--show-error', '--proto', '=https', '--proto-redir', '=https',
        '--connect-timeout', '30', '--max-time', '180', '--header', 'Cache-Control: no-cache',
        '--write-out', '\n%{http_code}', address.toString(),
      ], { timeout: 200_000, maxBuffer: 8 * 1024 * 1024 });
      const separator = stdout.lastIndexOf('\n');
      const status = Number(stdout.slice(separator + 1));
      if (separator < 0 || !Number.isInteger(status) || status < 100 || status > 599) throw new Error('公开更新源返回无效的HTTP状态。');
      const response = new Response(stdout.slice(0, separator), { status });
      if (response.ok) {
        if (!ready || await ready(response.clone())) return response;
        await response.body?.cancel();
        throw new Error('公开更新源尚未显示新版。');
      }
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
  const credential = await githubCredential(cwd);
  const request = async <T>(url: string, init: RequestInit = {}, allowMissing = false): Promise<T | null> => {
    const address = new URL(url);
    if (!init.method || init.method === 'GET') address.searchParams.set('noCache', Date.now().toString());
    const response = await fetch(address, { ...init, signal: AbortSignal.timeout(240_000), headers: {
      Accept: 'application/vnd.github+json', Authorization: `Bearer ${credential}`,
      'X-GitHub-Api-Version': '2022-11-28', 'Cache-Control': 'no-cache', ...init.headers,
    } });
    if (allowMissing && response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw new GitHubRequestError(response.status); }
    return response.status === 204 ? null : await response.json() as T;
  };
  const endpoint = (path: string) => `https://api.github.com/repos/${repository}/${path}`;
  const api = async <T>(path: string, allowMissing = false): Promise<T | null> => {
    for (let attempt = 0; ; attempt++) {
      try { return await request<T>(endpoint(path), {}, allowMissing); }
      catch (error) {
        if (attempt === 2 || !transientReleaseError(error)) throw error;
        await new Promise(resolveWait => setTimeout(resolveWait, 1000 * 2 ** attempt));
      }
    }
  };
  // Draft releases are included in this authenticated listing for users with
  // push access; a tag lookup alone is insufficient for unpublished drafts.
  const tagRelease = async () => {
    for (let page = 1; ; page++) {
      const releases = (await api<Release[]>(`releases?per_page=100&page=${page}`))!;
      const matches = releases.filter(release => release.tag_name === tag);
      if (matches.length > 1) throw new Error('同版本存在多个发布草稿，停止操作。');
      if (matches.length) return matches[0];
      if (releases.length < 100) return null;
    }
  };
  const assertMain = async () => {
    const main = await api<{ object: { sha: string } }>(`git/ref/heads/${releaseBranch}`);
    if (main?.object.sha !== sourceCommit) throw new Error('打包提交必须与已推送的远端main一致，请先检查并推送源码。');
  };
  const assertTag = async (allowMissing: boolean) => {
    const ref = await api<{ object: { sha: string } }>(`git/ref/tags/${tag}`, allowMissing);
    if (allowMissing && !ref) return;
    // The ref endpoint distinguishes a missing tag with 404; commits/<tag>
    // uses 422 for unknown refs and also resolves existing annotated tags.
    const commit = await api<{ sha: string }>(`commits/${tag}`);
    if (commit?.sha !== sourceCommit) throw new Error('版本tag与main打包源码不一致，不能覆盖。');
  };
  await assertMain();
  await assertTag(true);
  const existing = await tagRelease();
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
      let draft: Release | null = null;
      await reconcileReleaseMutation(
        async () => {
          await assertMain(); await assertTag(true);
          draft = await request<Release>(endpoint('releases'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            tag_name: tag, target_commitish: sourceCommit, draft: true, prerelease: false, make_latest: 'false',
            name: `GitTogether ${version}`, body: await readFile(notes, 'utf8'),
          }) });
        },
        async () => {
          draft = draft ? await api<Release>(`releases/${draft.id}`) : await tagRelease();
          if (draft && (!draft.draft || draft.target_commitish !== sourceCommit)) throw new Error('版本草稿状态或源码已改变，停止上传。');
          return draft !== null;
        },
      );
      const releaseId = (draft as Release | null)!.id;
      const matchingRelease = async (requireDraft: boolean) => {
        const current = await api<Release>(`releases/${releaseId}`);
        if (!current || current.id !== releaseId || current.tag_name !== tag || current.target_commitish !== sourceCommit || (requireDraft && !current.draft)) {
          throw new Error('发布草稿已改变，停止操作。');
        }
        return current;
      };
      // Only our matching draft is replaceable, so a failed upload can be retried
      // without exposing half a release or replacing a published installation.
      for (const [index, file] of expected.entries()) {
        const bytes = await readFile(index === 0 ? artifact.zipPath : artifact.updateMetadataPath);
        await reconcileReleaseMutation(
          async () => {
            const current = await matchingRelease(true);
            for (const asset of current.assets.filter(asset => asset.name === file.name)) {
              await request(endpoint(`releases/assets/${asset.id}`), { method: 'DELETE' });
            }
            return request(`https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(file.name)}`, {
              method: 'POST', headers: { 'Content-Type': index === 0 ? 'application/zip' : 'application/yaml' }, body: new Uint8Array(bytes),
            });
          },
          async () => {
            const matches = (await matchingRelease(true)).assets.filter(asset => asset.name === file.name);
            return matches.length === 1 && assetMatches(matches[0], file);
          },
        );
      }
      const uploaded = await matchingRelease(true);
      verifyReleaseAssets(uploaded.assets, expected);
      await reconcileReleaseMutation(
        async () => {
          await assertMain(); await assertTag(true);
          verifyReleaseAssets((await matchingRelease(true)).assets, expected);
          return request(endpoint(`releases/${releaseId}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draft: false, prerelease: false, make_latest: 'true' }) });
        },
        async () => {
          const current = await matchingRelease(false);
          verifyReleaseAssets(current.assets, expected);
          if (current.draft) return false;
          if (current.prerelease) throw new Error('正式版本状态不符。');
          return true;
        },
      );
      await assertTag(false);

      console.log('正式版本已公开，正在验证无需登录的应用更新源…');
      return verifyPublicDesktopRelease(artifact);
    },
  };
}

// Reusable after a published release's public download was interrupted. This
// phase reads and verifies the original artifact without recreating assets.
export async function verifyPublicDesktopRelease(artifact: ReleasePackage): Promise<{ releaseUrl: string; tag: string; publicUpdateVerified: true }> {
  const tag = 'v' + artifact.version;
  if (!artifact.notarized) throw new Error('只能核对已完成公证的正式包。');
  const metadata = await readFile(artifact.updateMetadataPath);
  verifyUpdateMetadata(JSON.parse(metadata.toString()), artifact);
  const expected = [
    { name: basename(artifact.zipPath), size: artifact.size, sha256: artifact.sha256 },
    { name: basename(artifact.updateMetadataPath), size: metadata.length, sha256: createHash('sha256').update(metadata).digest('hex') },
  ];
  const publicLatest = await (await publicRead('https://api.github.com/repos/' + repository + '/releases/latest', async response => {
    const current = await response.json() as Release;
    return current.tag_name === tag && !current.draft && !current.prerelease;
  })).json() as Release;
  verifyReleaseAssets(publicLatest.assets, expected);
  const commit = await (await publicRead('https://api.github.com/repos/' + repository + '/commits/' + tag)).json() as { sha: string };
  if (commit.sha !== artifact.sourceCommit) throw new Error('公开tag与原始打包源码不一致。');
  const feedUrl = 'https://github.com/' + repository + '/releases.atom';
  const feed = await (await publicRead(feedUrl, async response => (await response.text()).includes('/releases/tag/' + tag))).text();
  if (!feed.includes('/releases/tag/' + tag)) throw new Error('应用更新器使用的公开版本列表尚未包含新版。');
  const base = 'https://github.com/' + repository + '/releases/download/' + tag;
  verifyUpdateMetadata(await (await publicRead(base + '/latest-mac.yml')).json(), artifact);
  const temporary = await mkdtemp(join(tmpdir(), 'gittogether-public-check-'));
  try {
    const downloaded = join(temporary, 'app.zip');
    // Use macOS's HTTPS downloader for binary transfers, with a separate large
    // file deadline. A range from byte zero still retrieves the entire ZIP.
    await promisify(execFile)('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error',
      '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '30', '--max-time', '900',
      '--retry', '2', '--retry-delay', '2', '--retry-max-time', '900', '--range', '0-',
      '--output', downloaded, base + '/' + basename(artifact.zipPath)], { timeout: 2_800_000 });
    const bytes = await readFile(downloaded);
    if (bytes.length !== artifact.size || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256
      || createHash('sha512').update(bytes).digest('base64') !== artifact.sha512) throw new Error('公共安装包的大小或校验值不一致。');
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return { releaseUrl: publicLatest.html_url, tag, publicUpdateVerified: true };
}
