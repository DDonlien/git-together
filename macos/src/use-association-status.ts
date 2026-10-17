import { useEffect, useRef } from 'react';
import { associationStatus, type AssociationStatus } from './branch-links';
import type { LocalLink } from './import-model';
import type { RemoteRepositoryState } from './remote-repository-model';
import type { LocalRepositoryState } from './use-workspace';

export function useAssociationStatus(instanceId: string, link: LocalLink | undefined, local: LocalRepositoryState | undefined, remote: RemoteRepositoryState, hiddenEntries: ReadonlySet<string>, scopeKey: string): AssociationStatus {
  const identity = JSON.stringify([instanceId, link?.repositoryId, link?.path, link?.worktrees?.map(item => [item.path, item.branch]).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])), scopeKey]);
  const current = associationStatus(link, local, remote, hiddenEntries);
  const reading = !!local?.loading || remote.loading;
  const settled = !!link && current.verified && !reading;
  const lastVerified = useRef<{ identity: string; status: AssociationStatus } | null>(null);
  // This is the previous successful observation, not another copy of the
  // current derived status. Polling and automatic visibility can be transient.
  useEffect(() => {
    if (!link || lastVerified.current?.identity !== identity) lastVerified.current = null;
    if (settled) lastVerified.current = { identity, status: current };
  }, [identity, settled, current.label, current.detail, current.verified, !!link]);
  if (!link || settled) return current;
  const previous = lastVerified.current?.identity === identity ? lastVerified.current.status : null;
  const progress = reading ? '正在刷新关联验证；' : '本次关联验证尚未成功；';
  return previous
    ? { ...previous, detail: `${progress}显示上次成功结果：${previous.detail} 当前检查：${current.detail}` }
    : { ...current, label: '关联待确认', detail: `${progress}${current.detail}` };
}
