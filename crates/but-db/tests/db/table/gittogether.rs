use but_db::{GitTogetherMessage, GitTogetherOperation, GitTogetherSession, GitTogetherThread};

use crate::table::in_memory_db;

#[test]
fn persists_sessions_threads_messages_and_operations() -> anyhow::Result<()> {
    let mut db = in_memory_db();
    let session = GitTogetherSession {
        id: "session-1".into(),
        title: "Asset repair".into(),
        status: "active".into(),
        branch_ref: "refs/heads/gittogether/asset-repair".into(),
        worktree_path: "/tmp/session-1".into(),
        base_commit: "1111111".into(),
        target_ref: Some("refs/heads/main".into()),
        operation_type: "asset-repair".into(),
        touched_files: "[]".into(),
        touched_roots: "[]".into(),
        dirty_count: 0,
        conflict_count: 0,
        snapshot_commit: None,
        created_at: 1,
        updated_at: 1,
    };
    db.gittogether_mut().insert_session(&session)?;
    assert_eq!(db.gittogether().get_session(&session.id)?, Some(session));

    db.gittogether_mut().update_session_worktree_state(
        "session-1",
        r#"["Content/A.uasset"]"#,
        r#"["Content"]"#,
        1,
        1,
        2,
    )?;
    let live = db
        .gittogether()
        .get_session("session-1")?
        .expect("session exists");
    assert_eq!(live.dirty_count, 1);
    assert_eq!(live.conflict_count, 1);

    db.gittogether_mut().update_session_snapshot(
        "session-1",
        "snapshot",
        r#"["Content/A.uasset"]"#,
        r#"["Content"]"#,
        Some("2222222"),
        2,
    )?;
    let updated = db
        .gittogether()
        .get_session("session-1")?
        .expect("session exists");
    assert_eq!(updated.snapshot_commit.as_deref(), Some("2222222"));
    assert_eq!(updated.status, "snapshot");
    assert_eq!(updated.dirty_count, 0);
    assert_eq!(updated.conflict_count, 0);

    let thread = GitTogetherThread {
        id: "thread-1".into(),
        title: "Review changes".into(),
        status: "open".into(),
        session_id: Some("session-1".into()),
        branch_ref: Some("refs/heads/gittogether/asset-repair".into()),
        created_at: 3,
        updated_at: 3,
    };
    db.gittogether_mut().insert_thread(&thread)?;
    db.gittogether_mut().insert_message(&GitTogetherMessage {
        id: "message-1".into(),
        thread_id: thread.id.clone(),
        role: "user".into(),
        content: "Check the binary assets".into(),
        created_at: 4,
    })?;
    assert_eq!(db.gittogether().list_threads()?.len(), 1);
    assert_eq!(db.gittogether().list_messages(&thread.id)?.len(), 1);

    db.gittogether_mut()
        .insert_operation(&GitTogetherOperation {
            id: "operation-1".into(),
            kind: "snapshot".into(),
            state: "succeeded".into(),
            detail: "Created snapshot".into(),
            head_before: Some("1111111".into()),
            head_after: Some("2222222".into()),
            created_at: 5,
            updated_at: 5,
        })?;
    assert_eq!(db.gittogether().list_operations(10)?.len(), 1);
    Ok(())
}
