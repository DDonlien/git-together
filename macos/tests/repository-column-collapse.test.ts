import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryColumnHeading } from '../src/RepositoryColumnHeading';
import { RepositoryView } from '../src/RepositoryView';
import type { Account, RemoteRepository } from '../src/import-model';
import type { RepositoryWorkspace } from '../src/repository-model';

const columns = [
  { title: '分支图', icon: 'branch', controls: 'repository-graph-column', key: 'graph', minimum: 230 },
  { title: '更改与 Diff', icon: 'code', controls: 'repository-changes-column', key: 'changes', minimum: 290 },
  { title: '文件树', icon: 'folder', controls: 'repository-tree-column', key: 'tree', minimum: 216 },
] as const;

test('every column heading defaults expanded with one named public keyboard disclosure', () => {
  for (const { title, icon, controls } of columns) {
    const markup = renderToStaticMarkup(createElement(RepositoryColumnHeading, { title, icon, controls }));
    assert.match(markup, /<header class="repository-column-heading">/);
    assert.match(markup, new RegExp(`<h2>${title}</h2>`));
    assert.match(markup, new RegExp(`aria-label="收起${title}"`));
    assert.match(markup, new RegExp(`aria-expanded="true" aria-controls="${controls}"`));
    assert.match(markup, /<button[^>]*type="button"[^>]*class="[^"]*ogui-button[^"]*repository-column-disclosure/);
    assert.equal((markup.match(/<button/g) || []).length, 1);
    assert.doesNotMatch(markup, /tabindex="-1"|disabled=""/);
  }
});

test('production workspaces expose three distinct disclosure targets with all task drafts and source controls still mounted', () => {
  const repository: RemoteRepository = { id: 'qa:columns', remoteId: 1, accountId: 'qa', name: 'project', fullName: 'qa/project', description: '', defaultBranch: 'main', private: true, url: 'https://git.example.test/qa/project', available: true };
  const account: Account = { id: 'qa', provider: 'gitea', host: 'https://git.example.test', name: 'QA', login: 'qa', updatedAt: '' };
  const workspace: RepositoryWorkspace = { source: 'local', complete: true, commits: [], tasks: ['main', 'task/search', 'task/review'].map(branch => ({ id: branch, branch, head: 'a', path: `/qa/${branch}`, files: [], tree: ['src/app.ts'], error: '' })) };
  const markup = renderToStaticMarkup(createElement(RepositoryView, { repository, account, workspace, localPath: '/qa/main', globalSearch: '', onConfigure() {} }));
  for (const { title, controls } of columns) {
    assert.equal((markup.match(new RegExp(`id="${controls}"`, 'g')) || []).length, 1);
    assert.match(markup, new RegExp(`aria-label="收起${title}"`));
    assert.match(markup, new RegExp(`aria-expanded="true" aria-controls="${controls}"`));
  }
  assert.equal((markup.match(/repository-column-disclosure/g) || []).length, 3);
  assert.equal((markup.match(/<textarea/g) || []).length, 3);
  assert.equal((markup.match(/aria-label="文件树：/g) || []).length, 3);
  assert.match(markup, /<legend class="ogui-sr-only">文件树来源<\/legend>/);
  assert.doesNotMatch(markup, /hidden=""/);
});

test('each heading owns functional disclosure state without effects, service calls or conditional task rendering', () => {
  const heading = readFileSync(new URL('../src/RepositoryColumnHeading.tsx', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  assert.match(heading, /const \[collapsed, setCollapsed\] = useState\(false\)/);
  assert.match(heading, /onClick=\{\(\) => setCollapsed\(value => !value\)\}/);
  assert.match(heading, /aria-expanded=\{!collapsed\} aria-controls=\{controls\}/);
  assert.match(heading, /collapsed \? '展开' : '收起'/);
  assert.doesNotMatch(heading, /useEffect|importAPI|localStorage|children.*collapsed/);
  assert.equal((view.match(/<RepositoryColumnHeading /g) || []).length, 3);
  assert.doesNotMatch(view, /setCollapsed|collapsed &&|!collapsed &&|@refresh reset/);
  assert.match(view, /key=\{task.id\}[^>]*hidden=/);
});

test('independent grid minima release width for every disclosure combination and hide content without destroying it', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const { key, minimum } of columns) {
    assert.ok(css.includes(`--${key}-min: ${minimum}px;`));
    assert.ok(css.includes(`.repository-columns:has(> .repository-${key}-column > .repository-column-heading.is-collapsed) { --${key}-width: 44px; --${key}-min: 44px; }`));
  }
  assert.match(css, /min-width: calc\(var\(--graph-min\) \+ var\(--changes-min\) \+ var\(--tree-min\) \+ 24px\)/);
  assert.match(css, /grid-template-columns: var\(--graph-width\) var\(--changes-width\) var\(--tree-width\)/);
  assert.match(css, /\.repository-column:has\(> \.repository-column-heading.is-collapsed\) > :not\(\.repository-column-heading\) \{ display: none; \}/);
  assert.match(css, /\.repository-column-heading.is-collapsed > h2 \{[^}]*writing-mode: vertical-rl;/);
  assert.match(css, /\.repository-column-heading \{ min-height: 44px; padding: 7px 10px;/);
  assert.doesNotMatch(css, /\.repository-column-disclosure[^}]*display: none/);
});
