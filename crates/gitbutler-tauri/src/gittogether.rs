//! GitTogether's repository-first local workflow commands.
//!
//! The module deliberately keeps ordinary Git semantics at the boundary. Read-only state is
//! projected for the dashboard, while checkout, index, worktree, and transport operations use
//! libgit2 as the existing compatibility adapter. Secrets never cross back to the frontend.

use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context as _, Result, bail};
use but_api::json;
use but_ctx::{Context as ProjectContext, ProjectHandleOrLegacyProjectId};
use but_db::{GitTogetherMessage, GitTogetherOperation, GitTogetherSession, GitTogetherThread};
use but_secret::{Sensitive, secret};
use git2::{
    BranchType, Cred, CredentialType, DiffFormat, DiffOptions, FetchOptions, IndexAddOption, Oid,
    PushOptions, RemoteCallbacks, Repository, Status, StatusOptions,
    build::{CheckoutBuilder, RepoBuilder},
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use url::Url;
use uuid::Uuid;

const CONNECTION_STORE_FILE: &str = "gittogether-connections.json";
const PREVIEW_LIMIT_BYTES: u64 = 512 * 1024;
const DIFF_LIMIT_BYTES: usize = 256 * 1024;

/// Non-secret metadata for an HTTPS Git server connection.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    /// Stable profile identifier.
    pub id: String,
    /// User-facing profile name.
    pub label: String,
    /// HTTPS server root used to scope credential disclosure.
    pub base_url: String,
    /// Username sent to the Git server.
    pub username: String,
    /// Whether a password or PAT was saved in the operating-system keychain.
    pub has_secret: bool,
}

/// Locally persisted profile metadata. The opaque handle never crosses the Tauri boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConnectionProfile {
    id: String,
    label: String,
    base_url: String,
    username: String,
    has_secret: bool,
    #[serde(default)]
    pub secret_handle: String,
}

impl From<&StoredConnectionProfile> for ConnectionProfile {
    fn from(value: &StoredConnectionProfile) -> Self {
        Self {
            id: value.id.clone(),
            label: value.label.clone(),
            base_url: value.base_url.clone(),
            username: value.username.clone(),
            has_secret: value.has_secret,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionStore {
    profiles: Vec<StoredConnectionProfile>,
    bindings: BTreeMap<String, String>,
}

/// All configured profiles and repository bindings.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionState {
    /// Saved non-secret connection profiles.
    pub profiles: Vec<ConnectionProfile>,
    /// Project ID to profile ID bindings.
    pub bindings: BTreeMap<String, String>,
}

struct ConnectionCredential {
    profile: StoredConnectionProfile,
    secret: Sensitive<String>,
}

/// A sanitized Git remote shown in the dashboard.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSummary {
    /// Remote name, such as `origin`.
    pub name: String,
    /// Remote URL with any inline credentials removed.
    pub url: Option<String>,
}

/// A changed path relative to a checkout root.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    /// Repository-relative path.
    pub path: String,
    /// Human-readable Git status.
    pub status: String,
    /// Whether the index contains a staged form of this change.
    pub staged: bool,
    /// Whether the path uses a high-risk binary asset extension.
    pub high_risk: bool,
}

/// A real local branch, optionally checked out into a worktree.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchSummary {
    /// Short local branch name.
    pub name: String,
    /// Full local ref name.
    pub ref_name: String,
    /// Tip commit ID.
    pub head: String,
    /// Merge base with the configured upstream, or the tip when no upstream exists.
    pub base_commit: String,
    /// Configured upstream tracking ref.
    pub upstream: Option<String>,
    /// Commits only on the local branch.
    pub ahead: usize,
    /// Commits only on its upstream.
    pub behind: usize,
    /// Stable linked-worktree name, or `main` for the primary checkout.
    pub worktree_name: Option<String>,
    /// Checkout path when this branch is checked out.
    pub worktree_path: Option<String>,
    /// Whether the branch is checked out anywhere.
    pub is_checked_out: bool,
    /// Whether this is the project's primary checkout branch.
    pub is_primary: bool,
    /// Number of changed paths in the checkout.
    pub dirty_count: usize,
    /// Number of conflicted paths in the checkout.
    pub conflict_count: usize,
    /// Changed paths in this branch's real checkout, when it has one.
    pub files: Vec<ChangedFile>,
    /// Local operating-system owner label.
    pub owner: String,
    /// Active Work Session attached to the branch.
    pub session_id: Option<String>,
    /// Presence is intentionally unavailable until the 0.3.x GPS line.
    pub presence: String,
}

/// A commit row for the bottom-up graph projection.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommit {
    /// Full commit ID.
    pub id: String,
    /// Short commit ID.
    pub short_id: String,
    /// First-line commit summary.
    pub summary: String,
    /// Commit author name from local Git data.
    pub author: String,
    /// Commit time in Unix seconds.
    pub time: i64,
    /// Branch names pointing at this commit.
    pub refs: Vec<String>,
}

/// A Work Session with JSON scope fields decoded for the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    /// Stable session identifier.
    pub id: String,
    /// User-facing title.
    pub title: String,
    /// `active` or `snapshot`.
    pub status: String,
    /// Full branch ref created for the session.
    pub branch_ref: String,
    /// Real linked-worktree path.
    pub worktree_path: String,
    /// Commit on which the session started.
    pub base_commit: String,
    /// Branch ref to which later integration is compared.
    pub target_ref: Option<String>,
    /// User-declared operation category.
    pub operation_type: String,
    /// Paths touched by the session.
    pub touched_files: Vec<String>,
    /// Top-level roots touched by the session.
    pub touched_roots: Vec<String>,
    /// Current changed-path count in the session worktree.
    pub dirty_count: usize,
    /// Current conflicted-path count in the session worktree.
    pub conflict_count: usize,
    /// Snapshot commit, when one was created.
    pub snapshot_commit: Option<String>,
    /// Creation time in Unix seconds.
    pub created_at: i64,
    /// Last update time in Unix seconds.
    pub updated_at: i64,
}

impl From<GitTogetherSession> for SessionView {
    fn from(value: GitTogetherSession) -> Self {
        SessionView {
            id: value.id,
            title: value.title,
            status: value.status,
            branch_ref: value.branch_ref,
            worktree_path: value.worktree_path,
            base_commit: value.base_commit,
            target_ref: value.target_ref,
            operation_type: value.operation_type,
            touched_files: serde_json::from_str(&value.touched_files).unwrap_or_default(),
            touched_roots: serde_json::from_str(&value.touched_roots).unwrap_or_default(),
            dirty_count: value.dirty_count.max(0) as usize,
            conflict_count: value.conflict_count.max(0) as usize,
            snapshot_commit: value.snapshot_commit,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

/// A recent operation persisted independently for each repository.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationView {
    /// Stable operation ID.
    pub id: String,
    /// Fetch, commit, push, get-latest, or snapshot.
    pub kind: String,
    /// `succeeded` or `failed`.
    pub state: String,
    /// Non-secret outcome detail.
    pub detail: String,
    /// HEAD observed before the operation.
    pub head_before: Option<String>,
    /// HEAD observed after the operation.
    pub head_after: Option<String>,
    /// Creation time in Unix seconds.
    pub created_at: i64,
    /// Last update time in Unix seconds.
    pub updated_at: i64,
}

impl From<GitTogetherOperation> for OperationView {
    fn from(value: GitTogetherOperation) -> Self {
        OperationView {
            id: value.id,
            kind: value.kind,
            state: value.state,
            detail: value.detail,
            head_before: value.head_before,
            head_after: value.head_after,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

/// Full repository projection used by the four-region workspace.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryOverview {
    /// Project identifier.
    pub project_id: String,
    /// Primary checkout path.
    pub path: String,
    /// Current branch in the primary checkout.
    pub current_branch: Option<String>,
    /// Current primary HEAD.
    pub head: Option<String>,
    /// Number of changed paths in the primary checkout.
    pub dirty_count: usize,
    /// Number of conflicted paths in the primary checkout.
    pub conflict_count: usize,
    /// Current-branch ahead count.
    pub ahead: usize,
    /// Current-branch behind count.
    pub behind: usize,
    /// Repository remotes with sanitized URLs.
    pub remotes: Vec<RemoteSummary>,
    /// Real local branches and worktree associations.
    pub branches: Vec<BranchSummary>,
    /// Changed files in the primary checkout.
    pub files: Vec<ChangedFile>,
    /// Recent graph commits, newest first. The UI renders them bottom-up.
    pub commits: Vec<GraphCommit>,
    /// Protected Work Sessions.
    pub sessions: Vec<SessionView>,
    /// Local task/conversation threads.
    pub threads: Vec<GitTogetherThread>,
    /// Recent independent operation outcomes.
    pub operations: Vec<OperationView>,
    /// Bound self-hosted connection, if any.
    pub connection: Option<ConnectionProfile>,
    /// Explicit local Presence boundary.
    pub presence: String,
}

/// Result of one repository mutation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    /// Operation category.
    pub kind: String,
    /// Stable success state.
    pub state: String,
    /// Non-secret result detail.
    pub detail: String,
    /// HEAD before the operation.
    pub head_before: Option<String>,
    /// HEAD after the operation.
    pub head_after: Option<String>,
    /// Remote name used, when relevant.
    pub remote: Option<String>,
}

/// Read-only Get Latest safety plan.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetLatestPreview {
    /// Checkout branch.
    pub branch: Option<String>,
    /// Tracking ref used as the central source.
    pub upstream: Option<String>,
    /// Current HEAD expected by the apply command.
    pub expected_head: Option<String>,
    /// Tracking branch HEAD.
    pub upstream_head: Option<String>,
    /// Commits only on the local branch.
    pub ahead: usize,
    /// Commits only on the upstream branch.
    pub behind: usize,
    /// Changed paths that make an update unsafe.
    pub dirty_files: Vec<String>,
    /// Whether the only required mutation is a clean fast-forward.
    pub can_apply: bool,
    /// `fastForward`, `upToDate`, or `blocked`.
    pub action: String,
    /// Human-readable safety reasons.
    pub risks: Vec<String>,
}

/// Text patch for the selected changed file.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    /// Repository-relative path.
    pub path: String,
    /// Unified patch text, capped for UI safety.
    pub patch: String,
    /// Whether libgit2 classified the delta as binary.
    pub binary: bool,
    /// Whether the patch was truncated.
    pub truncated: bool,
}

/// Preview data for a selected path.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    /// Repository-relative path.
    pub path: String,
    /// `text`, `image`, `binary`, or `missing`.
    pub kind: String,
    /// Text content when `kind` is `text`.
    pub content: Option<String>,
    /// Absolute local path when `kind` is `image`.
    pub absolute_path: Option<String>,
    /// File byte size when available.
    pub size: Option<u64>,
}

/// Assessment returned after a Protected Work Session snapshot.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAssessment {
    /// Session identifier.
    pub session_id: String,
    /// `blocked` or `reviewRequired` in the local-only 0.2.x line.
    pub risk_level: String,
    /// Automatic merge remains false while Presence is unavailable.
    pub auto_merge_allowed: bool,
    /// Explicit Presence state.
    pub presence: String,
    /// Explanations used for the decision.
    pub reasons: Vec<String>,
    /// Paths also changed on the target since the session base.
    pub overlapping_files: Vec<String>,
    /// High-risk binary assets touched by the session.
    pub high_risk_files: Vec<String>,
    /// Current target commit.
    pub target_head: Option<String>,
}

/// Snapshot result with its merge-safety assessment.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshotResult {
    /// Updated session.
    pub session: SessionView,
    /// Snapshot commit operation.
    pub operation: OperationResult,
    /// Honest local-only integration assessment.
    pub assessment: SessionAssessment,
}

/// Return the real state of one registered repository.
#[tauri::command(async)]
pub fn gittogether_repository_overview(
    app: AppHandle,
    project_id: ProjectHandleOrLegacyProjectId,
) -> Result<RepositoryOverview, json::Error> {
    repository_overview(&app, project_id).map_err(Into::into)
}

/// Return a unified diff for one changed file.
#[tauri::command(async)]
pub fn gittogether_file_diff(
    project_id: ProjectHandleOrLegacyProjectId,
    worktree_path: Option<String>,
    path: String,
) -> Result<FileDiff, json::Error> {
    (|| {
        let ctx = project_context(project_id)?;
        let repo = checkout_repository(&ctx, worktree_path.as_deref())?;
        file_diff(&repo, &path)
    })()
    .map_err(Into::into)
}

/// Return a safe local preview for one changed file.
#[tauri::command(async)]
pub fn gittogether_file_preview(
    project_id: ProjectHandleOrLegacyProjectId,
    worktree_path: Option<String>,
    path: String,
) -> Result<FilePreview, json::Error> {
    (|| {
        let ctx = project_context(project_id)?;
        let repo = checkout_repository(&ctx, worktree_path.as_deref())?;
        file_preview(&repo, &path)
    })()
    .map_err(Into::into)
}

/// Fetch remote refs without applying them to a checkout.
#[tauri::command(async)]
pub fn gittogether_fetch(
    app: AppHandle,
    project_id: ProjectHandleOrLegacyProjectId,
    profile_id: Option<String>,
) -> Result<OperationResult, json::Error> {
    project_network_operation(
        &app,
        project_id,
        profile_id.as_deref(),
        "fetch",
        |repo, credential| {
            let head_before = head_id(repo);
            let (remote, _) = fetch_repository(repo, credential)?;
            Ok(OperationResult {
                kind: "fetch".into(),
                state: "succeeded".into(),
                detail: format!("Fetched remote refs from {remote}; no checkout was changed."),
                head_before: head_before.clone(),
                head_after: head_before,
                remote: Some(remote),
            })
        },
    )
    .map_err(Into::into)
}

/// Preview the checkout mutation that Get Latest would perform.
#[tauri::command(async)]
pub fn gittogether_get_latest_preview(
    project_id: ProjectHandleOrLegacyProjectId,
    worktree_path: Option<String>,
) -> Result<GetLatestPreview, json::Error> {
    (|| {
        let ctx = project_context(project_id)?;
        let repo = checkout_repository(&ctx, worktree_path.as_deref())?;
        get_latest_preview(&repo)
    })()
    .map_err(Into::into)
}

/// Apply a previously previewed clean fast-forward.
#[tauri::command(async)]
pub fn gittogether_get_latest_apply(
    project_id: ProjectHandleOrLegacyProjectId,
    worktree_path: Option<String>,
    expected_head: String,
) -> Result<OperationResult, json::Error> {
    let result: Result<OperationResult> = (|| {
        let ctx = project_context(project_id)?;
        let repo = checkout_repository(&ctx, worktree_path.as_deref())?;
        let operation = apply_get_latest(&repo, &expected_head)?;
        record_operation(&ctx, &operation)?;
        Ok(operation)
    })();
    result.map_err(Into::into)
}

/// Stage and commit every current change in one checkout.
#[tauri::command(async)]
pub fn gittogether_commit_all(
    project_id: ProjectHandleOrLegacyProjectId,
    worktree_path: Option<String>,
    message: String,
) -> Result<OperationResult, json::Error> {
    let result: Result<OperationResult> = (|| {
        let ctx = project_context(project_id)?;
        let repo = checkout_repository(&ctx, worktree_path.as_deref())?;
        let operation = commit_all(&repo, &message)?.0;
        record_operation(&ctx, &operation)?;
        Ok(operation)
    })();
    result.map_err(Into::into)
}

/// Push the current checkout branch and report its result independently.
#[tauri::command(async)]
pub fn gittogether_push(
    app: AppHandle,
    project_id: ProjectHandleOrLegacyProjectId,
    worktree_path: Option<String>,
    profile_id: Option<String>,
) -> Result<OperationResult, json::Error> {
    let project_key = project_id.to_string();
    let result: Result<OperationResult> = (|| {
        let ctx = project_context(project_id)?;
        let repo = checkout_repository(&ctx, worktree_path.as_deref())?;
        let credential = credential_for_project(&app, &project_key, profile_id.as_deref())?;
        let operation = push_repository(&repo, credential.as_ref())?;
        record_operation(&ctx, &operation)?;
        Ok(operation)
    })();
    result.map_err(Into::into)
}

/// List self-hosted HTTPS connection profiles and repository bindings.
#[tauri::command(async)]
pub fn gittogether_connections(app: AppHandle) -> Result<ConnectionState, json::Error> {
    read_connection_store(&app)
        .map(|store| ConnectionState {
            profiles: store.profiles.iter().map(ConnectionProfile::from).collect(),
            bindings: store.bindings,
        })
        .map_err(Into::into)
}

/// Create or update a connection profile and place its secret in the system keychain.
#[tauri::command(async)]
pub fn gittogether_connection_save(
    app: AppHandle,
    id: Option<String>,
    label: String,
    base_url: String,
    username: String,
    secret_value: Option<String>,
) -> Result<ConnectionProfile, json::Error> {
    save_connection_profile(&app, id, label, base_url, username, secret_value).map_err(Into::into)
}

/// Delete a connection profile and revoke its keychain secret.
#[tauri::command(async)]
pub fn gittogether_connection_delete(
    app: AppHandle,
    id: String,
) -> Result<ConnectionState, json::Error> {
    delete_connection_profile(&app, &id)
        .map(|store| ConnectionState {
            profiles: store.profiles.iter().map(ConnectionProfile::from).collect(),
            bindings: store.bindings,
        })
        .map_err(Into::into)
}

/// Bind or unbind a connection profile for one repository.
#[tauri::command(async)]
pub fn gittogether_connection_bind(
    app: AppHandle,
    project_id: String,
    profile_id: Option<String>,
) -> Result<ConnectionState, json::Error> {
    bind_connection_profile(&app, project_id, profile_id)
        .map(|store| ConnectionState {
            profiles: store.profiles.iter().map(ConnectionProfile::from).collect(),
            bindings: store.bindings,
        })
        .map_err(Into::into)
}

/// Clone an HTTPS repository using a selected keychain-backed connection.
#[tauri::command(async)]
pub fn gittogether_clone(
    app: AppHandle,
    profile_id: String,
    url: String,
    destination: String,
) -> Result<OperationResult, json::Error> {
    clone_with_connection(&app, &profile_id, &url, Path::new(&destination)).map_err(Into::into)
}

/// Create a real branch and linked worktree for a Protected Work Session.
#[tauri::command(async)]
pub fn gittogether_session_create(
    project_id: ProjectHandleOrLegacyProjectId,
    title: String,
    operation_type: String,
) -> Result<SessionView, json::Error> {
    create_session(project_id, &title, &operation_type).map_err(Into::into)
}

/// Commit a Work Session snapshot and compute its local merge-safety assessment.
#[tauri::command(async)]
pub fn gittogether_session_snapshot(
    project_id: ProjectHandleOrLegacyProjectId,
    session_id: String,
) -> Result<SessionSnapshotResult, json::Error> {
    snapshot_session(project_id, &session_id).map_err(Into::into)
}

/// Recompute a Work Session assessment against its current target.
#[tauri::command(async)]
pub fn gittogether_session_assessment(
    project_id: ProjectHandleOrLegacyProjectId,
    session_id: String,
) -> Result<SessionAssessment, json::Error> {
    let result: Result<SessionAssessment> = (|| {
        let ctx = project_context(project_id)?;
        assess_session(&ctx, &session_id)
    })();
    result.map_err(Into::into)
}

/// Create a project-local task/conversation thread.
#[tauri::command(async)]
pub fn gittogether_thread_create(
    project_id: ProjectHandleOrLegacyProjectId,
    title: String,
    session_id: Option<String>,
) -> Result<GitTogetherThread, json::Error> {
    create_thread(project_id, &title, session_id.as_deref()).map_err(Into::into)
}

/// Add one local user message to a project thread.
#[tauri::command(async)]
pub fn gittogether_message_add(
    project_id: ProjectHandleOrLegacyProjectId,
    thread_id: String,
    content: String,
) -> Result<Vec<GitTogetherMessage>, json::Error> {
    add_message(project_id, &thread_id, &content).map_err(Into::into)
}

/// List the locally persisted messages for one project thread.
#[tauri::command(async)]
pub fn gittogether_messages(
    project_id: ProjectHandleOrLegacyProjectId,
    thread_id: String,
) -> Result<Vec<GitTogetherMessage>, json::Error> {
    let result: Result<Vec<GitTogetherMessage>> = (|| {
        let ctx = project_context(project_id)?;
        Ok(ctx
            .db
            .get_cache()?
            .gittogether()
            .list_messages(&thread_id)?)
    })();
    result.map_err(Into::into)
}

fn repository_overview(
    app: &AppHandle,
    project_id: ProjectHandleOrLegacyProjectId,
) -> Result<RepositoryOverview> {
    let project_key = project_id.to_string();
    let ctx = project_context(project_id)?;
    let repo = main_repository(&ctx)?;
    let path = repo
        .workdir()
        .context("A working repository is required")?
        .to_path_buf();
    let files = changed_files(&repo)?;
    let conflict_count = files
        .iter()
        .filter(|file| file.status == "conflicted")
        .count();
    refresh_active_session_scopes(&ctx)?;
    let sessions = ctx
        .db
        .get_cache()?
        .gittogether()
        .list_sessions()?
        .into_iter()
        .map(SessionView::from)
        .collect::<Vec<_>>();
    let session_by_branch = sessions
        .iter()
        .filter(|session| session.status == "active" || session.status == "snapshot")
        .map(|session| (session.branch_ref.clone(), session.id.clone()))
        .collect::<BTreeMap<_, _>>();
    let threads = ctx.db.get_cache()?.gittogether().list_threads()?;
    let operations = ctx
        .db
        .get_cache()?
        .gittogether()
        .list_operations(30)?
        .into_iter()
        .map(OperationView::from)
        .collect();
    let branches = branch_summaries(&repo, &session_by_branch)?;
    let current_branch = current_branch_name(&repo);
    let current = current_branch
        .as_ref()
        .and_then(|name| branches.iter().find(|branch| &branch.name == name));
    let remotes = remote_summaries(&repo)?;
    let store = read_connection_store(app)?;
    let connection = store
        .bindings
        .get(&project_key)
        .and_then(|id| store.profiles.iter().find(|profile| &profile.id == id))
        .map(ConnectionProfile::from);

    Ok(RepositoryOverview {
        project_id: project_key,
        path: path.to_string_lossy().into_owned(),
        current_branch,
        head: head_id(&repo),
        dirty_count: files.len(),
        conflict_count,
        ahead: current.map_or(0, |branch| branch.ahead),
        behind: current.map_or(0, |branch| branch.behind),
        remotes,
        branches,
        files,
        commits: graph_commits(&repo, 40)?,
        sessions,
        threads,
        operations,
        connection,
        presence: "unavailable (Git Presence Server begins in 0.3.x)".into(),
    })
}

fn project_network_operation(
    app: &AppHandle,
    project_id: ProjectHandleOrLegacyProjectId,
    profile_id: Option<&str>,
    kind: &str,
    operation: impl FnOnce(&Repository, Option<&ConnectionCredential>) -> Result<OperationResult>,
) -> Result<OperationResult> {
    let project_key = project_id.to_string();
    let ctx = project_context(project_id)?;
    let repo = main_repository(&ctx)?;
    let credential = credential_for_project(app, &project_key, profile_id)?;
    match operation(&repo, credential.as_ref()) {
        Ok(result) => {
            record_operation(&ctx, &result)?;
            Ok(result)
        }
        Err(error) => {
            let failed = OperationResult {
                kind: kind.into(),
                state: "failed".into(),
                detail: error.to_string(),
                head_before: head_id(&repo),
                head_after: head_id(&repo),
                remote: None,
            };
            record_operation(&ctx, &failed).ok();
            Err(error)
        }
    }
}

fn project_context(project_id: ProjectHandleOrLegacyProjectId) -> Result<ProjectContext> {
    project_id.try_into()
}

fn main_repository(ctx: &ProjectContext) -> Result<Repository> {
    let path = {
        let repo = ctx.repo.get()?;
        repo.workdir()
            .context("A non-bare repository is required")?
            .to_path_buf()
    };
    Repository::open(path).context("Failed to open repository checkout")
}

fn checkout_repository(ctx: &ProjectContext, requested_path: Option<&str>) -> Result<Repository> {
    let main = main_repository(ctx)?;
    let Some(requested_path) = requested_path else {
        return Ok(main);
    };
    let requested = fs::canonicalize(requested_path)
        .with_context(|| format!("Worktree path does not exist: {requested_path}"))?;
    let main_path = fs::canonicalize(
        main.workdir()
            .context("A non-bare repository is required")?,
    )?;
    if requested == main_path {
        return Repository::open(requested).map_err(Into::into);
    }
    for name in main.worktrees()?.iter().flatten() {
        let worktree = main.find_worktree(name)?;
        if worktree.path().exists() && fs::canonicalize(worktree.path())? == requested {
            return Repository::open(requested).map_err(Into::into);
        }
    }
    bail!("The requested path is not a worktree of this repository")
}

fn changed_files(repo: &Repository) -> Result<Vec<ChangedFile>> {
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);
    let statuses = repo.statuses(Some(&mut options))?;
    let mut files = BTreeMap::new();
    for entry in statuses.iter() {
        let path = entry.path()?;
        let status = entry.status();
        files.insert(
            path.to_owned(),
            ChangedFile {
                path: path.to_owned(),
                status: status_label(status).into(),
                staged: is_staged(status),
                high_risk: is_high_risk_path(path),
            },
        );
    }
    Ok(files.into_values().collect())
}

fn refresh_active_session_scopes(ctx: &ProjectContext) -> Result<()> {
    struct ScopeUpdate {
        id: String,
        touched_files: String,
        touched_roots: String,
        dirty_count: i64,
        conflict_count: i64,
    }

    let sessions = ctx.db.get_cache()?.gittogether().list_sessions()?;
    let mut updates = Vec::new();
    for session in sessions
        .into_iter()
        .filter(|session| session.status == "active")
    {
        let Ok(repo) = checkout_repository(ctx, Some(&session.worktree_path)) else {
            continue;
        };
        let Ok(files) = changed_files(&repo) else {
            continue;
        };
        let mut paths =
            serde_json::from_str::<Vec<String>>(&session.touched_files).unwrap_or_default();
        paths.extend(files.iter().map(|file| file.path.clone()));
        paths.sort();
        paths.dedup();
        let roots = touched_roots(&paths);
        let touched_files = serde_json::to_string(&paths)?;
        let touched_roots = serde_json::to_string(&roots)?;
        let dirty_count = files.len() as i64;
        let conflict_count = files
            .iter()
            .filter(|file| file.status == "conflicted")
            .count() as i64;
        if session.touched_files == touched_files
            && session.touched_roots == touched_roots
            && session.dirty_count == dirty_count
            && session.conflict_count == conflict_count
        {
            continue;
        }
        updates.push(ScopeUpdate {
            id: session.id,
            touched_files,
            touched_roots,
            dirty_count,
            conflict_count,
        });
    }

    if updates.is_empty() {
        return Ok(());
    }
    let now = now_seconds();
    let mut db = ctx.db.get_cache_mut()?;
    for update in updates {
        db.gittogether_mut().update_session_worktree_state(
            &update.id,
            &update.touched_files,
            &update.touched_roots,
            update.dirty_count,
            update.conflict_count,
            now,
        )?;
    }
    Ok(())
}

fn status_label(status: Status) -> &'static str {
    if status.contains(Status::CONFLICTED) {
        "conflicted"
    } else if status.intersects(Status::WT_NEW | Status::INDEX_NEW) {
        "added"
    } else if status.intersects(Status::WT_DELETED | Status::INDEX_DELETED) {
        "deleted"
    } else if status.intersects(Status::WT_RENAMED | Status::INDEX_RENAMED) {
        "renamed"
    } else if status.intersects(Status::WT_TYPECHANGE | Status::INDEX_TYPECHANGE) {
        "type changed"
    } else {
        "modified"
    }
}

fn is_staged(status: Status) -> bool {
    status.intersects(
        Status::INDEX_NEW
            | Status::INDEX_MODIFIED
            | Status::INDEX_DELETED
            | Status::INDEX_RENAMED
            | Status::INDEX_TYPECHANGE,
    )
}

fn is_high_risk_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "uasset"
                    | "umap"
                    | "blend"
                    | "psd"
                    | "fbx"
                    | "glb"
                    | "gltf"
                    | "wav"
                    | "mp4"
                    | "zip"
                    | "7z"
                    | "dll"
                    | "dylib"
                    | "so"
            )
        })
}

#[derive(Debug)]
struct CheckoutInfo {
    name: String,
    path: String,
    primary: bool,
    dirty_count: usize,
    conflict_count: usize,
    files: Vec<ChangedFile>,
}

fn branch_summaries(
    repo: &Repository,
    session_by_branch: &BTreeMap<String, String>,
) -> Result<Vec<BranchSummary>> {
    let mut checkouts = BTreeMap::<String, CheckoutInfo>::new();
    if let Ok(head) = repo.head()
        && let Ok(name) = head.name()
    {
        let files = changed_files(repo)?;
        checkouts.insert(
            name.to_owned(),
            CheckoutInfo {
                name: "main".into(),
                path: repo
                    .workdir()
                    .context("A workdir is required")?
                    .to_string_lossy()
                    .into_owned(),
                primary: true,
                dirty_count: files.len(),
                conflict_count: files
                    .iter()
                    .filter(|file| file.status == "conflicted")
                    .count(),
                files,
            },
        );
    }
    for worktree_name in repo.worktrees()?.iter().flatten() {
        let worktree = repo.find_worktree(worktree_name)?;
        if !worktree.path().exists() {
            continue;
        }
        let worktree_repo = match Repository::open(worktree.path()) {
            Ok(repo) => repo,
            Err(_) => continue,
        };
        let Ok(head) = worktree_repo.head() else {
            continue;
        };
        let Ok(ref_name) = head.name() else {
            continue;
        };
        let files = changed_files(&worktree_repo)?;
        checkouts.insert(
            ref_name.to_owned(),
            CheckoutInfo {
                name: worktree_name.to_owned(),
                path: worktree.path().to_string_lossy().into_owned(),
                primary: false,
                dirty_count: files.len(),
                conflict_count: files
                    .iter()
                    .filter(|file| file.status == "conflicted")
                    .count(),
                files,
            },
        );
    }

    let owner = std::env::var("USER").unwrap_or_else(|_| "local".into());
    let mut branches = Vec::new();
    for branch in repo.branches(Some(BranchType::Local))? {
        let (branch, _) = branch?;
        let name = branch.name()?.to_owned();
        let ref_name = branch.get().name()?.to_owned();
        if ref_name.starts_with("refs/heads/gitbutler/") {
            continue;
        }
        let Some(target) = branch.get().target() else {
            continue;
        };
        let (upstream, ahead, behind, base_commit) = branch_divergence(repo, &branch, target);
        let checkout = checkouts.get(&ref_name);
        branches.push(BranchSummary {
            name,
            ref_name: ref_name.clone(),
            head: target.to_string(),
            base_commit,
            upstream,
            ahead,
            behind,
            worktree_name: checkout.map(|item| item.name.clone()),
            worktree_path: checkout.map(|item| item.path.clone()),
            is_checked_out: checkout.is_some(),
            is_primary: checkout.is_some_and(|item| item.primary),
            dirty_count: checkout.map_or(0, |item| item.dirty_count),
            conflict_count: checkout.map_or(0, |item| item.conflict_count),
            files: checkout.map(|item| item.files.clone()).unwrap_or_default(),
            owner: owner.clone(),
            session_id: session_by_branch.get(&ref_name).cloned(),
            presence: "unavailable".into(),
        });
    }
    branches.sort_by(|left, right| {
        right
            .is_primary
            .cmp(&left.is_primary)
            .then_with(|| right.is_checked_out.cmp(&left.is_checked_out))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(branches)
}

fn branch_divergence(
    repo: &Repository,
    branch: &git2::Branch<'_>,
    local: Oid,
) -> (Option<String>, usize, usize, String) {
    let Ok(upstream) = branch.upstream() else {
        return (None, 0, 0, local.to_string());
    };
    let name = upstream.get().name().ok().map(ToOwned::to_owned);
    let Some(remote) = upstream.get().target() else {
        return (name, 0, 0, local.to_string());
    };
    let (ahead, behind) = repo.graph_ahead_behind(local, remote).unwrap_or_default();
    let base_commit = repo.merge_base(local, remote).unwrap_or(local).to_string();
    (name, ahead, behind, base_commit)
}

fn remote_summaries(repo: &Repository) -> Result<Vec<RemoteSummary>> {
    let mut remotes = Vec::new();
    for name in repo.remotes()?.iter().flatten() {
        let remote = repo.find_remote(name)?;
        remotes.push(RemoteSummary {
            name: name.into(),
            url: remote.url().ok().map(sanitize_remote_url),
        });
    }
    Ok(remotes)
}

fn graph_commits(repo: &Repository, limit: usize) -> Result<Vec<GraphCommit>> {
    let mut refs_by_commit = BTreeMap::<Oid, Vec<String>>::new();
    for kind in [BranchType::Local, BranchType::Remote] {
        for branch in repo.branches(Some(kind))? {
            let (branch, _) = branch?;
            if let (Ok(name), Some(target)) = (branch.name(), branch.get().target()) {
                refs_by_commit.entry(target).or_default().push(name.into());
            }
        }
    }
    let mut walk = repo.revwalk()?;
    if walk.push_head().is_err() {
        return Ok(Vec::new());
    }
    walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;
    let mut commits = Vec::new();
    for id in walk.take(limit) {
        let id = id?;
        let commit = repo.find_commit(id)?;
        commits.push(GraphCommit {
            id: id.to_string(),
            short_id: id.to_string().chars().take(8).collect(),
            summary: commit.summary()?.unwrap_or("(no message)").into(),
            author: commit.author().name().unwrap_or("Unknown").into(),
            time: commit.time().seconds(),
            refs: refs_by_commit.remove(&id).unwrap_or_default(),
        });
    }
    Ok(commits)
}

fn file_diff(repo: &Repository, path: &str) -> Result<FileDiff> {
    validate_relative_path(path)?;
    let mut options = DiffOptions::new();
    options.pathspec(path).context_lines(3).show_binary(false);
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let diff = repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut options))?;
    let binary = diff
        .deltas()
        .any(|delta| delta.old_file().is_binary() || delta.new_file().is_binary());
    let mut bytes = Vec::new();
    let mut truncated = false;
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        if bytes.len() >= DIFF_LIMIT_BYTES {
            truncated = true;
            return true;
        }
        let remaining = DIFF_LIMIT_BYTES - bytes.len();
        let content = line.content();
        bytes.extend_from_slice(&content[..content.len().min(remaining)]);
        if content.len() > remaining {
            truncated = true;
        }
        true
    })?;
    Ok(FileDiff {
        path: path.into(),
        patch: String::from_utf8_lossy(&bytes).into_owned(),
        binary,
        truncated,
    })
}

fn file_preview(repo: &Repository, path: &str) -> Result<FilePreview> {
    validate_relative_path(path)?;
    let workdir = repo.workdir().context("A workdir is required")?;
    let candidate = workdir.join(path);
    if !candidate.exists() {
        return Ok(FilePreview {
            path: path.into(),
            kind: "missing".into(),
            content: None,
            absolute_path: None,
            size: None,
        });
    }
    let canonical_workdir = fs::canonicalize(workdir)?;
    let canonical = fs::canonicalize(&candidate)?;
    if !canonical.starts_with(&canonical_workdir) {
        bail!("Preview path escapes the selected worktree")
    }
    let size = fs::metadata(&canonical)?.len();
    if is_image_path(path) {
        return Ok(FilePreview {
            path: path.into(),
            kind: "image".into(),
            content: None,
            absolute_path: Some(canonical.to_string_lossy().into_owned()),
            size: Some(size),
        });
    }
    if size > PREVIEW_LIMIT_BYTES {
        return Ok(FilePreview {
            path: path.into(),
            kind: "binary".into(),
            content: None,
            absolute_path: None,
            size: Some(size),
        });
    }
    let bytes = fs::read(&canonical)?;
    match String::from_utf8(bytes) {
        Ok(content) => Ok(FilePreview {
            path: path.into(),
            kind: "text".into(),
            content: Some(content),
            absolute_path: None,
            size: Some(size),
        }),
        Err(_) => Ok(FilePreview {
            path: path.into(),
            kind: "binary".into(),
            content: None,
            absolute_path: None,
            size: Some(size),
        }),
    }
}

fn validate_relative_path(path: &str) -> Result<()> {
    let path = Path::new(path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        bail!("Expected a repository-relative path")
    }
    Ok(())
}

fn is_image_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg"
            )
        })
}

fn get_latest_preview(repo: &Repository) -> Result<GetLatestPreview> {
    let files = changed_files(repo)?;
    let dirty_files = files.into_iter().map(|file| file.path).collect::<Vec<_>>();
    let Ok(head) = repo.head() else {
        return Ok(blocked_latest(
            None,
            None,
            None,
            dirty_files,
            "Repository has no HEAD.",
        ));
    };
    let branch = head.shorthand().ok().map(ToOwned::to_owned);
    let Some(local_id) = head.target() else {
        return Ok(blocked_latest(
            branch,
            None,
            None,
            dirty_files,
            "HEAD is not a commit.",
        ));
    };
    if !head.is_branch() {
        return Ok(blocked_latest(
            branch,
            None,
            Some(local_id.to_string()),
            dirty_files,
            "Detached HEAD cannot use Get Latest.",
        ));
    }
    let branch_name = head
        .shorthand()
        .context("Current branch name is not valid UTF-8")?;
    let local_branch = repo.find_branch(branch_name, BranchType::Local)?;
    let Ok(upstream) = local_branch.upstream() else {
        return Ok(blocked_latest(
            Some(branch_name.into()),
            None,
            Some(local_id.to_string()),
            dirty_files,
            "Current branch has no configured upstream.",
        ));
    };
    let upstream_name = upstream.get().name().ok().map(ToOwned::to_owned);
    let Some(upstream_id) = upstream.get().target() else {
        return Ok(blocked_latest(
            Some(branch_name.into()),
            upstream_name,
            Some(local_id.to_string()),
            dirty_files,
            "Configured upstream does not point to a commit.",
        ));
    };
    let (ahead, behind) = repo.graph_ahead_behind(local_id, upstream_id)?;
    let mut risks = Vec::new();
    if !dirty_files.is_empty() {
        risks.push(format!(
            "{} changed path(s) must be committed, stashed, or discarded first.",
            dirty_files.len()
        ));
    }
    if ahead > 0 && behind > 0 {
        risks.push("Local and upstream history diverged; choose merge or rebase manually.".into());
    } else if ahead > 0 {
        risks.push("Local commits are ahead of upstream; no checkout update is required.".into());
    }
    let can_apply = behind > 0 && ahead == 0 && dirty_files.is_empty();
    let action = if can_apply {
        "fastForward"
    } else if ahead == 0 && behind == 0 {
        "upToDate"
    } else {
        "blocked"
    };
    Ok(GetLatestPreview {
        branch: Some(branch_name.into()),
        upstream: upstream_name,
        expected_head: Some(local_id.to_string()),
        upstream_head: Some(upstream_id.to_string()),
        ahead,
        behind,
        dirty_files,
        can_apply,
        action: action.into(),
        risks,
    })
}

fn blocked_latest(
    branch: Option<String>,
    upstream: Option<String>,
    expected_head: Option<String>,
    dirty_files: Vec<String>,
    reason: &str,
) -> GetLatestPreview {
    GetLatestPreview {
        branch,
        upstream,
        expected_head,
        upstream_head: None,
        ahead: 0,
        behind: 0,
        dirty_files,
        can_apply: false,
        action: "blocked".into(),
        risks: vec![reason.into()],
    }
}

fn apply_get_latest(repo: &Repository, expected_head: &str) -> Result<OperationResult> {
    let preview = get_latest_preview(repo)?;
    let actual_head = preview
        .expected_head
        .clone()
        .context("Repository has no current HEAD")?;
    if actual_head != expected_head {
        bail!("HEAD changed after preview; refresh Get Latest before applying")
    }
    if preview.action == "upToDate" {
        return Ok(OperationResult {
            kind: "getLatest".into(),
            state: "succeeded".into(),
            detail: "The checkout is already up to date.".into(),
            head_before: Some(actual_head.clone()),
            head_after: Some(actual_head),
            remote: None,
        });
    }
    if !preview.can_apply {
        bail!("Get Latest is blocked: {}", preview.risks.join(" "))
    }
    let upstream_id = Oid::from_str(
        preview
            .upstream_head
            .as_deref()
            .context("Upstream HEAD is unavailable")?,
    )?;
    let ref_name = repo
        .head()?
        .name()
        .context("Current HEAD is not attached to a branch")?
        .to_owned();
    let upstream_object = repo.find_object(upstream_id, None)?;
    let mut transaction = repo.transaction()?;
    transaction.lock_ref(&ref_name)?;
    let mut checkout = CheckoutBuilder::new();
    checkout
        .safe()
        .recreate_missing(true)
        .remove_untracked(false);
    repo.checkout_tree(&upstream_object, Some(&mut checkout))?;
    transaction.set_target(
        &ref_name,
        upstream_id,
        None,
        "GitTogether Get Latest fast-forward",
    )?;
    if let Err(error) = transaction.commit() {
        let original_object = repo.find_object(Oid::from_str(&actual_head)?, None)?;
        let mut restore = CheckoutBuilder::new();
        restore
            .force()
            .recreate_missing(true)
            .remove_untracked(false);
        repo.checkout_tree(&original_object, Some(&mut restore))
            .context("Get Latest could not commit its reference update or restore the checkout")?;
        return Err(error.into());
    }
    Ok(OperationResult {
        kind: "getLatest".into(),
        state: "succeeded".into(),
        detail: format!(
            "Fast-forwarded {} by {} commit(s).",
            preview.branch.as_deref().unwrap_or("branch"),
            preview.behind
        ),
        head_before: Some(actual_head),
        head_after: Some(upstream_id.to_string()),
        remote: preview
            .upstream
            .as_deref()
            .and_then(|upstream| upstream.strip_prefix("refs/remotes/"))
            .and_then(|upstream| upstream.split('/').next())
            .map(ToOwned::to_owned),
    })
}

fn commit_all(repo: &Repository, message: &str) -> Result<(OperationResult, Vec<String>)> {
    let message = message.trim();
    if message.is_empty() {
        bail!("A commit message is required")
    }
    let files = changed_files(repo)?;
    if files.is_empty() {
        bail!("There are no changes to commit")
    }
    if files.iter().any(|file| file.status == "conflicted") {
        bail!("Resolve conflicted paths before committing")
    }
    let head_before = head_id(repo);
    let mut index = repo.index()?;
    index.add_all(["*"], IndexAddOption::DEFAULT, None)?;
    index.update_all(["*"], None)?;
    index.write()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;
    let signature = repo
        .signature()
        .context("Configure Git user.name and user.email before committing")?;
    let parents = match repo.head() {
        Ok(head) => vec![head.peel_to_commit()?],
        Err(error) if error.code() == git2::ErrorCode::UnbornBranch => Vec::new(),
        Err(error) => return Err(error.into()),
    };
    let parent_refs = parents.iter().collect::<Vec<_>>();
    let new_id = repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        message,
        &tree,
        &parent_refs,
    )?;
    Ok((
        OperationResult {
            kind: "commit".into(),
            state: "succeeded".into(),
            detail: format!("Committed {} changed path(s).", files.len()),
            head_before,
            head_after: Some(new_id.to_string()),
            remote: None,
        },
        files.into_iter().map(|file| file.path).collect(),
    ))
}

fn push_repository(
    repo: &Repository,
    credential: Option<&ConnectionCredential>,
) -> Result<OperationResult> {
    let head = repo.head()?;
    if !head.is_branch() {
        bail!("Detached HEAD cannot be pushed from the dashboard")
    }
    let branch_name = head
        .shorthand()
        .context("Current branch name is not valid UTF-8")?
        .to_owned();
    let head_before = head.target().map(|id| id.to_string());
    let remote_name = selected_remote_name(repo, Some(&branch_name))?;
    let mut remote = repo.find_remote(&remote_name)?;
    let remote_url = remote.url().context("Selected remote has no URL")?;
    reject_inline_remote_credentials(remote_url)?;
    if let Some(credential) = credential {
        ensure_credential_scope(&credential.profile, remote_url)?;
    }
    let mut push_options = PushOptions::new();
    let mut callbacks = remote_callbacks(repo, credential)?;
    callbacks.push_update_reference(|_name, status| {
        status.map_or(Ok(()), |message| Err(git2::Error::from_str(message)))
    });
    push_options.remote_callbacks(callbacks);
    let refspec = format!("refs/heads/{branch_name}:refs/heads/{branch_name}");
    remote.push(&[refspec.as_str()], Some(&mut push_options))?;
    drop(remote);

    let mut config = repo.config()?;
    let merge_key = format!("branch.{branch_name}.merge");
    let remote_key = format!("branch.{branch_name}.remote");
    if config.get_string(&merge_key).is_err() {
        config.set_str(&merge_key, &format!("refs/heads/{branch_name}"))?;
        config.set_str(&remote_key, &remote_name)?;
    }

    // Fetch after a successful push so the remote-tracking ref reflects the real server result.
    fetch_named_remote(repo, &remote_name, credential)?;
    Ok(OperationResult {
        kind: "push".into(),
        state: "succeeded".into(),
        detail: format!("Pushed {branch_name} to {remote_name}."),
        head_before: head_before.clone(),
        head_after: head_before,
        remote: Some(remote_name),
    })
}

fn fetch_repository(
    repo: &Repository,
    credential: Option<&ConnectionCredential>,
) -> Result<(String, String)> {
    let branch = current_branch_name(repo);
    let remote_name = selected_remote_name(repo, branch.as_deref())?;
    let url = fetch_named_remote(repo, &remote_name, credential)?;
    Ok((remote_name, url))
}

fn fetch_named_remote(
    repo: &Repository,
    remote_name: &str,
    credential: Option<&ConnectionCredential>,
) -> Result<String> {
    let mut remote = repo.find_remote(remote_name)?;
    let remote_url = remote
        .url()
        .context("Selected remote has no URL")?
        .to_owned();
    reject_inline_remote_credentials(&remote_url)?;
    if let Some(credential) = credential {
        ensure_credential_scope(&credential.profile, &remote_url)?;
    }
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(remote_callbacks(repo, credential)?);
    remote.fetch(
        &[] as &[&str],
        Some(&mut fetch_options),
        Some("GitTogether fetch"),
    )?;
    Ok(sanitize_remote_url(&remote_url))
}

fn selected_remote_name(repo: &Repository, branch_name: Option<&str>) -> Result<String> {
    if let Some(branch_name) = branch_name {
        let key = format!("branch.{branch_name}.remote");
        if let Ok(remote) = repo.config()?.get_string(&key)
            && remote != "."
            && repo.find_remote(&remote).is_ok()
        {
            return Ok(remote);
        }
    }
    if repo.find_remote("origin").is_ok() {
        return Ok("origin".into());
    }
    repo.remotes()?
        .iter()
        .flatten()
        .next()
        .map(ToOwned::to_owned)
        .context("Repository has no Git remote")
}

fn remote_callbacks<'a>(
    repo: &Repository,
    credential: Option<&'a ConnectionCredential>,
) -> Result<RemoteCallbacks<'a>> {
    let config = repo.config()?;
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |url, username_from_url, allowed| {
        if let Some(credential) = credential {
            if allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
                return Cred::userpass_plaintext(
                    &credential.profile.username,
                    &credential.secret.0,
                );
            }
            if allowed.contains(CredentialType::USERNAME) {
                return Cred::username(&credential.profile.username);
            }
        }
        if allowed.contains(CredentialType::SSH_KEY) {
            return Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"));
        }
        if allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
            return Cred::credential_helper(&config, url, username_from_url);
        }
        if allowed.contains(CredentialType::DEFAULT) {
            return Cred::default();
        }
        if allowed.contains(CredentialType::USERNAME) {
            return Cred::username(username_from_url.unwrap_or("git"));
        }
        Err(git2::Error::from_str(
            "No supported Git credential method is available",
        ))
    });
    Ok(callbacks)
}

fn current_branch_name(repo: &Repository) -> Option<String> {
    repo.head()
        .ok()
        .filter(|head| head.is_branch())
        .and_then(|head| head.shorthand().ok().map(ToOwned::to_owned))
}

fn head_id(repo: &Repository) -> Option<String> {
    repo.head().ok()?.target().map(|id| id.to_string())
}

fn record_operation(ctx: &ProjectContext, result: &OperationResult) -> Result<()> {
    let now = now_seconds();
    ctx.db
        .get_cache_mut()?
        .gittogether_mut()
        .insert_operation(&GitTogetherOperation {
            id: Uuid::new_v4().to_string(),
            kind: result.kind.clone(),
            state: result.state.clone(),
            detail: result.detail.clone(),
            head_before: result.head_before.clone(),
            head_after: result.head_after.clone(),
            created_at: now,
            updated_at: now,
        })?;
    Ok(())
}

fn connection_store_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join(CONNECTION_STORE_FILE))
}

fn read_connection_store(app: &AppHandle) -> Result<ConnectionStore> {
    let path = connection_store_path(app)?;
    if !path.exists() {
        return Ok(ConnectionStore::default());
    }
    let bytes = fs::read(&path)
        .with_context(|| format!("Failed to read connection metadata at {}", path.display()))?;
    let mut store: ConnectionStore =
        serde_json::from_slice(&bytes).context("Connection metadata is not valid JSON")?;
    for profile in &mut store.profiles {
        if profile.secret_handle.is_empty() {
            profile.secret_handle = format!("gittogether-server-{}", profile.id);
        }
    }
    Ok(store)
}

fn write_connection_store(app: &AppHandle, store: &ConnectionStore) -> Result<()> {
    let path = connection_store_path(app)?;
    let parent = path
        .parent()
        .context("Connection store path has no parent")?;
    fs::create_dir_all(parent)?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(store)?)?;
    fs::rename(&temporary, &path)?;
    Ok(())
}

fn save_connection_profile(
    app: &AppHandle,
    id: Option<String>,
    label: String,
    base_url: String,
    username: String,
    secret_value: Option<String>,
) -> Result<ConnectionProfile> {
    let label = label.trim();
    let username = username.trim();
    if label.is_empty() || username.is_empty() {
        bail!("Connection label and username are required")
    }
    let base_url = normalize_https_base_url(&base_url)?;
    let mut store = read_connection_store(app)?;
    let id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let secret_handle = store
        .profiles
        .iter()
        .find(|profile| profile.id == id)
        .map(|profile| profile.secret_handle.clone())
        .unwrap_or_else(|| format!("gittogether-server-{id}"));
    let mut has_secret = store
        .profiles
        .iter()
        .find(|profile| profile.id == id)
        .is_some_and(|profile| profile.has_secret);
    if let Some(secret_value) = secret_value {
        if secret_value.is_empty() {
            bail!("Password or PAT cannot be empty")
        }
        secret::persist(
            &secret_handle,
            &Sensitive(secret_value),
            secret::Namespace::BuildKind,
        )?;
        has_secret = true;
    }
    if !has_secret {
        bail!("A password or PAT is required for a new connection")
    }
    let profile = StoredConnectionProfile {
        id: id.clone(),
        label: label.into(),
        base_url,
        username: username.into(),
        has_secret,
        secret_handle,
    };
    if let Some(existing) = store.profiles.iter_mut().find(|profile| profile.id == id) {
        *existing = profile.clone();
    } else {
        store.profiles.push(profile.clone());
        store
            .profiles
            .sort_by(|left, right| left.label.cmp(&right.label));
    }
    write_connection_store(app, &store)?;
    Ok(ConnectionProfile::from(&profile))
}

fn delete_connection_profile(app: &AppHandle, id: &str) -> Result<ConnectionStore> {
    let mut store = read_connection_store(app)?;
    let profile = store
        .profiles
        .iter()
        .find(|profile| profile.id == id)
        .cloned()
        .with_context(|| format!("Connection profile {id} does not exist"))?;
    secret::delete(&profile.secret_handle, secret::Namespace::BuildKind)?;
    store.profiles.retain(|profile| profile.id != id);
    store.bindings.retain(|_, profile_id| profile_id != id);
    write_connection_store(app, &store)?;
    Ok(store)
}

fn bind_connection_profile(
    app: &AppHandle,
    project_id: String,
    profile_id: Option<String>,
) -> Result<ConnectionStore> {
    let mut store = read_connection_store(app)?;
    if let Some(profile_id) = profile_id {
        if !store
            .profiles
            .iter()
            .any(|profile| profile.id == profile_id)
        {
            bail!("Connection profile {profile_id} does not exist")
        }
        store.bindings.insert(project_id, profile_id);
    } else {
        store.bindings.remove(&project_id);
    }
    write_connection_store(app, &store)?;
    Ok(store)
}

fn credential_for_project(
    app: &AppHandle,
    project_id: &str,
    profile_override: Option<&str>,
) -> Result<Option<ConnectionCredential>> {
    let store = read_connection_store(app)?;
    let selected = profile_override.or_else(|| store.bindings.get(project_id).map(String::as_str));
    let Some(selected) = selected else {
        return Ok(None);
    };
    credential_for_profile(&store, selected).map(Some)
}

fn credential_for_profile(store: &ConnectionStore, id: &str) -> Result<ConnectionCredential> {
    let profile = store
        .profiles
        .iter()
        .find(|profile| profile.id == id)
        .cloned()
        .with_context(|| format!("Connection profile {id} does not exist"))?;
    let secret = secret::retrieve(&profile.secret_handle, secret::Namespace::BuildKind)?
        .with_context(|| format!("The keychain secret for '{}' is missing", profile.label))?;
    Ok(ConnectionCredential { profile, secret })
}

fn normalize_https_base_url(input: &str) -> Result<String> {
    let mut url = Url::parse(input.trim()).context("Connection URL is invalid")?;
    if url.scheme() != "https" {
        bail!("Self-hosted connection URLs must use HTTPS")
    }
    if url.host_str().is_none() {
        bail!("Self-hosted connection URLs must include a server host")
    }
    if !url.username().is_empty() || url.password().is_some() {
        bail!("Do not put credentials in the server URL; save them in the keychain fields")
    }
    url.set_fragment(None);
    url.set_query(None);
    let normalized = url.as_str().trim_end_matches('/').to_owned();
    Ok(normalized)
}

fn ensure_credential_scope(profile: &StoredConnectionProfile, remote_url: &str) -> Result<()> {
    let base = Url::parse(&profile.base_url)?;
    let remote = Url::parse(remote_url).context(
        "A keychain-backed HTTPS profile cannot be sent to a non-URL or SSH-style remote",
    )?;
    if remote.scheme() != "https" {
        bail!("The bound connection can only authenticate HTTPS Git remotes")
    }
    if !remote.username().is_empty() || remote.password().is_some() {
        bail!("Remove inline credentials from the Git remote URL before using a saved connection")
    }
    if base.host_str() != remote.host_str()
        || base.port_or_known_default() != remote.port_or_known_default()
        || !path_is_within_scope(base.path(), remote.path())
    {
        bail!(
            "The selected connection is scoped to {}, but this remote uses a different server",
            profile.base_url
        )
    }
    Ok(())
}

fn path_is_within_scope(base_path: &str, remote_path: &str) -> bool {
    let base_path = base_path.trim_end_matches('/');
    base_path.is_empty()
        || remote_path == base_path
        || remote_path
            .strip_prefix(base_path)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

fn sanitize_remote_url(input: &str) -> String {
    let Ok(mut url) = Url::parse(input) else {
        return input.into();
    };
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.to_string()
}

fn reject_inline_remote_credentials(remote_url: &str) -> Result<()> {
    let Ok(url) = Url::parse(remote_url) else {
        return Ok(());
    };
    if !url.username().is_empty() || url.password().is_some() {
        bail!(
            "The Git remote URL contains inline credentials. Remove them and use a Keychain-backed connection profile instead"
        )
    }
    Ok(())
}

fn clone_with_connection(
    app: &AppHandle,
    profile_id: &str,
    remote_url: &str,
    destination: &Path,
) -> Result<OperationResult> {
    let store = read_connection_store(app)?;
    let credential = credential_for_profile(&store, profile_id)?;
    ensure_credential_scope(&credential.profile, remote_url)?;
    if destination.exists() {
        if !destination.is_dir() {
            bail!("Clone destination exists and is not a directory")
        }
        if fs::read_dir(destination)?.next().is_some() {
            bail!("Clone destination is not empty")
        }
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    let callback_repo_dir = tempfile_repository_for_config()?;
    let callback_repo = Repository::open_bare(&callback_repo_dir)?;
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(remote_callbacks(&callback_repo, Some(&credential))?);
    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch_options);
    let clone_result = builder.clone(remote_url, destination);
    drop(builder);
    drop(callback_repo);
    fs::remove_dir_all(&callback_repo_dir).ok();
    let repo =
        clone_result.with_context(|| format!("Failed to clone into {}", destination.display()))?;
    let head = head_id(&repo);
    Ok(OperationResult {
        kind: "clone".into(),
        state: "succeeded".into(),
        detail: format!("Cloned with connection '{}'.", credential.profile.label),
        head_before: None,
        head_after: head,
        remote: Some("origin".into()),
    })
}

fn tempfile_repository_for_config() -> Result<PathBuf> {
    let path = std::env::temp_dir().join(format!("gittogether-clone-{}.git", Uuid::new_v4()));
    Repository::init_bare(&path)?;
    Ok(path)
}

fn create_session(
    project_id: ProjectHandleOrLegacyProjectId,
    title: &str,
    operation_type: &str,
) -> Result<SessionView> {
    let title = title.trim();
    let operation_type = operation_type.trim();
    if title.is_empty() || operation_type.is_empty() {
        bail!("Session title and operation type are required")
    }
    let ctx = project_context(project_id)?;
    let repo = main_repository(&ctx)?;
    let head = repo.head()?;
    if !head.is_branch() {
        bail!("Protected Work Sessions require an attached local branch")
    }
    let base = head.target().context("Current branch has no commit")?;
    let target_ref = head.name().ok().map(ToOwned::to_owned);
    let id = Uuid::new_v4().to_string();
    let branch_name = format!(
        "gittogether/{}-{}",
        slug(title),
        id.chars().take(8).collect::<String>()
    );
    let branch = repo.branch(&branch_name, &repo.find_commit(base)?, false)?;
    let branch_ref = branch
        .get()
        .name()
        .context("Created branch has no reference name")?
        .to_owned();
    let worktree_parent = ctx.project_data_dir.join("gittogether-worktrees");
    fs::create_dir_all(&worktree_parent)?;
    let worktree_path = worktree_parent.join(&id);
    let mut options = git2::WorktreeAddOptions::new();
    options.lock(true).reference(Some(branch.get()));
    repo.worktree(&id, &worktree_path, Some(&options))?;
    let now = now_seconds();
    let session = GitTogetherSession {
        id,
        title: title.into(),
        status: "active".into(),
        branch_ref,
        worktree_path: worktree_path.to_string_lossy().into_owned(),
        base_commit: base.to_string(),
        target_ref,
        operation_type: operation_type.into(),
        touched_files: "[]".into(),
        touched_roots: "[]".into(),
        dirty_count: 0,
        conflict_count: 0,
        snapshot_commit: None,
        created_at: now,
        updated_at: now,
    };
    ctx.db
        .get_cache_mut()?
        .gittogether_mut()
        .insert_session(&session)?;
    Ok(session.into())
}

fn snapshot_session(
    project_id: ProjectHandleOrLegacyProjectId,
    session_id: &str,
) -> Result<SessionSnapshotResult> {
    let ctx = project_context(project_id)?;
    let session = ctx
        .db
        .get_cache()?
        .gittogether()
        .get_session(session_id)?
        .with_context(|| format!("Work Session {session_id} does not exist"))?;
    let repo = checkout_repository(&ctx, Some(&session.worktree_path))?;
    let message = format!("GitTogether snapshot: {}", session.title);
    let (operation, files) = commit_all(&repo, &message)?;
    let mut touched =
        serde_json::from_str::<Vec<String>>(&session.touched_files).unwrap_or_default();
    touched.extend(files);
    touched.sort();
    touched.dedup();
    let roots = touched_roots(&touched);
    let files_json = serde_json::to_string(&touched)?;
    let roots_json = serde_json::to_string(&roots)?;
    let snapshot_commit = operation
        .head_after
        .as_deref()
        .context("Snapshot commit was not created")?;
    let now = now_seconds();
    ctx.db
        .get_cache_mut()?
        .gittogether_mut()
        .update_session_snapshot(
            session_id,
            "snapshot",
            &files_json,
            &roots_json,
            Some(snapshot_commit),
            now,
        )?;
    record_operation(&ctx, &operation)?;
    let updated = ctx
        .db
        .get_cache()?
        .gittogether()
        .get_session(session_id)?
        .context("Updated Work Session disappeared")?;
    let assessment = assess_session(&ctx, session_id)?;
    Ok(SessionSnapshotResult {
        session: updated.into(),
        operation,
        assessment,
    })
}

fn assess_session(ctx: &ProjectContext, session_id: &str) -> Result<SessionAssessment> {
    let session = ctx
        .db
        .get_cache()?
        .gittogether()
        .get_session(session_id)?
        .with_context(|| format!("Work Session {session_id} does not exist"))?;
    let mut touched =
        serde_json::from_str::<Vec<String>>(&session.touched_files).unwrap_or_default();
    if Path::new(&session.worktree_path).exists() {
        let repo = checkout_repository(ctx, Some(&session.worktree_path))?;
        touched.extend(changed_files(&repo)?.into_iter().map(|file| file.path));
    }
    touched.sort();
    touched.dedup();
    let high_risk_files = touched
        .iter()
        .filter(|path| is_high_risk_path(path))
        .cloned()
        .collect::<Vec<_>>();
    let repo = main_repository(ctx)?;
    let mut target_head = None;
    let target_changes = if let Some(target_ref) = session.target_ref.as_deref() {
        match repo.find_reference(target_ref) {
            Ok(reference) => {
                let target = reference.peel_to_commit()?;
                target_head = Some(target.id().to_string());
                changed_paths_between(&repo, &session.base_commit, target.id())?
            }
            Err(_) => BTreeSet::new(),
        }
    } else {
        BTreeSet::new()
    };
    let overlapping_files = touched
        .iter()
        .filter(|path| target_changes.contains(path.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    let mut reasons = Vec::new();
    if session.target_ref.is_none() || target_head.is_none() {
        reasons.push("The original target branch is unavailable.".into());
    }
    if !overlapping_files.is_empty() {
        reasons.push(format!(
            "{} touched path(s) also changed on the target since the session base.",
            overlapping_files.len()
        ));
    }
    if !high_risk_files.is_empty() {
        reasons.push(format!(
            "{} high-risk binary asset(s) require manual review.",
            high_risk_files.len()
        ));
    }
    reasons.push(
        "Presence is unavailable in the local-only 0.2.x line, so automatic merge is disabled."
            .into(),
    );
    let risk_level =
        if session.target_ref.is_none() || target_head.is_none() || !overlapping_files.is_empty() {
            "blocked"
        } else {
            "reviewRequired"
        };
    Ok(SessionAssessment {
        session_id: session_id.into(),
        risk_level: risk_level.into(),
        auto_merge_allowed: false,
        presence: "unavailable".into(),
        reasons,
        overlapping_files,
        high_risk_files,
        target_head,
    })
}

fn changed_paths_between(repo: &Repository, base: &str, target: Oid) -> Result<BTreeSet<String>> {
    let base = Oid::from_str(base)?;
    if base == target {
        return Ok(BTreeSet::new());
    }
    let base_tree = repo.find_commit(base)?.tree()?;
    let target_tree = repo.find_commit(target)?.tree()?;
    let diff = repo.diff_tree_to_tree(Some(&base_tree), Some(&target_tree), None)?;
    let mut paths = BTreeSet::new();
    for delta in diff.deltas() {
        if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
            paths.insert(path.to_string_lossy().into_owned());
        }
    }
    Ok(paths)
}

fn touched_roots(files: &[String]) -> Vec<String> {
    files
        .iter()
        .filter_map(|path| Path::new(path).components().next())
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn create_thread(
    project_id: ProjectHandleOrLegacyProjectId,
    title: &str,
    session_id: Option<&str>,
) -> Result<GitTogetherThread> {
    let title = title.trim();
    if title.is_empty() {
        bail!("Thread title is required")
    }
    let ctx = project_context(project_id)?;
    let branch_ref = if let Some(session_id) = session_id {
        Some(
            ctx.db
                .get_cache()?
                .gittogether()
                .get_session(session_id)?
                .with_context(|| format!("Work Session {session_id} does not exist"))?
                .branch_ref,
        )
    } else {
        main_repository(&ctx)?
            .head()
            .ok()
            .and_then(|head| head.name().ok().map(ToOwned::to_owned))
    };
    let now = now_seconds();
    let thread = GitTogetherThread {
        id: Uuid::new_v4().to_string(),
        title: title.into(),
        status: "open".into(),
        session_id: session_id.map(ToOwned::to_owned),
        branch_ref,
        created_at: now,
        updated_at: now,
    };
    ctx.db
        .get_cache_mut()?
        .gittogether_mut()
        .insert_thread(&thread)?;
    Ok(thread)
}

fn add_message(
    project_id: ProjectHandleOrLegacyProjectId,
    thread_id: &str,
    content: &str,
) -> Result<Vec<GitTogetherMessage>> {
    let content = content.trim();
    if content.is_empty() {
        bail!("Message cannot be empty")
    }
    if content.len() > 100_000 {
        bail!("Message is too large")
    }
    let ctx = project_context(project_id)?;
    if !ctx
        .db
        .get_cache()?
        .gittogether()
        .list_threads()?
        .iter()
        .any(|thread| thread.id == thread_id)
    {
        bail!("Thread {thread_id} does not exist")
    }
    let message = GitTogetherMessage {
        id: Uuid::new_v4().to_string(),
        thread_id: thread_id.into(),
        role: "user".into(),
        content: content.into(),
        created_at: now_seconds(),
    };
    ctx.db
        .get_cache_mut()?
        .gittogether_mut()
        .insert_message(&message)?;
    Ok(ctx.db.get_cache()?.gittogether().list_messages(thread_id)?)
}

fn slug(input: &str) -> String {
    let mut slug = String::new();
    let mut last_was_separator = false;
    for character in input.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_was_separator = false;
        } else if !last_was_separator && !slug.is_empty() {
            slug.push('-');
            last_was_separator = true;
        }
        if slug.len() >= 32 {
            break;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "session".into()
    } else {
        slug.into()
    }
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, fs, path::Path};

    use git2::{Oid, Repository, Signature, WorktreeAddOptions};
    use tempfile::TempDir;

    use super::{
        StoredConnectionProfile, apply_get_latest, branch_summaries, ensure_credential_scope,
        get_latest_preview, is_high_risk_path, normalize_https_base_url, path_is_within_scope,
        slug, touched_roots,
    };

    fn repository_with_main() -> (TempDir, Repository, Oid) {
        let root = tempfile::tempdir().unwrap();
        let main_path = root.path().join("main");
        let repo = Repository::init(&main_path).unwrap();
        repo.set_head("refs/heads/main").unwrap();
        {
            let mut config = repo.config().unwrap();
            config.set_str("user.name", "GitTogether Test").unwrap();
            config
                .set_str("user.email", "gittogether-test@example.invalid")
                .unwrap();
        }
        fs::write(main_path.join("README.md"), "base\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("README.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let signature =
            Signature::now("GitTogether Test", "gittogether-test@example.invalid").unwrap();
        let initial = repo
            .commit(
                Some("refs/heads/main"),
                &signature,
                &signature,
                "initial",
                &tree,
                &[],
            )
            .unwrap();
        drop(tree);
        (root, repo, initial)
    }

    fn descendant_with_file(repo: &Repository, parent: Oid, content: &str) -> Oid {
        let parent = repo.find_commit(parent).unwrap();
        let parent_tree = parent.tree().unwrap();
        let blob = repo.blob(content.as_bytes()).unwrap();
        let mut builder = repo.treebuilder(Some(&parent_tree)).unwrap();
        builder.insert("README.md", blob, 0o100644).unwrap();
        let tree_id = builder.write().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let signature =
            Signature::now("GitTogether Test", "gittogether-test@example.invalid").unwrap();
        repo.commit(
            None,
            &signature,
            &signature,
            "upstream change",
            &tree,
            &[&parent],
        )
        .unwrap()
    }

    fn configure_upstream(repo: &Repository, upstream: Oid) {
        repo.remote("origin", "https://git.example.com/team/project.git")
            .unwrap();
        repo.reference("refs/remotes/origin/main", upstream, true, "test upstream")
            .unwrap();
        let mut config = repo.config().unwrap();
        config.set_str("branch.main.remote", "origin").unwrap();
        config
            .set_str("branch.main.merge", "refs/heads/main")
            .unwrap();
    }

    #[test]
    fn session_slug_is_safe_for_git_refs() {
        assert_eq!(slug("Fix Up Redirectors!"), "fix-up-redirectors");
        assert_eq!(slug("资产修复"), "session");
    }

    #[test]
    fn high_risk_assets_are_explicit() {
        assert!(is_high_risk_path("Content/Hero.uasset"));
        assert!(is_high_risk_path("scene.blend"));
        assert!(!is_high_risk_path("src/main.rs"));
    }

    #[test]
    fn roots_are_aggregated() {
        assert_eq!(
            touched_roots(&[
                "Content/A.uasset".into(),
                "Content/B.uasset".into(),
                "Source/main.cpp".into(),
            ]),
            vec!["Content", "Source"]
        );
    }

    #[test]
    fn connection_requires_https_and_removes_trailing_slash() {
        assert_eq!(
            normalize_https_base_url("https://git.example.com/").unwrap(),
            "https://git.example.com"
        );
        assert!(normalize_https_base_url("http://git.example.com").is_err());
        assert!(normalize_https_base_url("https://").is_err());
    }

    #[test]
    fn credential_scope_uses_path_segment_boundaries() {
        assert!(path_is_within_scope("/team", "/team/project.git"));
        assert!(path_is_within_scope("/team/", "/team/project.git"));
        assert!(path_is_within_scope("/team", "/team"));
        assert!(!path_is_within_scope("/team", "/team2/project.git"));

        let profile = StoredConnectionProfile {
            id: "profile".into(),
            label: "Team server".into(),
            base_url: "https://git.example.com/team".into(),
            username: "developer".into(),
            has_secret: true,
            secret_handle: "secret".into(),
        };
        assert!(
            ensure_credential_scope(&profile, "https://git.example.com/team/project.git").is_ok()
        );
        assert!(
            ensure_credential_scope(&profile, "https://git.example.com/team2/project.git").is_err()
        );
        assert!(
            ensure_credential_scope(&profile, "https://git.example.com:8443/team/project.git")
                .is_err()
        );
        assert!(
            ensure_credential_scope(&profile, "https://user@git.example.com/team/project.git")
                .is_err()
        );
    }

    #[test]
    fn get_latest_only_applies_an_exact_clean_fast_forward() {
        let (root, repo, initial) = repository_with_main();
        let upstream = descendant_with_file(&repo, initial, "latest\n");
        configure_upstream(&repo, upstream);

        let preview = get_latest_preview(&repo).unwrap();
        assert_eq!(preview.action, "fastForward");
        assert_eq!(preview.behind, 1);
        assert!(preview.can_apply);
        assert!(apply_get_latest(&repo, "0000000000000000000000000000000000000000").is_err());
        assert_eq!(repo.head().unwrap().target(), Some(initial));

        let result = apply_get_latest(&repo, &initial.to_string()).unwrap();
        assert_eq!(
            result.head_after.as_deref(),
            Some(upstream.to_string().as_str())
        );
        assert_eq!(repo.head().unwrap().target(), Some(upstream));
        assert_eq!(
            fs::read_to_string(root.path().join("main/README.md")).unwrap(),
            "latest\n"
        );
    }

    #[test]
    fn get_latest_blocks_a_dirty_checkout() {
        let (root, repo, initial) = repository_with_main();
        let upstream = descendant_with_file(&repo, initial, "latest\n");
        configure_upstream(&repo, upstream);
        fs::write(root.path().join("main/README.md"), "local edit\n").unwrap();

        let preview = get_latest_preview(&repo).unwrap();
        assert_eq!(preview.action, "blocked");
        assert!(!preview.can_apply);
        assert_eq!(preview.dirty_files, vec!["README.md"]);
        assert!(apply_get_latest(&repo, &initial.to_string()).is_err());
        assert_eq!(repo.head().unwrap().target(), Some(initial));
        assert_eq!(
            fs::read_to_string(root.path().join("main/README.md")).unwrap(),
            "local edit\n"
        );
    }

    #[test]
    fn branch_overview_associates_a_real_linked_worktree() {
        let (root, repo, initial) = repository_with_main();
        let commit = repo.find_commit(initial).unwrap();
        let branch = repo.branch("feature", &commit, false).unwrap();
        let worktree_path = root.path().join("feature-worktree");
        let mut options = WorktreeAddOptions::new();
        options.reference(Some(branch.get()));
        repo.worktree("feature-worktree", &worktree_path, Some(&options))
            .unwrap();

        let branches = branch_summaries(&repo, &BTreeMap::new()).unwrap();
        let main = branches.iter().find(|item| item.name == "main").unwrap();
        let feature = branches.iter().find(|item| item.name == "feature").unwrap();
        assert!(main.is_primary);
        assert!(main.is_checked_out);
        assert!(feature.is_checked_out);
        assert!(!feature.is_primary);
        assert_eq!(
            fs::canonicalize(feature.worktree_path.as_deref().unwrap()).unwrap(),
            fs::canonicalize(worktree_path).unwrap()
        );
    }
}
