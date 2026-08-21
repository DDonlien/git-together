import {
	invalidatesList,
	invalidatesType,
	providesList,
	providesType,
	ReduxTag,
} from "$lib/state/tags";
import { createEntityAdapter, type EntityState } from "@reduxjs/toolkit";
import type { ForgeProvider, RemoteBranchInfo } from "$lib/baseBranch/baseBranch";
import type { GitBranchListing } from "$lib/branches/branchListing";
import type { BackendEndpointBuilder } from "$lib/state/backendApi";
import type {
	BaseBranch,
	BranchCheckoutResult,
	ListedBranch,
	ListedStack,
	WorkspaceFetchStatus,
} from "@gitbutler/but-sdk";

export function buildBranchEndpoints(build: BackendEndpointBuilder) {
	return {
		// ── Base Branch ─────────────────────────────────────────────
		forgeProvider: build.query<ForgeProvider | null, { projectId: string }>({
			extraOptions: { command: "forge_provider" },
			query: (args) => args,
			providesTags: [providesType(ReduxTag.ForgeProvider)],
		}),
		baseBranch: build.query<BaseBranch | undefined, { projectId: string }>({
			extraOptions: { command: "get_base_branch_data" },
			query: (args) => args,
			providesTags: [providesType(ReduxTag.BaseBranchData)],
		}),
		workspaceFetchStatus: build.query<WorkspaceFetchStatus, { projectId: string }>({
			extraOptions: { command: "workspace_fetch_status" },
			query: (args) => args,
			providesTags: [providesType(ReduxTag.WorkspaceFetchStatus)],
		}),
		workspaceFetchFromRemotes: build.mutation<void, { projectId: string; action?: string }>({
			extraOptions: { command: "workspace_fetch_from_remotes" },
			query: ({ projectId, action }) => ({
				projectId,
				action: action ?? "auto",
			}),
			invalidatesTags: [
				invalidatesType(ReduxTag.WorkspaceFetchStatus),
				invalidatesList(ReduxTag.Stacks),
				invalidatesList(ReduxTag.StackDetails),
			],
		}),
		// Update integration metadata without changing the checked-out branch.
		setTargetRef: build.mutation<
			void,
			{ projectId: string; targetRef: string; pushRemote?: string }
		>({
			extraOptions: { command: "set_target_ref_and_init_project" },
			query: (args) => args,
			invalidatesTags: [
				invalidatesType(ReduxTag.ForgeProvider),
				invalidatesType(ReduxTag.BaseBranchData),
				invalidatesList(ReduxTag.Stacks),
				invalidatesList(ReduxTag.StackDetails),
				// No branch is checked out, so no `git/head` event refreshes the
				// operating mode - invalidate it explicitly.
				invalidatesList(ReduxTag.HeadMetadata),
			],
		}),
		checkoutBranch: build.mutation<BranchCheckoutResult, { projectId: string; branch: number[] }>({
			extraOptions: { command: "branch_checkout", actionName: "Checkout Branch" },
			query: (args) => args,
			invalidatesTags: [
				invalidatesList(ReduxTag.HeadMetadata),
				invalidatesList(ReduxTag.Stacks),
				invalidatesList(ReduxTag.StackDetails),
				invalidatesList(ReduxTag.BranchListing),
				invalidatesList(ReduxTag.WorktreeChanges),
			],
		}),
		checkoutNewBranch: build.mutation<
			BranchCheckoutResult,
			{ projectId: string; name: string | null }
		>({
			extraOptions: { command: "branch_checkout_new", actionName: "Create and Checkout Branch" },
			query: (args) => args,
			invalidatesTags: [
				invalidatesList(ReduxTag.HeadMetadata),
				invalidatesList(ReduxTag.Stacks),
				invalidatesList(ReduxTag.StackDetails),
				invalidatesList(ReduxTag.BranchListing),
				invalidatesList(ReduxTag.WorktreeChanges),
			],
		}),
		remoteBranches: build.query<RemoteBranchInfo[], { projectId: string }>({
			extraOptions: { command: "git_remote_branches" },
			query: (args) => args,
			transformResponse: (data: string[]) => {
				return data
					.map((name) => name.substring(13))
					.sort((a, b) => a.localeCompare(b))
					.map((name) => ({ name }));
			},
		}),

		// ── Branch Listing ──────────────────────────────────────────
		listBranches: build.query<EntityState<GitBranchListing, string>, { projectId: string }>({
			extraOptions: { command: "branch_list" },
			query: (args) => args,
			providesTags: [providesList(ReduxTag.BranchListing)],
			transformResponse: (response: ListedStack[]) => {
				const branches = response.flatMap((stack) => stack.branches.map(toGitBranchListing));
				return listingAdapter.addMany(listingAdapter.getInitialState(), branches);
			},
		}),
	};
}

function toGitBranchListing(branch: ListedBranch): GitBranchListing {
	const remotes = branch.remoteRefs.flatMap(({ full }) => {
		const prefix = "refs/remotes/";
		const suffix = `/${branch.displayName}`;
		if (!full.startsWith(prefix) || !full.endsWith(suffix)) return [];
		return [full.slice(prefix.length, -suffix.length)];
	});

	return {
		name: branch.displayName,
		remotes: [...new Set(remotes)],
		updatedAt: branch.updatedAtMs ?? 0,
		lastCommiter: {
			name: branch.lastAuthor?.name ?? null,
			email: branch.lastAuthor?.email ?? null,
			gravatarUrl: branch.lastAuthor?.gravatarUrl ?? null,
		},
		hasLocal: branch.hasLocal,
		commitCount: branch.commitCount,
	};
}

const listingAdapter = createEntityAdapter<GitBranchListing, string>({
	selectId: (listing) => listing.name,
});

export const listingSelectors = listingAdapter.getSelectors();
