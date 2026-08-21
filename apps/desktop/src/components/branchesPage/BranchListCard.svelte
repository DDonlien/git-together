<script lang="ts">
	import BranchesCardLayout from "$components/branchesPage/BranchesCardLayout.svelte";
	import { GIT_CONFIG_SERVICE } from "$lib/config/gitConfigService";
	import { getPrStatus } from "$lib/forge/interface/prUtils";
	import { useUserAvatarUrl } from "$lib/user/userAvatar.svelte";
	import { inject } from "@gitbutler/core/context";

	import { AvatarGroup, ReviewBadge, SeriesLabelsRow, TestId, TimeAgo } from "@gitbutler/ui";
	import { gravatarUrlFromEmail } from "@gitbutler/ui/components/avatar/gravatar";
	import type { GitBranchListing } from "$lib/branches/branchListing";
	import type { PullRequest } from "$lib/forge/interface/types";
	import type { ForgeUnitInfo } from "@gitbutler/but-sdk";

	interface Props {
		reviewUnit: ForgeUnitInfo | undefined;
		forge?: string;
		branchListing: GitBranchListing;
		currentBranchName?: string;
		prs: PullRequest[];
		selected: boolean;
		onclick: (args: { listing: GitBranchListing; pr?: PullRequest }) => void;
	}

	const { reviewUnit, forge, branchListing, currentBranchName, prs, selected, onclick }: Props =
		$props();
	const userAvatarUrl = useUserAvatarUrl();

	const unknownName = "unknown";
	const unknownEmail = "example@example.com";

	const gitConfigService = inject(GIT_CONFIG_SERVICE);
	const pr = $derived(prs.at(0));

	let lastCommitDetails = $state<{ authorName: string; lastCommitAt?: Date }>();

	// If there are zero commits we should not show the author
	const ownedByUser = $derived(branchListing.commitCount === 0);

	$effect(() => {
		let canceled = false;

		if (ownedByUser) {
			gitConfigService.get("user.name").then((userName) => {
				if (canceled) return;

				if (userName) {
					lastCommitDetails = { authorName: userName };
				} else {
					lastCommitDetails = undefined;
				}
			});
		} else {
			lastCommitDetails = {
				authorName: branchListing.lastCommiter.name || unknownName,
				lastCommitAt: new Date(branchListing.updatedAt),
			};
		}

		return () => {
			canceled = true;
		};
	});

	let avatars = $state<{ username: string; srcUrl: string }[]>([]);

	$effect(() => {
		setAvatars(ownedByUser);
	});

	async function setAvatars(ownedByUser: boolean) {
		if (ownedByUser) {
			const name = (await gitConfigService.get("user.name")) || unknownName;
			const email = (await gitConfigService.get<string>("user.email")) || unknownEmail;

			avatars = [
				{
					username: name,
					srcUrl: userAvatarUrl(email) ?? (await gravatarUrlFromEmail(email)),
				},
			];
		} else if (branchListing.lastCommiter.email || branchListing.lastCommiter.name) {
			const name = branchListing.lastCommiter.name || unknownName;
			const email = branchListing.lastCommiter.email || unknownEmail;
			avatars = [
				{
					username: name,
					srcUrl:
						userAvatarUrl(email) ??
						branchListing.lastCommiter.gravatarUrl ??
						(await gravatarUrlFromEmail(email)),
				},
			];
		} else {
			avatars = [];
		}
	}

	const isCurrentBranch = $derived(branchListing.name === currentBranchName);
</script>

<BranchesCardLayout
	testId={TestId.BranchListCard}
	{selected}
	onclick={() => onclick?.({ listing: branchListing, pr })}
>
	{#snippet content()}
		<div class="sidebar-entry__header">
			<SeriesLabelsRow series={[branchListing.name]} />
			{#if isCurrentBranch}
				<div class="sidebar-entry__current-tag">
					<span class="text-10 text-semibold">Current</span>
				</div>
			{/if}
		</div>

		<div class="text-12 sidebar-entry__about">
			{#if pr}
				<ReviewBadge
					type={reviewUnit?.abbr}
					{forge}
					status={getPrStatus(pr)}
					title={pr.title}
					number={pr.number}
				/>
				<span class="sidebar-entry__divider">•</span>
			{/if}

			{#if avatars.length > 0}
				<AvatarGroup {avatars} />
				<span class="sidebar-entry__divider">•</span>
			{/if}

			{#each branchListing.remotes as remote}
				<span class="truncate">{remote}</span>
				<span class="sidebar-entry__divider">•</span>
			{/each}

			{#if branchListing.hasLocal}
				<span class="truncate">local</span>
				<span class="sidebar-entry__divider">•</span>
			{/if}

			{#if branchListing.remotes.length === 0 && !branchListing.hasLocal}
				<span class="truncate">No remotes</span>
			{/if}
		</div>
	{/snippet}
	{#snippet details()}
		<div class="text-12 sidebar-entry__details">
			<span class="truncate">
				{#if lastCommitDetails}
					<TimeAgo date={lastCommitDetails.lastCommitAt} addSuffix />
					by {lastCommitDetails.authorName}
				{/if}
			</span>

			{#if branchListing.commitCount !== null}
				<div class="sidebar-entry__details-item">
					<svg
						width="14"
						height="12"
						viewBox="0 0 14 12"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M10 6C10 7.65685 8.65685 9 7 9C5.34315 9 4 7.65685 4 6M10 6C10 4.34315 8.65685 3 7 3C5.34315 3 4 4.34315 4 6M10 6H14M4 6H0"
							stroke="currentColor"
						/>
					</svg>

					<span>{branchListing.commitCount}</span>
				</div>
			{/if}
		</div>
	{/snippet}
</BranchesCardLayout>

<style lang="postcss">
	.sidebar-entry__about {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-2);
	}

	.sidebar-entry__header {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.sidebar-entry__divider {
		color: var(--text-3);

		&:last-child {
			display: none;
		}
	}

	.sidebar-entry__current-tag {
		display: flex;
		padding: 2px 4px;
		border-radius: 10px;
		background-color: var(--fill-gray-bg);
		color: var(--fill-gray-fg);
	}

	.sidebar-entry__details {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		gap: 6px;
	}

	.sidebar-entry__details-item {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--text-2);
	}
</style>
