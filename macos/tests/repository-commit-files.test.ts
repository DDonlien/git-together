import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryCommitFiles } from '../src/RepositoryCommitFiles';

const files = [
  { path: 'src/app.ts', status: 'M', tracked: true },
  { path: 'new.txt', status: '??', tracked: false },
];
const props = { files, paths: files.map(file => file.path), branch: 'main', disabled: false, onChange: () => {} };

test('same-named worktrees have distinct accessible disclosure targets for both file groups', () => {
  const markup = renderToStaticMarkup(createElement(Fragment, null, createElement(RepositoryCommitFiles, props), createElement(RepositoryCommitFiles, props)));
  const targets = [...markup.matchAll(/class="submit-file-group-toggle"[^>]*aria-expanded="true"[^>]*aria-controls="([^"]+)"/g)].map(match => match[1]);
  assert.equal(targets.length, 4);
  assert.equal(new Set(targets).size, 4);
  for (const target of targets) assert.ok(markup.includes(`<div id="${target}">`));
});

test('locked submission selection leaves disclosure available while keeping file and group choices disabled', () => {
  const markup = renderToStaticMarkup(createElement(RepositoryCommitFiles, { ...props, disabled: true }));
  const disclosures = [...markup.matchAll(/<button[^>]*class="submit-file-group-toggle"[^>]*>/g)].map(match => match[0]);
  assert.equal(disclosures.length, 2);
  assert.ok(disclosures.every(button => !button.includes('disabled')));
  const choices = [...markup.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(match => match[0]);
  assert.equal(choices.length, 5);
  assert.ok(choices.every(checkbox => checkbox.includes('disabled')));
});
