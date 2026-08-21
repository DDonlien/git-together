import { msSinceDaysAgo } from "$lib/utils/time";
import { isDefined } from "@gitbutler/ui/utils/typeguards";
import type { ForgeUser, PullRequest } from "$lib/forge/interface/types";

export type GitBranchListing = {
	name: string;
	remotes: string[];
	updatedAt: number;
	lastCommiter: {
		name: string | null;
		email: string | null;
		gravatarUrl: string | null;
	};
	hasLocal: boolean;
	commitCount: number | null;
};

export type GroupedSidebarEntries = Record<
	"current" | "authored" | "review" | "today" | "yesterday" | "lastWeek" | "older",
	SidebarEntrySubject[]
>;

type PullRequestEntrySubject = {
	type: "pullRequest";
	subject: PullRequest;
	branchListing?: GitBranchListing;
};

type BranchListingEntrySubject = {
	type: "branchListing";
	subject: GitBranchListing;
	prs: PullRequest[];
};

export type SidebarEntrySubject = PullRequestEntrySubject | BranchListingEntrySubject;

export const BRANCH_FILTER_OPTIONS = ["all", "pullRequest", "local"] as const;
export type BranchFilterOption = (typeof BRANCH_FILTER_OPTIONS)[number];

export function isBranchFilterOption(something: unknown): something is BranchFilterOption {
	return (
		typeof something === "string" && BRANCH_FILTER_OPTIONS.includes(something as BranchFilterOption)
	);
}

function getEntryUpdatedDate(entry: SidebarEntrySubject) {
	return new Date(
		entry.type === "branchListing" ? entry.subject.updatedAt : entry.subject.modifiedAt,
	);
}

function getEntryName(entry: SidebarEntrySubject) {
	return entry.type === "branchListing" ? entry.subject.name : entry.subject.title;
}

function isCurrentBranch(entry: SidebarEntrySubject, currentBranchName: string | undefined) {
	if (entry.type !== "branchListing") return false;
	return currentBranchName !== undefined && entry.subject.name === currentBranchName;
}

function isReviewerOfEntry(login: string | undefined, entry: SidebarEntrySubject): boolean {
	if (login === undefined) return false;
	if (entry.type === "pullRequest") {
		return entry.subject.reviewers.some((r) => r.login === login);
	}
	return entry.prs.some((pr) => pr.reviewers.some((r) => r.login === login));
}

function isAuthorOfEntry(login: string | undefined, entry: SidebarEntrySubject): boolean {
	if (login === undefined) return false;
	if (entry.type === "pullRequest") {
		return entry.subject.author?.login === login;
	}
	return entry.prs.some((pr) => pr.author?.login === login);
}

export function combineBranchesAndPrs(
	pullRequests: PullRequest[],
	branchList: GitBranchListing[],
	selectedOption: BranchFilterOption,
) {
	const prMap = Object.fromEntries(pullRequests.map((pr) => [pr.sourceBranch, pr]));

	const listingSubjects: BranchListingEntrySubject[] = branchList.map((subject) => ({
		type: "branchListing",
		subject: subject,
		prs:
			getBranchNames(subject)
				.map((name) => prMap[name])
				.filter(isDefined) || [],
	}));

	const attachedPrs = new Set(listingSubjects.flatMap((item) => item.prs.map((pr) => pr.number)));
	const prs: PullRequestEntrySubject[] = pullRequests
		.filter((pr) => !attachedPrs.has(pr.number))
		.map((pullRequests) => ({ type: "pullRequest", subject: pullRequests }));

	const result = [...prs, ...listingSubjects];

	result.sort((a, b) => {
		const timeDifference = getEntryUpdatedDate(b).getTime() - getEntryUpdatedDate(a).getTime();
		if (timeDifference !== 0) {
			return timeDifference;
		}

		return getEntryName(a).localeCompare(getEntryName(b));
	});

	// Filter by the currently selected tab in the frontend
	const filtered = filterSidebarEntries(pullRequests, selectedOption, result);

	return filtered;
}

function filterSidebarEntries(
	pullRequests: PullRequest[],
	selectedOption: string,
	sidebarEntries: SidebarEntrySubject[],
): SidebarEntrySubject[] {
	switch (selectedOption) {
		case "pullRequest": {
			return sidebarEntries.filter(
				(sidebarEntry) =>
					sidebarEntry.type === "pullRequest" ||
					pullRequests.some((pullRequest) =>
						containsPullRequestBranch(sidebarEntry.subject, pullRequest.sourceBranch),
					),
			);
		}
		case "local": {
			return sidebarEntries.filter(
				(sidebarEntry) => sidebarEntry.type === "branchListing" && sidebarEntry.subject.hasLocal,
			);
		}
		default: {
			return sidebarEntries;
		}
	}
}

function containsPullRequestBranch(branchListing: GitBranchListing, sourceBranch: string): boolean {
	return sourceBranch === branchListing.name;
}

export function groupBranches(
	branches: SidebarEntrySubject[],
	user: ForgeUser | undefined,
	currentBranchName?: string,
) {
	const grouped: GroupedSidebarEntries = {
		current: [],
		authored: [],
		review: [],
		today: [],
		yesterday: [],
		lastWeek: [],
		older: [],
	};

	const now = Date.now();

	for (let i = 0; i < branches.length; i++) {
		const b = branches[i];
		if (!b) continue;

		if (!getEntryUpdatedDate(b)) {
			grouped.older.push(b);
			continue;
		}

		const msSinceLastCommit = now - getEntryUpdatedDate(b).getTime();

		if (isCurrentBranch(b, currentBranchName)) {
			grouped.current.push(b);
			continue;
		}

		if (isAuthorOfEntry(user?.login, b)) {
			grouped.authored.push(b);
			continue;
		}

		if (isReviewerOfEntry(user?.login, b)) {
			grouped.review.push(b);
			continue;
		}

		if (msSinceLastCommit < msSinceDaysAgo(1)) {
			grouped.today.push(b);
			continue;
		}

		if (msSinceLastCommit < msSinceDaysAgo(2)) {
			grouped.yesterday.push(b);
			continue;
		}

		if (msSinceLastCommit < msSinceDaysAgo(7)) {
			grouped.lastWeek.push(b);
			continue;
		}

		grouped.older.push(b);
	}

	return grouped;
}

/** The real Git branch represented by this listing. */
function getBranchNames(branchListing: GitBranchListing) {
	return [branchListing.name];
}
