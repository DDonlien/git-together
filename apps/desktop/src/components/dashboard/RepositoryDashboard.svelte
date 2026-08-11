<script lang="ts">
	import { goto } from "$app/navigation";
	import RepositoryCard from "$components/dashboard/RepositoryCard.svelte";
	import { BACKEND } from "$lib/backend";
	import { showError } from "$lib/error/showError";
	import { GitTogetherService } from "$lib/gittogether/gitTogetherService";
	import { showToast } from "$lib/notifications/toasts";
	import { handleAddProjectOutcome } from "$lib/project/project";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { projectPath } from "$lib/routes/routes.svelte";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { inject } from "@gitbutler/core/context";
	import { persisted } from "@gitbutler/shared/persisted";
	import { chipToasts } from "@gitbutler/ui";
	import { convertFileSrc } from "@tauri-apps/api/core";
	import { onMount, untrack } from "svelte";
	import { get } from "svelte/store";
	import type {
		BranchSummary,
		ConnectionProfile,
		ConnectionState,
		FileDiff,
		FilePreview,
		GitTogetherMessage,
		LatestReview,
		ProjectOperationState,
		RepositoryAction,
		RepositoryOverview,
		SessionAssessment,
		SessionView,
	} from "$lib/gittogether/types";

	type PanelId = "repositories" | "tasks" | "conversation" | "details";
	type DetailTab = "files" | "diff" | "preview" | "terminal" | "graph" | "git";
	type ModalId = "commit" | "latest" | "connections" | "session" | null;

	const panelIds: PanelId[] = ["repositories", "tasks", "conversation", "details"];
	const panelTitles: Record<PanelId, string> = {
		repositories: "Repositories",
		tasks: "Threads / Tasks",
		conversation: "Chat",
		details: "Context",
	};
	const detailTabs: { id: DetailTab; label: string }[] = [
		{ id: "files", label: "Files" },
		{ id: "diff", label: "Diff" },
		{ id: "preview", label: "Preview" },
		{ id: "terminal", label: "Terminal" },
		{ id: "graph", label: "Git Graph" },
		{ id: "git", label: "Git Details" },
	];

	const backend = inject(BACKEND);
	const projectsService = inject(PROJECTS_SERVICE);
	const uiState = inject(UI_STATE);
	const gitTogether = new GitTogetherService(backend);
	const projectsQuery = $derived(projectsService.projects());
	const serverCapabilitiesQuery = $derived(projectsService.serverCapabilities());
	const canAddProjects = $derived(serverCapabilitiesQuery.response?.canAddProjects ?? true);

	const panelOrder = persisted<PanelId[]>(panelIds, "gittogether-dashboard-panel-order");
	const collapsedPanels = persisted<PanelId[]>([], "gittogether-dashboard-collapsed-panels");
	const branchOrderByProject = persisted<Record<string, string[]>>({}, "gittogether-branch-order");

	let filter = $state("");
	let selectedProjectIds = $state<string[]>([]);
	let focusedProjectId = $state<string>();
	let selectedWorktreePaths = $state<Record<string, string | undefined>>({});
	let overviews = $state<Record<string, RepositoryOverview | undefined>>({});
	let overviewErrors = $state<Record<string, string | undefined>>({});
	let overviewLoading = $state<Record<string, boolean>>({});
	let operations = $state<Record<string, ProjectOperationState | undefined>>({});
	let detailTab = $state<DetailTab>("git");
	let activeModal = $state<ModalId>(null);

	let selectedFilePath = $state<string>();
	let selectedFileDiff = $state<FileDiff>();
	let selectedFilePreview = $state<FilePreview>();
	let contextLoading = $state(false);
	let contextError = $state<string>();
	let contextRequest = 0;

	let selectedThreadId = $state<string>();
	let threadMessages = $state<GitTogetherMessage[]>([]);
	let threadLoading = $state(false);
	let messageDraft = $state("");
	let messageSending = $state(false);
	let newThreadTitle = $state("");
	let newThreadSessionId = $state("");
	let threadCreating = $state(false);

	let sessionTitle = $state("");
	let sessionOperationType = $state("code-edit");
	let sessionCreating = $state(false);
	let sessionBusy = $state<Record<string, boolean>>({});
	let sessionAssessments = $state<Record<string, SessionAssessment | undefined>>({});

	let commitMessage = $state("");
	let commitTargetIds = $state<string[]>([]);
	let commitSubmitting = $state(false);

	let latestReviews = $state<LatestReview[]>([]);
	let latestLoading = $state(false);
	let latestApplying = $state(false);

	let connections = $state<ConnectionState>({ profiles: [], bindings: {} });
	let connectionsLoading = $state(false);
	let connectionSaving = $state(false);
	let connectionId = $state<string>();
	let connectionLabel = $state("");
	let connectionBaseUrl = $state("");
	let connectionUsername = $state("");
	let connectionSecret = $state("");
	let pendingConnectionDelete = $state<string>();
	let cloneProfileId = $state("");
	let cloneUrl = $state("");
	let cloneDestination = $state("");
	let cloneLoading = $state(false);

	const projects = $derived(projectsQuery.response ?? []);
	const filteredProjects = $derived.by(() => {
		const normalized = filter.trim().toLowerCase();
		if (!normalized) return projects;
		return projects.filter((project) =>
			`${project.title} ${project.path}`.toLowerCase().includes(normalized),
		);
	});
	const focusedProject = $derived(
		projects.find((project) => project.id === focusedProjectId) ?? filteredProjects[0],
	);
	const focusedOverview = $derived(focusedProject ? overviews[focusedProject.id] : undefined);
	const focusedWorktreePath = $derived(
		focusedProject
			? (selectedWorktreePaths[focusedProject.id] ?? focusedOverview?.path ?? focusedProject.path)
			: undefined,
	);
	const focusedBranch = $derived(
		focusedOverview?.branches.find((branch) => branch.worktreePath === focusedWorktreePath) ??
			focusedOverview?.branches.find((branch) => branch.isPrimary),
	);
	const focusedFiles = $derived(focusedBranch?.files ?? focusedOverview?.files ?? []);
	const focusedThread = $derived(
		focusedOverview?.threads.find((thread) => thread.id === selectedThreadId),
	);
	const visibleProjectIds = $derived(filteredProjects.map((project) => project.id));
	const allVisibleSelected = $derived(
		visibleProjectIds.length > 0 &&
			visibleProjectIds.every((id) => selectedProjectIds.includes(id)),
	);
	const latestSafeCount = $derived(
		latestReviews.filter((review) => review.preview?.canApply && review.preview.expectedHead)
			.length,
	);

	onMount(() => {
		void loadConnections();
		const refreshInterval = window.setInterval(() => {
			if (projects.length > 0) void refreshProjects();
		}, 10_000);
		return () => window.clearInterval(refreshInterval);
	});

	$effect(() => {
		const ids = projects.map((project) => project.id);
		untrack(() => {
			if (!focusedProjectId || !ids.includes(focusedProjectId)) focusedProjectId = ids[0];
			for (const id of ids) {
				if (!overviews[id] && !overviewLoading[id]) void refreshOverview(id);
			}
		});
	});

	$effect(() => {
		const overview = focusedOverview;
		if (!overview) return;
		untrack(() => {
			if (!selectedThreadId || !overview.threads.some((thread) => thread.id === selectedThreadId)) {
				selectedThreadId = overview.threads[0]?.id;
			}
			if (!selectedFilePath || !focusedFiles.some((file) => file.path === selectedFilePath)) {
				selectedFilePath = focusedFiles[0]?.path;
			}
		});
	});

	$effect(() => {
		const projectId = focusedProject?.id;
		const threadId = selectedThreadId;
		untrack(() => {
			if (projectId && threadId) void loadMessages(projectId, threadId);
			else threadMessages = [];
		});
	});

	$effect(() => {
		const projectId = focusedProject?.id;
		const path = selectedFilePath;
		const worktreePath = focusedWorktreePath;
		untrack(() => {
			if (projectId && path) void loadFileContext(projectId, path, worktreePath);
			else {
				selectedFileDiff = undefined;
				selectedFilePreview = undefined;
			}
		});
	});

	function errorMessage(error: unknown): string {
		if (typeof error === "string") return error;
		if (error instanceof Error) return error.message;
		if (error && typeof error === "object" && "message" in error) {
			return String((error as { message: unknown }).message);
		}
		try {
			return JSON.stringify(error);
		} catch {
			return "Unknown error";
		}
	}

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

	function orderedFocusedBranches() {
		if (!focusedProject || !focusedOverview) return [];
		const savedOrder = get(branchOrderByProject)[focusedProject.id] ?? [];
		const savedPosition = new Map(savedOrder.map((refName, index) => [refName, index]));
		return [...focusedOverview.branches].sort((left, right) => {
			const leftPosition = savedPosition.get(left.refName);
			const rightPosition = savedPosition.get(right.refName);
			if (leftPosition !== undefined && rightPosition !== undefined) {
				return leftPosition - rightPosition;
			}
			if (leftPosition !== undefined) return -1;
			if (rightPosition !== undefined) return 1;
			return (
				Number(right.isPrimary) - Number(left.isPrimary) || left.name.localeCompare(right.name)
			);
		});
	}

	function moveBranch(refName: string, direction: -1 | 1) {
		if (!focusedProject) return;
		const orderedRefs = orderedFocusedBranches().map((branch) => branch.refName);
		const index = orderedRefs.indexOf(refName);
		const nextIndex = index + direction;
		if (index < 0 || nextIndex < 0 || nextIndex >= orderedRefs.length) return;
		[orderedRefs[index], orderedRefs[nextIndex]] = [orderedRefs[nextIndex]!, orderedRefs[index]!];
		branchOrderByProject.set({
			...get(branchOrderByProject),
			[focusedProject.id]: orderedRefs,
		});
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

	function focusProject(projectId: string) {
		focusedProjectId = projectId;
		const overview = overviews[projectId];
		if (!selectedWorktreePaths[projectId] && overview) {
			selectedWorktreePaths = { ...selectedWorktreePaths, [projectId]: overview.path };
		}
	}

	function selectBranch(projectId: string, branch: BranchSummary) {
		focusProject(projectId);
		if (!branch.worktreePath) {
			showToast({
				style: "info",
				title: "Branch is not checked out",
				message: `${branch.name} is a real stored ref but has no worktree context to open.`,
			});
			return;
		}
		selectedWorktreePaths = { ...selectedWorktreePaths, [projectId]: branch.worktreePath };
		selectedFilePath = branch.files[0]?.path;
	}

	function targetProjectIds(explicit?: string[]) {
		if (explicit?.length) return explicit;
		return selectedProjectIds.length > 0 ? selectedProjectIds : visibleProjectIds;
	}

	async function refreshOverview(projectId: string) {
		overviewLoading = { ...overviewLoading, [projectId]: true };
		overviewErrors = { ...overviewErrors, [projectId]: undefined };
		try {
			const overview = await gitTogether.repositoryOverview(projectId);
			overviews = { ...overviews, [projectId]: overview };
			if (!selectedWorktreePaths[projectId]) {
				selectedWorktreePaths = { ...selectedWorktreePaths, [projectId]: overview.path };
			}
		} catch (error: unknown) {
			overviewErrors = { ...overviewErrors, [projectId]: errorMessage(error) };
		} finally {
			overviewLoading = { ...overviewLoading, [projectId]: false };
		}
	}

	async function refreshProjects(projectIds = projects.map((project) => project.id)) {
		await Promise.all(projectIds.map(refreshOverview));
	}

	async function addProject() {
		try {
			const outcome = await projectsService.addProject();
			if (outcome) {
				handleAddProjectOutcome(outcome, (project) => {
					focusedProjectId = project.id;
					void refreshOverview(project.id);
				});
			}
		} catch (error: unknown) {
			showError("Unable to add repository", error);
		}
	}

	function setOperation(projectId: string, operation: ProjectOperationState) {
		operations = { ...operations, [projectId]: operation };
	}

	async function runMutation(
		projectId: string,
		action: Exclude<RepositoryAction, "latest">,
		message?: string,
	): Promise<boolean> {
		const worktreePath = selectedWorktreePaths[projectId] ?? overviews[projectId]?.path;
		setOperation(projectId, { state: "running", kind: action, detail: "Operation in progress…" });
		try {
			const result =
				action === "fetch"
					? await gitTogether.fetch(projectId)
					: action === "commit"
						? await gitTogether.commitAll(projectId, message ?? "", worktreePath)
						: await gitTogether.push(projectId, worktreePath);
			setOperation(projectId, {
				state: "succeeded",
				kind: result.kind,
				detail: result.detail,
			});
			return true;
		} catch (error: unknown) {
			setOperation(projectId, {
				state: "failed",
				kind: action,
				detail: `${errorMessage(error)} Open Connections if this repository needs a saved HTTPS account.`,
			});
			return false;
		} finally {
			await refreshOverview(projectId);
		}
	}

	async function runBatch(
		action: Exclude<RepositoryAction, "latest">,
		projectIds = targetProjectIds(),
		message?: string,
	) {
		if (projectIds.length === 0) return;
		const results = await Promise.all(projectIds.map((id) => runMutation(id, action, message)));
		const succeeded = results.filter(Boolean).length;
		const failed = results.length - succeeded;
		showToast({
			style: failed > 0 ? "warning" : "success",
			title: `${action[0]?.toUpperCase()}${action.slice(1)} finished`,
			message: `${succeeded} succeeded; ${failed} failed. Each repository keeps its own result above.`,
		});
	}

	function repositoryAction(projectId: string, action: RepositoryAction) {
		if (action === "latest") {
			void prepareLatest([projectId]);
		} else if (action === "commit") {
			openCommit([projectId]);
		} else {
			void runBatch(action, [projectId]);
		}
	}

	function openCommit(projectIds = targetProjectIds()) {
		if (projectIds.length === 0) return;
		commitTargetIds = projectIds;
		commitMessage = "";
		activeModal = "commit";
	}

	async function submitCommit() {
		if (!commitMessage.trim()) return;
		commitSubmitting = true;
		try {
			await runBatch("commit", commitTargetIds, commitMessage);
			activeModal = null;
		} finally {
			commitSubmitting = false;
		}
	}

	async function prepareLatest(projectIds = targetProjectIds()) {
		if (projectIds.length === 0) return;
		activeModal = "latest";
		latestLoading = true;
		latestReviews = projectIds.map((projectId) => ({
			projectId,
			projectTitle: projects.find((project) => project.id === projectId)?.title ?? projectId,
			worktreePath: selectedWorktreePaths[projectId] ?? overviews[projectId]?.path,
		}));
		latestReviews = await Promise.all(
			latestReviews.map(async (review) => {
				setOperation(review.projectId, {
					state: "running",
					kind: "fetch",
					detail: "Fetching remote refs before safety review…",
				});
				try {
					const fetched = await gitTogether.fetch(review.projectId);
					setOperation(review.projectId, {
						state: "succeeded",
						kind: fetched.kind,
						detail: fetched.detail,
					});
					const preview = await gitTogether.getLatestPreview(review.projectId, review.worktreePath);
					return { ...review, preview };
				} catch (error: unknown) {
					const detail = errorMessage(error);
					setOperation(review.projectId, { state: "failed", kind: "fetch", detail });
					return { ...review, error: detail };
				} finally {
					await refreshOverview(review.projectId);
				}
			}),
		);
		latestLoading = false;
	}

	async function applyLatest() {
		const applicable = latestReviews.filter(
			(review) => review.preview?.canApply && review.preview.expectedHead,
		);
		if (applicable.length === 0) {
			activeModal = null;
			chipToasts.success("No clean fast-forward needs to be applied");
			return;
		}
		latestApplying = true;
		const results = await Promise.all(
			applicable.map(async (review) => {
				setOperation(review.projectId, {
					state: "running",
					kind: "getLatest",
					detail: "Applying the reviewed fast-forward…",
				});
				try {
					const result = await gitTogether.getLatestApply(
						review.projectId,
						review.preview!.expectedHead!,
						review.worktreePath,
					);
					setOperation(review.projectId, {
						state: "succeeded",
						kind: result.kind,
						detail: result.detail,
					});
					return true;
				} catch (error: unknown) {
					setOperation(review.projectId, {
						state: "failed",
						kind: "getLatest",
						detail: errorMessage(error),
					});
					return false;
				} finally {
					await refreshOverview(review.projectId);
				}
			}),
		);
		latestApplying = false;
		activeModal = null;
		const succeeded = results.filter(Boolean).length;
		showToast({
			style: succeeded === results.length ? "success" : "warning",
			title: "Get Latest finished",
			message: `${succeeded} of ${results.length} reviewed fast-forwards were applied.`,
		});
	}

	async function loadMessages(projectId: string, threadId: string) {
		threadLoading = true;
		try {
			const messages = await gitTogether.messages(projectId, threadId);
			if (focusedProject?.id === projectId && selectedThreadId === threadId) {
				threadMessages = messages;
			}
		} catch (error: unknown) {
			showError("Unable to load thread", error);
		} finally {
			threadLoading = false;
		}
	}

	async function createThread() {
		if (!focusedProject || !newThreadTitle.trim()) return;
		threadCreating = true;
		try {
			const thread = await gitTogether.createThread(
				focusedProject.id,
				newThreadTitle,
				newThreadSessionId || undefined,
			);
			newThreadTitle = "";
			selectedThreadId = thread.id;
			await refreshOverview(focusedProject.id);
		} catch (error: unknown) {
			showError("Unable to create thread", error);
		} finally {
			threadCreating = false;
		}
	}

	async function sendMessage() {
		if (!focusedProject || !selectedThreadId || !messageDraft.trim()) return;
		messageSending = true;
		try {
			threadMessages = await gitTogether.addMessage(
				focusedProject.id,
				selectedThreadId,
				messageDraft,
			);
			messageDraft = "";
		} catch (error: unknown) {
			showError("Unable to save message", error);
		} finally {
			messageSending = false;
		}
	}

	async function createSession() {
		if (!focusedProject || !sessionTitle.trim()) return;
		sessionCreating = true;
		try {
			const session = await gitTogether.createSession(
				focusedProject.id,
				sessionTitle,
				sessionOperationType,
			);
			selectedWorktreePaths = {
				...selectedWorktreePaths,
				[focusedProject.id]: session.worktreePath,
			};
			sessionTitle = "";
			activeModal = null;
			await refreshOverview(focusedProject.id);
			chipToasts.success("Protected Work Session created in a real linked worktree");
		} catch (error: unknown) {
			showError("Unable to create Work Session", error);
		} finally {
			sessionCreating = false;
		}
	}

	async function snapshotSession(session: SessionView) {
		if (!focusedProject) return;
		sessionBusy = { ...sessionBusy, [session.id]: true };
		try {
			const result = await gitTogether.snapshotSession(focusedProject.id, session.id);
			sessionAssessments = { ...sessionAssessments, [session.id]: result.assessment };
			setOperation(focusedProject.id, {
				state: "succeeded",
				kind: result.operation.kind,
				detail: result.operation.detail,
			});
			await refreshOverview(focusedProject.id);
		} catch (error: unknown) {
			showError("Unable to snapshot Work Session", error);
		} finally {
			sessionBusy = { ...sessionBusy, [session.id]: false };
		}
	}

	async function assessSession(session: SessionView) {
		if (!focusedProject) return;
		sessionBusy = { ...sessionBusy, [session.id]: true };
		try {
			const assessment = await gitTogether.assessSession(focusedProject.id, session.id);
			sessionAssessments = { ...sessionAssessments, [session.id]: assessment };
		} catch (error: unknown) {
			showError("Unable to assess Work Session", error);
		} finally {
			sessionBusy = { ...sessionBusy, [session.id]: false };
		}
	}

	async function loadFileContext(projectId: string, path: string, worktreePath?: string) {
		const request = ++contextRequest;
		contextLoading = true;
		contextError = undefined;
		try {
			const [diff, preview] = await Promise.all([
				gitTogether.fileDiff(projectId, path, worktreePath),
				gitTogether.filePreview(projectId, path, worktreePath),
			]);
			if (request === contextRequest) {
				selectedFileDiff = diff;
				selectedFilePreview = preview;
			}
		} catch (error: unknown) {
			if (request === contextRequest) contextError = errorMessage(error);
		} finally {
			if (request === contextRequest) contextLoading = false;
		}
	}

	async function openTerminal(path = focusedWorktreePath) {
		if (!path) return;
		try {
			await backend.invoke("open_in_terminal", {
				terminalId: uiState.global.defaultTerminal.current.identifier,
				path,
			});
		} catch (error: unknown) {
			showError("Unable to open terminal", error);
		}
	}

	async function loadConnections() {
		connectionsLoading = true;
		try {
			connections = await gitTogether.connections();
			if (!cloneProfileId && connections.profiles[0]) cloneProfileId = connections.profiles[0].id;
		} catch (error: unknown) {
			showError("Unable to load server connections", error);
		} finally {
			connectionsLoading = false;
		}
	}

	function editConnection(profile?: ConnectionProfile) {
		connectionId = profile?.id;
		connectionLabel = profile?.label ?? "";
		connectionBaseUrl = profile?.baseUrl ?? "";
		connectionUsername = profile?.username ?? "";
		connectionSecret = "";
	}

	async function saveConnection() {
		connectionSaving = true;
		try {
			await gitTogether.saveConnection({
				id: connectionId,
				label: connectionLabel,
				baseUrl: connectionBaseUrl,
				username: connectionUsername,
				secretValue: connectionSecret || undefined,
			});
			editConnection();
			await loadConnections();
			chipToasts.success("Connection metadata saved; secret stored in the system Keychain");
		} catch (error: unknown) {
			showError("Unable to save connection", error);
		} finally {
			connectionSaving = false;
		}
	}

	async function deleteConnection(id: string) {
		if (pendingConnectionDelete !== id) {
			pendingConnectionDelete = id;
			return;
		}
		try {
			connections = await gitTogether.deleteConnection(id);
			pendingConnectionDelete = undefined;
			await refreshProjects();
		} catch (error: unknown) {
			showError("Unable to revoke connection", error);
		}
	}

	async function bindFocusedConnection(profileId: string) {
		if (!focusedProject) return;
		try {
			connections = await gitTogether.bindConnection(focusedProject.id, profileId || undefined);
			await refreshOverview(focusedProject.id);
		} catch (error: unknown) {
			showError("Unable to bind connection", error);
		}
	}

	async function chooseCloneDestination() {
		const selected = await backend.filePicker({
			directory: true,
			recursive: true,
			title: "Choose an empty clone destination",
		});
		if (selected) cloneDestination = Array.isArray(selected) ? (selected[0] ?? "") : selected;
	}

	async function cloneWithConnection() {
		if (!cloneProfileId || !cloneUrl.trim() || !cloneDestination.trim()) return;
		cloneLoading = true;
		try {
			await gitTogether.clone(cloneProfileId, cloneUrl, cloneDestination);
			const outcome = await projectsService.addProject(cloneDestination);
			if (outcome) {
				handleAddProjectOutcome(outcome, (project) => {
					focusedProjectId = project.id;
					selectedProjectIds = [project.id];
					void refreshOverview(project.id);
				});
			}
			cloneUrl = "";
			cloneDestination = "";
			activeModal = null;
		} catch (error: unknown) {
			showError("Unable to clone repository", error);
		} finally {
			cloneLoading = false;
		}
	}

	function fileName(path: string) {
		return path.split("/").pop() ?? path;
	}

	function formatTime(seconds: number) {
		return new Date(seconds * 1000).toLocaleString();
	}

	function bottomUpCommits() {
		return focusedOverview ? [...focusedOverview.commits].reverse() : [];
	}

	function previewImageUrl(path?: string) {
		return path ? convertFileSrc(path) : undefined;
	}
</script>

<svelte:head>
	<title>GitTogether · Repository workspace</title>
</svelte:head>

<main class="dashboard" aria-label="GitTogether repository workspace">
	<header class="dashboard-header">
		<div class="dashboard-brand">
			<div class="dashboard-brand__mark" aria-hidden="true">GT</div>
			<div>
				<h1>GitTogether</h1>
				<p>Ordinary Git branches, real worktrees, local-first collaboration</p>
			</div>
		</div>
		<div class="dashboard-header__actions">
			<span class="connection-state"><i></i>Local Git mode · Presence unavailable until 0.3.x</span>
			<button
				type="button"
				class="button"
				onclick={() => {
					activeModal = "connections";
					void loadConnections();
				}}
			>
				Connections
			</button>
			{#if canAddProjects}
				<button type="button" class="button button--primary" onclick={addProject}
					>+ Add repository</button
				>
			{/if}
			<button
				type="button"
				class="button"
				onclick={() => {
					activeModal = "connections";
					void loadConnections();
				}}
			>
				Clone with account
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
		<button type="button" class="toolbar-link" onclick={toggleVisibleProjects}>
			{allVisibleSelected ? "Clear visible" : "Select visible"}
		</button>
		<div class="batch-actions" aria-label="Batch Git operations">
			<button
				type="button"
				onclick={() => void runBatch("fetch")}
				disabled={visibleProjectIds.length === 0}>Fetch</button
			>
			<button type="button" onclick={() => openCommit()} disabled={visibleProjectIds.length === 0}
				>Commit</button
			>
			<button
				type="button"
				onclick={() => void runBatch("push")}
				disabled={visibleProjectIds.length === 0}>Push</button
			>
			<button
				type="button"
				class="batch-actions__latest"
				onclick={() => void prepareLatest()}
				disabled={visibleProjectIds.length === 0}
			>
				Get Latest…
			</button>
		</div>
		<button
			type="button"
			class="toolbar-link"
			onclick={() => void refreshProjects()}
			disabled={projects.length === 0}>↻ Refresh</button
		>
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
							aria-label={`Move ${panelTitles[panel]} left`}
							onclick={() => movePanel(panel, -1)}
							disabled={index === 0}>←</button
						>
						<button
							type="button"
							aria-label={`Move ${panelTitles[panel]} right`}
							onclick={() => movePanel(panel, 1)}
							disabled={index === $panelOrder.length - 1}>→</button
						>
						<button
							type="button"
							aria-label={isCollapsed(panel)
								? `Expand ${panelTitles[panel]}`
								: `Collapse ${panelTitles[panel]}`}
							onclick={() => togglePanel(panel)}
						>
							{isCollapsed(panel) ? "+" : "−"}
						</button>
					</div>
				</div>

				{#if !isCollapsed(panel)}
					{#if panel === "repositories"}
						<div class="panel-content panel-content--repositories">
							{#if projectsQuery.response === undefined}
								<div class="panel-empty">
									<span class="loading-orb"></span>
									<p>Loading registered repositories…</p>
								</div>
							{:else if filteredProjects.length === 0}
								<div class="panel-empty">
									<strong
										>{projects.length === 0
											? "Your local workspace is ready"
											: "No repositories match"}</strong
									>
									<p>
										{projects.length === 0
											? "Add an existing checkout or clone over HTTPS with a Keychain-backed connection."
											: "Try another repository name or path."}
									</p>
									{#if projects.length === 0}
										<div class="empty-actions">
											{#if canAddProjects}<button
													type="button"
													class="button button--primary"
													onclick={addProject}>Add local repository</button
												>{/if}
											<button
												type="button"
												class="button"
												onclick={() => (activeModal = "connections")}>Connect &amp; clone</button
											>
										</div>
									{/if}
								</div>
							{:else}
								<div class="repository-list">
									{#each filteredProjects as project (project.id)}
										<RepositoryCard
											{project}
											overview={overviews[project.id]}
											overviewError={overviewErrors[project.id]}
											loading={overviewLoading[project.id] ?? false}
											selected={selectedProjectIds.includes(project.id)}
											focused={focusedProject?.id === project.id}
											selectedWorktreePath={selectedWorktreePaths[project.id]}
											operation={operations[project.id]}
											onToggle={toggleProject}
											onFocus={focusProject}
											onOpen={(id) => goto(projectPath(id))}
											onSelectBranch={selectBranch}
											onAction={repositoryAction}
										/>
									{/each}
								</div>
							{/if}
						</div>
					{:else if panel === "tasks"}
						<div class="panel-content task-panel">
							{#if focusedOverview}
								<div class="subsection-heading">
									<div><span class="eyebrow">Protected</span><strong>Work Sessions</strong></div>
									<button
										type="button"
										class="mini-button"
										onclick={() => (activeModal = "session")}>+ Session</button
									>
								</div>
								<div class="session-list">
									{#each focusedOverview.sessions as session (session.id)}
										<article class="session-card">
											<div class="session-card__title">
												<strong>{session.title}</strong><span>{session.status}</span>
											</div>
											<code>{session.branchRef.replace("refs/heads/", "")}</code>
											<div class="session-meta">
												<span>{session.operationType}</span><span>{session.dirtyCount} dirty</span
												><span>{session.conflictCount} conflicts</span><span
													>{session.touchedFiles.length} paths</span
												><span>{session.touchedRoots.length} roots</span>
											</div>
											<div class="session-actions">
												<button
													type="button"
													onclick={() => {
														selectedWorktreePaths = {
															...selectedWorktreePaths,
															[focusedProject!.id]: session.worktreePath,
														};
													}}>Focus</button
												>
												<button
													type="button"
													onclick={() => void openTerminal(session.worktreePath)}>Terminal</button
												>
												<button
													type="button"
													onclick={() => void assessSession(session)}
													disabled={sessionBusy[session.id]}>Assess</button
												>
												<button
													type="button"
													onclick={() => void snapshotSession(session)}
													disabled={sessionBusy[session.id]}>Snapshot</button
												>
											</div>
											{#if sessionAssessments[session.id]}
												<div
													class="assessment assessment--{sessionAssessments[session.id]!.riskLevel}"
												>
													<strong>{sessionAssessments[session.id]!.riskLevel}</strong>
													<span>Auto-merge disabled · Presence unavailable</span>
													{#each sessionAssessments[session.id]!.reasons as reason}<p>
															{reason}
														</p>{/each}
												</div>
											{/if}
										</article>
									{/each}
									{#if focusedOverview.sessions.length === 0}<p class="inline-empty">
											No protected sessions yet.
										</p>{/if}
								</div>

								<div class="subsection-heading subsection-heading--threads">
									<div><span class="eyebrow">Local</span><strong>Threads</strong></div>
								</div>
								<form
									class="thread-create"
									onsubmit={(event) => {
										event.preventDefault();
										void createThread();
									}}
								>
									<input
										bind:value={newThreadTitle}
										placeholder="New thread title"
										aria-label="New thread title"
									/>
									<select
										bind:value={newThreadSessionId}
										aria-label="Attach thread to Work Session"
									>
										<option value="">Current branch</option>
										{#each focusedOverview.sessions as session}<option value={session.id}
												>{session.title}</option
											>{/each}
									</select>
									<button type="submit" disabled={threadCreating || !newThreadTitle.trim()}
										>Add</button
									>
								</form>
								<div class="thread-list">
									{#each focusedOverview.threads as thread (thread.id)}
										<button
											type="button"
											class:thread-item--active={thread.id === selectedThreadId}
											class="thread-item"
											onclick={() => (selectedThreadId = thread.id)}
										>
											<strong>{thread.title}</strong><span
												>{thread.branchRef?.replace("refs/heads/", "") ?? "Repository"}</span
											>
										</button>
									{/each}
									{#if focusedOverview.threads.length === 0}<p class="inline-empty">
											Create a project-scoped thread to begin.
										</p>{/if}
								</div>
							{:else}
								<div class="panel-empty">
									<strong>Select a repository</strong>
									<p>Its real Work Sessions and local threads will appear here.</p>
								</div>
							{/if}
						</div>
					{:else if panel === "conversation"}
						<div class="chat-panel">
							{#if focusedProject && focusedThread}
								<header class="chat-header">
									<div>
										<span class="eyebrow">{focusedProject.title}</span><strong
											>{focusedThread.title}</strong
										>
									</div>
									<span
										>{focusedThread.branchRef?.replace("refs/heads/", "") ??
											focusedOverview?.currentBranch ??
											"Repository"}</span
									>
								</header>
								<div class="message-list" aria-live="polite">
									{#if threadLoading}<div class="message-loading">
											<span class="loading-orb"></span>Loading messages…
										</div>{/if}
									{#each threadMessages as message (message.id)}
										<article class="message message--{message.role}">
											<div>
												<strong>{message.role === "user" ? "You" : message.role}</strong><time
													>{formatTime(message.createdAt)}</time
												>
											</div>
											<p>{message.content}</p>
										</article>
									{/each}
									{#if !threadLoading && threadMessages.length === 0}
										<div class="chat-empty">
											<span>◌</span><strong>Thread is empty</strong>
											<p>
												Messages stay local and scoped to this repository. No remote AI reply is
												implied.
											</p>
										</div>
									{/if}
								</div>
								<form
									class="composer"
									onsubmit={(event) => {
										event.preventDefault();
										void sendMessage();
									}}
								>
									<textarea
										bind:value={messageDraft}
										rows="3"
										placeholder="Record a decision, instruction, or hand-off…"
									></textarea>
									<div>
										<span>Local project log · secrets should never be pasted here</span><button
											type="submit"
											disabled={messageSending || !messageDraft.trim()}>Save message</button
										>
									</div>
								</form>
							{:else}
								<div class="panel-empty">
									<span class="empty-symbol">◌</span><strong>No thread selected</strong>
									<p>Choose or create a repository-scoped thread in Threads / Tasks.</p>
								</div>
							{/if}
						</div>
					{:else}
						<div class="context-panel">
							<div class="detail-tabs" role="tablist" aria-label="Repository context">
								{#each detailTabs as tab}
									<button
										type="button"
										role="tab"
										aria-selected={detailTab === tab.id}
										class:detail-tab--active={detailTab === tab.id}
										onclick={() => (detailTab = tab.id)}>{tab.label}</button
									>
								{/each}
							</div>
							{#if focusedProject && focusedOverview}
								<div class="context-heading">
									<strong>{focusedProject.title}</strong>
									<code>{focusedBranch?.name ?? focusedOverview.currentBranch ?? "Detached"}</code>
									<span title={focusedWorktreePath}>{focusedWorktreePath}</span>
								</div>
								<div class="branch-workspace" aria-label="Parallel branch and worktree workspace">
									<header>
										<div>
											<span class="eyebrow">Real Git contexts</span>
											<strong>Branch Workspace</strong>
										</div>
										<small>Compare horizontally · reorder with arrows</small>
									</header>
									<div class="branch-columns">
										{#each orderedFocusedBranches() as branch, branchIndex (branch.refName)}
											<article
												class:branch-column--active={focusedBranch?.refName === branch.refName}
												class="branch-column"
											>
												<div class="branch-column__heading">
													<div>
														<strong>{branch.name}</strong>
														<span>{branch.worktreeName ?? "Stored ref"}</span>
													</div>
													<div class="branch-column__order">
														<button
															type="button"
															aria-label={`Move ${branch.name} left`}
															onclick={() => moveBranch(branch.refName, -1)}
															disabled={branchIndex === 0}>←</button
														>
														<button
															type="button"
															aria-label={`Move ${branch.name} right`}
															onclick={() => moveBranch(branch.refName, 1)}
															disabled={branchIndex === focusedOverview.branches.length - 1}
															>→</button
														>
													</div>
												</div>
												<div class="branch-column__commits">
													<span>HEAD <code>{branch.head.slice(0, 8)}</code></span>
													<span>BASE <code>{branch.baseCommit.slice(0, 8)}</code></span>
												</div>
												<div class="branch-column__state">
													<span>{branch.dirtyCount} changed</span>
													<span>{branch.conflictCount} conflicts</span>
													<span>↑{branch.ahead} ↓{branch.behind}</span>
												</div>
												<div class="branch-column__changes">
													{#each branch.files.slice(0, 4) as file (file.path)}
														<span title={file.path}
															><i>{file.status.slice(0, 1).toUpperCase()}</i>{file.path}</span
														>
													{/each}
													{#if branch.files.length > 4}<small
															>+{branch.files.length - 4} more paths</small
														>
													{:else if branch.files.length === 0}<small
															>{branch.isCheckedOut
																? "Clean worktree"
																: "No worktree checkout"}</small
														>{/if}
												</div>
												<footer>
													<span
														>{branch.sessionId
															? `Session ${branch.sessionId.slice(0, 8)}`
															: branch.owner}</span
													>
													<button
														type="button"
														onclick={() => selectBranch(focusedProject.id, branch)}
														disabled={!branch.worktreePath}
														>{focusedBranch?.refName === branch.refName
															? "Focused"
															: "Focus"}</button
													>
												</footer>
											</article>
										{/each}
									</div>
								</div>
								<div class="context-body">
									{#if detailTab === "files"}
										<div class="file-list">
											{#each focusedFiles as file (file.path)}
												<button
													type="button"
													class:file-item--active={file.path === selectedFilePath}
													class="file-item"
													onclick={() => {
														selectedFilePath = file.path;
														detailTab = "diff";
													}}
												>
													<span class="file-status">{file.status.slice(0, 1).toUpperCase()}</span>
													<span
														><strong>{fileName(file.path)}</strong><small>{file.path}</small></span
													>
													{#if file.staged}<i>staged</i>{/if}{#if file.highRisk}<i class="risk"
															>asset review</i
														>{/if}
												</button>
											{/each}
											{#if focusedFiles.length === 0}<div class="context-empty">
													This worktree is clean.
												</div>{/if}
										</div>
									{:else if detailTab === "diff"}
										{#if contextLoading}<div class="context-empty">
												<span class="loading-orb"></span>Reading diff…
											</div>
										{:else if contextError}<div class="context-error">{contextError}</div>
										{:else if selectedFileDiff}
											<div class="artifact-heading">
												<strong>{selectedFileDiff.path}</strong>{#if selectedFileDiff.binary}<span
														>binary</span
													>{/if}{#if selectedFileDiff.truncated}<span>truncated</span>{/if}
											</div>
											<pre class="diff-view">{selectedFileDiff.patch ||
													(selectedFileDiff.binary
														? "Binary delta — use Preview and manual asset review."
														: "No textual patch available.")}</pre>
										{:else}<div class="context-empty">Select a changed file.</div>{/if}
									{:else if detailTab === "preview"}
										{#if contextLoading}<div class="context-empty">
												<span class="loading-orb"></span>Reading preview…
											</div>
										{:else if selectedFilePreview?.kind === "image" && selectedFilePreview.absolutePath}
											<div class="artifact-heading">
												<strong>{selectedFilePreview.path}</strong><span
													>{selectedFilePreview.size ?? 0} bytes</span
												>
											</div>
											<div class="image-preview">
												<img
													src={previewImageUrl(selectedFilePreview.absolutePath)}
													alt={`Preview of ${selectedFilePreview.path}`}
												/>
											</div>
										{:else if selectedFilePreview?.kind === "text"}
											<div class="artifact-heading">
												<strong>{selectedFilePreview.path}</strong><span
													>{selectedFilePreview.size ?? 0} bytes</span
												>
											</div>
											<pre class="text-preview">{selectedFilePreview.content}</pre>
										{:else if selectedFilePreview}<div class="context-empty">
												{selectedFilePreview.kind === "binary"
													? "Binary file; preview intentionally withheld."
													: "The file no longer exists in this worktree."}
											</div>
										{:else}<div class="context-empty">Select a changed file.</div>{/if}
									{:else if detailTab === "terminal"}
										<div class="terminal-card">
											<span class="terminal-prompt">❯</span><strong
												>{uiState.global.defaultTerminal.current.displayName}</strong
											><code>{focusedWorktreePath}</code>
											<p>The external terminal opens at the exact selected real worktree.</p>
											<button
												type="button"
												class="button button--primary"
												onclick={() => void openTerminal()}>Open terminal here</button
											>
										</div>
									{:else if detailTab === "graph"}
										<div class="git-graph" aria-label="Bottom-up Git history">
											{#each bottomUpCommits() as commit (commit.id)}
												<div class="graph-commit">
													<span class="graph-rail"><i></i></span>
													<div>
														<strong>{commit.summary}</strong><span
															><code>{commit.shortId}</code> · {commit.author} · {formatTime(
																commit.time,
															)}</span
														>{#if commit.refs.length}<p>{commit.refs.join(" · ")}</p>{/if}
													</div>
												</div>
											{/each}
											{#if focusedOverview.commits.length === 0}<div class="context-empty">
													No commit history is available.
												</div>{/if}
										</div>
									{:else}
										<div class="git-details">
											<div>
												<span>HEAD</span><code>{focusedOverview.head?.slice(0, 12) ?? "none"}</code>
											</div>
											<div>
												<span>Branch</span><strong
													>{focusedBranch?.name ??
														focusedOverview.currentBranch ??
														"Detached"}</strong
												>
											</div>
											<div>
												<span>Base commit</span><code
													>{focusedBranch?.baseCommit.slice(0, 12) ?? "—"}</code
												>
											</div>
											<div>
												<span>Dirty / conflicts</span><strong
													>{focusedBranch?.dirtyCount ?? focusedOverview.dirtyCount} / {focusedBranch?.conflictCount ??
														focusedOverview.conflictCount}</strong
												>
											</div>
											<div>
												<span>Ahead / behind</span><strong
													>{focusedBranch?.ahead ?? focusedOverview.ahead} / {focusedBranch?.behind ??
														focusedOverview.behind}</strong
												>
											</div>
											<div><span>Presence</span><strong>Unavailable (0.3.x)</strong></div>
											<div class="connection-binding">
												<span>HTTPS connection</span><select
													value={connections.bindings[focusedProject.id] ?? ""}
													onchange={(event) =>
														void bindFocusedConnection(event.currentTarget.value)}
													><option value="">System Git credentials</option
													>{#each connections.profiles as profile}<option value={profile.id}
															>{profile.label} · {profile.username}</option
														>{/each}</select
												>
											</div>
											<button
												type="button"
												class="mini-button"
												onclick={() => (activeModal = "connections")}
												>Manage server connections</button
											>
											<h3>Remotes</h3>
											{#each focusedOverview.remotes as remote}<div>
													<span>{remote.name}</span><code>{remote.url ?? "No URL"}</code>
												</div>{/each}
											<h3>Recent operations</h3>
											{#each focusedOverview.operations as operation}<article
													class="operation-row operation-row--{operation.state}"
												>
													<div>
														<strong>{operation.kind}</strong><time
															>{formatTime(operation.updatedAt)}</time
														>
													</div>
													<p>{operation.detail}</p>
												</article>{/each}
										</div>
									{/if}
								</div>
							{:else}
								<div class="panel-empty">
									<strong>Select a repository</strong>
									<p>
										Files, Diff, Preview, Terminal, bottom-up Graph, and Git Details use its real
										local state.
									</p>
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</section>
		{/each}
	</div>
</main>

{#if activeModal === "commit"}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) activeModal = null;
		}}
	>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="commit-title">
			<header>
				<div>
					<span class="eyebrow">Local commit</span>
					<h2 id="commit-title">
						Commit {commitTargetIds.length}
						{commitTargetIds.length === 1 ? "worktree" : "worktrees"}
					</h2>
				</div>
				<button type="button" onclick={() => (activeModal = null)}>×</button>
			</header>
			<p>
				Each selected checkout creates its own real commit and keeps an independent success or
				failure result. Nothing is pushed by this step.
			</p>
			<label
				>Commit message<textarea
					bind:value={commitMessage}
					rows="4"
					placeholder="Describe the shared intent"
				></textarea></label
			>
			<footer>
				<button type="button" class="button" onclick={() => (activeModal = null)}>Cancel</button
				><button
					type="button"
					class="button button--primary"
					onclick={() => void submitCommit()}
					disabled={commitSubmitting || !commitMessage.trim()}
					>{commitSubmitting ? "Committing…" : "Commit independently"}</button
				>
			</footer>
		</div>
	</div>
{:else if activeModal === "latest"}
	<div class="modal-backdrop" role="presentation">
		<div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="latest-title">
			<header>
				<div>
					<span class="eyebrow">Fetch → review → apply</span>
					<h2 id="latest-title">Get Latest safety review</h2>
				</div>
				<button type="button" onclick={() => (activeModal = null)} disabled={latestApplying}
					>×</button
				>
			</header>
			<p>
				Fetch only updated remote refs. The rows below preview whether the selected worktree can be
				changed. Only clean, non-diverged fast-forwards can be applied.
			</p>
			{#if latestLoading}<div class="modal-loading">
					<span class="loading-orb"></span>Fetching and comparing repositories…
				</div>{/if}
			<div class="latest-list">
				{#each latestReviews as review (review.projectId)}
					<article
						class:latest-row--safe={review.preview?.canApply}
						class:latest-row--blocked={review.error || review.preview?.action === "blocked"}
						class="latest-row"
					>
						<div>
							<strong>{review.projectTitle}</strong><span
								>{review.preview?.branch ?? "Unknown branch"} → {review.preview?.upstream ??
									"No upstream"}</span
							>
						</div>
						{#if review.error}<p>{review.error}</p>{:else if review.preview}<div
								class="latest-stats"
							>
								<span>↑{review.preview.ahead}</span><span>↓{review.preview.behind}</span><strong
									>{review.preview.action === "fastForward"
										? "Ready to fast-forward"
										: review.preview.action === "upToDate"
											? "Up to date"
											: "Blocked"}</strong
								>
							</div>
							{#each review.preview.risks as risk}<p>{risk}</p>{/each}{/if}
					</article>
				{/each}
			</div>
			<footer>
				<button
					type="button"
					class="button"
					onclick={() => (activeModal = null)}
					disabled={latestApplying}>Close</button
				><button
					type="button"
					class="button button--primary"
					onclick={() => void applyLatest()}
					disabled={latestLoading || latestApplying}
					>{latestApplying
						? "Applying…"
						: latestSafeCount > 0
							? `Apply ${latestSafeCount} safe fast-forward${latestSafeCount === 1 ? "" : "s"}`
							: "No update to apply"}</button
				>
			</footer>
		</div>
	</div>
{:else if activeModal === "session"}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) activeModal = null;
		}}
	>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="session-title">
			<header>
				<div>
					<span class="eyebrow">Real branch + linked worktree</span>
					<h2 id="session-title">New Protected Work Session</h2>
				</div>
				<button type="button" onclick={() => (activeModal = null)}>×</button>
			</header>
			<p>
				The session starts from the focused branch HEAD, records its base and scope, and never
				enables automatic merge while Presence is unavailable.
			</p>
			<label
				>Session title<input bind:value={sessionTitle} placeholder="Fix Up Redirectors" /></label
			>
			<label
				>Operation type<select bind:value={sessionOperationType}
					><option value="code-edit">Code edit</option><option value="asset-batch"
						>Batch asset operation</option
					><option value="redirectors">Fix Up Redirectors</option><option value="generated-content"
						>Generated content</option
					><option value="refactor">Refactor</option></select
				></label
			>
			<footer>
				<button type="button" class="button" onclick={() => (activeModal = null)}>Cancel</button
				><button
					type="button"
					class="button button--primary"
					onclick={() => void createSession()}
					disabled={sessionCreating || !sessionTitle.trim()}
					>{sessionCreating ? "Creating…" : "Create protected worktree"}</button
				>
			</footer>
		</div>
	</div>
{:else if activeModal === "connections"}
	<div class="modal-backdrop" role="presentation">
		<div
			class="modal modal--connections"
			role="dialog"
			aria-modal="true"
			aria-labelledby="connections-title"
		>
			<header>
				<div>
					<span class="eyebrow">Generic Git over HTTPS</span>
					<h2 id="connections-title">Server connections &amp; clone</h2>
				</div>
				<button type="button" onclick={() => (activeModal = null)}>×</button>
			</header>
			<p>
				Passwords and PATs are stored in the operating-system Keychain. Repository config, remote
				URLs, UI responses, and operation logs only receive non-secret metadata.
			</p>
			{#if connectionsLoading}<div class="modal-loading">
					<span class="loading-orb"></span>Reading connection metadata…
				</div>{/if}
			<div class="connection-grid">
				<div class="connection-column">
					<h3>{connectionId ? "Update connection" : "Add connection"}</h3>
					<label>Label<input bind:value={connectionLabel} placeholder="Studio Gitea" /></label>
					<label
						>HTTPS server root<input
							bind:value={connectionBaseUrl}
							placeholder="https://git.example.com"
						/></label
					>
					<label
						>Username<input
							bind:value={connectionUsername}
							autocomplete="username"
							placeholder="account name"
						/></label
					>
					<label
						>{connectionId ? "Replace password / PAT (optional)" : "Password / PAT"}<input
							bind:value={connectionSecret}
							type="password"
							autocomplete="new-password"
							placeholder={connectionId
								? "Leave empty to keep Keychain secret"
								: "Stored only in Keychain"}
						/></label
					>
					<div class="form-actions">
						{#if connectionId}<button type="button" class="button" onclick={() => editConnection()}
								>Cancel edit</button
							>{/if}<button
							type="button"
							class="button button--primary"
							onclick={() => void saveConnection()}
							disabled={connectionSaving ||
								!connectionLabel.trim() ||
								!connectionBaseUrl.trim() ||
								!connectionUsername.trim() ||
								(!connectionId && !connectionSecret)}
							>{connectionSaving ? "Saving…" : "Save to Keychain"}</button
						>
					</div>
					<div class="profile-list">
						{#each connections.profiles as profile (profile.id)}
							<article>
								<div>
									<strong>{profile.label}</strong><span>{profile.username} · {profile.baseUrl}</span
									>
								</div>
								<button type="button" onclick={() => editConnection(profile)}>Edit</button><button
									type="button"
									class:danger-button={pendingConnectionDelete === profile.id}
									onclick={() => void deleteConnection(profile.id)}
									>{pendingConnectionDelete === profile.id ? "Confirm revoke" : "Revoke"}</button
								>
							</article>
						{/each}
						{#if connections.profiles.length === 0}<p class="inline-empty">
								No HTTPS connections saved yet.
							</p>{/if}
					</div>
				</div>
				<div class="connection-column connection-column--clone">
					<h3>Clone repository</h3>
					<label
						>Connection<select bind:value={cloneProfileId}
							><option value="">Choose a saved connection</option
							>{#each connections.profiles as profile}<option value={profile.id}
									>{profile.label} · {profile.username}</option
								>{/each}</select
						></label
					>
					<label
						>Repository HTTPS URL<input
							bind:value={cloneUrl}
							placeholder="https://git.example.com/team/project.git"
						/></label
					>
					<label
						>Empty destination
						<div class="path-picker">
							<input
								bind:value={cloneDestination}
								placeholder="/Users/you/Projects/project"
							/><button type="button" onclick={() => void chooseCloneDestination()}>Browse…</button>
						</div></label
					>
					<div class="security-note">
						<strong>Credential scope</strong>
						<p>
							GitTogether sends this account only when the repository URL matches the selected
							profile's HTTPS host, port, and path prefix. Inline URL credentials are rejected.
						</p>
					</div>
					<button
						type="button"
						class="button button--primary"
						onclick={() => void cloneWithConnection()}
						disabled={cloneLoading ||
							!cloneProfileId ||
							!cloneUrl.trim() ||
							!cloneDestination.trim()}
						>{cloneLoading ? "Cloning…" : "Clone and add repository"}</button
					>
				</div>
			</div>
		</div>
	</div>
{/if}

<style lang="postcss">
	.dashboard {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 100%;
		padding: 24px clamp(16px, 3vw, 46px) 34px;
		overflow: auto;
		gap: 16px;
		background:
			radial-gradient(
				circle at 88% 0%,
				color-mix(in srgb, var(--fill-pop-bg) 10%, transparent),
				transparent 32%
			),
			var(--bg-2);
	}
	.dashboard-header,
	.dashboard-toolbar,
	.dashboard-brand,
	.dashboard-header__actions,
	.dashboard-toolbar__title,
	.connection-state,
	.batch-actions,
	.panel-header,
	.panel-header__actions,
	.subsection-heading,
	.session-card__title,
	.session-meta,
	.session-actions,
	.chat-header,
	.composer > div,
	.context-heading,
	.artifact-heading,
	.latest-row > div:first-child,
	.latest-stats,
	.form-actions,
	.profile-list article,
	.path-picker,
	.operation-row > div {
		display: flex;
		align-items: center;
	}
	.dashboard-header,
	.dashboard-toolbar,
	.panel-header,
	.subsection-heading,
	.chat-header {
		justify-content: space-between;
	}
	.dashboard-header {
		min-height: 50px;
		gap: 16px;
	}
	.dashboard-brand {
		gap: 11px;
	}
	.dashboard-brand__mark {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--fill-pop-bg);
		box-shadow: 0 8px 24px color-mix(in srgb, var(--fill-pop-bg) 24%, transparent);
		color: var(--bg-1);
		font-weight: 800;
		font-size: 13px;
		letter-spacing: -0.06em;
	}
	.dashboard-brand h1,
	.dashboard-brand p,
	.panel-header h2,
	.modal h2,
	.modal p,
	.git-details h3 {
		margin: 0;
	}
	.dashboard-brand h1 {
		font-size: 19px;
		letter-spacing: -0.03em;
	}
	.dashboard-brand p {
		margin-top: 2px;
		color: var(--text-3);
		font-size: 10px;
	}
	.dashboard-header__actions {
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
	}
	.connection-state {
		margin-right: 5px;
		gap: 6px;
		color: var(--text-3);
		font-size: 9px;
	}
	.connection-state i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #d4a64f;
		box-shadow: 0 0 0 3px color-mix(in srgb, #d4a64f 14%, transparent);
	}
	.button,
	.toolbar-link,
	.batch-actions button,
	.panel-header__actions button,
	.mini-button,
	.session-actions button,
	.thread-create button,
	.composer button,
	.profile-list button,
	.path-picker button {
		border: 0;
		background: transparent;
		color: var(--text-2);
		font: inherit;
		cursor: pointer;
	}
	.button {
		padding: 7px 11px;
		border: 1px solid var(--border-2);
		border-radius: 8px;
		background: var(--bg-1);
		font-weight: 600;
		font-size: 10px;
	}
	.button:hover:not(:disabled),
	.toolbar-link:hover:not(:disabled),
	.panel-header__actions button:hover:not(:disabled),
	.mini-button:hover:not(:disabled) {
		color: var(--text-1);
	}
	.button:disabled,
	.toolbar-link:disabled,
	.batch-actions button:disabled,
	.panel-header__actions button:disabled,
	button:disabled {
		cursor: default;
		opacity: 0.45;
	}
	.button--primary {
		border-color: var(--fill-pop-bg);
		background: var(--fill-pop-bg);
		color: var(--bg-1);
	}
	.dashboard-toolbar {
		padding: 8px 0 12px;
		gap: 10px;
		border-bottom: 1px solid var(--border-2);
	}
	.dashboard-toolbar__title {
		min-width: max-content;
		gap: 8px;
	}
	.eyebrow,
	.panel-kicker {
		color: var(--text-3);
		font-weight: 700;
		font-size: 8px;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}
	.search-box {
		display: flex;
		align-items: center;
		width: min(290px, 24vw);
		padding: 0 9px;
		gap: 6px;
		border: 1px solid var(--border-2);
		border-radius: 8px;
		background: var(--bg-1);
		color: var(--text-3);
	}
	.search-box input {
		width: 100%;
		padding: 7px 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text-1);
		font: inherit;
		font-size: 10px;
	}
	.toolbar-link {
		min-width: max-content;
		font-size: 9px;
	}
	.batch-actions {
		padding: 3px;
		gap: 2px;
		border: 1px solid var(--border-2);
		border-radius: 9px;
		background: var(--bg-1);
	}
	.batch-actions button {
		padding: 6px 8px;
		border-radius: 6px;
		font-size: 9px;
	}
	.batch-actions button:hover:not(:disabled) {
		background: var(--bg-2);
		color: var(--text-1);
	}
	.batch-actions__latest {
		background: color-mix(in srgb, var(--fill-pop-bg) 13%, var(--bg-2)) !important;
	}
	.dashboard-grid {
		display: grid;
		grid-template-columns: minmax(330px, 1.35fr) minmax(235px, 0.85fr) minmax(330px, 1.25fr) minmax(
				340px,
				1.2fr
			);
		align-items: stretch;
		min-height: min(710px, calc(100vh - 165px));
		gap: 10px;
	}
	.dashboard-panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		max-height: calc(100vh - 165px);
		overflow: hidden;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-ml);
		background: color-mix(in srgb, var(--bg-1) 94%, transparent);
	}
	.dashboard-panel.panel-collapsed {
		align-self: start;
	}
	.panel-header {
		flex: 0 0 auto;
		padding: 11px 12px;
		gap: 8px;
		border-bottom: 1px solid var(--border-2);
	}
	.panel-header h2 {
		margin-top: 3px;
		font-size: 11px;
		letter-spacing: -0.01em;
	}
	.panel-header__actions {
		gap: 1px;
	}
	.panel-header__actions button {
		width: 23px;
		height: 23px;
		border-radius: 6px;
		font-size: 13px;
	}
	.panel-header__actions button:hover:not(:disabled) {
		background: var(--bg-2);
	}
	.panel-content,
	.chat-panel,
	.context-panel {
		min-height: 0;
		overflow: auto;
	}
	.panel-content {
		padding: 10px;
	}
	.panel-content--repositories {
		height: 100%;
	}
	.repository-list {
		display: grid;
		gap: 8px;
	}
	.panel-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 170px;
		padding: 24px 15px;
		gap: 7px;
		color: var(--text-2);
		text-align: center;
	}
	.panel-empty strong {
		color: var(--text-1);
		font-size: 11px;
	}
	.panel-empty p {
		max-width: 420px;
		margin: 0;
		color: var(--text-3);
		font-size: 10px;
		line-height: 1.5;
	}
	.empty-actions {
		display: flex;
		margin-top: 6px;
		gap: 6px;
	}
	.empty-symbol {
		color: var(--fill-pop-bg);
		font-size: 21px;
	}
	.loading-orb {
		display: inline-block;
		flex: 0 0 auto;
		width: 14px;
		height: 14px;
		border: 2px solid var(--border-2);
		border-radius: 50%;
		border-top-color: var(--fill-pop-bg);
		animation: spin 0.8s linear infinite;
	}
	.task-panel {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.subsection-heading {
		padding: 2px 1px;
	}
	.subsection-heading > div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.subsection-heading strong {
		font-size: 10px;
	}
	.subsection-heading--threads {
		margin-top: 6px;
		padding-top: 12px;
		border-top: 1px solid var(--border-2);
	}
	.mini-button {
		padding: 5px 7px;
		border: 1px solid var(--border-2);
		border-radius: 7px;
		font-size: 8px;
	}
	.session-list,
	.thread-list {
		display: grid;
		gap: 6px;
	}
	.session-card {
		display: flex;
		flex-direction: column;
		padding: 9px;
		gap: 6px;
		border: 1px solid var(--border-2);
		border-radius: 9px;
		background: var(--bg-2);
	}
	.session-card__title {
		justify-content: space-between;
		gap: 6px;
	}
	.session-card__title strong {
		overflow: hidden;
		font-size: 10px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.session-card__title span {
		color: var(--fill-pop-bg);
		font-size: 8px;
		text-transform: uppercase;
	}
	.session-card code {
		overflow: hidden;
		color: var(--text-3);
		font-size: 8px;
		text-overflow: ellipsis;
	}
	.session-meta {
		flex-wrap: wrap;
		gap: 4px;
	}
	.session-meta span {
		padding: 3px 5px;
		border-radius: 999px;
		background: var(--bg-1);
		color: var(--text-3);
		font-size: 7px;
	}
	.session-actions {
		flex-wrap: wrap;
		gap: 3px;
	}
	.session-actions button {
		padding: 4px 6px;
		border: 1px solid var(--border-2);
		border-radius: 6px;
		background: var(--bg-1);
		font-size: 8px;
	}
	.assessment {
		padding: 7px;
		border-left: 2px solid #d4a64f;
		border-radius: 4px;
		background: color-mix(in srgb, #d4a64f 8%, var(--bg-1));
		font-size: 8px;
	}
	.assessment--blocked {
		border-left-color: #e56b6f;
	}
	.assessment strong {
		margin-right: 5px;
		text-transform: capitalize;
	}
	.assessment span {
		color: var(--text-3);
	}
	.assessment p {
		margin: 4px 0 0;
		color: var(--text-2);
		line-height: 1.35;
	}
	.inline-empty {
		margin: 4px 0;
		color: var(--text-3);
		font-size: 9px;
		text-align: center;
	}
	.thread-create {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 92px auto;
		gap: 4px;
	}
	.thread-create input,
	.thread-create select,
	.modal input,
	.modal textarea,
	.modal select,
	.connection-binding select {
		min-width: 0;
		padding: 6px 7px;
		border: 1px solid var(--border-2);
		border-radius: 7px;
		outline: 0;
		background: var(--bg-1);
		color: var(--text-1);
		font: inherit;
		font-size: 8px;
	}
	.thread-create button {
		padding: 5px 7px;
		border-radius: 7px;
		background: var(--fill-pop-bg);
		color: var(--bg-1);
		font-size: 8px;
	}
	.thread-item {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: 8px;
		gap: 2px;
		border: 1px solid var(--border-2);
		border-radius: 8px;
		background: transparent;
		color: var(--text-2);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.thread-item:hover,
	.thread-item--active {
		border-color: var(--fill-pop-bg);
		background: color-mix(in srgb, var(--fill-pop-bg) 7%, var(--bg-1));
	}
	.thread-item strong {
		font-size: 9px;
	}
	.thread-item span {
		overflow: hidden;
		color: var(--text-3);
		font-size: 8px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chat-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.chat-header {
		flex: 0 0 auto;
		padding: 11px 12px;
		border-bottom: 1px solid var(--border-2);
	}
	.chat-header > div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.chat-header strong {
		font-size: 11px;
	}
	.chat-header > span {
		max-width: 45%;
		overflow: hidden;
		color: var(--text-3);
		font-size: 8px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.message-list {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 180px;
		padding: 12px;
		overflow: auto;
		gap: 8px;
	}
	.message-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: var(--text-3);
		font-size: 9px;
	}
	.message {
		align-self: flex-end;
		width: min(90%, 540px);
		padding: 9px 10px;
		border: 1px solid color-mix(in srgb, var(--fill-pop-bg) 35%, var(--border-2));
		border-radius: 11px 11px 3px 11px;
		background: color-mix(in srgb, var(--fill-pop-bg) 8%, var(--bg-2));
	}
	.message > div {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.message strong,
	.message time {
		font-size: 8px;
	}
	.message time {
		color: var(--text-3);
	}
	.message p {
		margin: 6px 0 0;
		color: var(--text-1);
		font-size: 10px;
		line-height: 1.5;
		white-space: pre-wrap;
	}
	.chat-empty {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 5px;
		color: var(--text-3);
		text-align: center;
	}
	.chat-empty span {
		color: var(--fill-pop-bg);
		font-size: 22px;
	}
	.chat-empty strong {
		color: var(--text-1);
		font-size: 10px;
	}
	.chat-empty p {
		max-width: 280px;
		margin: 0;
		font-size: 9px;
		line-height: 1.45;
	}
	.composer {
		flex: 0 0 auto;
		padding: 10px;
		border-top: 1px solid var(--border-2);
	}
	.composer textarea {
		width: 100%;
		padding: 8px;
		border: 1px solid var(--border-2);
		border-radius: 8px;
		outline: 0;
		background: var(--bg-2);
		color: var(--text-1);
		font: inherit;
		font-size: 9px;
		line-height: 1.4;
		resize: vertical;
	}
	.composer > div {
		justify-content: space-between;
		margin-top: 5px;
		gap: 7px;
	}
	.composer span {
		color: var(--text-3);
		font-size: 7px;
	}
	.composer button {
		padding: 6px 8px;
		border-radius: 7px;
		background: var(--fill-pop-bg);
		color: var(--bg-1);
		font-size: 8px;
	}
	.context-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.detail-tabs {
		display: flex;
		flex: 0 0 auto;
		flex-wrap: wrap;
		padding: 5px 7px 0;
		gap: 1px;
		border-bottom: 1px solid var(--border-2);
	}
	.detail-tabs button {
		padding: 6px 7px 8px;
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--text-3);
		font: inherit;
		font-size: 8px;
		cursor: pointer;
	}
	.detail-tabs button:hover,
	.detail-tab--active {
		color: var(--text-1) !important;
	}
	.detail-tab--active {
		border-bottom-color: var(--fill-pop-bg) !important;
	}
	.context-heading {
		flex: 0 0 auto;
		padding: 9px 10px;
		gap: 6px;
		border-bottom: 1px solid var(--border-2);
	}
	.context-heading strong {
		font-size: 10px;
	}
	.context-heading code {
		color: var(--fill-pop-bg);
		font-size: 8px;
	}
	.context-heading span {
		min-width: 0;
		margin-left: auto;
		overflow: hidden;
		color: var(--text-3);
		font-size: 7px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.branch-workspace {
		flex: 0 0 auto;
		padding: 9px 9px 10px;
		border-bottom: 1px solid var(--border-2);
		background: var(--bg-2);
	}
	.branch-workspace > header,
	.branch-workspace > header > div,
	.branch-column__heading,
	.branch-column__order,
	.branch-column__commits,
	.branch-column__state,
	.branch-column footer {
		display: flex;
		align-items: center;
	}
	.branch-workspace > header {
		justify-content: space-between;
		margin-bottom: 7px;
		gap: 8px;
	}
	.branch-workspace > header > div {
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}
	.branch-workspace > header strong {
		font-size: 9px;
	}
	.branch-workspace > header small {
		color: var(--text-3);
		font-size: 7px;
	}
	.branch-columns {
		display: flex;
		overflow-x: auto;
		gap: 7px;
		scroll-snap-type: x proximity;
	}
	.branch-column {
		display: flex;
		flex: 0 0 182px;
		flex-direction: column;
		min-width: 0;
		padding: 8px;
		gap: 7px;
		border: 1px solid var(--border-2);
		border-radius: 9px;
		background: var(--bg-1);
		scroll-snap-align: start;
	}
	.branch-column--active {
		border-color: var(--fill-pop-bg);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fill-pop-bg) 24%, transparent);
	}
	.branch-column__heading {
		justify-content: space-between;
		gap: 6px;
	}
	.branch-column__heading > div:first-child {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 2px;
	}
	.branch-column__heading strong,
	.branch-column__heading span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.branch-column__heading strong {
		font-size: 9px;
	}
	.branch-column__heading span,
	.branch-column__commits,
	.branch-column footer {
		color: var(--text-3);
		font-size: 7px;
	}
	.branch-column__order {
		gap: 1px;
	}
	.branch-column__order button,
	.branch-column footer button {
		border: 0;
		border-radius: 5px;
		background: var(--bg-2);
		color: var(--text-2);
		font: inherit;
		font-size: 7px;
		cursor: pointer;
	}
	.branch-column__order button {
		width: 18px;
		height: 18px;
	}
	.branch-column__commits,
	.branch-column__state {
		flex-wrap: wrap;
		gap: 4px;
	}
	.branch-column__commits {
		font-family: var(--font-mono);
	}
	.branch-column__state span {
		padding: 3px 5px;
		border-radius: 999px;
		background: var(--bg-2);
		color: var(--text-3);
		font-size: 7px;
	}
	.branch-column__changes {
		display: grid;
		min-height: 42px;
		gap: 3px;
	}
	.branch-column__changes span {
		display: flex;
		align-items: center;
		min-width: 0;
		overflow: hidden;
		gap: 4px;
		color: var(--text-2);
		font-size: 7px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.branch-column__changes i {
		flex: 0 0 auto;
		color: var(--fill-pop-bg);
		font-style: normal;
		font-weight: 700;
	}
	.branch-column__changes small {
		color: var(--text-3);
		font-size: 7px;
	}
	.branch-column footer {
		justify-content: space-between;
		margin-top: auto;
		gap: 5px;
	}
	.branch-column footer span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.branch-column footer button {
		padding: 4px 6px;
	}
	.context-body {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	.file-list {
		display: grid;
	}
	.file-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 8px 10px;
		gap: 7px;
		border: 0;
		border-bottom: 1px solid var(--border-2);
		background: transparent;
		color: var(--text-2);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.file-item:hover,
	.file-item--active {
		background: color-mix(in srgb, var(--fill-pop-bg) 7%, var(--bg-1));
	}
	.file-status {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		width: 19px;
		height: 19px;
		border-radius: 6px;
		background: var(--bg-2);
		color: var(--fill-pop-bg);
		font-weight: 700;
		font-size: 8px;
	}
	.file-item > span:nth-child(2) {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		gap: 2px;
	}
	.file-item strong,
	.file-item small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-item strong {
		color: var(--text-1);
		font-size: 9px;
	}
	.file-item small {
		color: var(--text-3);
		font-size: 7px;
	}
	.file-item i {
		padding: 3px 5px;
		border-radius: 999px;
		background: var(--bg-2);
		color: var(--text-3);
		font-style: normal;
		font-size: 7px;
	}
	.file-item i.risk {
		color: #d4a64f;
	}
	.context-empty,
	.context-error,
	.modal-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 145px;
		padding: 20px;
		gap: 7px;
		color: var(--text-3);
		font-size: 9px;
		text-align: center;
	}
	.context-error {
		color: #e56b6f;
	}
	.artifact-heading {
		justify-content: space-between;
		padding: 8px 10px;
		gap: 8px;
		border-bottom: 1px solid var(--border-2);
	}
	.artifact-heading strong {
		overflow: hidden;
		font-size: 9px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.artifact-heading span {
		color: var(--text-3);
		font-size: 7px;
	}
	.diff-view,
	.text-preview {
		min-height: 100%;
		margin: 0;
		padding: 10px;
		overflow: auto;
		background: var(--bg-2);
		color: var(--text-2);
		font-size: 8px;
		line-height: 1.45;
		font-family: var(--font-mono);
		white-space: pre;
	}
	.image-preview {
		display: grid;
		place-items: center;
		min-height: 260px;
		padding: 16px;
		background: repeating-conic-gradient(var(--bg-2) 0% 25%, var(--bg-1) 0% 50%) 50% / 18px 18px;
	}
	.image-preview img {
		max-width: 100%;
		max-height: 430px;
		object-fit: contain;
		box-shadow: 0 10px 28px #0004;
	}
	.terminal-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		margin: 12px;
		padding: 15px;
		gap: 7px;
		border: 1px solid var(--border-2);
		border-radius: 10px;
		background: var(--bg-2);
	}
	.terminal-prompt {
		color: var(--fill-pop-bg);
		font-size: 18px;
	}
	.terminal-card strong {
		font-size: 10px;
	}
	.terminal-card code {
		max-width: 100%;
		overflow: hidden;
		color: var(--text-2);
		font-size: 8px;
		text-overflow: ellipsis;
	}
	.terminal-card p {
		margin: 0;
		color: var(--text-3);
		font-size: 8px;
		line-height: 1.4;
	}
	.git-graph {
		display: flex;
		flex-direction: column;
		padding: 10px;
	}
	.graph-commit {
		display: grid;
		grid-template-columns: 22px minmax(0, 1fr);
		min-height: 54px;
	}
	.graph-rail {
		position: relative;
	}
	.graph-rail::before {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 10px;
		width: 2px;
		background: var(--border-3);
		content: "";
	}
	.graph-rail i {
		z-index: 1;
		position: absolute;
		top: 7px;
		left: 5px;
		width: 12px;
		height: 12px;
		border: 3px solid var(--bg-1);
		border-radius: 50%;
		background: var(--fill-pop-bg);
	}
	.graph-commit > div {
		min-width: 0;
		padding: 4px 0 10px 5px;
	}
	.graph-commit strong {
		display: block;
		overflow: hidden;
		color: var(--text-1);
		font-size: 9px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.graph-commit span,
	.graph-commit p {
		color: var(--text-3);
		font-size: 7px;
	}
	.graph-commit p {
		margin: 4px 0 0;
		color: var(--fill-pop-bg);
	}
	.git-details {
		display: grid;
		padding: 10px;
		gap: 6px;
	}
	.git-details > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 0;
		gap: 8px;
		border-bottom: 1px solid var(--border-2);
		font-size: 8px;
	}
	.git-details > div span {
		color: var(--text-3);
	}
	.git-details code {
		max-width: 70%;
		overflow: hidden;
		color: var(--text-2);
		font-size: 7px;
		text-overflow: ellipsis;
	}
	.git-details h3 {
		margin-top: 7px;
		color: var(--text-1);
		font-size: 9px;
	}
	.connection-binding select {
		max-width: 65%;
	}
	.operation-row {
		padding: 7px;
		border-left: 2px solid #63c18b;
		border-radius: 4px;
		background: var(--bg-2);
	}
	.operation-row--failed {
		border-left-color: #e56b6f;
	}
	.operation-row strong {
		font-size: 8px;
		text-transform: capitalize;
	}
	.operation-row time {
		color: var(--text-3);
		font-size: 7px;
	}
	.operation-row p {
		margin: 4px 0 0;
		color: var(--text-2);
		font-size: 8px;
		line-height: 1.35;
	}
	.modal-backdrop {
		display: grid;
		z-index: 1000;
		position: fixed;
		place-items: center;
		inset: 0;
		padding: 22px;
		backdrop-filter: blur(8px);
		background: #071018a8;
	}
	.modal {
		display: flex;
		flex-direction: column;
		width: min(520px, 96vw);
		max-height: min(760px, 92vh);
		padding: 18px;
		overflow: auto;
		gap: 13px;
		border: 1px solid var(--border-3);
		border-radius: 14px;
		background: var(--bg-1);
		box-shadow: 0 24px 80px #0008;
	}
	.modal--wide {
		width: min(760px, 96vw);
	}
	.modal--connections {
		width: min(960px, 96vw);
	}
	.modal > header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.modal > header h2 {
		margin-top: 4px;
		font-size: 16px;
	}
	.modal > header > button {
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 7px;
		background: var(--bg-2);
		color: var(--text-2);
		font-size: 17px;
		cursor: pointer;
	}
	.modal > p {
		color: var(--text-3);
		font-size: 9px;
		line-height: 1.5;
	}
	.modal > label,
	.connection-column > label {
		display: flex;
		flex-direction: column;
		gap: 5px;
		color: var(--text-2);
		font-size: 9px;
	}
	.modal input,
	.modal textarea,
	.modal select {
		padding: 8px 9px;
		font-size: 9px;
	}
	.modal textarea {
		resize: vertical;
	}
	.modal > footer {
		display: flex;
		justify-content: flex-end;
		padding-top: 4px;
		gap: 6px;
	}
	.modal-loading {
		min-height: 80px;
	}
	.latest-list {
		display: grid;
		gap: 7px;
	}
	.latest-row {
		padding: 10px;
		border: 1px solid var(--border-2);
		border-left: 3px solid var(--border-3);
		border-radius: 8px;
		background: var(--bg-2);
	}
	.latest-row--safe {
		border-left-color: #63c18b;
	}
	.latest-row--blocked {
		border-left-color: #e56b6f;
	}
	.latest-row > div:first-child {
		justify-content: space-between;
		gap: 10px;
	}
	.latest-row strong {
		font-size: 10px;
	}
	.latest-row span,
	.latest-row p {
		color: var(--text-3);
		font-size: 8px;
	}
	.latest-row p {
		margin: 6px 0 0;
		line-height: 1.4;
	}
	.latest-stats {
		margin-top: 7px;
		gap: 6px;
	}
	.latest-stats span {
		padding: 3px 5px;
		border-radius: 999px;
		background: var(--bg-1);
	}
	.latest-stats strong {
		margin-left: auto;
		font-size: 8px;
	}
	.connection-grid {
		display: grid;
		grid-template-columns: 1.2fr 0.8fr;
		gap: 16px;
	}
	.connection-column {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 9px;
	}
	.connection-column + .connection-column {
		padding-left: 16px;
		border-left: 1px solid var(--border-2);
	}
	.connection-column h3 {
		margin: 0 0 2px;
		font-size: 11px;
	}
	.form-actions {
		justify-content: flex-end;
		gap: 5px;
	}
	.profile-list {
		display: grid;
		margin-top: 5px;
		gap: 5px;
	}
	.profile-list article {
		padding: 7px;
		gap: 5px;
		border: 1px solid var(--border-2);
		border-radius: 8px;
		background: var(--bg-2);
	}
	.profile-list article > div {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		gap: 2px;
	}
	.profile-list strong,
	.profile-list span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.profile-list strong {
		font-size: 9px;
	}
	.profile-list span {
		color: var(--text-3);
		font-size: 7px;
	}
	.profile-list button {
		padding: 4px 5px;
		font-size: 7px;
	}
	.danger-button {
		border-radius: 5px;
		background: #e56b6f !important;
		color: white !important;
	}
	.path-picker {
		gap: 5px;
	}
	.path-picker input {
		flex: 1;
	}
	.path-picker button {
		padding: 7px;
		border: 1px solid var(--border-2);
		border-radius: 7px;
		font-size: 8px;
	}
	.security-note {
		margin-top: 6px;
		padding: 10px;
		border: 1px solid color-mix(in srgb, var(--fill-pop-bg) 35%, var(--border-2));
		border-radius: 8px;
		background: color-mix(in srgb, var(--fill-pop-bg) 6%, var(--bg-2));
	}
	.security-note strong {
		font-size: 9px;
	}
	.security-note p {
		margin: 5px 0 0;
		color: var(--text-3);
		font-size: 8px;
		line-height: 1.45;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 1550px) {
		.dashboard-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.dashboard-panel {
			max-height: 720px;
		}
	}
	@media (max-width: 920px) {
		.dashboard {
			padding-inline: 16px;
		}
		.dashboard-header,
		.dashboard-toolbar {
			flex-wrap: wrap;
			align-items: flex-start;
		}
		.search-box {
			order: 5;
			width: 100%;
		}
		.dashboard-grid,
		.connection-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.connection-column + .connection-column {
			padding: 14px 0 0;
			border-top: 1px solid var(--border-2);
			border-left: 0;
		}
	}
</style>
