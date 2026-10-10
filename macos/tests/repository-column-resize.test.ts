import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryColumns } from '../src/RepositoryColumns';
import { columnGap, columnLayoutMinimum, columnMinimums, columnResizeBounds, defaultColumnRatios, resizeColumns, type ColumnBoundary, type ColumnRatios } from '../src/column-layout';

test('default exact 30/40/30 shares preserve the existing readable minima and two 12px gaps', () => {
  assert.deepEqual(defaultColumnRatios, [3, 4, 3]);
  assert.equal(columnLayoutMinimum(defaultColumnRatios), 791);
  const width = columnLayoutMinimum(defaultColumnRatios) - columnGap * 2;
  defaultColumnRatios.forEach((share, index) => assert.ok(width * share / 10 >= columnMinimums[index]));
});

test('both separators round to 10% stops, conserve adjacent width and leave the third column unchanged', () => {
  assert.equal(resizeColumns(defaultColumnRatios, 0, 3.49, 1400), defaultColumnRatios);
  assert.deepEqual(resizeColumns(defaultColumnRatios, 0, 3.51, 1400), [4, 3, 3]);
  assert.deepEqual(resizeColumns(defaultColumnRatios, 1, 4.51, 1400), [3, 5, 2]);
  assert.deepEqual(resizeColumns(defaultColumnRatios, 1, 3.49, 1400), [3, 3, 4]);
});

test('extreme drags clamp to readable 10% bounds instead of continuous minimum widths', () => {
  assert.deepEqual(columnResizeBounds(defaultColumnRatios, 0, 1400), { minimum: 2, maximum: 4 });
  assert.deepEqual(resizeColumns(defaultColumnRatios, 0, -100, 1400), [2, 5, 3]);
  assert.deepEqual(resizeColumns(defaultColumnRatios, 0, 100, 1400), [4, 3, 3]);
  assert.deepEqual(columnResizeBounds(defaultColumnRatios, 1, 1400), { minimum: 3, maximum: 5 });
  assert.deepEqual(resizeColumns(defaultColumnRatios, 1, -100, 1400), [3, 3, 4]);
  assert.deepEqual(resizeColumns(defaultColumnRatios, 1, 100, 1400), [3, 5, 2]);
});

test('a narrow viewport retains exact shares and cannot shrink below any existing minimum', () => {
  const width = columnLayoutMinimum(defaultColumnRatios) - columnGap * 2;
  for (const boundary of [0, 1] as const) {
    assert.deepEqual(resizeColumns(defaultColumnRatios, boundary, -100, width), defaultColumnRatios);
    assert.deepEqual(resizeColumns(defaultColumnRatios, boundary, 100, width), defaultColumnRatios);
  }
});

test('every reachable ratio remains integer, totals ten and supports exact proportions after window shrinking', () => {
  for (let first = 1; first <= 8; first++) for (let second = 1; second < 10 - first; second++) {
    const ratios: ColumnRatios = [first, second, 10 - first - second];
    const width = Math.max(1800, columnLayoutMinimum(ratios) - columnGap * 2);
    for (const boundary of [0, 1] as ColumnBoundary[]) for (const target of [-100, 1.49, 4.51, 100]) {
      const next = resizeColumns(ratios, boundary, target, width);
      assert.equal(next.reduce((sum, value) => sum + value, 0), 10);
      assert.ok(next.every(value => Number.isInteger(value) && value > 0));
      assert.equal(next[boundary === 0 ? 2 : 0], ratios[boundary === 0 ? 2 : 0]);
      next.forEach((share, index) => assert.ok((columnLayoutMinimum(next) - columnGap * 2) * share / 10 >= columnMinimums[index]));
    }
  }
});

test('production layout has two focusable named vertical separators between stable cards', () => {
  const children: [ReactNode, ReactNode, ReactNode] = [createElement('section', { 'data-card': 'graph' }), createElement('section', { 'data-card': 'changes' }), createElement('section', { 'data-card': 'tree' })];
  const markup = renderToStaticMarkup(createElement(RepositoryColumns, { children }));
  assert.equal((markup.match(/role="separator"/g) || []).length, 2);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 2);
  assert.equal((markup.match(/aria-orientation="vertical"/g) || []).length, 2);
  assert.match(markup, /aria-label="调整分支图与更改与 Diff比例"/);
  assert.match(markup, /aria-label="调整更改与 Diff与文件树比例"/);
  assert.match(markup, /--graph-share:3fr;--changes-share:4fr;--tree-share:3fr/);
  assert.ok(markup.indexOf('data-card="graph"') < markup.indexOf('role="separator"'));
  assert.ok(markup.indexOf('role="separator"') < markup.indexOf('data-card="changes"'));
});

test('pointer capture, keyboard steps and cancel preserve mounted content without storage or services', () => {
  const source = readFileSync(new URL('../src/RepositoryColumns.tsx', import.meta.url), 'utf8');
  assert.match(source, /setPointerCapture\(event.pointerId\)/);
  assert.match(source, /onPointerMove=\{move\}/);
  assert.match(source, /onPointerCancel=/);
  assert.match(source, /onLostPointerCapture=\{finishDrag\}/);
  assert.match(source, /ArrowLeft.*ratios\[boundary\] - 1/);
  assert.match(source, /ArrowRight.*ratios\[boundary\] \+ 1/);
  assert.match(source, /Home.*bounds.minimum.*End.*bounds.maximum/);
  assert.match(source, /setRatios\(drag.current.ratios\)/);
  assert.match(source, /return \(\) => observer.disconnect\(\)/);
  assert.doesNotMatch(source, /importAPI|localStorage|sessionStorage|document.addEventListener/);
  assert.match(source, /children\[0\].*separator\(0\).*children\[1\].*separator\(1\).*children\[2\]/);
});

test('hover and keyboard focus reveal a centered grip without adding gaps or scrollbars; collapsed rails retain their original rules', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-column-resizer \{[^}]*cursor: col-resize; touch-action: none;/);
  assert.match(css, /\.repository-column-grip \{[^}]*top: 50%; left: 50%; width: 4px; height: 48px;/);
  assert.match(css, /repository-column-resizer:is\(:hover,:focus-visible\) > \.repository-column-grip/);
  assert.match(css, /\.repository-column-heading.is-collapsed\) > \.repository-column-resizer \{ visibility: hidden; pointer-events: none; \}/);
  assert.match(css, /\.repository-columns\.is-resizing.*user-select: none;/);
});
