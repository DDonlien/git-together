<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import WorkspaceView from "$components/views/WorkspaceView.svelte";
	import { MODE_SERVICE } from "$lib/mode/modeService";
	import { STACK_SERVICE } from "$lib/stacks/stackService.svelte";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { inject } from "@gitbutler/core/context";

	const modeService = inject(MODE_SERVICE);

	const projectId = $derived(page.params.projectId!);
	const mode = $derived(modeService.mode(projectId));
	const stackService = inject(STACK_SERVICE);
	const uiState = inject(UI_STATE);
	const createCommitRequested = $derived(page.url.searchParams.get("create") === "1");

	// Check for stackId in URL query parameters
	const urlStackId = $derived(page.url.searchParams.get("stackId"));
	let scrollToStackId = $state<string | undefined>(undefined);

	// Read all local commits in the workspace for the given project
	$effect(() => {
		stackService.allLocalCommits(projectId);
	});

	$effect(() => {
		if (urlStackId) {
			scrollToStackId = urlStackId;
		}
	});

	function gotoEdit() {
		goto(`/${projectId}/edit`);
	}

	$effect(() => {
		if (mode.response?.type === "Edit") {
			gotoEdit();
		}
	});

	// The dashboard can send the user straight to a repository's commit flow.
	// The commit editor remains in the existing workspace so it keeps the same
	// file-selection and validation behavior as a normal workspace action.
	$effect(() => {
		if (!createCommitRequested) return;

		const projectState = uiState.project(projectId);
		if (!projectState.exclusiveAction.current) {
			projectState.exclusiveAction.set({
				type: "commit",
				stackId: undefined,
				branchName: undefined,
			});
		}

		const cleanUrl = new URL(page.url);
		cleanUrl.searchParams.delete("create");
		void goto(cleanUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	});

	function onScrollComplete() {
		scrollToStackId = undefined;
		const newUrl = new URL(page.url);
		newUrl.searchParams.delete("stackId");
		goto(newUrl.toString(), { replaceState: false });
	}
</script>

<WorkspaceView {projectId} {scrollToStackId} {onScrollComplete} />
