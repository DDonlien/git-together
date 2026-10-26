import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { mkdir, readFile, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'
import { isolateGitConfig } from '../../helpers/git-config'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { getStatusOrThrow } from '../../helpers/status'
import { ignoreChangedFile } from '../../../src/ui/gittogether/ignore-file'
import { stageFiles } from '../../../src/lib/git/update-index'
import { AppFileStatusKind } from '../../../src/models/status'

describe('ignore a file from the commit list', () => {
  beforeEach(isolateGitConfig)

  it('ignores a literal untracked path without ignoring the same name in another directory', async t => {
    const repo = await setupEmptyRepository(t)
    await mkdir(join(repo.path, 'nested'))
    await writeFile(join(repo.path, 'file[1].txt'), 'keep local')
    await writeFile(join(repo.path, 'nested/file[1].txt'), 'other directory')
    await writeFile(join(repo.path, '.gitignore'), '# existing rules\n')

    assert.equal(await ignoreChangedFile(repo, 'file[1].txt'), false)
    const status = await getStatusOrThrow(repo)
    assert.ok(
      !status.workingDirectory.files.some(file => file.path === 'file[1].txt')
    )
    assert.ok(
      status.workingDirectory.files.some(
        file => file.path === 'nested/file[1].txt'
      )
    )
    assert.equal(
      await readFile(join(repo.path, 'file[1].txt'), 'utf8'),
      'keep local'
    )
    assert.match(
      await readFile(join(repo.path, '.gitignore'), 'utf8'),
      /^# existing rules\n/
    )
  })

  it('stops tracking a modified file and preserves other staged changes, HEAD and working files', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [
        { path: '.DS_Store', contents: 'base' },
        { path: 'other.txt', contents: 'base' },
      ],
    })
    const head = (await exec(['rev-parse', 'HEAD'], repo.path)).stdout
    await writeFile(join(repo.path, '.DS_Store'), 'local metadata')
    await writeFile(join(repo.path, 'other.txt'), 'staged')
    assert.equal((await exec(['add', 'other.txt'], repo.path)).exitCode, 0)
    await writeFile(join(repo.path, 'other.txt'), 'unstaged')

    assert.equal(await ignoreChangedFile(repo, '.DS_Store'), true)
    const status = await getStatusOrThrow(repo)
    assert.equal(
      status.workingDirectory.files.find(file => file.path === '.DS_Store')
        ?.status.kind,
      AppFileStatusKind.Deleted
    )
    assert.equal(
      await readFile(join(repo.path, '.DS_Store'), 'utf8'),
      'local metadata'
    )
    assert.equal(
      (await exec(['show', ':other.txt'], repo.path)).stdout,
      'staged'
    )
    assert.equal(
      await readFile(join(repo.path, 'other.txt'), 'utf8'),
      'unstaged'
    )
    assert.equal((await exec(['rev-parse', 'HEAD'], repo.path)).stdout, head)

    // Desktop resets the index before staging the reviewed commit selection.
    assert.equal(
      (await exec(['reset', '--mixed', 'HEAD'], repo.path)).exitCode,
      0
    )
    await stageFiles(
      repo,
      status.workingDirectory.files.filter(file => file.path !== 'other.txt')
    )
    assert.equal(
      (await exec(['commit', '-m', 'ignore metadata'], repo.path)).exitCode,
      0
    )
    assert.equal(
      (
        await exec(
          ['ls-tree', '--name-only', 'HEAD', '--', '.DS_Store'],
          repo.path
        )
      ).stdout,
      ''
    )
    assert.equal(
      await readFile(join(repo.path, '.DS_Store'), 'utf8'),
      'local metadata'
    )
    assert.equal(
      (await exec(['check-ignore', '.DS_Store'], repo.path)).exitCode,
      0
    )
  })

  it('refuses to discard unique staged content before writing any ignore rule', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [{ path: 'partial.txt', contents: 'base' }],
    })
    await writeFile(join(repo.path, 'partial.txt'), 'unique staged content')
    assert.equal((await exec(['add', 'partial.txt'], repo.path)).exitCode, 0)
    await writeFile(join(repo.path, 'partial.txt'), 'working content')

    await assert.rejects(ignoreChangedFile(repo, 'partial.txt'))
    assert.equal(
      (await exec(['show', ':partial.txt'], repo.path)).stdout,
      'unique staged content'
    )
    assert.equal(
      await readFile(join(repo.path, 'partial.txt'), 'utf8'),
      'working content'
    )
    await assert.rejects(readFile(join(repo.path, '.gitignore')), {
      code: 'ENOENT',
    })
  })

  it('rejects unsupported and stale paths without creating an ignore file', async t => {
    const repo = await setupEmptyRepository(t)
    for (const path of [
      'missing.txt',
      '../outside.txt',
      '.gitignore',
      'newline\nfile',
    ]) {
      await assert.rejects(ignoreChangedFile(repo, path))
    }
    await assert.rejects(readFile(join(repo.path, '.gitignore')), {
      code: 'ENOENT',
    })
  })

  it('keeps the target and index intact when the root ignore file is a symbolic link', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [{ path: 'tracked.txt', contents: 'base' }],
    })
    await writeFile(join(repo.path, 'tracked.txt'), 'working content')
    await writeFile(join(repo.path, 'rules.txt'), '# preserve\n')
    await symlink('rules.txt', join(repo.path, '.gitignore'))

    await assert.rejects(
      ignoreChangedFile(repo, 'tracked.txt'),
      /symbolic link/
    )
    assert.equal(
      await readFile(join(repo.path, 'rules.txt'), 'utf8'),
      '# preserve\n'
    )
    assert.equal(
      (await exec(['show', ':tracked.txt'], repo.path)).stdout,
      'base'
    )
    assert.equal(
      await readFile(join(repo.path, 'tracked.txt'), 'utf8'),
      'working content'
    )
  })
})
