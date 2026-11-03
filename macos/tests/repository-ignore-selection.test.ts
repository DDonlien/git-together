import test from 'node:test';
import assert from 'node:assert/strict';
import { commitPathsAfterIgnore } from '../src/repository-action-model';

test('Ignore includes a new .gitignore change and keeps unrelated file selections unchanged', () => {
  const ignored = { path: '.DS_Store', status: '??', tracked: false };
  const selected = { path: 'selected.txt', status: 'M', tracked: true };
  const excluded = { path: 'excluded.txt', status: 'M', tracked: true };
  const fresh = [selected, excluded, { path: '.gitignore', status: 'M', tracked: true }, { path: 'unrelated.txt', status: '??', tracked: false }];
  assert.deepEqual(commitPathsAfterIgnore([ignored, selected, excluded], [ignored.path, selected.path], ignored, fresh), ['selected.txt', '.gitignore']);
});

test('Ignore preserves an explicitly excluded existing .gitignore change and includes the target stop-tracking deletion', () => {
  const ignored = { path: '.DS_Store', status: 'M', tracked: true };
  const ignoreRules = { path: '.gitignore', status: 'M', tracked: true };
  const fresh = [{ ...ignored, status: 'D' }, ignoreRules];
  assert.deepEqual(commitPathsAfterIgnore([ignored, ignoreRules], [], ignored, fresh), ['.DS_Store']);
});
