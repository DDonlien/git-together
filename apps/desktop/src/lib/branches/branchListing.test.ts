import {
	combineBranchesAndPrs,
	groupBranches,
	type GitBranchListing,
	type SidebarEntrySubject,
} from "$lib/branches/branchListing";
import { describe, expect, test } from "vitest";

function branch(name: string): GitBranchListing {
	return {
		name,
		remotes: [],
		updatedAt: Date.now(),
		lastCommiter: { name: "Test User", email: "test@example.com", gravatarUrl: null },
		hasLocal: true,
		commitCount: 1,
	};
}

function branchNames(entries: SidebarEntrySubject[]): string[] {
	return entries.flatMap((entry) => (entry.type === "branchListing" ? [entry.subject.name] : []));
}

describe("ordinary Git branch listing", () => {
	test("groups the checked-out branch as current without virtual branch state", () => {
		const entries: SidebarEntrySubject[] = [
			{ type: "branchListing", subject: branch("main"), prs: [] },
			{ type: "branchListing", subject: branch("feature"), prs: [] },
		];

		const grouped = groupBranches(entries, undefined, "main");

		expect(branchNames(grouped.current)).toEqual(["main"]);
		expect(branchNames(grouped.today)).toEqual(["feature"]);
	});

	test("keeps every real branch as an independent listing", () => {
		const entries = combineBranchesAndPrs([], [branch("main"), branch("feature")], "all");

		expect(branchNames(entries)).toEqual(["feature", "main"]);
	});
});
