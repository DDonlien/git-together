<script lang="ts">
	import BranchNameTextbox from "$components/branch/BranchNameTextbox.svelte";
	import { BRANCH_SERVICE } from "$lib/branches/branchService.svelte";
	import { autoSelectBranchCreationFeature } from "$lib/config/uiFeatureFlags";
	import { STACK_SERVICE } from "$lib/stacks/stackService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Button, ElementId, Modal, TestId } from "@gitbutler/ui";

	type Props = {
		projectId: string;
	};

	const { projectId }: Props = $props();
	const branchService = inject(BRANCH_SERVICE);
	const stackService = inject(STACK_SERVICE);
	const [checkoutNewBranch, branchCreation] = branchService.checkoutNew;

	let createRefModal = $state<ReturnType<typeof Modal>>();
	let createRefName = $state<string>();
	let branchNameInput = $state<ReturnType<typeof BranchNameTextbox>>();
	let normalizedRefName = $state<string>();
	let isBranchNameValid = $state(false);

	async function addNew() {
		if (!normalizedRefName) return;

		await checkoutNewBranch({ projectId, name: normalizedRefName });
		createRefModal?.close();
		createRefName = undefined;
		normalizedRefName = undefined;
	}

	export async function show() {
		createRefModal?.show();
		createRefName = await stackService.fetchNewBranchName(projectId);

		if ($autoSelectBranchCreationFeature) {
			await branchNameInput?.selectAll();
		}
	}

	export function close() {
		createRefModal?.close();
	}
</script>

<Modal
	bind:this={createRefModal}
	width="small"
	title="Create and checkout branch"
	testId={TestId.CreateNewBranchModal}
>
	<div class="content-wrap">
		<BranchNameTextbox
			bind:this={branchNameInput}
			label="New branch"
			id={ElementId.NewBranchNameInput}
			value={createRefName}
			autofocus
			onnormalizedvalue={(value) => (normalizedRefName = value)}
			onvalidationchange={(isValid) => (isBranchNameValid = isValid)}
		/>
		<p class="text-12 text-body clr-text-2">
			The branch is created from the current HEAD and checked out immediately.
		</p>
	</div>

	{#snippet controls(close)}
		<Button kind="outline" type="reset" onclick={close}>Cancel</Button>
		<Button
			style="pop"
			type="submit"
			onclick={addNew}
			disabled={!isBranchNameValid}
			loading={branchCreation.current.isLoading}
			testId={TestId.ConfirmSubmit}
		>
			Create and checkout
		</Button>
	{/snippet}
</Modal>

<style>
	.content-wrap {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
