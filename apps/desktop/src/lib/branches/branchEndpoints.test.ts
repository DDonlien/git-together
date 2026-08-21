import { buildBranchEndpoints, listingSelectors } from "$lib/branches/branchEndpoints";
import { invalidatesList, invalidatesType, providesType, ReduxTag } from "$lib/state/tags";
import { describe, expect, test } from "vitest";
import type { BackendEndpointBuilder } from "$lib/state/backendApi";
import type { ListedBranch, ListedStack } from "@gitbutler/but-sdk";

function createEndpointBuilder(): BackendEndpointBuilder {
	return {
		mutation: (definition) => definition,
		query: (definition) => definition,
	} as BackendEndpointBuilder;
}

function listedBranch(
	displayName: string,
	refName: string,
	remoteRefs: string[] = [],
): ListedBranch {
	return {
		refName: { full: refName },
		displayName,
		tip: "0000000000000000000000000000000000000000",
		hasLocal: refName.startsWith("refs/heads/"),
		remoteRefs: remoteRefs.map((full) => ({ full })),
		commitCount: 2,
		commitsAheadOfTarget: null,
		lastAuthor: {
			name: "Test User",
			email: "test@example.com",
			gravatarUrl: "https://example.com/avatar.png",
		},
		updatedAtMs: 1234,
		review: null,
		reviewStatus: null,
	};
}

describe("buildBranchEndpoints", () => {
	test("maps fetch APIs to the workspace-prefixed commands", () => {
		const endpoints = buildBranchEndpoints(createEndpointBuilder());

		expect(endpoints.workspaceFetchStatus.extraOptions).toEqual({
			command: "workspace_fetch_status",
		});
		expect(endpoints.workspaceFetchStatus.query?.({ projectId: "project-1" })).toEqual({
			projectId: "project-1",
		});
		expect(endpoints.workspaceFetchStatus.providesTags).toEqual([
			providesType(ReduxTag.WorkspaceFetchStatus),
		]);

		expect(endpoints.workspaceFetchFromRemotes.extraOptions).toEqual({
			command: "workspace_fetch_from_remotes",
		});
		expect(
			endpoints.workspaceFetchFromRemotes.query?.({
				projectId: "project-1",
				action: "modal",
			}),
		).toEqual({
			projectId: "project-1",
			action: "modal",
		});
		expect(endpoints.workspaceFetchFromRemotes.invalidatesTags).toEqual([
			invalidatesType(ReduxTag.WorkspaceFetchStatus),
			invalidatesList(ReduxTag.Stacks),
			invalidatesList(ReduxTag.StackDetails),
		]);
	});

	test("defaults workspace fetch action to auto", () => {
		const endpoints = buildBranchEndpoints(createEndpointBuilder());

		expect(
			endpoints.workspaceFetchFromRemotes.query?.({
				projectId: "project-1",
			}),
		).toEqual({
			projectId: "project-1",
			action: "auto",
		});
	});

	test("checks out a real local Git branch", () => {
		const endpoints = buildBranchEndpoints(createEndpointBuilder());
		const branch = Array.from(new TextEncoder().encode("refs/heads/feature"));

		expect(endpoints.checkoutBranch.extraOptions).toEqual({
			command: "branch_checkout",
			actionName: "Checkout Branch",
		});
		expect(endpoints.checkoutBranch.query?.({ projectId: "project-1", branch })).toEqual({
			projectId: "project-1",
			branch,
		});
		expect(endpoints.checkoutBranch.invalidatesTags).toEqual([
			invalidatesList(ReduxTag.HeadMetadata),
			invalidatesList(ReduxTag.Stacks),
			invalidatesList(ReduxTag.StackDetails),
			invalidatesList(ReduxTag.BranchListing),
			invalidatesList(ReduxTag.WorktreeChanges),
		]);
	});

	test("creates and checks out a real local Git branch", () => {
		const endpoints = buildBranchEndpoints(createEndpointBuilder());

		expect(endpoints.checkoutNewBranch.extraOptions).toEqual({
			command: "branch_checkout_new",
			actionName: "Create and Checkout Branch",
		});
		expect(
			endpoints.checkoutNewBranch.query?.({ projectId: "project-1", name: "feature" }),
		).toEqual({ projectId: "project-1", name: "feature" });
		expect(endpoints.checkoutNewBranch.invalidatesTags).toEqual([
			invalidatesList(ReduxTag.HeadMetadata),
			invalidatesList(ReduxTag.Stacks),
			invalidatesList(ReduxTag.StackDetails),
			invalidatesList(ReduxTag.BranchListing),
			invalidatesList(ReduxTag.WorktreeChanges),
		]);
	});

	test("flattens backend stack groups into independent real Git branches", async () => {
		const endpoints = buildBranchEndpoints(createEndpointBuilder());
		const transformResponse = endpoints.listBranches.transformResponse;
		const response: ListedStack[] = [
			{
				status: "unapplied",
				updatedAtMs: 1234,
				branches: [
					listedBranch("feature/topic", "refs/heads/feature/topic", [
						"refs/remotes/team/origin/feature/topic",
					]),
					listedBranch("main", "refs/heads/main"),
				],
			},
		];

		expect(endpoints.listBranches.extraOptions).toEqual({ command: "branch_list" });
		expect(transformResponse).toBeTypeOf("function");
		if (!transformResponse) throw new Error("Branch listing transform is missing");
		const result = await transformResponse(response, undefined, { projectId: "project-1" });
		expect(listingSelectors.selectAll(result)).toEqual([
			expect.objectContaining({ name: "feature/topic", remotes: ["team/origin"] }),
			expect.objectContaining({ name: "main", remotes: [] }),
		]);
	});
});
