import type { RepositoryCommit } from './repository-model';

export function RepositoryCommitDetails({ commit, branch }: { commit: RepositoryCommit & { description?: string }; branch: string }) {
  return <section className="repository-commit-details" aria-label={`提交详情：${branch}`}>
    <strong>{commit.summary}</strong>
    {commit.description ? <p className="repository-commit-description">{commit.description}</p> : null}
    <span>{commit.author} · <time dateTime={commit.time}>{new Date(commit.time).toLocaleString()}</time></span>
    <code>{commit.id}</code>
  </section>;
}
