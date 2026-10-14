import { isRecord } from './import-model';
import type { LocalLink } from './import-model';

export type RepositoryAuthentication = 'system' | 'account';
export const usesSystemAuthentication = (link?: LocalLink) => !!link && link.authentication !== 'account';
export type AccessPermission = 'granted' | 'denied' | 'unknown';
export type RepositoryAccess = {
  repositoryId: string;
  authorization: 'authorized' | 'missing' | 'unknown' | 'not-required';
  read: AccessPermission;
  write: AccessPermission;
  reason: string;
};
export type AccountRepositoryAccess = {
  accountId: string;
  kind: 'github-app' | 'oauth' | 'token' | 'provider';
  checkedAt: string;
  repositories: RepositoryAccess[];
  error?: string;
};
export function isAccountRepositoryAccess(value: unknown): value is AccountRepositoryAccess {
  return isRecord(value) && typeof value.accountId === 'string' &&
    ['github-app', 'oauth', 'token', 'provider'].includes(String(value.kind)) &&
    typeof value.checkedAt === 'string' && Number.isFinite(Date.parse(value.checkedAt)) &&
    (value.error === undefined || typeof value.error === 'string') &&
    Array.isArray(value.repositories) && value.repositories.every(row => isRecord(row) &&
      typeof row.repositoryId === 'string' && typeof row.reason === 'string' &&
      ['authorized', 'missing', 'unknown', 'not-required'].includes(String(row.authorization)) &&
      ['granted', 'denied', 'unknown'].includes(String(row.read)) &&
      ['granted', 'denied', 'unknown'].includes(String(row.write)));
}
