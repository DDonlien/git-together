import test from 'node:test';
import assert from 'node:assert/strict';
import { isDivergence } from '../src/divergence-model';

const verified = () => ({ diverged: true, repositoryId: 'fixture', taskId: 'task', path: '/tmp/fixture', branch: 'main', head: 'a'.repeat(40), changeKey: 'b'.repeat(64), dirty: false, remote: 'origin', pushRemote: null, remoteHead: 'c'.repeat(40), ahead: 1, behind: 2, bases: ['d'.repeat(40)], localCommits: ['a'.repeat(40)], commitsTruncated: false });

test('only complete, verified divergence data is accepted', () => {
  assert.equal(isDivergence(verified()), true);
  assert.equal(isDivergence({ diverged: false }), true);
  for (const change of [{ ahead: 0 }, { behind: 0 }, { bases: [] }, { head: 'bad' }, { remoteHead: 'bad' }, { changeKey: '' }, { remote: '' }, { dirty: null }, { localCommits: ['bad'] }, { commitsTruncated: 'false' }]) {
    assert.equal(isDivergence({ ...verified(), ...change }), false);
  }
});
