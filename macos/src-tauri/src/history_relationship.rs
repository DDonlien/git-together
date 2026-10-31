use crate::{git, util};
use std::path::Path;

/// An absent merge base is not proof of divergence: the history may be shallow,
/// unrelated, or unavailable. Never turn a Git read failure into a relationship.
#[derive(Debug, PartialEq, Eq)]
pub enum Relationship {
    Equal,
    Ahead {
        count: u64,
    },
    Behind {
        count: u64,
    },
    Diverged {
        ahead: u64,
        behind: u64,
        bases: Vec<String>,
    },
    Unknown,
}

pub async fn inspect(root: &Path, local: &str, remote: &str) -> util::Result<Relationship> {
    util::sha(local)?;
    util::sha(remote)?;
    if local == remote {
        return Ok(Relationship::Equal);
    }
    let output = git::merge_bases(root, local, remote).await?;
    let bases: Vec<String> = output
        .lines()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
        .collect();
    if bases.is_empty() {
        return Ok(Relationship::Unknown);
    }
    if bases.iter().any(|base| !util::valid_sha(base)) {
        return Err("共同祖先返回格式无效，无法确认历史关系。".into());
    }
    let range = format!("{local}...{remote}");
    let counts = git::read(root, &["rev-list", "--left-right", "--count", &range]).await?;
    let values: Vec<_> = counts.split_whitespace().collect();
    if values.len() != 2 {
        return Err("提交数量返回格式无效，无法确认历史关系。".into());
    }
    let ahead = values[0].parse::<u64>().map_err(|_| "本地提交数量无效。")?;
    let behind = values[1].parse::<u64>().map_err(|_| "远端提交数量无效。")?;
    match (ahead, behind) {
        (0, 0) => Err("不同提交的历史关系无法确认。".into()),
        (count, 0) => Ok(Relationship::Ahead { count }),
        (0, count) => Ok(Relationship::Behind { count }),
        (ahead, behind) => Ok(Relationship::Diverged {
            ahead,
            behind,
            bases,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn git(root: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .current_dir(root)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).unwrap().trim().to_owned()
    }

    #[tokio::test]
    async fn verifies_common_ancestry_without_touching_head_or_index() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path();
        git(root, &["init", "--quiet"]);
        git(root, &["config", "user.name", "Test"]);
        git(root, &["config", "user.email", "test@example.invalid"]);
        std::fs::write(root.join("file"), "base\n").unwrap();
        git(root, &["add", "file"]);
        git(root, &["commit", "--quiet", "-m", "base"]);
        let base = git(root, &["rev-parse", "HEAD"]);
        let tree = git(root, &["rev-parse", "HEAD^{tree}"]);
        let local = git(root, &["commit-tree", &tree, "-p", &base, "-m", "local"]);
        let remote = git(root, &["commit-tree", &tree, "-p", &base, "-m", "remote"]);
        let unrelated = git(root, &["commit-tree", &tree, "-m", "unrelated"]);
        std::fs::write(root.join("file"), "staged\n").unwrap();
        git(root, &["add", "file"]);
        std::fs::write(root.join("file"), "unstaged\n").unwrap();
        let status = git(root, &["status", "--porcelain=v1"]);
        let index = std::fs::read(root.join(".git/index")).unwrap();

        assert_eq!(
            inspect(root, &base, &base).await.unwrap(),
            Relationship::Equal
        );
        assert_eq!(
            inspect(root, &local, &base).await.unwrap(),
            Relationship::Ahead { count: 1 }
        );
        assert_eq!(
            inspect(root, &base, &remote).await.unwrap(),
            Relationship::Behind { count: 1 }
        );
        assert_eq!(
            inspect(root, &local, &remote).await.unwrap(),
            Relationship::Diverged {
                ahead: 1,
                behind: 1,
                bases: vec![base.clone()]
            }
        );
        assert_eq!(
            inspect(root, &local, &unrelated).await.unwrap(),
            Relationship::Unknown
        );
        assert!(inspect(root, &local, &"a".repeat(40)).await.is_err());
        assert_eq!(git(root, &["rev-parse", "HEAD"]), base);
        assert_eq!(git(root, &["status", "--porcelain=v1"]), status);
        assert_eq!(std::fs::read(root.join(".git/index")).unwrap(), index);
        assert_eq!(
            std::fs::read_to_string(root.join("file")).unwrap(),
            "unstaged\n"
        );
    }
}
