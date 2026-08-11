#![allow(missing_docs)]

use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

use crate::{DbHandle, M, SchemaVersion, Transaction};

pub(crate) const M: &[M<'static>] = &[
    M::up(
        20260811234000,
        SchemaVersion::Zero,
        "CREATE TABLE `gittogether_sessions`(
    `id` TEXT NOT NULL PRIMARY KEY,
    `title` TEXT NOT NULL,
    `status` TEXT NOT NULL,
    `branch_ref` TEXT NOT NULL,
    `worktree_path` TEXT NOT NULL,
    `base_commit` TEXT NOT NULL,
    `target_ref` TEXT,
    `operation_type` TEXT NOT NULL,
    `touched_files` TEXT NOT NULL DEFAULT '[]',
    `touched_roots` TEXT NOT NULL DEFAULT '[]',
    `snapshot_commit` TEXT,
    `created_at` INTEGER NOT NULL,
    `updated_at` INTEGER NOT NULL
);

CREATE INDEX `index_gittogether_sessions_on_updated_at`
    ON `gittogether_sessions` (`updated_at` DESC);

CREATE TABLE `gittogether_threads`(
    `id` TEXT NOT NULL PRIMARY KEY,
    `title` TEXT NOT NULL,
    `status` TEXT NOT NULL,
    `session_id` TEXT,
    `branch_ref` TEXT,
    `created_at` INTEGER NOT NULL,
    `updated_at` INTEGER NOT NULL
);

CREATE INDEX `index_gittogether_threads_on_updated_at`
    ON `gittogether_threads` (`updated_at` DESC);

CREATE TABLE `gittogether_messages`(
    `id` TEXT NOT NULL PRIMARY KEY,
    `thread_id` TEXT NOT NULL REFERENCES `gittogether_threads` (`id`),
    `role` TEXT NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` INTEGER NOT NULL
);

CREATE INDEX `index_gittogether_messages_on_thread`
    ON `gittogether_messages` (`thread_id`, `created_at` ASC);

CREATE TABLE `gittogether_operations`(
    `id` TEXT NOT NULL PRIMARY KEY,
    `kind` TEXT NOT NULL,
    `state` TEXT NOT NULL,
    `detail` TEXT NOT NULL,
    `head_before` TEXT,
    `head_after` TEXT,
    `created_at` INTEGER NOT NULL,
    `updated_at` INTEGER NOT NULL
);

CREATE INDEX `index_gittogether_operations_on_updated_at`
    ON `gittogether_operations` (`updated_at` DESC);",
    ),
    M::up(
        20260812001000,
        SchemaVersion::Zero,
        "ALTER TABLE `gittogether_sessions`
            ADD COLUMN `dirty_count` INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE `gittogether_sessions`
            ADD COLUMN `conflict_count` INTEGER NOT NULL DEFAULT 0;",
    ),
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTogetherSession {
    pub id: String,
    pub title: String,
    pub status: String,
    pub branch_ref: String,
    pub worktree_path: String,
    pub base_commit: String,
    pub target_ref: Option<String>,
    pub operation_type: String,
    pub touched_files: String,
    pub touched_roots: String,
    pub dirty_count: i64,
    pub conflict_count: i64,
    pub snapshot_commit: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTogetherThread {
    pub id: String,
    pub title: String,
    pub status: String,
    pub session_id: Option<String>,
    pub branch_ref: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTogetherMessage {
    pub id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTogetherOperation {
    pub id: String,
    pub kind: String,
    pub state: String,
    pub detail: String,
    pub head_before: Option<String>,
    pub head_after: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl DbHandle {
    pub fn gittogether(&self) -> GitTogetherHandle<'_> {
        GitTogetherHandle { conn: &self.conn }
    }

    pub fn gittogether_mut(&mut self) -> GitTogetherHandleMut<'_> {
        GitTogetherHandleMut { conn: &self.conn }
    }
}

impl<'conn> Transaction<'conn> {
    pub fn gittogether(&self) -> GitTogetherHandle<'_> {
        GitTogetherHandle { conn: self.inner() }
    }

    pub fn gittogether_mut(&mut self) -> GitTogetherHandleMut<'_> {
        GitTogetherHandleMut { conn: self.inner() }
    }
}

pub struct GitTogetherHandle<'conn> {
    conn: &'conn rusqlite::Connection,
}

pub struct GitTogetherHandleMut<'conn> {
    conn: &'conn rusqlite::Connection,
}

impl GitTogetherHandle<'_> {
    pub fn get_session(&self, id: &str) -> rusqlite::Result<Option<GitTogetherSession>> {
        self.conn
            .query_row(
                "SELECT id, title, status, branch_ref, worktree_path, base_commit, target_ref, operation_type, touched_files, touched_roots, dirty_count, conflict_count, snapshot_commit, created_at, updated_at
                 FROM gittogether_sessions WHERE id = ?1",
                [id],
                session_from_row,
            )
            .optional()
    }

    pub fn list_sessions(&self) -> rusqlite::Result<Vec<GitTogetherSession>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, status, branch_ref, worktree_path, base_commit, target_ref, operation_type, touched_files, touched_roots, dirty_count, conflict_count, snapshot_commit, created_at, updated_at
             FROM gittogether_sessions ORDER BY updated_at DESC, id ASC",
        )?;
        stmt.query_map([], session_from_row)?.collect()
    }

    pub fn list_threads(&self) -> rusqlite::Result<Vec<GitTogetherThread>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, status, session_id, branch_ref, created_at, updated_at
             FROM gittogether_threads ORDER BY updated_at DESC, id ASC",
        )?;
        stmt.query_map([], |row| {
            Ok(GitTogetherThread {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                session_id: row.get(3)?,
                branch_ref: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .collect()
    }

    pub fn list_messages(&self, thread_id: &str) -> rusqlite::Result<Vec<GitTogetherMessage>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, thread_id, role, content, created_at
             FROM gittogether_messages WHERE thread_id = ?1 ORDER BY created_at ASC, id ASC",
        )?;
        stmt.query_map([thread_id], |row| {
            Ok(GitTogetherMessage {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect()
    }

    pub fn list_operations(&self, limit: usize) -> rusqlite::Result<Vec<GitTogetherOperation>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kind, state, detail, head_before, head_after, created_at, updated_at
             FROM gittogether_operations ORDER BY updated_at DESC, id ASC LIMIT ?1",
        )?;
        stmt.query_map([limit as i64], |row| {
            Ok(GitTogetherOperation {
                id: row.get(0)?,
                kind: row.get(1)?,
                state: row.get(2)?,
                detail: row.get(3)?,
                head_before: row.get(4)?,
                head_after: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?
        .collect()
    }
}

impl GitTogetherHandleMut<'_> {
    pub fn insert_session(&mut self, value: &GitTogetherSession) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO gittogether_sessions
             (id, title, status, branch_ref, worktree_path, base_commit, target_ref, operation_type, touched_files, touched_roots, dirty_count, conflict_count, snapshot_commit, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                value.id,
                value.title,
                value.status,
                value.branch_ref,
                value.worktree_path,
                value.base_commit,
                value.target_ref,
                value.operation_type,
                value.touched_files,
                value.touched_roots,
                value.dirty_count,
                value.conflict_count,
                value.snapshot_commit,
                value.created_at,
                value.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_session_snapshot(
        &mut self,
        id: &str,
        status: &str,
        touched_files: &str,
        touched_roots: &str,
        snapshot_commit: Option<&str>,
        updated_at: i64,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE gittogether_sessions
             SET status = ?1, touched_files = ?2, touched_roots = ?3, dirty_count = 0,
                 conflict_count = 0, snapshot_commit = ?4, updated_at = ?5
             WHERE id = ?6",
            rusqlite::params![
                status,
                touched_files,
                touched_roots,
                snapshot_commit,
                updated_at,
                id
            ],
        )?;
        Ok(())
    }

    pub fn update_session_worktree_state(
        &mut self,
        id: &str,
        touched_files: &str,
        touched_roots: &str,
        dirty_count: i64,
        conflict_count: i64,
        updated_at: i64,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE gittogether_sessions
             SET touched_files = ?1, touched_roots = ?2, dirty_count = ?3,
                 conflict_count = ?4, updated_at = ?5
             WHERE id = ?6 AND status = 'active'",
            rusqlite::params![
                touched_files,
                touched_roots,
                dirty_count,
                conflict_count,
                updated_at,
                id
            ],
        )?;
        Ok(())
    }

    pub fn insert_thread(&mut self, value: &GitTogetherThread) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO gittogether_threads
             (id, title, status, session_id, branch_ref, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                value.id,
                value.title,
                value.status,
                value.session_id,
                value.branch_ref,
                value.created_at,
                value.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn touch_thread(&mut self, id: &str, updated_at: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE gittogether_threads SET updated_at = ?1 WHERE id = ?2",
            rusqlite::params![updated_at, id],
        )?;
        Ok(())
    }

    pub fn insert_message(&mut self, value: &GitTogetherMessage) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO gittogether_messages (id, thread_id, role, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                value.id,
                value.thread_id,
                value.role,
                value.content,
                value.created_at,
            ],
        )?;
        self.touch_thread(&value.thread_id, value.created_at)
    }

    pub fn insert_operation(&mut self, value: &GitTogetherOperation) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO gittogether_operations
             (id, kind, state, detail, head_before, head_after, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                value.id,
                value.kind,
                value.state,
                value.detail,
                value.head_before,
                value.head_after,
                value.created_at,
                value.updated_at,
            ],
        )?;
        Ok(())
    }
}

fn session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GitTogetherSession> {
    Ok(GitTogetherSession {
        id: row.get(0)?,
        title: row.get(1)?,
        status: row.get(2)?,
        branch_ref: row.get(3)?,
        worktree_path: row.get(4)?,
        base_commit: row.get(5)?,
        target_ref: row.get(6)?,
        operation_type: row.get(7)?,
        touched_files: row.get(8)?,
        touched_roots: row.get(9)?,
        dirty_count: row.get(10)?,
        conflict_count: row.get(11)?,
        snapshot_commit: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}
