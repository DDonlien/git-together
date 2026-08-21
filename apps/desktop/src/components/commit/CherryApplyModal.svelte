<script lang="ts">
	import { goto } from "$app/navigation";
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import { showError } from "$lib/error/showError";
	import { workspacePath } from "$lib/routes/routes.svelte";
	import { toCommitMovePlacement } from "$lib/stacks/commitMovePlacement";
	import { STACK_SERVICE } from "$lib/stacks/stackService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Button, InfoMessage, Modal } from "@gitbutler/ui";

	type Props = {
		projectId: string;
		/** The commit hash to cherry-pick. */
		subject?: string;
	};

	let { projectId, subject }: Props = $props();

	const stackService = inject(STACK_SERVICE);
	const stacksResult = $derived(stackService.stacks(projectId));
	const currentBranchName = $derived(
		stacksResult.result.data?.at(0)?.segments.at(0)?.refName?.displayName,
	);
	const [cherryPick, cherryPickResult] = stackService.commitCherryPick;

	let modalRef = $state<Modal>();

	export function close() {
		modalRef?.close();
	}

	export function open() {
		modalRef?.show();
	}

	async function handleApply() {
		if (!currentBranchName || !subject) return;

		// The compatibility API expresses the checked-out branch tip as a graph placement.
		const { relativeTo, side } = toCommitMovePlacement({
			targetBranchName: currentBranchName,
			targetCommitId: "top",
		});

		try {
			await cherryPick({
				projectId,
				sourceCommitIds: [subject],
				relativeTo,
				side,
				dryRun: false,
			});
		} catch (error) {
			showError("Cannot cherry-pick commit", error);
			return;
		}

		goto(workspacePath(projectId));
		close();
	}

	const isApplying = $derived(cherryPickResult.current.isLoading);
</script>

<Modal bind:this={modalRef} title="Cherry-pick commit" width={500}>
	<ReduxResult {projectId} result={stacksResult.result}>
		{#snippet children()}
			<div class="cherry-apply-modal">
				<InfoMessage style="info" outlined>
					{#snippet content()}
						{#if currentBranchName}
							Cherry-pick this commit into the checked-out branch
							<strong>{currentBranchName}</strong>.
						{:else}
							No checked-out branch is available.
						{/if}
					{/snippet}
				</InfoMessage>
			</div>
		{/snippet}
	</ReduxResult>
	{#snippet controls()}
		<Button kind="outline" onclick={close} disabled={isApplying}>Cancel</Button>
		<Button
			style="pop"
			onclick={handleApply}
			disabled={!currentBranchName || isApplying}
			loading={isApplying}
		>
			Cherry-pick
		</Button>
	{/snippet}
</Modal>

<style lang="postcss">
	.cherry-apply-modal {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
</style>
