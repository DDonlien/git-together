export type ConnectionProfile = {
	id: string;
	label: string;
	baseUrl: string;
	username: string;
	hasSecret: boolean;
};

export type ConnectionState = {
	profiles: ConnectionProfile[];
	bindings: Record<string, string>;
};

export type RemoteSummary = {
	name: string;
	url?: string;
};

export type ChangedFile = {
	path: string;
	status: string;
	staged: boolean;
	highRisk: boolean;
};

export type BranchSummary = {
	name: string;
	refName: string;
	head: string;
	baseCommit: string;
	upstream?: string;
	ahead: number;
	behind: number;
	worktreeName?: string;
	worktreePath?: string;
	isCheckedOut: boolean;
	isPrimary: boolean;
	dirtyCount: number;
	conflictCount: number;
	files: ChangedFile[];
	owner: string;
	sessionId?: string;
	presence: string;
};

export type GraphCommit = {
	id: string;
	shortId: string;
	summary: string;
	author: string;
	time: number;
	refs: string[];
};

export type SessionView = {
	id: string;
	title: string;
	status: string;
	branchRef: string;
	worktreePath: string;
	baseCommit: string;
	targetRef?: string;
	operationType: string;
	touchedFiles: string[];
	touchedRoots: string[];
	dirtyCount: number;
	conflictCount: number;
	snapshotCommit?: string;
	createdAt: number;
	updatedAt: number;
};

export type GitTogetherThread = {
	id: string;
	title: string;
	status: string;
	sessionId?: string;
	branchRef?: string;
	createdAt: number;
	updatedAt: number;
};

export type GitTogetherMessage = {
	id: string;
	threadId: string;
	role: string;
	content: string;
	createdAt: number;
};

export type OperationView = {
	id: string;
	kind: string;
	state: string;
	detail: string;
	headBefore?: string;
	headAfter?: string;
	createdAt: number;
	updatedAt: number;
};

export type RepositoryOverview = {
	projectId: string;
	path: string;
	currentBranch?: string;
	head?: string;
	dirtyCount: number;
	conflictCount: number;
	ahead: number;
	behind: number;
	remotes: RemoteSummary[];
	branches: BranchSummary[];
	files: ChangedFile[];
	commits: GraphCommit[];
	sessions: SessionView[];
	threads: GitTogetherThread[];
	operations: OperationView[];
	connection?: ConnectionProfile;
	presence: string;
};

export type OperationResult = {
	kind: string;
	state: string;
	detail: string;
	headBefore?: string;
	headAfter?: string;
	remote?: string;
};

export type GetLatestPreview = {
	branch?: string;
	upstream?: string;
	expectedHead?: string;
	upstreamHead?: string;
	ahead: number;
	behind: number;
	dirtyFiles: string[];
	canApply: boolean;
	action: "fastForward" | "upToDate" | "blocked";
	risks: string[];
};

export type FileDiff = {
	path: string;
	patch: string;
	binary: boolean;
	truncated: boolean;
};

export type FilePreview = {
	path: string;
	kind: "text" | "image" | "binary" | "missing";
	content?: string;
	absolutePath?: string;
	size?: number;
};

export type SessionAssessment = {
	sessionId: string;
	riskLevel: "blocked" | "reviewRequired";
	autoMergeAllowed: false;
	presence: "unavailable";
	reasons: string[];
	overlappingFiles: string[];
	highRiskFiles: string[];
	targetHead?: string;
};

export type SessionSnapshotResult = {
	session: SessionView;
	operation: OperationResult;
	assessment: SessionAssessment;
};

export type LatestReview = {
	projectId: string;
	projectTitle: string;
	worktreePath?: string;
	preview?: GetLatestPreview;
	error?: string;
};

export type ProjectOperationState = {
	state: "running" | "succeeded" | "failed";
	kind: string;
	detail: string;
};

export type RepositoryAction = "fetch" | "commit" | "push" | "latest";
