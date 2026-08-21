<script lang="ts">
	import BranchExplorer from "$components/branchesPage/BranchExplorer.svelte";
	import BranchListCard from "$components/branchesPage/BranchListCard.svelte";
	import BranchesListGroup from "$components/branchesPage/BranchesListGroup.svelte";
	import BranchesViewPr from "$components/branchesPage/BranchesViewPR.svelte";
	import CurrentOriginCard from "$components/branchesPage/CurrentOriginCard.svelte";
	import PRListCard from "$components/branchesPage/PRListCard.svelte";
	import UnappliedCommitView from "$components/commit/UnappliedCommitView.svelte";
	import MultiDiffView from "$components/diff/MultiDiffView.svelte";
	import PrBranchView from "$components/forge/PrDetailsDrawer.svelte";
	import AppScrollableContainer from "$components/shared/AppScrollableContainer.svelte";
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import Resizer from "$components/shared/Resizer.svelte";
	import SashLayer from "$components/shared/SashLayer.svelte";
	import BranchesViewBranch from "$components/views/BranchesViewBranch.svelte";
	import TargetCommitList from "$components/views/TargetCommitList.svelte";
	import { BASE_BRANCH_SERVICE } from "$lib/baseBranch/baseBranchService.svelte";
	import { getBranchNameFromRef } from "$lib/branches/branchUtils";
	import { BRANCH_SERVICE } from "$lib/branches/branchService.svelte";
	import { isNormalizedError } from "$lib/error/normalizedError";
	import { useBitbucketForgeUser } from "$lib/forge/bitbucket/hooks.svelte";
	import { FORGE_INFO_SERVICE } from "$lib/forge/forgeInfo.svelte";
	import { useGitHubForgeUser } from "$lib/forge/github/hooks.svelte";
	import { useGitLabForgeUser } from "$lib/forge/gitlab/hooks.svelte";
	import { MODE_SERVICE } from "$lib/mode/modeService";
	import { STACK_SERVICE } from "$lib/stacks/stackService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { persisted } from "@gitbutler/shared/persisted";
	import { reactive } from "@gitbutler/shared/reactiveUtils.svelte";
	import { AsyncButton, Button, Modal, TestId } from "@gitbutler/ui";
	import { focusable } from "@gitbutler/ui/focus/focusable";
	import { getTimeAgo } from "@gitbutler/ui/utils/timeAgo";
	import { untrack } from "svelte";
	import type { BranchFilterOption, SidebarEntrySubject } from "$lib/branches/branchListing";
	type Props = {
		projectId: string;
	};

	const { projectId }: Props = $props();

	type BranchesSelection =
		| {
				type: "branch";
				branchName: string;
				remote?: string;
				commitId?: string;
		  }
		| { type: "pr"; prNumber: number }
		| { type: "target"; commitId?: string };

	const stackService = inject(STACK_SERVICE);
	const modeService = inject(MODE_SERVICE);
	const baseBranchService = inject(BASE_BRANCH_SERVICE);
	const forgeInfoService = inject(FORGE_INFO_SERVICE);
	const forgeInfoQuery = $derived(forgeInfoService.get(projectId));
	const forgeInfo = $derived(forgeInfoQuery.response);
	// Call both hooks at init (they inject()/getContext(), which must not
	// run inside a $derived re-computation); select reactively by forge.
	const projectIdRef = reactive(() => projectId);
	const githubUser = useGitHubForgeUser(projectIdRef);
	const gitlabUser = useGitLabForgeUser(projectIdRef);
	const bitbucketUser = useBitbucketForgeUser(projectIdRef);
	const forgeUser = $derived.by(() => {
		switch (forgeInfo?.name) {
			case "github":
				return githubUser.user.current;
			case "gitlab":
				return gitlabUser.user.current;
			case "bitbucket":
				return bitbucketUser.user.current;
			default:
				return undefined;
		}
	});
	const prUnit = $derived(forgeInfo?.unit);
	const branchService = inject(BRANCH_SERVICE);
	const modeQuery = $derived(modeService.mode(projectId));
	const currentBranchName = $derived(
		modeQuery.response?.type === "OutsideWorkspace"
			? getBranchNameFromRef(modeQuery.response.subject.branchName ?? "")
			: undefined,
	);

	const baseBranchQuery = $derived(baseBranchService.baseBranch(projectId));
	const selectedOption = persisted<BranchFilterOption>(
		"all",
		`branches-selectedOption-${untrack(() => projectId)}`,
	);

	let selection = $state<BranchesSelection>({ type: "target" });

	let branchColumn = $state<HTMLDivElement>();
	let branchViewLeftEl = $state<HTMLDivElement>();

	const LEFT_PANEL_RESIZER = {
		minWidth: 16,
		maxWidth: 40,
		defaultValue: 24,
	};

	const BRANCH_COLUMN_RESIZER = {
		minWidth: 20,
		maxWidth: 30,
		defaultValue: 20,
	};

	const [checkoutBranch] = branchService.checkout;

	async function checkoutLocalBranch(branchName: string) {
		await checkoutBranch({
			projectId,
			branch: Array.from(new TextEncoder().encode(`refs/heads/${branchName}`)),
		});
		await baseBranchService.refreshBaseBranch(projectId);
	}

	async function deleteLocalBranch(branchName: string) {
		await stackService.deleteLocalBranch({
			projectId,
			refname: `refs/heads/${branchName}`,
			givenName: branchName,
		});
		// Unselect branch
		await baseBranchService.refreshBaseBranch(projectId);
	}

	let deleteLocalBranchModal = $state<Modal>();

	function handleDeleteLocalBranch(branchName: string) {
		deleteLocalBranchModal?.show(branchName);
	}

	function onerror(err: unknown) {
		// Clear selection if branch not found.
		if (isNormalizedError(err) && err.code === "BranchNotFound") {
			selection = { type: "target" };
			console.warn("Branches selection cleared");
		}
	}

	let multiDiffView = $state<MultiDiffView>();
</script>

{#snippet branchActions(branchName: string, _remote: string | undefined, hasLocal: boolean)}
	<div class="branch-actions">
		<AsyncButton
			testId={TestId.BranchesViewCheckoutBranchButton}
			icon="branch"
			shrinkable
			disabled={!hasLocal}
			tooltip={hasLocal ? undefined : "Create a local branch before checking it out"}
			action={async () => await checkoutLocalBranch(branchName)}
		>
			Checkout
		</AsyncButton>
		<Button
			testId={TestId.BranchesViewDeleteLocalBranchButton}
			kind="outline"
			icon="bin"
			onclick={() => {
				handleDeleteLocalBranch(branchName);
			}}
			disabled={!hasLocal}
			tooltip={hasLocal ? undefined : "No local branch to delete"}
		>
			Delete local
		</Button>
	</div>
{/snippet}

<Modal
	testId={TestId.DeleteLocalBranchConfirmationModal}
	bind:this={deleteLocalBranchModal}
	title="Delete local branch"
	width="small"
	defaultItem={selection.type === "branch" ? selection.branchName : undefined}
	onSubmit={async (close, branchName: string | undefined) => {
		if (branchName) {
			await deleteLocalBranch(branchName);
		}
		close();
	}}
>
	{#snippet children(branchName)}
		<p>Are you sure you want to delete the local changes inside the branch {branchName}?</p>
	{/snippet}

	{#snippet controls(close)}
		<Button
			testId={TestId.DeleteLocalBranchConfirmationModal_Cancel}
			kind="outline"
			type="reset"
			onclick={close}>Cancel</Button
		>
		<Button
			testId={TestId.DeleteLocalBranchConfirmationModal_Delete}
			style="danger"
			type="submit"
			icon="bin">Delete</Button
		>
	{/snippet}
</Modal>

<SashLayer>
	<div class="branches-view" data-testid={TestId.BranchesView}>
		<div class="relative overflow-hidden radius-ml">
			<div
				bind:this={branchViewLeftEl}
				class="branches-view__left"
				use:focusable={{ vertical: true }}
			>
				<ReduxResult {projectId} result={baseBranchQuery.result}>
					{#snippet children(baseBranch)}
						{#if baseBranch}
							{@const lastCommit = baseBranch.recentCommits.at(0)}
							<BranchesListGroup title="Integration target">
								<!-- TODO: We need an API for `commitsCount`! -->
								<CurrentOriginCard
									originName={baseBranch.branchName}
									lastCommit={lastCommit
										? {
												author: lastCommit.author,
												ago: getTimeAgo(new Date(lastCommit.committedAt), true),
												branch: baseBranch.shortName,
												sha: lastCommit.id.slice(0, 7),
											}
										: undefined}
									onclick={() => {
										selection = { type: "target" };
									}}
									selected={selection.type === "target"}
								/>
							</BranchesListGroup>
						{/if}
						<BranchExplorer
							{projectId}
							bind:selectedOption={$selectedOption}
							{forgeUser}
							baseBranch={baseBranch ?? undefined}
							{currentBranchName}
						>
							{#snippet sidebarEntry(sidebarEntrySubject: SidebarEntrySubject)}
								{#if sidebarEntrySubject.type === "branchListing"}
									<BranchListCard
										reviewUnit={prUnit}
										forge={forgeInfo?.name}
										branchListing={sidebarEntrySubject.subject}
										{currentBranchName}
										prs={sidebarEntrySubject.prs}
										selected={selection.type === "branch"
											? selection.branchName === sidebarEntrySubject.subject.name
											: false}
										onclick={({ listing }) => {
											selection = {
												type: "branch",
												branchName: listing.name,
												remote: listing.remotes.at(0),
											};
										}}
									/>
								{:else}
									<PRListCard
										reviewUnit={prUnit}
										forge={forgeInfo?.name}
										number={sidebarEntrySubject.subject.number}
										isDraft={sidebarEntrySubject.subject.draft}
										title={sidebarEntrySubject.subject.title}
										sourceBranch={sidebarEntrySubject.subject.sourceBranch}
										author={{
											name: sidebarEntrySubject.subject.author?.name,
											email: sidebarEntrySubject.subject.author?.email,
											gravatarUrl: sidebarEntrySubject.subject.author?.gravatarUrl,
										}}
										modifiedAt={sidebarEntrySubject.subject.modifiedAt}
										mergedAt={sidebarEntrySubject.subject.mergedAt}
										closedAt={sidebarEntrySubject.subject.closedAt}
										selected={selection.type === "pr" &&
											selection.prNumber === sidebarEntrySubject.subject.number}
										onclick={(pr) => (selection = { type: "pr", prNumber: pr.number })}
										noRemote
									/>
								{/if}
							{/snippet}
						</BranchExplorer>
					{/snippet}
				</ReduxResult>
			</div>
			<Resizer
				viewport={branchViewLeftEl}
				direction="right"
				minWidth={LEFT_PANEL_RESIZER.minWidth}
				maxWidth={LEFT_PANEL_RESIZER.maxWidth}
				persistId="resizer-branchesWidth"
				defaultValue={LEFT_PANEL_RESIZER.defaultValue}
			/>
		</div>

		<div class="branches-view__right">
			<div class="right-wrapper dotted-pattern">
				{#if selection.type === "target"}
					{#if baseBranchQuery.response}
						<div class="branch-column" bind:this={branchColumn} use:focusable={{ vertical: true }}>
							<TargetCommitList
								{projectId}
								onclick={(commitId) => (selection = { type: "target", commitId })}
								onFileClick={(index) => {
									multiDiffView?.jumpToIndex(index);
								}}
							/>
							<Resizer
								viewport={branchColumn}
								persistId="branches-branch-column-1"
								direction="right"
								defaultValue={BRANCH_COLUMN_RESIZER.defaultValue}
								minWidth={BRANCH_COLUMN_RESIZER.minWidth}
								maxWidth={BRANCH_COLUMN_RESIZER.maxWidth}
							/>
						</div>
					{:else}
						<div class="branch-selection-placeholder text-13 clr-text-2">
							Select a branch to inspect its commits.
						</div>
					{/if}
				{:else}
					<AppScrollableContainer>
						<div class="branch-column" bind:this={branchColumn} use:focusable={{ vertical: true }}>
							{#if selection.type === "branch"}
								{@const { branchName, remote } = selection}
								{@const listing = branchService.listingByName(projectId, selection.branchName)}

								<ReduxResult {projectId} result={listing.result}>
									{#snippet children(listing)}
										{@const hasLocal = listing.hasLocal}

										{#if branchName}
											{@const isCurrentBranch = branchName === currentBranchName}
											{#if !isCurrentBranch}
												{@render branchActions(branchName, remote, hasLocal)}
											{/if}
											<BranchesViewBranch
												{projectId}
												{branchName}
												{remote}
												inWorkspace={isCurrentBranch}
												selectedCommitId={selection.type === "branch"
													? selection.commitId
													: undefined}
												onCommitClick={(commitId) => {
													selection = { type: "branch", branchName, remote, commitId };
												}}
												onFileClick={(index) => {
													multiDiffView?.jumpToIndex(index);
												}}
												{onerror}
											/>
										{/if}
									{/snippet}
								</ReduxResult>
							{:else if selection.type === "pr"}
								{@const prNumber = selection.prNumber}
								<BranchesViewPr {projectId} {prNumber} {onerror} />
							{/if}
							<Resizer
								viewport={branchColumn}
								persistId="branches-branch-column-1"
								direction="right"
								defaultValue={BRANCH_COLUMN_RESIZER.defaultValue}
								minWidth={BRANCH_COLUMN_RESIZER.minWidth}
								maxWidth={BRANCH_COLUMN_RESIZER.maxWidth}
							/>
						</div>
					</AppScrollableContainer>
				{/if}

				<div class="commit-column">
					{#if selection.type === "branch" && selection.commitId}
						{@const { commitId } = selection}
						{@const changesQuery = stackService.commitChanges(projectId, commitId)}
						<UnappliedCommitView {projectId} {commitId} />
						<ReduxResult {projectId} result={changesQuery.result}>
							{#snippet children(result, { projectId })}
								<MultiDiffView
									bind:this={multiDiffView}
									selectionId={{
										type: "commit",
										commitId: commitId,
									}}
									changes={result.changes}
									{projectId}
									draggable={true}
									selectable={false}
								/>
							{/snippet}
						</ReduxResult>
					{:else if selection.type === "pr"}
						{@const prNumber = selection.prNumber}
						<PrBranchView {projectId} {prNumber} {onerror} />
					{:else if selection.type === "target"}
						{@const commitId = selection.commitId}
						{#if commitId}
							{@const changesQuery = stackService.commitChanges(projectId, commitId)}
							<UnappliedCommitView {projectId} {commitId} />
							<ReduxResult {projectId} result={changesQuery.result}>
								{#snippet children(result, { projectId })}
									<MultiDiffView
										bind:this={multiDiffView}
										selectionId={{
											type: "commit",
											commitId: commitId,
										}}
										changes={result.changes}
										{projectId}
										draggable={true}
										selectable={false}
									/>
								{/snippet}
							</ReduxResult>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>
</SashLayer>

<style lang="postcss">
	.branches-view {
		display: flex;
		position: relative;
		width: 100%;
		height: 100%;
		gap: 8px;
	}

	.branches-view__left,
	.branches-view__right {
		display: flex;
		position: relative;
		flex: 1;
		flex-direction: column;
		height: 100%;
		max-height: 100%;
		overflow: hidden;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-ml);
	}

	.right-wrapper {
		display: flex;
		position: relative;
		height: 100%;
		overflow: hidden;
	}

	.branch-column {
		display: flex;
		position: relative;
		flex: 1;
		flex-direction: column;
		max-height: 100%;
		padding: 12px;
	}

	.branch-selection-placeholder {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
	}

	.commit-column {
		display: flex;
		position: relative;
		flex: 1;
		flex-direction: column;
		max-height: 100%;
		padding: 12px;
		padding-left: 0;
		overflow: hidden;
		gap: 12px;
	}

	.branch-actions {
		display: flex;
		margin-bottom: 12px;
		padding: 12px;
		gap: 6px;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-ml);
		background-color: var(--bg-1);
	}
</style>
