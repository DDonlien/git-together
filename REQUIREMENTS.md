# GitTogether Requirements

Status snapshot: 2026-08-11

GitTogether is a local-first client built from the GitButler codebase. The
current product direction is to make ordinary Git branches and worktrees the
primary user model, while keeping the existing GitButler Git operations as a
foundation that can be progressively reshaped.

## Status legend

- **Done**: implemented in the current working tree and covered by the current
  validation where applicable.
- **Partial**: the user-facing entry point or foundation exists, but the
  behavior is still backed by an existing GitButler flow, placeholder data, or
  an incomplete integration.
- **Pending**: required work that has not been implemented yet.
- **Deferred**: intentionally outside the current local-only phase.

## Product boundary

### Local-first behavior

GitTogether must remain useful without a GitTogether cloud service. Local Git
operations, repository discovery, branch/worktree organization, file review,
commit creation, and terminal access must not require Presence, GPS, or an
agent service.

### Service-dependent behavior

Presence, GPS, remote agent orchestration, hosted conversation history, and
GitTogether-specific update infrastructure are separate phases. They must not
be faked as complete by the local client.

### Repository bootstrap

- The original empty `DDonlien/git-together` repository is intentionally kept
  for the user to delete later.
- The active fork is `DDonlien/gittogether`.
- The local checkout is `D:\Projects\GitHubPersonal\git-together`.
- `origin` points to the personal fork; `upstream` points to
  `gitbutlerapp/gitbutler`.

## Functional requirements

| ID    | Requirement                          | Status   | Acceptance criteria / remaining work                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-001 | GitTogether application identity     | Partial  | The main desktop titles, onboarding copy, package repository metadata, Tauri product names/identifiers, and log names use GitTogether. Remaining: replace or explicitly retain upstream-facing release, documentation, telemetry, icon, CLI, and deep-link branding before a public release.                                          |
| R-002 | Multi-repository home dashboard      | Done     | The root route opens a dashboard showing all registered repositories, with loading and empty states, repository cards, search, selection, add-local, and clone actions.                                                                                                                                                               |
| R-003 | Repository search and selection      | Done     | Users can filter repositories by title/path, select individual cards, select or clear all visible cards, and see the selected count.                                                                                                                                                                                                  |
| R-004 | Batch Get latest                     | Done     | The dashboard fetches selected repositories concurrently, fetches all visible repositories when none are selected, reports aggregate failures, and does not claim success when a fetch rejects.                                                                                                                                       |
| R-005 | Real Git branch mode by default      | Done     | New GitTogether settings enable `singleBranch` by default, and the settings UI exposes the mode as Git mode instead of an admin-only experiment. Existing GitButler single-branch backend behavior remains the implementation base.                                                                                                   |
| R-006 | Branch and worktree organization     | Partial  | Existing branch creation and stack/worktree screens remain available and the default mode no longer forces the virtual workspace branch. Remaining: define and implement the GitTogether information architecture for freely organizing branches and linked worktrees, including clearer worktree ownership and safe switching rules. |
| R-007 | Workspace files and diffs            | Partial  | Opening a repository still reaches the existing workspace with real changed-file and diff views. The dashboard Details > Files tab is currently an entry point/placeholder and must become a live repository-scoped view.                                                                                                             |
| R-008 | Commit flow                          | Partial  | Dashboard “Review & commit” opens the existing workspace commit editor, preserving file selection, hooks, validation, and branch creation. Remaining: provide a GitTogether-native commit surface and a clear result state when the commit is created.                                                                                |
| R-009 | Batch commit                         | Pending  | Add a safe multi-repository commit queue with per-repository commit messages, selected-file review, independent success/failure results, cancellation, and recovery. A failure in one repository must not silently commit or discard changes in another.                                                                              |
| R-010 | Push flow                            | Partial  | Existing per-repository/per-branch GitButler push controls remain available. Remaining: implement GitTogether-native push status and a batch push queue with remote/branch selection, authentication errors, conflict handling, retry, and per-repository results.                                                                    |
| R-011 | Batch commit and push                | Pending  | Combine R-009 and R-010 only after both individual flows are safe. The UI must never imply that push happened when only a commit was created; each repository needs an explicit commit and push state.                                                                                                                                |
| R-012 | Four-region information architecture | Partial  | The dashboard has persistent Repositories, AI tasks, Conversation, and Details panels with reorder/collapse controls. AI tasks and Conversation are currently empty states; Details is partly placeholder content.                                                                                                                    |
| R-013 | Context: Git Graph                   | Partial  | The dashboard exposes a Git Graph tab and links to the repository workspace. Remaining: render a live repository graph with bottom-up chronological direction, branch/worktree labels, selected commit state, and navigation into diffs.                                                                                              |
| R-014 | Context: Files                       | Partial  | The dashboard exposes a Files tab. Remaining: show live changed files, staged/unstaged state, filtering, selection, and diff navigation for the selected repository.                                                                                                                                                                  |
| R-015 | Context: Git details                 | Partial  | The dashboard exposes Git details and shows local Git mode. Remaining: show current branch, target/upstream, worktree path, ahead/behind, remotes, dirty state, conflicts, and last operation from live data.                                                                                                                         |
| R-016 | Context: Terminal                    | Partial  | The dashboard exposes a Terminal tab and selected worktree path. Remaining: embed or open a real terminal scoped to the selected repository/worktree with safe lifecycle and copy/paste behavior.                                                                                                                                     |
| R-017 | AI tasks                             | Pending  | Add a repository-scoped task model and UI for creating, queuing, cancelling, retrying, and reviewing tasks. Tasks must work locally without requiring a hosted agent service; provider-specific capabilities must be explicit.                                                                                                        |
| R-018 | Conversation                         | Pending  | Add repository/worktree-scoped conversation state, message history, composer, task handoff, and local persistence. Hosted synchronization is optional and must not be a prerequisite for local use.                                                                                                                                   |
| R-019 | Agent integration                    | Deferred | Connect local tasks/conversations to an agent runtime only after the local task and conversation contracts are stable. This is not part of the current server-independent milestone.                                                                                                                                                  |
| R-020 | Presence and GPS                     | Deferred | Implement presence, location/GPS, collaboration discovery, permissions, privacy controls, and the required service APIs in a later server-backed phase.                                                                                                                                                                               |
| R-021 | Remote and forge integrations        | Partial  | Existing GitHub/GitLab/Bitbucket integration code remains available through the fork. Remaining: audit all forge-dependent copy and flows so local GitTogether operation remains clear when no forge account or cloud service is connected.                                                                                           |
| R-022 | Update infrastructure                | Pending  | Replace or disable the inherited GitButler updater endpoints and signing configuration before distributing GitTogether builds. Do not point a GitTogether release at GitButler update infrastructure.                                                                                                                                 |
| R-023 | Deep links and CLI identity          | Partial  | Existing `but`, `but-dev`, and `but-nightly` schemes and internal `but` binaries are retained for compatibility. Decide whether GitTogether should add new schemes/CLI names or intentionally document compatibility before release.                                                                                                  |
| R-024 | Error handling and recovery          | Partial  | Batch fetch now aggregates failures correctly. Remaining: add consistent per-repository operation states, retry, cancellation, conflict/authentication guidance, and durable recovery for commit/push/task operations.                                                                                                                |
| R-025 | Accessibility and responsive layout  | Partial  | New dashboard components pass current Svelte accessibility diagnostics and include responsive layouts. Remaining: keyboard navigation, focus restoration, screen-reader semantics for reorderable panels/tabs, and end-to-end checks at supported window sizes.                                                                       |
| R-026 | Runtime validation                   | Partial  | Frontend package checks, targeted ESLint, production frontend build, JSON/JSONC parsing, and Rust formatting pass. Remaining: `cargo check`, Tauri build, launch, and interactive runtime validation with a real local repository.                                                                                                    |
| R-027 | Release packaging                    | Pending  | Build GitTogether development/test/nightly/release packages with correct identifiers, icons, metadata, updater policy, deep links, bundled helper binaries, and clean install/upgrade behavior.                                                                                                                                       |
| R-028 | Documentation                        | Partial  | This document records the full product scope and the current status. Remaining: add user-facing GitTogether setup, Git mode, dashboard, branch/worktree, commit/push, task, and privacy documentation.                                                                                                                                |

## Current implementation map

- `apps/desktop/src/components/dashboard/RepositoryDashboard.svelte`:
  dashboard layout, repository query, selection, panel persistence, and batch
  fetch entry point.
- `apps/desktop/src/components/dashboard/RepositoryCard.svelte`: repository
  card, target/upstream summary, sync control, and commit entry point.
- `apps/desktop/src/routes/+page.svelte`: dashboard home route.
- `apps/desktop/src/routes/[projectId]/workspace/+page.svelte`: dashboard
  deep-link into the existing commit editor.
- `apps/desktop/src/lib/baseBranch/baseBranchService.svelte.ts`: optional
  rethrow support for aggregate fetch error handling.
- `crates/but-settings/assets/defaults.jsonc`: real Git branch mode default.
- `crates/gitbutler-tauri/tauri.conf*.json`: GitTogether application identity
  for development, test, nightly, and release configurations.
- `apps/desktop/src/components/views/AppHeader.svelte`: GitTogether-neutral
  workspace labels in the single-branch presentation.

## Definition of complete for the next milestone

The next milestone is complete when:

1. R-007 through R-016 show live repository-scoped data rather than
   placeholders.
2. R-009 through R-011 provide independently recoverable commit/push queues.
3. R-017 and R-018 work locally with an explicit provider/service boundary.
4. R-022, R-023, and R-027 are resolved before any public GitTogether build is
   distributed.
5. R-026 includes Rust/Tauri build and interactive runtime validation.
6. The requirements status in this file is updated in the same change as each
   milestone implementation.

## Explicit non-goals for this milestone

- Deleting the original `DDonlien/git-together` repository automatically.
- Pushing to `gitbutlerapp/gitbutler` or any upstream repository.
- Claiming AI, Presence, GPS, or hosted service integration is complete.
- Treating the current Details placeholders as live Git data.
- Shipping inherited GitButler updater endpoints as GitTogether infrastructure.
