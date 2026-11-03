//! End-to-end Push tests. The SSH executable is a local pipe to temporary
//! bare repositories; no network, user credentials or real worktree is used.
use super::*;
use std::os::unix::fs::PermissionsExt;

// Run each fixture in a child test process so all Git subprocesses, including
// those created by Service and the local SSH shim, ignore user/system config.
// This avoids mutating the shared process environment while other tests run.
async fn run_isolated(name: &str) -> bool {
    if std::env::var_os("GITTOGETHER_ISOLATED_PUSH_TEST").is_some() {
        return false;
    }
    let status = tokio::process::Command::new(std::env::current_exe().unwrap())
        .arg("--exact")
        .arg(format!("service::sync_push_tests::{name}"))
        .arg("--nocapture")
        .env("GITTOGETHER_ISOLATED_PUSH_TEST", "1")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_TEMPLATE_DIR", "/dev/null")
        .env("GIT_ATTR_NOSYSTEM", "1")
        .env_remove("GIT_CONFIG")
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_COMMON_DIR")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_OBJECT_DIRECTORY")
        .env_remove("GIT_ALTERNATE_OBJECT_DIRECTORIES")
        .env_remove("GIT_SSH")
        .env_remove("GIT_SSH_COMMAND")
        .env_remove("SSH_AUTH_SOCK")
        .status()
        .await
        .unwrap();
    assert!(status.success(), "isolated fixture {name} failed");
    true
}

async fn git_cmd(root: &Path, args: &[&str]) -> String {
    git::run(
        root,
        args,
        git::Options {
            write: true,
            ..Default::default()
        },
    )
    .await
    .unwrap_or_else(|error| panic!("git {args:?}: {error}"))
}

async fn lfs_available(root: &Path) -> bool {
    git::run(root, &["lfs", "version"], git::Options::default())
        .await
        .is_ok()
}

struct Fixture {
    _temporary: tempfile::TempDir,
    local: PathBuf,
    writer: PathBuf,
    remote: PathBuf,
    other: PathBuf,
    hooks: PathBuf,
    service: Arc<Service>,
}

impl Fixture {
    async fn new() -> Self {
        let temporary = tempfile::tempdir().unwrap();
        let base = temporary.path();
        let seed = base.join("seed");
        let remote = base.join("remote.git");
        let other = base.join("other.git");
        let local = base.join("local");
        let writer = base.join("writer");
        let hooks = base.join("empty-hooks");
        fs::create_dir(&hooks).unwrap();
        fs::create_dir(&seed).unwrap();
        for args in [
            vec!["init", "--quiet", "--initial-branch=main", "--template="],
            vec!["config", "core.hooksPath", hooks.to_str().unwrap()],
            vec!["config", "user.name", "Fixture"],
            vec!["config", "user.email", "fixture@example.invalid"],
            vec!["config", "commit.gpgsign", "false"],
        ] {
            git_cmd(&seed, &args).await;
        }
        fs::write(seed.join("shared.txt"), "base\n").unwrap();
        fs::write(seed.join("keep.txt"), "original\n").unwrap();
        git_cmd(&seed, &["add", "--all"]).await;
        git_cmd(&seed, &["commit", "--quiet", "-m", "base"]).await;
        for bare in [&remote, &other] {
            git_cmd(
                &seed,
                &[
                    "clone",
                    "--bare",
                    "--quiet",
                    seed.to_str().unwrap(),
                    bare.to_str().unwrap(),
                ],
            )
            .await;
            git_cmd(bare, &["config", "core.hooksPath", hooks.to_str().unwrap()]).await;
        }
        for checkout in [&local, &writer] {
            git_cmd(
                &seed,
                &[
                    "clone",
                    "--quiet",
                    remote.to_str().unwrap(),
                    checkout.to_str().unwrap(),
                ],
            )
            .await;
            for args in [
                vec!["config", "core.hooksPath", hooks.to_str().unwrap()],
                vec!["config", "user.name", "Fixture"],
                vec!["config", "user.email", "fixture@example.invalid"],
                vec!["config", "commit.gpgsign", "false"],
            ] {
                git_cmd(checkout, &args).await;
            }
        }
        let local = dunce::canonicalize(local).unwrap();
        let writer = dunce::canonicalize(writer).unwrap();
        let remote = dunce::canonicalize(remote).unwrap();
        let other = dunce::canonicalize(other).unwrap();
        let ssh = base.join("fixture-ssh");
        let script = format!("#!/bin/sh\nremote='{}'\nfor arg in \"$@\"; do\n  if [ \"$arg\" = '23' ]; then remote='{}'; fi\ndone\nfor arg in \"$@\"; do\n  case \"$arg\" in\n    *git-upload-pack*)\n      [ -f '{}/fail-readback' ] && exit 1\n      exec git-upload-pack \"$remote\";;\n    *git-receive-pack*)\n      [ -f '{}/arm-fail-readback' ] && touch '{}/fail-readback'\n      exec git-receive-pack \"$remote\";;\n  esac\ndone\nexit 1\n", remote.display(), other.display(), base.display(), base.display(), base.display());
        fs::write(&ssh, script).unwrap();
        fs::set_permissions(&ssh, fs::Permissions::from_mode(0o700)).unwrap();
        git_cmd(
            &local,
            &[
                "remote",
                "set-url",
                "origin",
                "ssh://fixture@fixture.invalid/fixture/project.git",
            ],
        )
        .await;
        git_cmd(
            &local,
            &["config", "core.sshCommand", ssh.to_str().unwrap()],
        )
        .await;
        git_cmd(&local, &["config", "ssh.variant", "ssh"]).await;
        let service = Service::new(base.join("storage"), false, "test").unwrap();
        service.state.write().await.value = json!({"version":2,"accounts":[{"account":{"id":"fixture","provider":"gitea","host":"https://fixture.invalid","login":"fixture","name":"Fixture","updatedAt":"2026-11-01T00:00:00Z"},"token":"fixture-only"}],"repositories":[{"id":"fixture:1","accountId":"fixture","remoteId":1,"name":"project","fullName":"fixture/project","description":"","defaultBranch":"main","private":false,"url":"https://fixture.invalid/fixture/project","available":true}],"links":[{"repositoryId":"fixture:1","path":local.to_string_lossy(),"authentication":"system","worktrees":[{"branch":"main","path":local.to_string_lossy()}]}]});
        Self {
            _temporary: temporary,
            local,
            writer,
            remote,
            other,
            hooks,
            service,
        }
    }

    async fn commit(&self, root: &Path, file: &str, contents: &str, message: &str) -> String {
        fs::write(root.join(file), contents).unwrap();
        git_cmd(root, &["add", "--", file]).await;
        git_cmd(root, &["commit", "--quiet", "-m", message]).await;
        git_cmd(root, &["rev-parse", "HEAD"])
            .await
            .trim()
            .to_owned()
    }

    async fn remote_head(&self) -> String {
        git_cmd(&self.remote, &["rev-parse", "refs/heads/main"])
            .await
            .trim()
            .to_owned()
    }

    async fn diverge(&self, conflict: bool) -> (String, String) {
        let file = if conflict { "shared.txt" } else { "local.txt" };
        let local = self
            .commit(&self.local, file, "local\n", "local commit")
            .await;
        let file = if conflict { "shared.txt" } else { "remote.txt" };
        let remote = self
            .commit(&self.writer, file, "remote\n", "remote commit")
            .await;
        git_cmd(&self.writer, &["push", "--quiet", "origin", "main"]).await;
        (local, remote)
    }

    async fn request(&self, selected: Option<&str>) -> Value {
        let task = git::task(&self.local).await.unwrap();
        json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"commitId":selected.unwrap_or(text(&task,"head")),"operationId":uuid::Uuid::new_v4().to_string()})
    }

    async fn push(&self, selected: Option<&str>) -> Result<Value> {
        self.service
            .handle(
                "pushCommit",
                self.request(selected).await,
                CancellationToken::new(),
            )
            .await
    }

    async fn lfs_diverge(&self) -> (String, String) {
        // Local-only LFS configuration; hooks are deliberately not installed.
        git_cmd(&self.local, &["lfs", "install", "--local", "--skip-repo"]).await;
        fs::write(
            self.local.join(".gitattributes"),
            "*.asset filter=lfs diff=lfs merge=lfs -text\n",
        )
        .unwrap();
        git_cmd(&self.local, &["add", ".gitattributes"]).await;
        git_cmd(&self.local, &["commit", "--quiet", "-m", "track assets"]).await;
        git_cmd(&self.local, &["push", "--quiet", "origin", "main"]).await;
        // The writer's origin is a local filesystem repository, not a network.
        git_cmd(
            &self.writer,
            &["pull", "--quiet", "--ff-only", "origin", "main"],
        )
        .await;
        git_cmd(&self.writer, &["lfs", "install", "--local", "--skip-repo"]).await;
        let local = self
            .commit(&self.local, "local.txt", "local\n", "local commit")
            .await;
        let remote = self
            .commit(
                &self.writer,
                "remote.asset",
                "remote asset contents\n",
                "remote LFS commit",
            )
            .await;
        git_cmd(&self.writer, &["push", "--quiet", "origin", "main"]).await;
        // An invalid scheme fails before networking, while the remote LFS
        // object is absent locally because the fixture does not upload it.
        git_cmd(
            &self.local,
            &["config", "lfs.url", "unsupported-fixture://invalid"],
        )
        .await;
        (local, remote)
    }
}

#[tokio::test]
async fn diverged_push_merges_and_returns_actual_remote_head() {
    if run_isolated("diverged_push_merges_and_returns_actual_remote_head").await {
        return;
    }
    let fixture = Fixture::new().await;
    let (local, remote) = fixture.diverge(false).await;
    let result = fixture.push(None).await.unwrap();
    let merged = text(&result, "commitId");
    assert_ne!(merged, local);
    assert_eq!(result["requestedCommitId"], local);
    assert_eq!(fixture.remote_head().await, merged);
    assert_eq!(
        git_cmd(&fixture.local, &["rev-parse", "HEAD^1"])
            .await
            .trim(),
        local
    );
    assert_eq!(
        git_cmd(&fixture.local, &["rev-parse", "HEAD^2"])
            .await
            .trim(),
        remote
    );
    assert_eq!(
        fs::read_to_string(fixture.local.join("local.txt")).unwrap(),
        "local\n"
    );
    assert_eq!(
        fs::read_to_string(fixture.local.join("remote.txt")).unwrap(),
        "remote\n"
    );
}

#[tokio::test]
async fn conflict_keeps_merge_state_and_never_pushes() {
    if run_isolated("conflict_keeps_merge_state_and_never_pushes").await {
        return;
    }
    let fixture = Fixture::new().await;
    let (local, remote) = fixture.diverge(true).await;
    let error = fixture.push(None).await.unwrap_err();
    assert!(
        error.contains("冲突") && error.contains("未执行 Push"),
        "{error}"
    );
    assert!(error.contains("shared.txt"), "{error}");
    assert!(fixture.local.join(".git/MERGE_HEAD").exists());
    assert_eq!(
        git_cmd(&fixture.local, &["rev-parse", "HEAD"]).await.trim(),
        local
    );
    assert_eq!(fixture.remote_head().await, remote);
    assert!(
        git_cmd(&fixture.local, &["diff", "--name-only", "--diff-filter=U"])
            .await
            .contains("shared.txt")
    );
}

#[tokio::test]
async fn failed_merge_hook_reports_unfinished_merge_without_inventing_conflicts() {
    if run_isolated("failed_merge_hook_reports_unfinished_merge_without_inventing_conflicts").await
    {
        return;
    }
    let fixture = Fixture::new().await;
    let (local, remote) = fixture.diverge(false).await;
    let hooks = fixture._temporary.path().join("failing-merge-hook");
    fs::create_dir(&hooks).unwrap();
    let hook = hooks.join("pre-merge-commit");
    fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o700)).unwrap();
    git_cmd(
        &fixture.local,
        &["config", "core.hooksPath", hooks.to_str().unwrap()],
    )
    .await;
    let error = fixture.push(None).await.unwrap_err();
    assert!(
        error.contains("签名或提交钩子") && error.contains("未执行 Push"),
        "{error}"
    );
    assert!(!error.contains("冲突文件"), "{error}");
    assert!(fixture.local.join(".git/MERGE_HEAD").exists());
    assert_eq!(
        git_cmd(&fixture.local, &["rev-parse", "HEAD"]).await.trim(),
        local
    );
    assert!(
        git_cmd(&fixture.local, &["diff", "--name-only", "--diff-filter=U"])
            .await
            .is_empty()
    );
    assert_eq!(fixture.remote_head().await, remote);
}

#[tokio::test]
async fn selected_historical_commit_never_expands_to_newer_local_commits() {
    if run_isolated("selected_historical_commit_never_expands_to_newer_local_commits").await {
        return;
    }
    let fixture = Fixture::new().await;
    let (local, remote) = fixture.diverge(false).await;
    let later = fixture
        .commit(
            &fixture.local,
            "later.txt",
            "private later\n",
            "later commit",
        )
        .await;
    let error = fixture.push(Some(&local)).await.unwrap_err();
    assert!(
        error.contains("历史提交") && error.contains("未推送"),
        "{error}"
    );
    assert_eq!(fixture.remote_head().await, remote);
    assert_eq!(
        git_cmd(&fixture.local, &["rev-parse", "HEAD"]).await.trim(),
        later
    );
    assert!(!fixture.local.join(".git/MERGE_HEAD").exists());
}

#[tokio::test]
async fn mismatched_fetch_and_push_remote_heads_are_not_merged_or_pushed() {
    if run_isolated("mismatched_fetch_and_push_remote_heads_are_not_merged_or_pushed").await {
        return;
    }
    let fixture = Fixture::new().await;
    let (local, remote) = fixture.diverge(false).await;
    git_cmd(
        &fixture.local,
        &[
            "remote",
            "set-url",
            "--push",
            "origin",
            "ssh://fixture@fixture.invalid:23/fixture/project.git",
        ],
    )
    .await;
    let other_before = git_cmd(&fixture.other, &["rev-parse", "refs/heads/main"]).await;
    // Give the push target an unrelated descendant that is not on the fetch target.
    let other_writer = fixture._temporary.path().join("other-writer");
    git_cmd(
        &fixture.writer,
        &[
            "clone",
            "--quiet",
            fixture.other.to_str().unwrap(),
            other_writer.to_str().unwrap(),
        ],
    )
    .await;
    for args in [
        vec!["config", "core.hooksPath", fixture.hooks.to_str().unwrap()],
        vec!["config", "user.name", "Fixture"],
        vec!["config", "user.email", "fixture@example.invalid"],
        vec!["config", "commit.gpgsign", "false"],
    ] {
        git_cmd(&other_writer, &args).await;
    }
    fixture
        .commit(&other_writer, "other.txt", "other target\n", "other target")
        .await;
    git_cmd(&other_writer, &["push", "--quiet", "origin", "main"]).await;
    let other_after = git_cmd(&fixture.other, &["rev-parse", "refs/heads/main"]).await;
    assert_ne!(other_before, other_after);
    let error = fixture.push(None).await.unwrap_err();
    assert!(
        error.contains("不同") && error.contains("未推送"),
        "{error}"
    );
    assert_eq!(
        git_cmd(&fixture.local, &["rev-parse", "HEAD"]).await.trim(),
        local
    );
    assert_eq!(fixture.remote_head().await, remote);
    assert_eq!(
        git_cmd(&fixture.other, &["rev-parse", "refs/heads/main"]).await,
        other_after
    );
}

#[tokio::test]
async fn push_integrates_its_own_target_not_a_differently_named_upstream() {
    if run_isolated("push_integrates_its_own_target_not_a_differently_named_upstream").await {
        return;
    }
    let fixture = Fixture::new().await;
    let (local, remote_main) = fixture.diverge(false).await;
    let alternate = fixture
        .commit(
            &fixture.writer,
            "alternate.txt",
            "different upstream\n",
            "alternate upstream",
        )
        .await;
    git_cmd(
        &fixture.writer,
        &["push", "--quiet", "origin", "HEAD:refs/heads/alternate"],
    )
    .await;
    git_cmd(
        &fixture.local,
        &["config", "branch.main.merge", "refs/heads/alternate"],
    )
    .await;
    let result = fixture.push(None).await.unwrap();
    assert_eq!(result["requestedCommitId"], local);
    assert_eq!(
        git_cmd(&fixture.local, &["rev-parse", "HEAD^2"])
            .await
            .trim(),
        remote_main
    );
    assert_eq!(fixture.remote_head().await, text(&result, "commitId"));
    assert_eq!(
        git_cmd(&fixture.remote, &["rev-parse", "refs/heads/alternate"])
            .await
            .trim(),
        alternate
    );
    assert!(!fixture.local.join("alternate.txt").exists());
}

#[tokio::test]
async fn staged_unstaged_and_untracked_files_survive_automatic_integration() {
    if run_isolated("staged_unstaged_and_untracked_files_survive_automatic_integration").await {
        return;
    }
    let fixture = Fixture::new().await;
    let (_, remote) = fixture.diverge(false).await;
    fs::write(fixture.local.join("keep.txt"), "staged content\n").unwrap();
    git_cmd(&fixture.local, &["add", "keep.txt"]).await;
    fs::write(fixture.local.join("keep.txt"), "working content\n").unwrap();
    fs::write(fixture.local.join("untracked.txt"), "untracked content\n").unwrap();
    let index_before = git_cmd(&fixture.local, &["show", ":keep.txt"]).await;
    let result = fixture.push(None).await;
    assert_eq!(
        git_cmd(&fixture.local, &["show", ":keep.txt"]).await,
        index_before
    );
    assert_eq!(
        fs::read_to_string(fixture.local.join("keep.txt")).unwrap(),
        "working content\n"
    );
    assert_eq!(
        fs::read_to_string(fixture.local.join("untracked.txt")).unwrap(),
        "untracked content\n"
    );
    if let Ok(result) = result {
        assert_eq!(
            git_cmd(&fixture.local, &["show", "HEAD:keep.txt"]).await,
            "original\n",
            "the merge must not commit unrelated staged content"
        );
        assert_eq!(fixture.remote_head().await, text(&result, "commitId"));
    } else if let Err(error) = result {
        assert!(
            error.contains("未执行 Push") || error.contains("未推送"),
            "{error}"
        );
        assert_eq!(fixture.remote_head().await, remote);
    }
}

#[tokio::test]
async fn remote_advance_during_push_is_rejected_without_force_push() {
    if run_isolated("remote_advance_during_push_is_rejected_without_force_push").await {
        return;
    }
    let fixture = Fixture::new().await;
    fixture.diverge(false).await;
    let raced = fixture
        .commit(
            &fixture.writer,
            "race.txt",
            "new remote work\n",
            "concurrent remote commit",
        )
        .await;
    // Transfer the object without moving main; the isolated pre-push hook can
    // now simulate another writer updating the real target ref concurrently.
    git_cmd(
        &fixture.writer,
        &["push", "--quiet", "origin", "HEAD:refs/fixture/race"],
    )
    .await;
    let race_hooks = fixture._temporary.path().join("race-hooks");
    fs::create_dir(&race_hooks).unwrap();
    git_cmd(
        &fixture.local,
        &["config", "core.hooksPath", race_hooks.to_str().unwrap()],
    )
    .await;
    let hook = race_hooks.join("pre-push");
    let marker = fixture._temporary.path().join("hook-ran");
    fs::write(
        &hook,
        format!(
            "#!/bin/sh\nprintf ran > '{}'\ngit --git-dir='{}' update-ref refs/heads/main '{}'\n",
            marker.display(),
            fixture.remote.display(),
            raced
        ),
    )
    .unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o700)).unwrap();
    let error = fixture.push(None).await.unwrap_err();
    assert!(marker.exists(), "pre-push hook was not called: {error}");
    assert_eq!(fixture.remote_head().await, raced);
    assert!(!fixture.local.join(".git/MERGE_HEAD").exists());
}

#[tokio::test]
async fn successful_push_with_missing_lfs_object_reports_hydration_warning() {
    if run_isolated("successful_push_with_missing_lfs_object_reports_hydration_warning").await {
        return;
    }
    let fixture = Fixture::new().await;
    if !lfs_available(&fixture.local).await {
        eprintln!("Git LFS is unavailable; skipping LFS-specific fixture");
        return;
    }
    let (_, remote) = fixture.lfs_diverge().await;
    let result = fixture.push(None).await.unwrap();
    assert!(text(&result, "warning").contains("LFS"), "{result}");
    assert_eq!(fixture.remote_head().await, text(&result, "commitId"));
    assert_eq!(
        git_cmd(&fixture.local, &["rev-parse", "HEAD^2"])
            .await
            .trim(),
        remote
    );
    assert!(fs::read_to_string(fixture.local.join("remote.asset"))
        .unwrap()
        .starts_with("version https://git-lfs.github.com/spec/v1"));
}

#[tokio::test]
async fn failed_push_after_lfs_hydration_failure_reports_both_outcomes() {
    if run_isolated("failed_push_after_lfs_hydration_failure_reports_both_outcomes").await {
        return;
    }
    let fixture = Fixture::new().await;
    if !lfs_available(&fixture.local).await {
        eprintln!("Git LFS is unavailable; skipping LFS-specific fixture");
        return;
    }
    let (_, remote) = fixture.lfs_diverge().await;
    let hooks = fixture._temporary.path().join("failing-push-hook");
    fs::create_dir(&hooks).unwrap();
    let hook = hooks.join("pre-push");
    fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o700)).unwrap();
    git_cmd(
        &fixture.local,
        &["config", "core.hooksPath", hooks.to_str().unwrap()],
    )
    .await;
    let error = fixture.push(None).await.unwrap_err();
    assert!(
        error.contains("LFS") && error.contains("合并已完成") && error.contains("推送结果"),
        "{error}"
    );
    assert_eq!(fixture.remote_head().await, remote);
    assert!(fs::read_to_string(fixture.local.join("remote.asset"))
        .unwrap()
        .starts_with("version https://git-lfs.github.com/spec/v1"));
}

#[tokio::test]
async fn failed_readback_never_reports_a_confirmed_push() {
    if run_isolated("failed_readback_never_reports_a_confirmed_push").await {
        return;
    }
    let fixture = Fixture::new().await;
    let (_, old_remote) = fixture.diverge(false).await;
    fs::write(fixture._temporary.path().join("arm-fail-readback"), "").unwrap();
    let error = fixture.push(None).await.unwrap_err();
    assert!(error.contains("无法确认远端结果"), "{error}");
    let new_remote = fixture.remote_head().await;
    assert_ne!(new_remote, old_remote);
    assert_eq!(
        git_cmd(&fixture.local, &["rev-parse", "HEAD"]).await.trim(),
        new_remote
    );
}

#[tokio::test]
async fn lfs_checkout_does_not_replace_a_modified_working_file() {
    if run_isolated("lfs_checkout_does_not_replace_a_modified_working_file").await {
        return;
    }
    let fixture = Fixture::new().await;
    if !lfs_available(&fixture.local).await {
        eprintln!("Git LFS is unavailable; skipping LFS-specific fixture");
        return;
    }
    git_cmd(
        &fixture.local,
        &["lfs", "install", "--local", "--skip-repo"],
    )
    .await;
    fs::write(
        fixture.local.join(".gitattributes"),
        "*.asset filter=lfs diff=lfs merge=lfs -text\n",
    )
    .unwrap();
    fs::write(
        fixture.local.join("tracked.asset"),
        "committed LFS content\n",
    )
    .unwrap();
    git_cmd(&fixture.local, &["add", ".gitattributes", "tracked.asset"]).await;
    git_cmd(&fixture.local, &["commit", "--quiet", "-m", "track asset"]).await;
    assert!(git_cmd(&fixture.local, &["show", "HEAD:tracked.asset"])
        .await
        .starts_with("version https://git-lfs.github.com/spec/v1"));
    fs::write(
        fixture.local.join("tracked.asset"),
        "user staged LFS content\n",
    )
    .unwrap();
    git_cmd(&fixture.local, &["add", "tracked.asset"]).await;
    let staged = git_cmd(&fixture.local, &["show", ":tracked.asset"]).await;
    fs::write(
        fixture.local.join("tracked.asset"),
        "user modified LFS content\n",
    )
    .unwrap();
    git_cmd(
        &fixture.local,
        &["config", "lfs.url", "unsupported-fixture://invalid"],
    )
    .await;
    let head = git_cmd(&fixture.local, &["rev-parse", "HEAD"]).await;
    let context = fixture.service.context("fixture:1").await.unwrap();
    let hydrated = context
        .network
        .hydrate(&fixture.local, head.trim(), None)
        .await;
    assert!(
        hydrated.is_ok(),
        "fixture hydration did not reach checkout: {hydrated:?}"
    );
    assert_eq!(
        fs::read_to_string(fixture.local.join("tracked.asset")).unwrap(),
        "user modified LFS content\n"
    );
    assert_eq!(
        git_cmd(&fixture.local, &["show", ":tracked.asset"]).await,
        staged
    );
}
