<script lang="ts">
	import { goto } from "$app/navigation";
	import RepositoryDashboard from "$components/dashboard/RepositoryDashboard.svelte";
	import FullviewLoading from "$components/shared/FullviewLoading.svelte";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { inject } from "@gitbutler/core/context";
	import { Button } from "@gitbutler/ui";
	import { onMount } from "svelte";

	const projectsService = inject(PROJECTS_SERVICE);

	type RootState = { type: "loading" | "empty" } | { type: "error"; message: string };

	let rootState = $state<RootState>({ type: "loading" });

	function errorMessage(error: unknown) {
		if (error instanceof Error) return error.message;
		return typeof error === "string" ? error : "The project list could not be loaded.";
	}

	async function openInitialView() {
		rootState = { type: "loading" };
		try {
			const projects = await projectsService.fetchProjects();
			const persistedId = projectsService.getLastOpenedProject();
			const projectId =
				projects.find((project) => project.id === persistedId)?.id ?? projects[0]?.id;

			if (projectId) {
				await goto(`/${projectId}`, { replaceState: true });
				return;
			}

			rootState = { type: "empty" };
		} catch (error: unknown) {
			rootState = { type: "error", message: errorMessage(error) };
		}
	}

	onMount(() => {
		void openInitialView();
	});
</script>

{#if rootState.type === "loading"}
	<FullviewLoading />
{:else if rootState.type === "error"}
	<div class="root-error" role="alert">
		<strong>Unable to open GitTogether</strong>
		<p>{rootState.message}</p>
		<Button style="pop" onclick={openInitialView}>Retry</Button>
	</div>
{:else}
	<RepositoryDashboard view="overview" />
{/if}

<style>
	.root-error {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: var(--bg-2);
		color: var(--text-1);
	}

	.root-error p {
		max-width: 520px;
		margin: 0 0 8px;
		color: var(--text-2);
		text-align: center;
	}
</style>
