<script lang="ts">
	import { Button, Icon } from "@gitbutler/ui";
	import type {
		BranchSummary,
		ProjectOperationState,
		RepositoryAction,
		RepositoryOverview,
	} from "$lib/gittogether/types";
	import type { Project } from "$lib/project/project";

	type Props = {
		project: Project;
		overview?: RepositoryOverview;
		overviewError?: string;
		loading: boolean;
		selected: boolean;
		focused: boolean;
		selectedWorktreePath?: string;
		operation?: ProjectOperationState;
		onToggle: (projectId: string) => void;
		onOpen: (projectId: string) => void;
		onSelectBranch: (projectId: string, branch: BranchSummary) => void;
		onAction: (projectId: string, action: RepositoryAction) => void;
	};

	let {
		project,
		overview,
		overviewError,
		loading,
		selected,
		focused,
		selectedWorktreePath,
		operation,
		onToggle,
		onOpen,
		onSelectBranch,
		onAction,
	}: Props = $props();

	const busy = $derived(operation?.state === "running");
	const currentBranch = $derived(overview?.currentBranch ?? "No attached branch");

	function shortRef(value?: string) {
		return value?.replace(/^refs\/(heads|remotes)\//, "") ?? "—";
	}
</script>

<article class:selected class:focused class="repository-card">
	<div class="repository-card__topline">
		<label class="repository-card__check">
			<input
				type="checkbox"
				checked={selected}
				aria-label={`Select ${project.title}`}
				onchange={() => onToggle(project.id)}
			/>
			<span class="checkmark" aria-hidden="true"></span>
		</label>

		<button
			class="repository-card__identity"
			type="button"
			onclick={() => onOpen(project.id)}
			aria-label={`Open ${project.title} workspace`}
		>
			<span class="repository-card__icon" aria-hidden="true"><Icon name="repo" size={16} /></span>
			<span class="repository-card__name-wrap">
				<strong>{project.title}</strong>
				<span>{project.path}</span>
			</span>
		</button>

		<div class="repository-card__summary">
			<span class="summary-pill summary-pill--branch">{currentBranch}</span>
			{#if overview}
				<span class:summary-pill--warn={overview.dirtyCount > 0} class="summary-pill">
					{overview.dirtyCount} changed
				</span>
				<span class="summary-pill">↑{overview.ahead} ↓{overview.behind}</span>
				{#if overview.conflictCount > 0}
					<span class="summary-pill summary-pill--danger">{overview.conflictCount} conflicts</span>
				{/if}
				<span class="summary-pill">{overview.connection?.label ?? "System Git credentials"}</span>
			{/if}
		</div>

		<div class="repository-card__actions">
			<Button
				size="tag"
				kind="outline"
				onclick={() => onAction(project.id, "fetch")}
				disabled={busy || !overview}
			>
				Fetch
			</Button>
			<Button
				size="tag"
				kind="outline"
				onclick={() => onAction(project.id, "commit")}
				disabled={busy || !overview}
			>
				Commit
			</Button>
			<Button
				size="tag"
				kind="outline"
				onclick={() => onAction(project.id, "push")}
				disabled={busy || !overview}
			>
				Push
			</Button>
			<Button
				size="tag"
				kind="outline"
				onclick={() => onAction(project.id, "latest")}
				disabled={busy || !overview}
			>
				Get Latest
			</Button>
			<Button size="tag" kind="outline" icon="open-in-folder" onclick={() => onOpen(project.id)}
				>Workspace</Button
			>
		</div>
	</div>

	{#if operation}
		<div
			class:operation--failed={operation.state === "failed"}
			class="operation operation--{operation.state}"
		>
			<strong>{operation.kind}</strong>
			<span>{operation.detail}</span>
		</div>
	{/if}

	{#if loading}
		<div class="repository-state"><span class="loading-orb"></span> Reading real Git state…</div>
	{:else if overviewError}
		<div class="repository-state repository-state--error">{overviewError}</div>
	{:else if overview}
		<div class="branch-table" role="table" aria-label={`${project.title} branches and worktrees`}>
			<div class="branch-row branch-row--header" role="row">
				<span>Branch</span><span>Worktree</span><span>State</span><span>Divergence</span><span
					>Agent / owner</span
				><span>Presence</span>
			</div>
			{#each overview.branches as branch (branch.refName)}
				<button
					type="button"
					class:branch-row--active={branch.worktreePath === selectedWorktreePath ||
						(!selectedWorktreePath && branch.isPrimary)}
					class:branch-row--detached={!branch.isCheckedOut}
					class="branch-row"
					onclick={() => onSelectBranch(project.id, branch)}
				>
					<span class="branch-name">
						<i class:branch-dot--primary={branch.isPrimary} class="branch-dot"></i>
						<strong>{branch.name}</strong>
						<small title={`base ${branch.baseCommit}`}>{branch.head.slice(0, 8)}</small>
					</span>
					<span title={branch.worktreePath ?? "Not checked out"}>
						{branch.worktreeName ?? "Not checked out"}
					</span>
					<span>
						{#if branch.conflictCount > 0}
							<b class="state-danger">{branch.conflictCount} conflicts</b>
						{:else if branch.dirtyCount > 0}
							<b class="state-warn">{branch.dirtyCount} changed</b>
						{:else if branch.isCheckedOut}
							Clean
						{:else}
							Stored ref
						{/if}
					</span>
					<span title={shortRef(branch.upstream)}>↑{branch.ahead} ↓{branch.behind}</span>
					<span>{branch.sessionId ? `Session ${branch.sessionId.slice(0, 8)}` : branch.owner}</span>
					<span class="presence">{branch.presence}</span>
				</button>
			{/each}
			{#if overview.branches.length === 0}
				<div class="branch-empty">No local branches are available.</div>
			{/if}
		</div>
	{/if}
</article>

<style lang="postcss">
	.repository-card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-ml);
		background: var(--bg-1);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.repository-card.selected,
	.repository-card.focused {
		border-color: color-mix(in srgb, var(--fill-pop-bg) 72%, var(--border-2));
	}

	.repository-card.focused {
		box-shadow: 0 8px 30px color-mix(in srgb, var(--fill-pop-bg) 11%, transparent);
	}

	.repository-card__topline,
	.repository-card__identity,
	.repository-card__summary,
	.repository-card__actions,
	.operation,
	.repository-state,
	.branch-name {
		display: flex;
		align-items: center;
	}

	.repository-card__topline {
		padding: 12px 14px;
		gap: 10px;
		border-bottom: 1px solid var(--border-2);
	}

	.repository-card__check {
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.repository-card__check input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	.checkmark {
		width: 15px;
		height: 15px;
		border: 1px solid var(--border-3);
		border-radius: 4px;
		background: var(--bg-2);
	}

	.repository-card__check input:checked + .checkmark {
		border-color: var(--fill-pop-bg);
		background: var(--fill-pop-bg);
		box-shadow: inset 0 0 0 3px var(--bg-1);
	}

	.repository-card__identity {
		flex: 0 1 240px;
		min-width: 150px;
		padding: 0;
		gap: 9px;
		border: 0;
		background: transparent;
		color: var(--text-1);
		text-align: left;
		cursor: pointer;
	}

	.repository-card__icon {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		background: color-mix(in srgb, var(--fill-pop-bg) 18%, var(--bg-2));
		color: var(--fill-pop-bg);
		font-weight: 700;
	}

	.repository-card__name-wrap {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 3px;
	}

	.repository-card__name-wrap strong,
	.repository-card__name-wrap span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.repository-card__name-wrap strong {
		font-size: 14px;
	}

	.repository-card__name-wrap span {
		color: var(--text-3);
		font-size: 12px;
		font-family: var(--font-mono);
	}

	.repository-card__summary {
		flex: 1;
		flex-wrap: wrap;
		gap: 5px;
	}

	.summary-pill {
		max-width: 180px;
		padding: 4px 7px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--bg-2);
		color: var(--text-3);
		font-size: 12px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.summary-pill--branch {
		color: var(--text-1);
	}

	.summary-pill--warn,
	.state-warn {
		color: var(--clr-warning-50, #d4a64f);
	}

	.summary-pill--danger,
	.state-danger {
		color: var(--clr-error-50, #e56b6f);
	}

	.repository-card__actions {
		flex: 0 0 auto;
		gap: 4px;
	}

	.operation {
		padding: 8px 14px;
		gap: 8px;
		border-bottom: 1px solid var(--border-2);
		background: color-mix(in srgb, #63c18b 9%, var(--bg-1));
		font-size: 12px;
	}

	.operation--running {
		background: color-mix(in srgb, var(--fill-pop-bg) 9%, var(--bg-1));
	}

	.operation--failed {
		background: color-mix(in srgb, #e56b6f 9%, var(--bg-1));
		color: #e56b6f;
	}

	.operation strong {
		text-transform: capitalize;
	}

	.operation span {
		overflow: hidden;
		color: var(--text-2);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.repository-state {
		justify-content: center;
		min-height: 76px;
		gap: 8px;
		color: var(--text-3);
		font-size: 13px;
	}

	.repository-state--error {
		padding: 16px;
		color: #e56b6f;
		text-align: center;
	}

	.loading-orb {
		width: 14px;
		height: 14px;
		border: 2px solid var(--border-2);
		border-radius: 50%;
		border-top-color: var(--fill-pop-bg);
		animation: spin 0.8s linear infinite;
	}

	.branch-table {
		min-width: 720px;
		overflow: auto;
	}

	.branch-row {
		display: grid;
		grid-template-columns:
			minmax(155px, 1.3fr) minmax(100px, 0.9fr) minmax(90px, 0.8fr)
			82px minmax(110px, 0.9fr) 90px;
		width: 100%;
		min-width: 720px;
		padding: 8px 14px;
		gap: 10px;
		border: 0;
		border-bottom: 1px solid var(--border-2);
		background: transparent;
		color: var(--text-2);
		font: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
	}

	.branch-row:last-child {
		border-bottom: 0;
	}

	.branch-row:not(.branch-row--header):hover,
	.branch-row--active {
		background: color-mix(in srgb, var(--fill-pop-bg) 7%, var(--bg-1));
	}

	.branch-row--header {
		background: var(--bg-2);
		color: var(--text-3);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: default;
	}

	.branch-row--detached {
		opacity: 0.72;
	}

	.branch-row > span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.branch-name {
		gap: 6px;
	}

	.branch-name strong {
		overflow: hidden;
		color: var(--text-1);
		font-size: 13px;
		text-overflow: ellipsis;
	}

	.branch-name small {
		color: var(--text-3);
		font-family: var(--font-mono);
	}

	.branch-dot {
		flex: 0 0 auto;
		width: 7px;
		height: 7px;
		border: 1px solid var(--border-3);
		border-radius: 50%;
	}

	.branch-dot--primary {
		border-color: var(--fill-pop-bg);
		background: var(--fill-pop-bg);
	}

	.presence {
		color: var(--text-3);
		text-transform: capitalize;
	}

	.branch-empty {
		padding: 18px;
		color: var(--text-3);
		font-size: 13px;
		text-align: center;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 1050px) {
		.repository-card__topline {
			flex-wrap: wrap;
		}
		.repository-card__summary {
			flex-basis: 100%;
			order: 3;
			padding-left: 28px;
		}
		.repository-card__actions {
			margin-left: auto;
		}
	}
</style>
