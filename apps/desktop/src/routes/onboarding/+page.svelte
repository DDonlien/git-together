<script lang="ts">
	import { goto } from "$app/navigation";
	import FullviewLoading from "$components/shared/FullviewLoading.svelte";

	$effect(() => {
		void goto("/", { replaceState: true });
	});
</script>

<FullviewLoading />
