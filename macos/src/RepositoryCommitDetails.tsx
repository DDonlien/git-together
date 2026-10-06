import type { RepositoryCommit } from './repository-model';

export function RepositoryCommitDetails({ commit, branch }: { commit: RepositoryCommit; branch: string }) {
  return <section className="repository-commit-details" aria-label={`提交详情：${branch}`}>
    <strong>{commit.summary}</strong>
    <span>{commit.author} · <time dateTime={commit.time}>{new Date(commit.time).toLocaleString()}</time></span>
    <code>{commit.id}</code>
  </section>;
}
