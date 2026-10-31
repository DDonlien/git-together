import { isRecord } from './import-model';

export type DivergenceMode = 'pull' | 'latest' | 'push';
export type Divergence = { diverged: false } | {
  diverged: true; repositoryId: string; taskId: string; path: string; branch: string;
  head: string; changeKey: string; dirty: boolean; remote: string; pushRemote: string | null; remoteHead: string;
  ahead: number; behind: number; bases: string[]; localCommits: string[]; commitsTruncated: boolean;
};
const sha = (value: unknown) => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export function isDivergence(value: unknown): value is Divergence {
  if (!isRecord(value)) return false;
  if (value.diverged === false) return true;
  return value.diverged === true && ['repositoryId', 'taskId', 'path', 'branch', 'remote'].every(key => typeof value[key] === 'string' && !!value[key]) &&
    sha(value.head) && sha(value.remoteHead) && typeof value.changeKey === 'string' && /^[a-f0-9]{64}$/.test(value.changeKey) &&
    typeof value.dirty === 'boolean' && (value.pushRemote === null || typeof value.pushRemote === 'string' && !!value.pushRemote) && count(value.ahead) && count(value.behind) &&
    Array.isArray(value.bases) && value.bases.length > 0 && value.bases.every(sha) &&
    Array.isArray(value.localCommits) && value.localCommits.length <= 100 && value.localCommits.every(sha) && typeof value.commitsTruncated === 'boolean';
}
