import { FileChangeDropData, FolderChangeDropData, HunkDropDataV3 } from "$lib/dragging/draggables";
import { UNCOMMITTED_SERVICE } from "$lib/selection/uncommittedService.svelte";
import { UI_STATE } from "$lib/state/uiState.svelte";
import { inject } from "@gitbutler/core/context";
import type { DropzoneHandler } from "$lib/dragging/handler";

export class StartCommitDzHandler implements DropzoneHandler {
	private readonly uiState = inject(UI_STATE);
	private readonly uncommittedService = inject(UNCOMMITTED_SERVICE);

	constructor(
		private readonly projectId: string,
		private readonly stackId: string | undefined,
		private readonly branchName: string,
	) {}

	print(): string {
		return `StartCommitDzHandler(${this.projectId}, ${this.stackId}, ${this.branchName})`;
	}

	accepts(data: unknown): boolean {
		if (data instanceof FileChangeDropData || data instanceof FolderChangeDropData) {
			// Only accept uncomitted files/folders
			if (data.isCommitted) return false;
			// Only accept unassinged files/folders or those assigned to the same stack
			if (data.stackId !== undefined && data.stackId !== this.stackId) return false;
			return true;
		}
		if (data instanceof HunkDropDataV3) {
			// Only accept uncommitted hunks
			if (!data.uncommitted) return false;
			if (data.selectionId.type !== "worktree") return false;
			// Only accept unassigned hunks or those assigned to the same stack
			if (data.stackId !== undefined && data.stackId !== this.stackId) return false;
			return true;
		}
		return false;
	}

	private startCommitting() {
		const projectState = this.uiState.project(this.projectId);
		projectState.exclusiveAction.set({
			type: "commit",
			stackId: this.stackId,
			branchName: this.branchName,
		});
	}

	private async checkDropData(
		data: FileChangeDropData | FolderChangeDropData | HunkDropDataV3,
	): Promise<true> {
		if (data instanceof FileChangeDropData || data instanceof FolderChangeDropData) {
			const changes = await data.treeChanges();
			const paths = changes.map((c) => c.path);
			if (paths.length === 0) return true;
			this.uncommittedService.checkFiles(data.stackId ?? null, paths);
			return true;
		}

		// Handle hunk data
		this.uncommittedService.checkHunk(data.stackId ?? null, data.change.path, data.hunk);
		return true;
	}

	async ondrop(data: FileChangeDropData | FolderChangeDropData | HunkDropDataV3): Promise<void> {
		this.startCommitting();
		await this.checkDropData(data);
	}
}
