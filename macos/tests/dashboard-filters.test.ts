import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { MultiFilterMenu } from '../src/MultiFilterMenu';
import { isCatalog, type Account, type RemoteRepository } from '../src/import-model';
import { accountOptions, isSelected, matchesRepositoryFilters, organizationGroups, organizationKey, repositoryClassification, repositorySources, repositoryTypes, toggleFilter, type FilterSelection } from '../src/dashboard-filters';

const accounts: Account[] = ['a', 'b'].map(id => ({ id, provider: 'github', host: 'https://github.com', login: id, name: 'Team', updatedAt: '' }));
const repo = (overrides: Partial<RemoteRepository> = {}): RemoteRepository => ({ id: 'a:1', accountId: 'a', remoteId: 1, name: 'project', fullName: 'studio/project', description: '', defaultBranch: 'main', private: false, available: true, url: 'https://github.com/studio/project', ownerType: 'organization', fork: false, collaborator: false, ...overrides });
const repositories = [repo(), repo({ id: 'a:2', fullName: 'a/fork', ownerType: 'user', fork: true }), repo({ id: 'a:3', fullName: 'friend/shared', ownerType: 'user', fork: true, collaborator: true }), repo({ id: 'b:1', accountId: 'b' }), repo({ id: 'a:4', fullName: 'hidden/project', ownerType: undefined, fork: undefined, collaborator: undefined })];
const groups = organizationGroups(accounts, repositories); const options = groups.flatMap(group => group.options);
const all = { organization: null, source: null, type: null };

test('account checkbox choices use identity keys, preserve none and combine across accounts', () => {
  const choices = accountOptions(accounts);
  assert.deepEqual(choices.map(option => option.value), ['a', 'b']);
  assert.match(choices[0].detail!, /a@github.com/); assert.match(choices[1].detail!, /b@github.com/);
  let selection = toggleFilter(null, 'b', choices);
  assert.deepEqual(repositories.filter(repo => isSelected(selection, repo.accountId)).map(repo => repo.id), ['a:1', 'a:2', 'a:3', 'a:4']);
  selection = toggleFilter(selection, 'a', choices);
  assert.equal(repositories.filter(repo => isSelected(selection, repo.accountId)).length, 0);
  selection = toggleFilter(selection, 'b', choices);
  assert.deepEqual(repositories.filter(repo => isSelected(selection, repo.accountId)).map(repo => repo.id), ['b:1']);
  selection = toggleFilter(selection, 'a', choices); assert.equal(selection, null);
  assert.ok(repositoryTypes.every(option => option.detail === undefined));
});

test('organization choices are account-bound, distinguish same-host logins and never guess users as organizations', () => {
  assert.equal(groups.length, 2); assert.notEqual(groups[0].options.find(o => o.label === 'studio')!.value, groups[1].options[0].value);
  assert.match(groups[0].detail!, /a@github.com/); assert.match(groups[1].detail!, /b@github.com/);
  assert.deepEqual(new Set(groups[0].options.map(o => o.label)), new Set(['studio', '个人仓库', '未识别归属']));
  assert.ok(!groups[0].options.some(o => ['a', 'friend', 'hidden', '全部'].includes(o.label)));
});
test('default and explicit all retain unknown repositories, empty choices match nothing', () => {
  assert.ok(repositories.every(r => matchesRepositoryFilters(r, false, all, options)));
  assert.ok(repositories.every(r => matchesRepositoryFilters(r, false, { ...all, type: new Set(repositoryTypes.map(o => o.value)) }, options)));
  for (const dimension of ['organization', 'source', 'type']) assert.ok(repositories.every(r => !matchesRepositoryFilters(r, false, { ...all, [dimension]: new Set<string>() }, options)));
});
test('sources use current local association, independent of remote availability', () => {
  assert.ok(matchesRepositoryFilters(repo(), false, { ...all, source: new Set(['remote']) }, options));
  assert.ok(!matchesRepositoryFilters(repo(), true, { ...all, source: new Set(['remote']) }, options));
  assert.ok(matchesRepositoryFilters(repo({ available: false }), true, { ...all, source: new Set(['local']) }, options));
});
test('type choices union sources and collaboration; fork plus Added can overlap and unknown is never Original', () => {
  const added = { ...all, type: new Set(['added']) };
  assert.deepEqual(repositories.filter(r => matchesRepositoryFilters(r, false, added, options)).map(r => r.id), ['a:3']);
  assert.ok(matchesRepositoryFilters(repositories[2], false, { ...all, type: new Set(['fork']) }, options));
  assert.ok(matchesRepositoryFilters(repositories[0], false, { ...all, type: new Set(['original', 'added']) }, options));
  assert.ok(!matchesRepositoryFilters(repositories[4], false, { ...all, type: new Set(['original', 'fork']) }, options));
  assert.ok(!matchesRepositoryFilters(repo({ permissions: { admin: true, push: true } }), false, added, options));
});
test('organization, location and type intersect rather than overriding one another', () => {
  const selection = { organization: new Set([organizationKey(repositories[2])]), source: new Set(['local']), type: new Set(['added']) };
  assert.ok(matchesRepositoryFilters(repositories[2], true, selection, options));
  assert.ok(!matchesRepositoryFilters(repositories[2], false, selection, options));
  assert.ok(!matchesRepositoryFilters(repositories[1], true, selection, options));
  assert.ok(!matchesRepositoryFilters(repositories[3], true, selection, options));
});
test('toggles are immutable, include no All option, normalize all and preserve explicit none', () => {
  let selection: FilterSelection = null;
  selection = toggleFilter(selection, 'remote', repositorySources); assert.deepEqual([...selection!], ['local']);
  const previous = selection; selection = toggleFilter(selection, 'local', repositorySources); assert.equal(selection!.size, 0); assert.deepEqual([...previous!], ['local']);
  selection = toggleFilter(selection, 'remote', repositorySources); selection = toggleFilter(selection, 'local', repositorySources); assert.equal(selection, null);
  assert.ok([...repositorySources, ...repositoryTypes].every(o => o.value !== 'all'));
});
test('refresh preserves subsets and none; new options join only unrestricted selection and removed keys do not alias accounts', () => {
  const original = new Set([options[0].value]); const added = { value: 'new-account-org', label: 'New org' };
  assert.ok(!isSelected(original, added.value)); assert.ok(isSelected(null, added.value)); assert.ok(!isSelected(new Set(), added.value));
  const refreshed = options.filter(o => o.value !== options[0].value).concat(added);
  assert.ok(!matchesRepositoryFilters(repositories[3], false, { ...all, organization: original }, refreshed));
  const next = toggleFilter(original, added.value, refreshed); assert.ok(isSelected(next, added.value)); assert.ok(!next?.has(options[0].value));
});
test('catalog validates optional classification DTO but accepts old encrypted catalogs without guessed metadata', () => {
  const catalog = { instanceId: 'test', revision: 1, accounts, repositories: [repo({ permissions: { push: true, pull: true } })], links: [], credentialStorage: 'encrypted' };
  assert.ok(isCatalog(catalog)); assert.ok(isCatalog({ ...catalog, repositories: [repositories[4]] }));
  for (const bad of [{ fork: 'false' }, { collaborator: 1 }, { ownerType: 'company' }, { permissions: { admin: 'yes' } }, { permissions: { token: true } }, { metadataError: {} }]) assert.ok(!isCatalog({ ...catalog, repositories: [repo(bad as Partial<RemoteRepository>)] }));
});
test('permissions are secondary classification details, never a collaboration proxy', () => {
  assert.equal(repositoryClassification(repo({ fork: true, collaborator: true, permissions: { push: true, pull: true } })), 'Fork · Added · Write');
  assert.equal(repositoryClassification(repo({ permissions: { admin: true } })), 'Original · Admin');
  assert.match(repositoryClassification(repositories[4]), /来源未确认/);
});
test('multi-select uses public Popover with native checkboxes, disclosure and keyboard focus; no single-choice menu roles', () => {
  const markup = renderToStaticMarkup(createElement(MultiFilterMenu, { label: '仓库', groups: [{ id: 'source', label: '位置', options: repositorySources }], selections: { source: null }, onToggle: () => {} }));
  assert.match(markup, /aria-label="仓库筛选"/); assert.match(markup, /aria-haspopup="dialog"/); assert.match(markup, /aria-expanded="false"/);
  const source = readFileSync(new URL('../src/MultiFilterMenu.tsx', import.meta.url), 'utf8');
  assert.match(source, /type="checkbox"/); assert.match(source, /onOpenChange=\{setOpen\}/); assert.match(source, /<fieldset/); assert.match(source, /<legend/);
  assert.doesNotMatch(source, /MenuItem|role="menuitem|useEffect|openOnArrowKeys/);
});
