import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertReleaseSource, compareReleaseVersions, releaseTagCommit, releaseVersionFromTag } from './release-tag.mjs';

test('release tags supply a canonical numeric product version', () => {
  assert.equal(releaseVersionFromTag('v0.38.2'), '0.38.2');
  for (const value of ['main', '0.38.2', 'v01.2.3', 'v1.2', 'v1.2.3-beta', 'v1.2.3\n', 'v9007199254740992.0.0']) {
    assert.throws(() => releaseVersionFromTag(value));
  }
  assert.ok(compareReleaseVersions('0.38.10', '0.38.9') > 0);
  assert.ok(compareReleaseVersions('1.0.0', '0.99.99') > 0);
  assert.equal(compareReleaseVersions('0.38.2', '0.38.2'), 0);
});

test('annotated tags resolve to their commit rather than the tag object', () => {
  const object = 'a'.repeat(40), commit = 'b'.repeat(40);
  assert.equal(releaseTagCommit(`${object}\trefs/tags/v1.2.3\n${commit}\trefs/tags/v1.2.3^{}\n`, 'v1.2.3'), commit);
  assert.equal(releaseTagCommit(`${commit}\trefs/tags/v1.2.3\n`, 'v1.2.3'), commit);
  assert.equal(releaseTagCommit('', 'v1.2.3'), undefined);
});

test('a tagged commit outside main can release, while a moved or missing tag is rejected', t => {
  const directory = mkdtempSync(join(tmpdir(), 'gittogether-tag-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const remote = join(directory, 'remote.git'), checkout = join(directory, 'source');
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--bare', '--initial-branch=main', remote);
  git('clone', remote, checkout);
  const sourceGit = (...args) => git('-C', checkout, ...args);
  sourceGit('config', 'user.name', 'Release fixture');
  sourceGit('config', 'user.email', 'release@example.test');
  writeFileSync(join(checkout, 'source.txt'), 'main source\n');
  sourceGit('add', 'source.txt'); sourceGit('commit', '-m', 'main source'); sourceGit('push', 'origin', 'main');
  sourceGit('checkout', '--detach');
  writeFileSync(join(checkout, 'source.txt'), 'tagged branch source\n');
  sourceGit('commit', '-am', 'tag source outside main');
  const commit = sourceGit('rev-parse', 'HEAD');
  sourceGit('tag', '-a', 'v0.38.2', '-m', 'release fixture');
  sourceGit('push', 'origin', 'refs/tags/v0.38.2');
  assertReleaseSource(checkout, commit, '0.38.2', 'v0.38.2');
  assert.throws(() => assertReleaseSource(checkout, commit, '0.38.2'));
  assert.throws(() => assertReleaseSource(checkout, commit, '0.38.3', 'v0.38.3'), /missing or no longer/);
  assert.throws(() => assertReleaseSource(checkout, commit, '0.38.3', 'v0.38.2'), /version must match/);
  sourceGit('tag', '-f', 'v0.38.2', 'origin/main');
  sourceGit('push', '--force', 'origin', 'refs/tags/v0.38.2');
  assert.throws(() => assertReleaseSource(checkout, commit, '0.38.2', 'v0.38.2'), /missing or no longer/);
});
