import { listingSelectors } from "$lib/branches/branchEndpoints";
import { invalidatesList, ReduxTag } from "$lib/state/tags";
import { InjectionToken } from "@gitbutler/core/context";
import type { BackendApi } from "$lib/state/backendApi";

export const BRANCH_SERVICE = new InjectionToken<BranchService>("BranchService");

export class BranchService {
	constructor(private backendApi: BackendApi) {}

	list(projectId: string) {
		return this.backendApi.endpoints.listBranches.useQuery(
			{ projectId },
			{
				transform: (result) => listingSelectors.selectAll(result),
			},
		);
	}

	listingByName(projectId: string, branchName: string) {
		return this.backendApi.endpoints.listBranches.useQuery(
			{ projectId },
			{
				transform: (result) => listingSelectors.selectById(result, branchName),
			},
		);
	}

	get checkout() {
		return this.backendApi.endpoints.checkoutBranch.useMutation();
	}

	get checkoutNew() {
		return this.backendApi.endpoints.checkoutNewBranch.useMutation();
	}

	async refresh(): Promise<void> {
		// TODO: This doesn't do anything... should it??
		this.backendApi.util.invalidateTags([invalidatesList(ReduxTag.BranchListing)]);
	}
}
