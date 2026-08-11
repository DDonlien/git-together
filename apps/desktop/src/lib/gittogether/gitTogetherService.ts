import type { IBackend } from "$lib/backend";
import type {
	ConnectionProfile,
	ConnectionState,
	FileDiff,
	FilePreview,
	GetLatestPreview,
	GitTogetherMessage,
	GitTogetherThread,
	OperationResult,
	RepositoryOverview,
	SessionAssessment,
	SessionSnapshotResult,
	SessionView,
} from "$lib/gittogether/types";

export class GitTogetherService {
	constructor(private backend: IBackend) {}

	async repositoryOverview(projectId: string): Promise<RepositoryOverview> {
		return await this.backend.invoke("gittogether_repository_overview", { projectId });
	}

	async fileDiff(projectId: string, path: string, worktreePath?: string): Promise<FileDiff> {
		return await this.backend.invoke("gittogether_file_diff", { projectId, worktreePath, path });
	}

	async filePreview(projectId: string, path: string, worktreePath?: string): Promise<FilePreview> {
		return await this.backend.invoke("gittogether_file_preview", { projectId, worktreePath, path });
	}

	async fetch(projectId: string, profileId?: string): Promise<OperationResult> {
		return await this.backend.invoke("gittogether_fetch", { projectId, profileId });
	}

	async getLatestPreview(projectId: string, worktreePath?: string): Promise<GetLatestPreview> {
		return await this.backend.invoke("gittogether_get_latest_preview", {
			projectId,
			worktreePath,
		});
	}

	async getLatestApply(
		projectId: string,
		expectedHead: string,
		worktreePath?: string,
	): Promise<OperationResult> {
		return await this.backend.invoke("gittogether_get_latest_apply", {
			projectId,
			worktreePath,
			expectedHead,
		});
	}

	async commitAll(
		projectId: string,
		message: string,
		worktreePath?: string,
	): Promise<OperationResult> {
		return await this.backend.invoke("gittogether_commit_all", {
			projectId,
			worktreePath,
			message,
		});
	}

	async push(
		projectId: string,
		worktreePath?: string,
		profileId?: string,
	): Promise<OperationResult> {
		return await this.backend.invoke("gittogether_push", {
			projectId,
			worktreePath,
			profileId,
		});
	}

	async connections(): Promise<ConnectionState> {
		return await this.backend.invoke("gittogether_connections");
	}

	async saveConnection(input: {
		id?: string;
		label: string;
		baseUrl: string;
		username: string;
		secretValue?: string;
	}): Promise<ConnectionProfile> {
		return await this.backend.invoke("gittogether_connection_save", input);
	}

	async deleteConnection(id: string): Promise<ConnectionState> {
		return await this.backend.invoke("gittogether_connection_delete", { id });
	}

	async bindConnection(projectId: string, profileId?: string): Promise<ConnectionState> {
		return await this.backend.invoke("gittogether_connection_bind", { projectId, profileId });
	}

	async clone(profileId: string, url: string, destination: string): Promise<OperationResult> {
		return await this.backend.invoke("gittogether_clone", { profileId, url, destination });
	}

	async createSession(
		projectId: string,
		title: string,
		operationType: string,
	): Promise<SessionView> {
		return await this.backend.invoke("gittogether_session_create", {
			projectId,
			title,
			operationType,
		});
	}

	async snapshotSession(projectId: string, sessionId: string): Promise<SessionSnapshotResult> {
		return await this.backend.invoke("gittogether_session_snapshot", { projectId, sessionId });
	}

	async assessSession(projectId: string, sessionId: string): Promise<SessionAssessment> {
		return await this.backend.invoke("gittogether_session_assessment", { projectId, sessionId });
	}

	async createThread(
		projectId: string,
		title: string,
		sessionId?: string,
	): Promise<GitTogetherThread> {
		return await this.backend.invoke("gittogether_thread_create", { projectId, title, sessionId });
	}

	async messages(projectId: string, threadId: string): Promise<GitTogetherMessage[]> {
		return await this.backend.invoke("gittogether_messages", { projectId, threadId });
	}

	async addMessage(
		projectId: string,
		threadId: string,
		content: string,
	): Promise<GitTogetherMessage[]> {
		return await this.backend.invoke("gittogether_message_add", { projectId, threadId, content });
	}
}
