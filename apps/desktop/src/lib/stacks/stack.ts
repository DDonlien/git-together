import type { BranchIconName } from "$lib/branches/branchIcon";
import type { PushStatus, Segment, Stack as RefInfoStack } from "@gitbutler/but-sdk";

export type Stack = RefInfoStack;

export type GerritPushFlag =
	| { type: "wip" }
	| { type: "ready" }
	| { type: "private" }
	| { type: "hashtag"; subject: string }
	| { type: "topic"; subject: string };

/**
 * Returns the name of the stack.
 *
 * This is the name of the top-most branch in the stack.
 */
export function getStackName(stack: Stack): string {
	const firstSegment = stack.segments.at(0);
	if (!firstSegment?.refName) {
		return "Unnamed segment";
	}
	return firstSegment.refName.displayName;
}

export function getStackBranchNames(stack: Stack): string[] {
	return stack.segments.map((segment) => {
		if (!segment.refName) {
			return "Unnamed segment";
		}
		return segment.refName.displayName;
	});
}

/**
 * Converts push status directly to a CSS color string.
 */
export function getColorFromPushStatus(pushStatus: PushStatus): string {
	switch (pushStatus) {
		case "nothingToPush":
		case "unpushedCommits":
		case "unpushedCommitsRequiringForce":
			return "var(--commit-remote)";
		case "completelyUnpushed":
			return "var(--commit-local)";
		case "integrated":
			return "var(--commit-integrated)";
	}
}

export function pushStatusToIcon(pushStatus: PushStatus): BranchIconName {
	switch (pushStatus) {
		case "nothingToPush":
		case "unpushedCommits":
		case "unpushedCommitsRequiringForce":
			return "branch";
		case "completelyUnpushed":
			return "branch-local";
		case "integrated":
			return "branch";
	}
}

export function stackRequiresForcePush(stack: Stack): boolean {
	return stack.segments.at(0)?.pushStatus === "unpushedCommitsRequiringForce";
}

export function branchRequiresForcePush(branch: Segment): boolean {
	return branch.pushStatus === "unpushedCommitsRequiringForce";
}

export function stackHasConflicts(stack: Stack): boolean {
	return stack.segments.at(0)?.commits.some((commit) => commit.hasConflicts) ?? false;
}

export function branchHasConflicts(branch: Segment): boolean {
	return branch.commits.some((commit) => commit.hasConflicts);
}

export function stackHasUnpushedCommits(stack: Stack): boolean {
	const pushStatus = stack.segments.at(0)?.pushStatus;
	return pushStatus ? requiresPush(pushStatus) : false;
}

export function branchHasUnpushedCommits(branch: Segment): boolean {
	return requiresPush(branch.pushStatus);
}

export function requiresPush(status: PushStatus): boolean {
	return (
		status === "unpushedCommits" ||
		status === "unpushedCommitsRequiringForce" ||
		status === "completelyUnpushed"
	);
}
