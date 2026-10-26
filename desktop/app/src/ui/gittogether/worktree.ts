import type { WorktreeEntry } from '../../models/worktree'

export function isCheckoutWorktree(worktree: WorktreeEntry): boolean {
  // Bare storage has no HEAD field in porcelain, which upstream parses as ''.
  // Unborn checkouts have an all-zero HEAD and must remain available.
  return worktree.head !== '' && !worktree.isPrunable
}
