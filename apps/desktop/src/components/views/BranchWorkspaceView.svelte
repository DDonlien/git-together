<script lang="ts">
	import ErrorBoundary from "$components/shared/ErrorBoundary.svelte";
	import StackView from "$components/views/StackView.svelte";
	import type { Stack } from "$lib/stacks/stack";

	type Props = {
		projectId: string;
		stacks: Stack[];
		scrollToStackId?: string;
		onScrollComplete?: () => void;
	};

	const { projectId, stacks, scrollToStackId, onScrollComplete }: Props = $props();

	// The shared repository projection still calls this object a stack. In
	// GitTogether it represents only the checked-out Git branch, so never expose
	// additional legacy workspace lanes.
	const branch = $derived(stacks.find((stack) => stack.id === scrollToStackId) ?? stacks.at(0));
	const checkedOutBranch = $derived(
		branch
			? {
					...branch,
					// Legacy repositories can still contain dependent segments. Keep
					// parsing them in the backend, but do not surface stacked branches.
					segments: branch.segments.slice(0, 1),
				}
			: undefined,
	);

	$effect(() => {
		if (scrollToStackId && checkedOutBranch) {
			queueMicrotask(() => onScrollComplete?.());
		}
	});
</script>

<div class="branch-workspace">
	{#if checkedOutBranch}
		<ErrorBoundary title="Something went wrong in this branch">
			<StackView
				{projectId}
				stack={checkedOutBranch}
				laneId={checkedOutBranch.id || "checked-out-branch"}
				onVisible={() => {}}
			/>
		</ErrorBoundary>
	{:else}
		<div class="empty-state text-13 clr-text-2">Current branch data is not available.</div>
	{/if}
</div>

<style>
	.branch-workspace {
		display: flex;
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow: auto;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
	}
</style>
