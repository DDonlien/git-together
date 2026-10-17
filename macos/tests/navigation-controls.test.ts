import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationControls } from '../src/NavigationControls';

test('navigation controls expose back, redo and manual account-directory refresh actions', () => {
  const markup = renderToStaticMarkup(createElement(NavigationControls, {
    canGoBack: true, canRedo: false, onBack() {}, onRedo() {}, onRefresh() {},
  }));
  assert.match(markup, /aria-label="返回"/);
  assert.match(markup, /disabled="" title="重做页面导航" aria-label="重做"/);
  assert.match(markup, /aria-label="刷新"/);
});
