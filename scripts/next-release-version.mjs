import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const repository = 'DDonlien/git-together';
const sourceCommit = process.argv[2];
assert.match(sourceCommit || '', /^[0-9a-f]{40}$/i, 'Pass the exact main commit being released.');
const baseline = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`], { encoding: 'utf8' })).flat();
const parse = value => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value || '');
  return match ? match.slice(1).map(Number) : undefined;
};
const compare = (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
const versionOf = release => release.tag_name?.match(/^v(\d+\.\d+\.\d+)$/)?.[1];
const sameSource = pages.filter(release => release.target_commitish === sourceCommit && parse(versionOf(release)));
const alreadyPublished = sameSource.find(release => !release.draft);
const resumableDraft = sameSource.filter(release => release.draft).sort((a, b) => compare(parse(versionOf(b)), parse(versionOf(a))))[0];
const chosen = alreadyPublished || resumableDraft;
let version;
if (chosen) version = versionOf(chosen);
else {
  const candidates = [baseline, ...pages.map(versionOf)].map(parse).filter(Boolean).sort(compare);
  assert.ok(candidates.length, 'No valid product version is available.');
  const [major, minor, patch] = candidates.at(-1);
  version = `${major}.${minor}.${patch + 1}`;
}
console.log(`version=${version}`);
console.log(`already_published=${alreadyPublished ? 'true' : 'false'}`);
