import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchInput, TextField, Textarea } from '../src/ui';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('legacy search stays neutral while form focus uses one blue border without an external halo', () => {
  const focus = css.match(/\.ogui-search:focus-within\s*\{([^}]+)\}/)?.[1];
  assert.ok(focus);
  assert.match(focus, /border-color:\s*var\(--strong-line\)/);
  assert.match(focus, /box-shadow:\s*none/);
  assert.doesNotMatch(focus, /--blue|--ogui-focus|outline/);
  assert.match(css, /\.ogui-field > input:focus, \.ogui-field > textarea:focus \{ border-color: var\(--blue\); box-shadow: none; \}/);
  assert.match(css, /\.ogui-field:focus-within > :where\(span,label\):first-child \{ color: var\(--blue\)/);
  const outline = css.match(/\.ogui-field > input:focus,\s*\.ogui-field > textarea:focus,\s*\.ogui-search input:focus\s*\{([^}]+)\}/)?.[1];
  assert.ok(outline);
  assert.match(outline, /outline:\s*none/);
  assert.match(css, /\.ogui-field\.has-error > input:focus,\s*\.ogui-field\.has-error > textarea:focus\s*\{\s*border-color:\s*var\(--danger\)/);
  // Only public text-entry classes suppress outlines; other controls keep focus.
  assert.match(css, /button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible\s*\{\s*outline: 2px solid var\(--blue\)/);
  assert.doesNotMatch(css, /(?:^|\n)(?:\*|input|button|textarea|select)(?::focus(?:-visible)?)?\s*\{[^}]*outline:\s*(?:none|0)/);
});

test('search fields retain accessible labels, values, clearing and native keyboard focusability', () => {
  for (const value of ['', 'Ball Maze']) {
    const markup = renderToStaticMarkup(createElement(SearchInput, { value, onChange: () => {}, placeholder: '搜索仓库或本地目录…' }));
    assert.match(markup, /class="ogui-search search-field"/);
    assert.match(markup, /type="search"/);
    assert.match(markup, /aria-label="搜索仓库或本地目录…"/);
    assert.ok(markup.includes(`value="${value}"`));
    assert.doesNotMatch(markup, /tabindex="-1"|disabled|readonly/);
    if (value) assert.match(markup, /<button[^>]*aria-label="Clear 搜索仓库或本地目录…"/);
    else assert.doesNotMatch(markup, /<button/);
  }
});

test('form fields retain labels, input values and error semantics independently of focus styling', () => {
  const text = renderToStaticMarkup(createElement(TextField, { label: '账号名称', value: '工作账号', onChange: () => {}, error: '请检查输入' }));
  assert.match(text, /class="ogui-field has-error"/);
  assert.match(text, /aria-invalid="true"/);
  assert.match(text, /aria-labelledby=/);
  assert.match(text, /role="alert">请检查输入/);
  assert.match(text, /value="工作账号"/);
  const textarea = renderToStaticMarkup(createElement(Textarea, { label: '说明', value: '保留输入内容', onChange: () => {} }));
  assert.match(textarea, /<textarea[^>]*aria-labelledby=/);
  assert.match(textarea, />保留输入内容<\/textarea>/);
  assert.doesNotMatch(text + textarea, /tabindex="-1"|disabled|readonly/);
});
