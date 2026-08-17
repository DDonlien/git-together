<script lang="ts">
	import { page } from "$app/state";
	import RepositoryDashboard from "$components/dashboard/RepositoryDashboard.svelte";

	const projectId = $derived(page.params.projectId!);
</script>

<RepositoryDashboard view="overview" activeProjectId={projectId} embedded />
