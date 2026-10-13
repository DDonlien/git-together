import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteRepositoryReader, type RemoteTransport } from '../server/remote-repository-reader';

const hash = (number: number) => number.toString(16).padStart(40, '0');
const commit = (id: string, parent?: string) => ({
  sha: id,
  commit: { message: `Commit ${id.slice(-2)}`, author: { name: 'QA', date: '2026-10-06T09:00:00Z' }, tree: { sha: hash(900) } },
  parents: parent ? [{ sha: parent }] : [],
});

test('remote history starts with 50 commits and scroll pages can continue beyond any configured history cap', async () => {
  const calls: string[] = [];
  const oldestToNewest = Array.from({ length: 52 }, (_, index) => commit(hash(index + 1), index ? hash(index) : undefined));
  const head = hash(52);
  const transport: RemoteTransport = async path => {
    calls.push(path); const url = new URL(path, 'https://fixed.example.test');
    if (url.pathname.endsWith('/branches')) return { value: [{ name: 'main', commit: { sha: head } }], headers: new Headers() };
    if (url.pathname.endsWith('/commits')) {
      const page = Number(url.searchParams.get('page'));
      const values = oldestToNewest.slice().reverse().slice((page - 1) * 50, page * 50);
      return { value: values, headers: new Headers(page === 1 ? { link: '<https://fixed.example.test/next>; rel="next"' } : {}) };
    }
    return { value: { tree: [], truncated: false }, headers: new Headers() };
  };
  const remote = new RemoteRepositoryReader('github', { fullName: 'qa/project', defaultBranch: 'main' }, transport);
  const workspace = await remote.workspace();
  assert.equal(workspace.commits.length, 50);
  assert.equal(workspace.tasks[0].historyHasMore, true);
  const secondPage = await remote.historyPage(head, 2);
  assert.equal(secondPage.commits.length, 2);
  assert.equal(secondPage.hasMore, false);
  assert.ok(calls.some(path => path.includes('page=2')));
  const laterPage = await remote.historyPage(head, 100_001);
  assert.equal(laterPage.commits.length, 0);
  assert.equal(laterPage.hasMore, false);
});
