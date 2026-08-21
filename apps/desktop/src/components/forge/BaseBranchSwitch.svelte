<script lang="ts">
	import { BASE_BRANCH_SERVICE } from "$lib/baseBranch/baseBranchService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Button, CardGroup, InfoMessage, Select, SelectItem } from "@gitbutler/ui";

	const { projectId }: { projectId: string } = $props();

	const baseBranchService = inject(BASE_BRANCH_SERVICE);
	const baseBranchQuery = $derived(baseBranchService.baseBranch(projectId));
	const baseBranch = $derived(baseBranchQuery.response);
	const remoteBranchesQuery = $derived(baseBranchService.remoteBranches(projectId));
	const [setBaseBranchTargetRef, targetRefSwitch] = baseBranchService.setTargetRef;

	let selectedBranch = $derived(baseBranch?.branchName);
	let selectedRemote = $derived(baseBranch?.pushRemoteName);

	function uniqueRemotes(remoteBranches: { name: string }[]): { name: string }[] {
		return Array.from(new Set(remoteBranches.map((b) => b.name.split("/")[0])))
			.filter((name): name is string => !!name)
			.map((r) => ({
				name: r,
			}));
	}

	const switching = $derived(targetRefSwitch.current.isLoading);

	async function switchTarget(branch: string, pushRemote?: string) {
		await setBaseBranchTargetRef({ projectId, targetRef: `refs/remotes/${branch}`, pushRemote });
	}

	async function onSetBaseBranchClick() {
		if (!selectedBranch) return;

		if (selectedRemote) {
			await switchTarget(selectedBranch, selectedRemote);
		} else {
			await switchTarget(selectedBranch);
		}
	}
</script>

{#if remoteBranchesQuery.result.isLoading}
	<InfoMessage filled outlined={false} icon="info">
		{#snippet content()}
			Loading remote branches...
		{/snippet}
	</InfoMessage>
{:else if remoteBranchesQuery.result.isSuccess}
	{@const remoteBranches = remoteBranchesQuery.response}
	{#if remoteBranches && remoteBranches.length > 0}
		{@const remotes = uniqueRemotes(remoteBranches)}
		<CardGroup>
			<CardGroup.Item>
				{#snippet title()}
					Remote configuration
				{/snippet}
				{#snippet caption()}
					Lets you choose where to push code and set the target branch for contributions. The target
					branch is usually the "production" branch like 'origin/master' or 'upstream/main.' This
					section helps ensure your code goes to the correct remote and branch for integration.
				{/snippet}

				<Select
					value={selectedBranch}
					options={remoteBranches.map((b) => ({ label: b.name, value: b.name }))}
					wide
					onselect={(value) => {
						selectedBranch = value;
					}}
					label="Current target branch"
					searchable
				>
					{#snippet itemSnippet({ item, highlighted })}
						<SelectItem selected={item.value === selectedBranch} {highlighted}>
							{item.label}
						</SelectItem>
					{/snippet}
				</Select>

				{#if remotes.length > 1}
					<Select
						value={selectedRemote}
						options={remotes.map((r) => ({ label: r.name, value: r.name }))}
						wide
						onselect={(value) => {
							selectedRemote = value;
						}}
						label="Create branches on remote"
					>
						{#snippet itemSnippet({ item, highlighted })}
							<SelectItem selected={item.value === selectedRemote} {highlighted}>
								{item.label}
							</SelectItem>
						{/snippet}
					</Select>
				{/if}

				<Button
					kind="outline"
					onclick={onSetBaseBranchClick}
					id="set-base-branch"
					loading={switching}
					disabled={selectedBranch === baseBranch?.branchName &&
						selectedRemote === baseBranch?.pushRemoteName}
				>
					{switching ? "Updating target..." : "Update configuration"}
				</Button>
			</CardGroup.Item>
		</CardGroup>
	{/if}
{:else if remoteBranchesQuery.result.isError}
	<InfoMessage filled outlined={true} style="danger">
		{#snippet title()}
			We got an error trying to list your remote branches
		{/snippet}
	</InfoMessage>
{/if}
