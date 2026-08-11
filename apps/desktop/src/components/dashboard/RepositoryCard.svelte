<script lang="ts">
	import SyncButton from "$components/forge/SyncButton.svelte";
	import { BASE_BRANCH_SERVICE } from "$lib/baseBranch/baseBranchService.svelte";
	import { inject } from "@gitbutler/core/context";
	import type { Project } from "$lib/project/project";

	type Props = {
		project: Project;
		selected: boolean;
		onToggle: (projectId: string) => void;
		onOpen: (projectId: string) => void;
		onCommit: (projectId: string) => void;
	};

	let { project, selected, onToggle, onOpen, onCommit }: Props = $props();

	const baseBranchService = inject(BASE_BRANCH_SERVICE);
	const baseBranchQuery = $derived(baseBranchService.baseBranch(project.id));
	const baseBranch = $derived(baseBranchQuery.response);
	const targetLabel = $derived(
		baseBranch ? `${baseBranch.remoteName}/${baseBranch.shortName}` : "Target branch not set",
	);
	const upstreamLabel = $derived(baseBranch?.behind ? `${baseBranch.behind} behind` : "Up to date");
</script>

<article class:selected class="repository-card">
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
			aria-label={`Open ${project.title}`}
		>
			<span class="repository-card__icon" aria-hidden="true">⌘</span>
			<span class="repository-card__name-wrap">
				<strong>{project.title}</strong>
				<span>{project.path}</span>
			</span>
		</button>

		<div class="repository-card__actions">
			<SyncButton projectId={project.id} />
			<button class="card-action" type="button" onclick={() => onCommit(project.id)}>
				Review &amp; commit
			</button>
		</div>
	</div>

	<div class="repository-card__status">
		<span class="status-pill status-pill--branch">
			<span class="status-dot" aria-hidden="true"></span>
			{targetLabel}
		</span>
		<span class="status-pill">{upstreamLabel}</span>
		<span class="status-pill">Local Git mode</span>
	</div>
</article>

<style lang="postcss">
	.repository-card {
		display: flex;
		flex-direction: column;
		padding: 14px;
		gap: 12px;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-ml);
		background: var(--bg-1);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			transform var(--transition-fast);
	}

	.repository-card:hover,
	.repository-card.selected {
		border-color: var(--fill-pop-bg);
		box-shadow: 0 8px 24px color-mix(in srgb, var(--fill-pop-bg) 12%, transparent);
	}

	.repository-card:hover {
		transform: translateY(-1px);
	}

	.repository-card__topline,
	.repository-card__identity,
	.repository-card__actions,
	.repository-card__status {
		display: flex;
		align-items: center;
	}

	.repository-card__topline {
		gap: 10px;
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
		white-space: nowrap;
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
		flex: 1;
		min-width: 0;
		padding: 0;
		gap: 10px;
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
		font-size: 16px;
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
		font-size: 13px;
	}

	.repository-card__name-wrap span {
		color: var(--text-3);
		font-size: 10px;
		font-family: var(--font-mono);
	}

	.repository-card__actions {
		flex: 0 0 auto;
		gap: 6px;
	}

	.card-action {
		padding: 7px 10px;
		border: 1px solid var(--border-2);
		border-radius: 8px;
		background: var(--bg-2);
		color: var(--text-2);
		font-weight: 600;
		font-size: 11px;
		cursor: pointer;
	}

	.card-action:hover {
		border-color: var(--fill-pop-bg);
		color: var(--text-1);
	}

	.repository-card__status {
		flex-wrap: wrap;
		padding-left: 28px;
		gap: 6px;
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		padding: 4px 8px;
		border-radius: 999px;
		background: var(--bg-2);
		color: var(--text-3);
		font-size: 10px;
	}

	.status-pill--branch {
		max-width: 240px;
		overflow: hidden;
		color: var(--text-2);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		margin-right: 5px;
		border-radius: 50%;
		background: var(--fill-pop-bg);
	}

	@media (max-width: 760px) {
		.repository-card__topline {
			flex-wrap: wrap;
			align-items: flex-start;
		}

		.repository-card__actions {
			width: 100%;
			padding-left: 28px;
		}
	}
</style>
