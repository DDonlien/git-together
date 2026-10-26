import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdateSettings } from '../src/UpdateSettings';
import { formatUpdateBytes, updateProgressPercent, updateTransferDescription, type UpdateStatus } from '../src/update-model';

const downloading = (extra: Partial<UpdateStatus> = {}): UpdateStatus => ({ phase: 'downloading', currentVersion: '1.0.0', availableVersion: '1.0.1', ...extra });

test('reported bytes retain decimal capacity units at each boundary', () => {
  for (const [bytes, label] of [[0, '0 B'], [999, '999 B'], [1000, '1.00 KB'], [1_000_000, '1.00 MB'], [1_000_000_000, '1.00 GB'], [483_468_906, '483 MB']] as const) {
    assert.equal(formatUpdateBytes(bytes), label);
  }
});

test('unknown totals stay indeterminate and reported totals produce bounded progress', () => {
  assert.equal(updateProgressPercent(downloading({ downloadedBytes: 25 })), undefined);
  assert.equal(updateProgressPercent(downloading({ downloadedBytes: 25, totalBytes: 100 })), 25);
  assert.equal(updateProgressPercent(downloading({ downloadedBytes: 120, totalBytes: 100 })), 100);
  assert.equal(updateProgressPercent(downloading({ percent: 100 })), 100);
  assert.match(updateTransferDescription(downloading({ totalBytes: 1_000_000 })), /已下载 容量未知/);
  assert.doesNotMatch(updateTransferDescription(downloading({})), /0%|0 B/);
});

test('an interrupted byte stream stops showing the previous transfer speed', () => {
  const status = downloading({ downloadedBytes: 100_000, totalBytes: 1_000_000, bytesPerSecond: 50_000, progressUpdatedAt: 1000 });
  assert.match(updateTransferDescription(status, 1500), /50\.0 KB\/s/);
  assert.match(updateTransferDescription(status, 3000), /0 B\/s/);
  assert.doesNotMatch(updateTransferDescription({ ...status, phase: 'ready', percent: 100 }, 4000), /\/s/);
});

test('the settings progress element stays indeterminate until actual capacity arrives', () => {
  const render = (status: UpdateStatus) => renderToStaticMarkup(createElement(UpdateSettings, {
    busy: false,
    updates: { status, supported: true, installing: false, installingRef: { current: false }, installationRef: { current: 0 }, action: async () => {} },
  }));
  const unknown = render(downloading());
  assert.match(unknown, /<progress[^>]*max="100"/);
  assert.doesNotMatch(unknown, /<progress[^>]*value=/);
  const known = render(downloading({ downloadedBytes: 250_000, totalBytes: 1_000_000, bytesPerSecond: 50_000 }));
  assert.match(known, /<progress[^>]*value="25"/);
  assert.match(known, /250 KB.*1\.00 MB.*25\.0%.*50\.0 KB\/s/);
});
