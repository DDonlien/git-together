import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const rule = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `Missing rule: ${selector}`);
  return css.slice(start + 1, css.indexOf('}', start) + 1);
};

test('expanded column headings and all three content panes use one horizontal inset', () => {
  assert.match(rule('.repository-column'), /--repository-column-inset: 12px;/);
  for (const selector of ['.repository-column-heading', '.repository-task-header', '.repository-task-path', '.repository-task-body', '.repository-graph-scroll', '.repository-commit-composer', '.repository-commit-details', '.repository-tree-identity', '.repository-task-tree']) {
    assert.match(rule(selector), /var\(--repository-column-inset\)/, selector);
  }
  assert.match(rule('.repository-column-heading.is-collapsed'), /padding: 8px;/);
});

test('file rows and group labels retain inner padding within the shared outer inset', () => {
  assert.match(rule('.readonly-file'), /padding: 9px 8px;/);
  assert.doesNotMatch(css, /\.repository-task-body \.readonly-file \{/);
  assert.match(rule('.repository-graph-table .repository-graph-lane'), /padding: 0;/);
  assert.match(rule('.repository-graph-table .repository-graph-byline'), /padding-right: 0;/);
  assert.match(rule('.repository-change-group h3'), /padding: 8px;/);
  assert.match(rule('.repository-tree-row'), /padding: 3px 0;/);
  assert.match(rule('.repository-tree-row.tree-file'), /padding: 0;/);
  assert.match(rule('.repository-tree-select'), /padding: 3px 0;/);
  assert.match(rule('.repository-tree-children'), /margin-left: 15px;[^}]*padding-left: 3px;/);
});

test('removed graph options leave no dormant density state while keeping branch and context navigation', () => {
  const source = readFileSync(new URL('../src/RepositoryGraph.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /分支图选项|repository-graph-tools|setCompact|is-compact|jumpMatch|IconButton/);
  assert.match(source, /const rowHeight = 36;/);
  assert.match(source, /label="分支筛选"/);
  assert.match(source, /onContextMenu=/);
  assert.match(source, /key === 'ContextMenu' \|\| key === 'F10' && event.shiftKey/);
  assert.match(source, /nextGraphMatch\(matches,[^\n]*event.shiftKey \? -1 : 1/);
  assert.match(source, /<CommitActions commit=\{rows\[byId.get\(context.id\)!\]\?\.commit\}/);
  assert.match(source, /lane \* 14 \+ 12/);
});
