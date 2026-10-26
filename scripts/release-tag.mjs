import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function releaseVersionFromTag(tag) {
  const match = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag || '');
  assert.ok(match && match[0] === tag, 'Release tags must use vMAJOR.MINOR.PATCH, for example v0.38.2.');
  assert.ok(match[1].split('.').every(part => Number.isSafeInteger(Number(part))), 'Release version is too large.');
  return match[1];
}

export function compareReleaseVersions(left, right) {
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

export function releaseTagCommit(refs, tag) {
  // ls-remote lists hashes first. Prefer the peeled commit for annotated tags.
  const entries = refs.trim().split('\n').filter(Boolean).map(line => line.split(/\s+/));
  return entries.find(([, ref]) => ref === `refs/tags/${tag}^{}`)?.[0]
    || entries.find(([, ref]) => ref === `refs/tags/${tag}`)?.[0];
}

export function assertReleaseSource(root, commit, version, tag) {
  assert.match(commit, /^[0-9a-f]{40}$/i, 'Release source must be an exact commit.');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
  if (tag) {
    assert.equal(releaseVersionFromTag(tag), version, 'The release version must match its tag.');
    const refs = git(['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
    assert.equal(releaseTagCommit(refs, tag), commit, 'The remote release tag is missing or no longer points to the selected source.');
  } else {
    git(['fetch', 'origin', 'main', '--no-tags']);
    git(['merge-base', '--is-ancestor', commit, 'FETCH_HEAD']);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const repository = 'DDonlien/git-together';
  const tag = process.argv[2];
  const version = releaseVersionFromTag(tag);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assertReleaseSource(root, commit, version, tag);
  const releases = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`], { encoding: 'utf8' })).flat();
  const existing = releases.find(release => release.tag_name === tag);
  if (existing) assert.equal(existing.target_commitish, commit, 'This release already belongs to another source commit.');
  if (!existing || existing.draft) {
    for (const release of releases.filter(value => !value.draft && !value.prerelease && /^v\d+\.\d+\.\d+$/.test(value.tag_name))) {
      assert.ok(compareReleaseVersions(version, release.tag_name.slice(1)) > 0, `Release ${tag} must be newer than published ${release.tag_name}.`);
    }
  }
  console.log(`version=${version}`);
  console.log(`source_commit=${commit}`);
  console.log(`already_published=${existing && !existing.draft ? 'true' : 'false'}`);
}
