<script lang="ts">
	import { goto } from "$app/navigation";
	import RepositoryCard from "$components/dashboard/RepositoryCard.svelte";
	import { BASE_BRANCH_SERVICE } from "$lib/baseBranch/baseBranchService.svelte";
	import { showError } from "$lib/error/showError";
	import { showToast } from "$lib/notifications/toasts";
	import { handleAddProjectOutcome } from "$lib/project/project";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { projectPath, workspacePath } from "$lib/routes/routes.svelte";
	import { inject } from "@gitbutler/core/context";
	import { persisted } from "@gitbutler/shared/persisted";
	import { chipToasts } from "@gitbutler/ui";
	import { get } from "svelte/store";

	type PanelId = "repositories" | "tasks" | "conversation" | "details";
	type DetailTab = "graph" | "files" | "git" | "terminal";

	const panelIds: PanelId[] = ["repositories", "tasks", "conversation", "details"];
	const panelTitles: Record<PanelId, string> = {
		repositories: "Repositories",
		tasks: "AI tasks",
		conversation: "Conversation",
		details: "Details",
	};

	const projectsService = inject(PROJECTS_SERVICE);
	const baseBranchService = inject(BASE_BRANCH_SERVICE);
	const projectsQuery = $derived(projectsService.projects());
	const serverCapabilitiesQuery = $derived(projectsService.serverCapabilities());
	const canAddProjects = $derived(serverCapabilitiesQuery.response?.canAddProjects ?? true);

	const panelOrder = persisted<PanelId[]>(panelIds, "gittogether-dashboard-panel-order");
	const collapsedPanels = persisted<PanelId[]>([], "gittogether-dashboard-collapsed-panels");

	let filter = $state("");
	let selectedProjectIds = $state<string[]>([]);
	let batchLoading = $state(false);
	let newProjectLoading = $state(false);
	let detailTab = $state<DetailTab>("git");

	const projects = $derived(projectsQuery.response ?? []);
	const filteredProjects = $derived.by(() => {
		const normalized = filter.trim().toLowerCase();
		if (!normalized) return projects;
		return projects.filter((project) => {
			return `${project.title} ${project.path}`.toLowerCase().includes(normalized);
		});
	});
	const selectedProjects = $derived(
		projects.filter((project) => selectedProjectIds.includes(project.id)),
	);
	const selectedProject = $derived(selectedProjects[0] ?? filteredProjects[0]);
	const visibleProjectIds = $derived(filteredProjects.map((project) => project.id));
	const allVisibleSelected = $derived(
		visibleProjectIds.length > 0 &&
			visibleProjectIds.every((id) => selectedProjectIds.includes(id)),
	);

	function isCollapsed(panel: PanelId) {
		return $collapsedPanels.includes(panel);
	}

	function togglePanel(panel: PanelId) {
		const current = $collapsedPanels;
		collapsedPanels.set(
			current.includes(panel) ? current.filter((item) => item !== panel) : [...current, panel],
		);
	}

	function movePanel(panel: PanelId, direction: -1 | 1) {
		const current = get(panelOrder);
		const index = current.indexOf(panel);
		const nextIndex = index + direction;
		if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
		const next = [...current];
		[next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
		panelOrder.set(next);
	}

	function toggleProject(projectId: string) {
		selectedProjectIds = selectedProjectIds.includes(projectId)
			? selectedProjectIds.filter((id) => id !== projectId)
			: [...selectedProjectIds, projectId];
	}

	function toggleVisibleProjects() {
		if (allVisibleSelected) {
			selectedProjectIds = selectedProjectIds.filter((id) => !visibleProjectIds.includes(id));
		} else {
			selectedProjectIds = [...new Set([...selectedProjectIds, ...visibleProjectIds])];
		}
	}

	function openProject(projectId: string) {
		goto(projectPath(projectId));
	}

	function openCommitWorkspace(projectId: string) {
		if (selectedProjectIds.length > 1) {
			showToast({
				style: "info",
				title: "Opening repository workspace",
				message: "Review and commit repositories one at a time before pushing.",
			});
		}
		goto(`${workspacePath(projectId)}?create=1`);
	}

	async function addProject() {
		newProjectLoading = true;
		try {
			const outcome = await projectsService.addProject();
			if (outcome) {
				handleAddProjectOutcome(outcome, (project) => openProject(project.id));
			}
		} catch (error: unknown) {
			showError("Unable to add repository", error);
		} finally {
			newProjectLoading = false;
		}
	}

	async function getLatest() {
		const targetIds = selectedProjectIds.length > 0 ? selectedProjectIds : visibleProjectIds;
		if (targetIds.length === 0) return;

		batchLoading = true;
		const outcomes = await Promise.allSettled(
			targetIds.map((projectId) =>
				baseBranchService.fetchFromRemotes(projectId, "modal", { rethrow: true }),
			),
		);
		batchLoading = false;

		const failures = outcomes.filter((outcome) => outcome.status === "rejected");
		if (failures.length > 0) {
			showError("Some repositories could not be updated", failures[0]?.reason);
			return;
		}
		chipToasts.success(
			`Fetched latest changes for ${targetIds.length} ${targetIds.length === 1 ? "repository" : "repositories"}`,
		);
	}

	function panelActionLabel(panel: PanelId) {
		return isCollapsed(panel) ? `Expand ${panelTitles[panel]}` : `Collapse ${panelTitles[panel]}`;
	}
</script>

<svelte:head>
	<title>GitTogether · Repositories</title>
</svelte:head>

<main class="dashboard" aria-label="GitTogether dashboard">
	<header class="dashboard-header">
		<div class="dashboard-brand">
			<div class="dashboard-brand__mark" aria-hidden="true">GT</div>
			<div>
				<h1>GitTogether</h1>
				<p>Repository workspace for humans and agents</p>
			</div>
		</div>
		<div class="dashboard-header__actions">
			<span class="connection-state"><span class="connection-state__dot"></span>Local Git mode</span
			>
			{#if canAddProjects}
				<button
					class="dashboard-button dashboard-button--primary"
					type="button"
					onclick={addProject}
					disabled={newProjectLoading}
				>
					{newProjectLoading ? "Adding…" : "+ Add repository"}
				</button>
			{/if}
			<button class="dashboard-button" type="button" onclick={() => goto("/onboarding/clone")}>
				Clone
			</button>
		</div>
	</header>

	<div class="dashboard-toolbar">
		<div class="dashboard-toolbar__title">
			<span class="eyebrow">Overview</span>
			<strong>{projects.length} {projects.length === 1 ? "repository" : "repositories"}</strong>
		</div>
		<label class="search-box">
			<span aria-hidden="true">⌕</span>
			<input
				bind:value={filter}
				placeholder="Search repositories"
				aria-label="Search repositories"
			/>
		</label>
		<button class="toolbar-link" type="button" onclick={toggleVisibleProjects}>
			{allVisibleSelected ? "Clear visible" : "Select visible"}
		</button>
		<button
			class="toolbar-link"
			type="button"
			onclick={getLatest}
			disabled={batchLoading || filteredProjects.length === 0}
		>
			{batchLoading ? "Fetching…" : "Get latest"}
		</button>
	</div>

	<div class="dashboard-grid">
		{#each $panelOrder as panel, index (panel)}
			<section
				class:panel-collapsed={isCollapsed(panel)}
				class="dashboard-panel dashboard-panel--{panel}"
			>
				<div class="panel-header">
					<div>
						<span class="panel-kicker">{String(index + 1).padStart(2, "0")}</span>
						<h2>{panelTitles[panel]}</h2>
					</div>
					<div class="panel-header__actions">
						<button
							type="button"
							class="panel-icon-button"
							aria-label={`Move ${panelTitles[panel]} left`}
							onclick={() => movePanel(panel, -1)}
							disabled={index === 0}>←</button
						>
						<button
							type="button"
							class="panel-icon-button"
							aria-label={`Move ${panelTitles[panel]} right`}
							onclick={() => movePanel(panel, 1)}
							disabled={index === $panelOrder.length - 1}>→</button
						>
						<button
							type="button"
							class="panel-icon-button"
							aria-label={panelActionLabel(panel)}
							onclick={() => togglePanel(panel)}>{isCollapsed(panel) ? "+" : "−"}</button
						>
					</div>
				</div>

				{#if !isCollapsed(panel)}
					{#if panel === "repositories"}
						<div class="panel-content panel-content--repositories">
							{#if projectsQuery.response === undefined}
								<div class="panel-empty">
									<span class="loading-orb"></span>
									<p>Loading repositories…</p>
								</div>
							{:else if filteredProjects.length === 0}
								<div class="panel-empty">
									<strong
										>{projects.length === 0
											? "Your repository home is ready"
											: "No repositories match"}</strong
									>
									<p>
										{projects.length === 0
											? "Add a local repository or clone one to start working."
											: "Try a different name or path."}
									</p>
									{#if projects.length === 0 && canAddProjects}<button
											class="dashboard-button dashboard-button--primary"
											type="button"
											onclick={addProject}>Add your first repository</button
										>{/if}
								</div>
							{:else}
								<div class="repository-list">
									{#each filteredProjects as project (project.id)}
										<RepositoryCard
											{project}
											selected={selectedProjectIds.includes(project.id)}
											onToggle={toggleProject}
											onOpen={openProject}
											onCommit={openCommitWorkspace}
										/>
									{/each}
								</div>
								<div class="batch-footer">
									<span
										>{selectedProjectIds.length
											? `${selectedProjectIds.length} selected`
											: "All visible repositories are targeted"}</span
									>
									<button
										class="dashboard-button dashboard-button--primary"
										type="button"
										onclick={() =>
											openCommitWorkspace((selectedProjects[0] ?? filteredProjects[0])!.id)}
										disabled={filteredProjects.length === 0}
									>
										Review &amp; commit
									</button>
								</div>
							{/if}
						</div>
					{:else if panel === "tasks"}
						<div class="panel-content panel-empty">
							<div class="empty-symbol">✦</div>
							<strong>No active AI tasks</strong>
							<p>
								Tasks will be attached to repositories and worktrees here. The local dashboard is
								ready before Presence/GPS is connected.
							</p>
						</div>
					{:else if panel === "conversation"}
						<div class="panel-content panel-empty">
							<div class="empty-symbol">◌</div>
							<strong>No conversation selected</strong>
							<p>
								Choose a repository to open its workspace. Chat and agent sessions will remain
								scoped to that repository.
							</p>
						</div>
					{:else}
						<div class="panel-content panel-content--details">
							<div class="detail-tabs" role="tablist" aria-label="Repository details">
								{#each [{ id: "graph", label: "Git Graph" }, { id: "files", label: "Files" }, { id: "git", label: "Git details" }, { id: "terminal", label: "Terminal" }] as tab}
									<button
										type="button"
										role="tab"
										aria-selected={detailTab === tab.id}
										class:detail-tab--active={detailTab === tab.id}
										class="detail-tab"
										onclick={() => (detailTab = tab.id as DetailTab)}>{tab.label}</button
									>
								{/each}
							</div>
							{#if selectedProject}
								<div class="detail-card">
									<strong>{selectedProject.title}</strong>
									<span class="detail-card__path">{selectedProject.path}</span>
									{#if detailTab === "graph"}
										<div class="mini-graph">
											<span class="graph-line"></span><span class="graph-node graph-node--main"
											></span><span class="graph-node graph-node--feature"></span><span
												class="graph-label">Open workspace to inspect the full Git graph</span
											>
										</div>
									{:else if detailTab === "files"}
										<div class="detail-placeholder">
											<span>◫</span>
											<p>Changed files and folder presence appear in the repository workspace.</p>
										</div>
									{:else if detailTab === "git"}
										<div class="detail-list">
											<div><span>Mode</span><strong>Git Mode</strong></div>
											<div><span>Worktree</span><strong>Local checkout</strong></div>
											<div><span>Server</span><strong>Not connected</strong></div>
										</div>
									{:else}
										<pre>{selectedProject.path}

GitTogether terminal follows the selected worktree.</pre>
									{/if}
									<button
										class="text-link"
										type="button"
										onclick={() => openProject(selectedProject!.id)}
										>Open repository workspace →</button
									>
								</div>
							{:else}
								<div class="panel-empty">
									<strong>Select a repository</strong>
									<p>Repository details will appear here.</p>
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</section>
		{/each}
	</div>
</main>

<style lang="postcss">
	.dashboard {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 100%;
		padding: 30px clamp(20px, 5vw, 72px) 48px;
		overflow: auto;
		gap: 22px;
		background:
			radial-gradient(
				circle at 85% 0%,
				color-mix(in srgb, var(--fill-pop-bg) 12%, transparent),
				transparent 35%
			),
			var(--bg-2);
	}

	.dashboard-header,
	.dashboard-toolbar,
	.dashboard-brand,
	.dashboard-header__actions,
	.panel-header,
	.panel-header__actions,
	.dashboard-toolbar__title,
	.connection-state,
	.batch-footer,
	.detail-tabs {
		display: flex;
		align-items: center;
	}

	.dashboard-header,
	.dashboard-toolbar {
		justify-content: space-between;
	}

	.dashboard-header {
		min-height: 56px;
		gap: 20px;
	}

	.dashboard-brand {
		gap: 12px;
	}

	.dashboard-brand__mark {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		border-radius: 13px;
		background: var(--fill-pop-bg);
		box-shadow: 0 8px 24px color-mix(in srgb, var(--fill-pop-bg) 28%, transparent);
		color: var(--bg-1);
		font-weight: 800;
		font-size: 14px;
		letter-spacing: -0.06em;
	}

	.dashboard-brand h1,
	.dashboard-brand p,
	.panel-header h2,
	.panel-header p {
		margin: 0;
	}

	.dashboard-brand h1 {
		font-size: 20px;
		letter-spacing: -0.03em;
	}

	.dashboard-brand p {
		margin-top: 3px;
		color: var(--text-3);
		font-size: 11px;
	}

	.dashboard-header__actions {
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}

	.connection-state {
		margin-right: 6px;
		gap: 6px;
		color: var(--text-3);
		font-size: 11px;
	}

	.connection-state__dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #63c18b;
		box-shadow: 0 0 0 3px color-mix(in srgb, #63c18b 14%, transparent);
	}

	.dashboard-button,
	.toolbar-link,
	.panel-icon-button,
	.detail-tab,
	.text-link {
		border: 0;
		background: transparent;
		color: var(--text-2);
		font: inherit;
		cursor: pointer;
	}

	.dashboard-button {
		padding: 8px 12px;
		border: 1px solid var(--border-2);
		border-radius: 8px;
		background: var(--bg-1);
		font-weight: 600;
		font-size: 11px;
	}

	.dashboard-button:hover,
	.toolbar-link:hover,
	.panel-icon-button:hover,
	.text-link:hover {
		color: var(--text-1);
	}

	.dashboard-button:disabled,
	.toolbar-link:disabled,
	.panel-icon-button:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.dashboard-button--primary {
		border-color: var(--fill-pop-bg);
		background: var(--fill-pop-bg);
		color: var(--bg-1);
	}

	.dashboard-toolbar {
		padding: 10px 0 14px;
		gap: 14px;
		border-bottom: 1px solid var(--border-2);
	}

	.dashboard-toolbar__title {
		min-width: max-content;
		gap: 10px;
	}

	.eyebrow,
	.panel-kicker {
		color: var(--text-3);
		font-weight: 700;
		font-size: 10px;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.search-box {
		display: flex;
		align-items: center;
		width: min(340px, 38vw);
		padding: 0 10px;
		gap: 7px;
		border: 1px solid var(--border-2);
		border-radius: 8px;
		background: var(--bg-1);
		color: var(--text-3);
	}

	.search-box input {
		width: 100%;
		padding: 8px 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text-1);
		font: inherit;
		font-size: 11px;
	}

	.dashboard-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: 14px;
	}

	.dashboard-panel {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-ml);
		background: color-mix(in srgb, var(--bg-1) 92%, transparent);
	}

	.dashboard-panel--repositories,
	.dashboard-panel--details {
		grid-column: span 2;
	}

	.dashboard-panel.panel-collapsed {
		grid-column: span 1;
	}

	.panel-header {
		justify-content: space-between;
		padding: 14px 16px;
		gap: 12px;
		border-bottom: 1px solid var(--border-2);
	}

	.panel-header h2 {
		margin-top: 4px;
		font-size: 13px;
		letter-spacing: -0.01em;
	}

	.panel-kicker {
		font-size: 9px;
		font-family: var(--font-mono);
	}

	.panel-header__actions {
		gap: 2px;
	}

	.panel-icon-button {
		width: 25px;
		height: 25px;
		border-radius: 6px;
		font-size: 15px;
		line-height: 1;
	}

	.panel-icon-button:hover {
		background: var(--bg-2);
	}

	.panel-content {
		padding: 16px;
	}

	.panel-content--repositories {
		padding-bottom: 10px;
	}

	.repository-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.batch-footer {
		justify-content: space-between;
		padding: 14px 2px 2px;
		gap: 12px;
		color: var(--text-3);
		font-size: 10px;
	}

	.panel-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 150px;
		padding: 24px;
		gap: 8px;
		color: var(--text-2);
		text-align: center;
	}

	.panel-empty strong {
		color: var(--text-1);
		font-size: 12px;
	}

	.panel-empty p {
		max-width: 420px;
		margin: 0;
		color: var(--text-3);
		font-size: 11px;
		line-height: 1.55;
	}

	.empty-symbol {
		margin-bottom: 3px;
		color: var(--fill-pop-bg);
		font-size: 24px;
	}

	.loading-orb {
		width: 18px;
		height: 18px;
		border: 2px solid var(--border-2);
		border-radius: 50%;
		border-top-color: var(--fill-pop-bg);
		animation: spin 0.8s linear infinite;
	}

	.panel-content--details {
		padding: 0;
	}

	.detail-tabs {
		padding: 8px 12px 0;
		gap: 4px;
		border-bottom: 1px solid var(--border-2);
	}

	.detail-tab {
		padding: 8px 10px 10px;
		border-bottom: 2px solid transparent;
		font-size: 10px;
	}

	.detail-tab--active {
		border-bottom-color: var(--fill-pop-bg);
		color: var(--text-1);
	}

	.detail-card {
		display: flex;
		flex-direction: column;
		min-height: 170px;
		padding: 18px;
		gap: 8px;
	}

	.detail-card > strong {
		font-size: 13px;
	}

	.detail-card__path {
		overflow: hidden;
		color: var(--text-3);
		font-size: 10px;
		font-family: var(--font-mono);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.text-link {
		align-self: flex-start;
		margin-top: auto;
		padding-top: 10px;
		color: var(--fill-pop-bg);
		font-weight: 600;
		font-size: 11px;
	}

	.mini-graph {
		display: grid;
		position: relative;
		grid-template-columns: 26px 1fr;
		align-items: center;
		min-height: 65px;
		padding: 6px 0 6px 18px;
	}

	.graph-line {
		position: absolute;
		top: 7px;
		bottom: 7px;
		left: 25px;
		width: 2px;
		background: var(--border-3);
	}

	.graph-node {
		z-index: 1;
		width: 10px;
		height: 10px;
		border: 2px solid var(--bg-1);
		border-radius: 50%;
		background: var(--fill-pop-bg);
	}

	.graph-node--feature {
		margin-top: 26px;
		background: var(--commit-local, var(--fill-pop-bg));
	}

	.graph-label {
		color: var(--text-3);
		font-size: 10px;
	}

	.detail-placeholder {
		display: flex;
		align-items: center;
		padding: 18px 0;
		gap: 10px;
		color: var(--text-3);
		font-size: 11px;
	}

	.detail-placeholder span {
		color: var(--fill-pop-bg);
		font-size: 22px;
	}

	.detail-placeholder p {
		margin: 0;
	}

	.detail-list {
		display: grid;
		margin-top: 12px;
		gap: 9px;
	}

	.detail-list div {
		display: flex;
		justify-content: space-between;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border-2);
		font-size: 11px;
	}

	.detail-list span {
		color: var(--text-3);
	}

	.detail-list strong {
		color: var(--text-1);
		font-weight: 600;
	}

	pre {
		margin: 12px 0 0;
		padding: 12px;
		border-radius: 8px;
		background: var(--bg-2);
		color: var(--text-2);
		font-size: 10px;
		line-height: 1.5;
		font-family: var(--font-mono);
		white-space: pre-wrap;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 920px) {
		.dashboard {
			padding-inline: 22px;
		}

		.dashboard-header,
		.dashboard-toolbar {
			flex-direction: column;
			align-items: flex-start;
		}

		.dashboard-header,
		.dashboard-header__actions,
		.dashboard-toolbar {
			width: 100%;
		}

		.dashboard-header__actions {
			justify-content: flex-start;
		}

		.search-box {
			width: 100%;
		}
	}

	@media (max-width: 720px) {
		.dashboard-grid,
		.repository-list {
			grid-template-columns: minmax(0, 1fr);
		}

		.dashboard-panel--repositories,
		.dashboard-panel--details,
		.dashboard-panel.panel-collapsed {
			grid-column: span 1;
		}
	}
</style>
