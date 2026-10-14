use super::*;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json, Router};
use std::collections::BTreeSet;

const BASE: &str = "/repos/fixture/imported";
const HEAD: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TREE: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

struct Fixture {
    responses: BTreeMap<String, Value>,
    failures: BTreeMap<String, StatusCode>,
    next_pages: BTreeSet<String>,
    calls: Mutex<Vec<String>>,
}

impl Fixture {
    fn new(commits: Vec<Value>) -> Self {
        Self {
            responses: BTreeMap::from([
                ("/user".into(), json!({"login":"current"})),
                (
                    "/user/emails".into(),
                    json!([{"email":"current@example.test","verified":true}]),
                ),
                (
                    BASE.into(),
                    json!({"id":1,"created_at":"2026-10-13T00:00:00Z","fork":true,"original_url":"https://github.com/foreign/project"}),
                ),
                (
                    format!("{BASE}/branches"),
                    json!([{"name":"main","commit":{"id":HEAD}},{"name":"feature","commit":{"id":HEAD}}]),
                ),
                (format!("{BASE}/commits"), json!(commits)),
                (format!("{BASE}/commits?page=2"), json!([])),
                (
                    format!("{BASE}/git/trees/{TREE}"),
                    json!({"tree":[],"truncated":false}),
                ),
                (
                    format!("{BASE}/activities/feeds"),
                    json!([{"op_type":"create_repo","repo_id":1,"act_user":{"login":"other"}}]),
                ),
            ]),
            failures: BTreeMap::new(),
            next_pages: BTreeSet::new(),
            calls: Mutex::new(vec![]),
        }
    }
}

struct TestProvider {
    provider: Provider,
    fixture: Arc<Fixture>,
    server: tokio::task::JoinHandle<()>,
}

impl Drop for TestProvider {
    fn drop(&mut self) {
        self.server.abort();
    }
}

async fn serve(fixture: Fixture) -> TestProvider {
    async fn read(
        State(fixture): State<Arc<Fixture>>,
        uri: axum::http::Uri,
    ) -> axum::response::Response {
        let path = uri.path().strip_prefix("/api/v1").unwrap().to_owned();
        let page = url::form_urlencoded::parse(uri.query().unwrap_or("").as_bytes())
            .find(|(key, _)| key == "page")
            .map(|(_, value)| value.into_owned());
        let key = match page.as_deref() {
            Some(page) if page != "1" => format!("{path}?page={page}"),
            _ => path.clone(),
        };
        fixture.calls.lock().await.push(key.clone());
        if let Some(status) = fixture.failures.get(&path) {
            return (*status, Json(json!({"message":"fixture upstream failure"}))).into_response();
        }
        let Some(body) = fixture.responses.get(&key) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        let mut response = Json(body.clone()).into_response();
        if fixture.next_pages.contains(&path) {
            response.headers_mut().insert(
                "link",
                "<http://127.0.0.1/next>; rel=\"next\"".parse().unwrap(),
            );
        }
        response
    }
    let fixture = Arc::new(fixture);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let host = format!("http://{}", listener.local_addr().unwrap());
    let app = Router::new().fallback(read).with_state(fixture.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let provider = Provider::new(
        json!({"id":"fixture-account","provider":"gitea","host":host,"login":"current"}),
        "fixture-only".into(),
        client().unwrap(),
    );
    TestProvider {
        provider,
        fixture,
        server,
    }
}

fn repository() -> Value {
    json!({"id":"fixture-account:1","remoteId":1,"fullName":"fixture/imported","defaultBranch":"main"})
}

fn commit(id: &str, email: Option<&str>, login: Option<&str>, parents: &[&str]) -> Value {
    json!({
        "sha":id,"author":login.map(|login| json!({"login":login})),
        "commit":{"message":"Imported history","author":{"name":"Original author","email":email,"date":"2026-10-12T00:00:00Z"},"tree":{"sha":TREE}},
        "parents":parents.iter().map(|id| json!({"sha":id})).collect::<Vec<_>>()
    })
}

fn push(id: &str, actor: &str) -> Value {
    json!({"op_type":"commit_repo","repo_id":1,"act_user":{"login":actor},"content":json!({"Commits":[{"Sha1":id}],"HeadCommit":{"Sha1":id}}).to_string()})
}

#[tokio::test]
async fn authenticated_push_preserves_branches_when_git_email_is_different() {
    let mut data = Fixture::new(vec![commit(
        HEAD,
        Some("git@personal.example.test"),
        None,
        &[],
    )]);
    data.responses.insert(
        "/user/emails".into(),
        json!([{"email":"account@work.example.test","verified":true}]),
    );
    data.responses.insert(
        format!("{BASE}/activities/feeds"),
        json!([push(HEAD, "CURRENT")]),
    );
    let fixture = serve(data).await;
    let workspace = fixture
        .provider
        .workspace(&repository(), &CancellationToken::new(), true)
        .await
        .unwrap();
    assert_eq!(workspace["warnings"], json!([]));
    for task in workspace["tasks"].as_array().unwrap() {
        assert_eq!(task["hasAccountPush"], true);
        assert_eq!(task["hasAccountCommits"], false);
        assert!(task["participationError"].is_null());
    }
}

#[tokio::test]
async fn branch_creation_activity_without_content_is_not_push_evidence() {
    for has_push in [false, true] {
        let mut creation = push(HEAD, "current");
        creation["content"] = json!("");
        creation["ref_name"] = json!("refs/heads/main");
        let mut activities = vec![creation];
        if has_push {
            activities.push(push(HEAD, "current"));
        }
        let mut data = Fixture::new(vec![commit(HEAD, Some("foreign@example.test"), None, &[])]);
        data.responses.insert(format!("{BASE}/activities/feeds"), json!(activities));
        let fixture = serve(data).await;
        let proof = fixture.provider.account_participation(&repository(), HEAD, &CancellationToken::new()).await.unwrap();
        assert_eq!(proof, json!({"hasAccountCommits":false,"hasAccountPush":has_push}));
    }
}

#[tokio::test]
async fn push_actor_repo_and_branch_ancestry_are_required() {
    let other = "cccccccccccccccccccccccccccccccccccccccc";
    for scenario in [
        "other-actor",
        "unrelated-commit",
        "compare-url-only",
        "other-repo",
        "missing-actor",
        "malformed-content",
        "missing-content",
        "non-string-content",
        "whitespace-content",
    ] {
        let mut activity = push(HEAD, "current");
        match scenario {
            "other-actor" => activity["act_user"]["login"] = json!("other"),
            "unrelated-commit" => activity = push(other, "current"),
            "compare-url-only" => activity["content"] = json!(json!({"Commits":[],"HeadCommit":{"Sha1":other},"CompareURL":format!("compare/{HEAD}...{other}"),"Message":HEAD}).to_string()),
            "other-repo" => activity["repo_id"] = json!(2),
            "missing-actor" => activity["act_user"] = Value::Null,
            "malformed-content" => activity["content"] = json!("not-json"),
            "missing-content" => { activity.as_object_mut().unwrap().remove("content"); },
            "non-string-content" => activity["content"] = Value::Null,
            "whitespace-content" => activity["content"] = json!(" "),
            _ => unreachable!(),
        }
        let mut data = Fixture::new(vec![commit(HEAD, Some("foreign@example.test"), None, &[])]);
        data.responses
            .insert(format!("{BASE}/activities/feeds"), json!([activity]));
        let fixture = serve(data).await;
        let proof = fixture
            .provider
            .account_participation(&repository(), HEAD, &CancellationToken::new())
            .await;
        if matches!(
            scenario,
            "other-repo" | "missing-actor" | "malformed-content" | "missing-content" | "non-string-content" | "whitespace-content"
        ) {
            assert!(
                proof.unwrap_err().contains("推送记录核对未完成"),
                "{scenario}"
            );
        } else {
            assert_eq!(
                proof.unwrap(),
                json!({"hasAccountCommits":false,"hasAccountPush":false}),
                "{scenario}"
            );
        }
    }
}

#[tokio::test]
async fn push_pagination_works_without_link_and_denied_reads_stay_unknown() {
    let mut data = Fixture::new(vec![commit(HEAD, Some("foreign@example.test"), None, &[])]);
    data.responses.insert(
        format!("{BASE}/activities/feeds"),
        json!(vec![push(HEAD, "other"); 50]),
    );
    data.responses.insert(
        format!("{BASE}/activities/feeds?page=2"),
        json!([push(HEAD, "current")]),
    );
    let fixture = serve(data).await;
    assert_eq!(
        fixture
            .provider
            .account_participation(&repository(), HEAD, &CancellationToken::new())
            .await
            .unwrap()["hasAccountPush"],
        true
    );
    assert!(fixture
        .fixture
        .calls
        .lock()
        .await
        .contains(&format!("{BASE}/activities/feeds?page=2")));

    let mut data = Fixture::new(vec![commit(HEAD, Some("foreign@example.test"), None, &[])]);
    data.failures
        .insert(format!("{BASE}/activities/feeds"), StatusCode::FORBIDDEN);
    let fixture = serve(data).await;
    let workspace = fixture
        .provider
        .workspace(&repository(), &CancellationToken::new(), true)
        .await
        .unwrap();
    assert!(workspace["tasks"][0]["hasAccountCommits"].is_null());
    assert!(text(&workspace["tasks"][0], "participationError").contains("推送记录核对未完成"));

    let mut data = Fixture::new(vec![commit(HEAD, Some("foreign@example.test"), None, &[])]);
    for page in 1..=10 {
        let key = if page == 1 {
            format!("{BASE}/activities/feeds")
        } else {
            format!("{BASE}/activities/feeds?page={page}")
        };
        data.responses
            .insert(key, json!(vec![push(HEAD, "other"); 50]));
    }
    let fixture = serve(data).await;
    assert!(fixture
        .provider
        .account_participation(&repository(), HEAD, &CancellationToken::new())
        .await
        .unwrap_err()
        .contains("最多500条"));
}

#[tokio::test]
async fn positive_push_survives_incomplete_author_identity_and_history() {
    let parent = "cccccccccccccccccccccccccccccccccccccccc";
    let mut data = Fixture::new(vec![commit(
        HEAD,
        Some("foreign@example.test"),
        None,
        &[parent],
    )]);
    data.failures
        .insert("/user/emails".into(), StatusCode::FORBIDDEN);
    data.responses.insert(
        format!("{BASE}/activities/feeds"),
        json!([push(HEAD, "current")]),
    );
    let fixture = serve(data).await;
    assert_eq!(
        fixture
            .provider
            .account_participation(&repository(), HEAD, &CancellationToken::new())
            .await
            .unwrap(),
        json!({"hasAccountPush":true})
    );
}

#[tokio::test]
async fn imported_foreign_authors_are_a_normal_negative_result() {
    let fixture = serve(Fixture::new(vec![commit(
        HEAD,
        Some("foreign@example.test"),
        None,
        &[],
    )]))
    .await;
    let workspace = fixture
        .provider
        .workspace(&repository(), &CancellationToken::new(), true)
        .await
        .unwrap();
    assert_eq!(workspace["complete"], true);
    assert_eq!(workspace["warnings"], json!([]));
    for task in workspace["tasks"].as_array().unwrap() {
        assert_eq!(task["hasAccountCommits"], false);
        assert!(task["participationError"].is_null());
        assert!(task["hasAccountCreation"].is_null());
    }
    fixture
        .provider
        .account_participation(&repository(), HEAD, &CancellationToken::new())
        .await
        .unwrap();
    assert!(fixture
        .fixture
        .calls
        .lock()
        .await
        .iter()
        .any(|path| path.ends_with("activities/feeds")));
}

#[tokio::test]
async fn verified_email_and_platform_account_are_positive_evidence() {
    for (email, login) in [
        ("CURRENT@EXAMPLE.TEST", None),
        ("different@example.test", Some("CURRENT")),
    ] {
        let fixture = serve(Fixture::new(vec![commit(HEAD, Some(email), login, &[])])).await;
        assert_eq!(
            fixture
                .provider
                .account_participation(&repository(), HEAD, &CancellationToken::new())
                .await
                .unwrap()["hasAccountCommits"],
            true
        );
        if login.is_some() {
            assert!(!fixture
                .fixture
                .calls
                .lock()
                .await
                .contains(&"/user/emails".into()));
        }
    }
    let mut data = Fixture::new(vec![commit(HEAD, Some("legacy@example.test"), None, &[])]);
    data.responses.insert("/user/emails".into(), json!([{"email":"current@example.test","verified":true},{"email":"legacy@example.test","verified":false}]));
    let fixture = serve(data).await;
    assert_eq!(
        fixture
            .provider
            .account_participation(&repository(), HEAD, &CancellationToken::new())
            .await
            .unwrap()["hasAccountCommits"],
        false
    );
}

#[tokio::test]
async fn incomplete_identity_data_remains_unknown() {
    for scenario in [
        "denied",
        "no-emails",
        "unverified-only",
        "wrong-account",
        "malformed-emails",
        "email-pagination",
        "missing-author-email",
    ] {
        let mut data = Fixture::new(vec![commit(HEAD, Some("foreign@example.test"), None, &[])]);
        match scenario {
            "denied" => {
                data.failures
                    .insert("/user/emails".into(), StatusCode::FORBIDDEN);
            }
            "no-emails" => {
                data.responses.insert("/user/emails".into(), json!([]));
            }
            "unverified-only" => {
                data.responses.insert(
                    "/user/emails".into(),
                    json!([{"email":"current@example.test","verified":false}]),
                );
            }
            "wrong-account" => {
                data.responses
                    .insert("/user".into(), json!({"login":"other"}));
            }
            "malformed-emails" => {
                data.responses.insert("/user/emails".into(), json!({}));
            }
            "email-pagination" => {
                data.next_pages.insert("/user/emails".into());
            }
            "missing-author-email" => {
                data.responses.insert(
                    format!("{BASE}/commits"),
                    json!([commit(HEAD, None, None, &[])]),
                );
            }
            _ => unreachable!(),
        }
        let fixture = serve(data).await;
        let workspace = fixture
            .provider
            .workspace(&repository(), &CancellationToken::new(), true)
            .await
            .unwrap();
        for task in workspace["tasks"].as_array().unwrap() {
            assert!(task["hasAccountCommits"].is_null(), "{scenario}");
            assert!(
                text(task, "participationError").contains("无法判断是否包含当前账号的提交"),
                "{scenario}"
            );
            assert_eq!(task["error"], "", "{scenario}");
        }
        assert!(
            !workspace["warnings"].as_array().unwrap().is_empty(),
            "{scenario}"
        );
    }
}

#[tokio::test]
async fn incomplete_history_is_unknown_but_later_positive_evidence_wins() {
    let parent = "cccccccccccccccccccccccccccccccccccccccc";
    let fixture = serve(Fixture::new(vec![commit(
        HEAD,
        Some("foreign@example.test"),
        None,
        &[parent],
    )]))
    .await;
    let error = fixture
        .provider
        .account_participation(&repository(), HEAD, &CancellationToken::new())
        .await
        .unwrap_err();
    assert!(error.contains("分支历史尚未完整确认"));
    let mut data = Fixture::new(vec![
        commit(HEAD, Some("foreign@example.test"), None, &[parent]),
        commit(parent, Some("current@example.test"), Some("current"), &[]),
    ]);
    data.failures
        .insert("/user/emails".into(), StatusCode::FORBIDDEN);
    let fixture = serve(data).await;
    assert_eq!(
        fixture
            .provider
            .account_participation(&repository(), HEAD, &CancellationToken::new())
            .await
            .unwrap()["hasAccountCommits"],
        true
    );
}

#[tokio::test]
async fn import_creation_and_commit_authorship_stay_separate() {
    for (actor, activity_present) in [
        (Some("current"), true),
        (Some("other"), true),
        (None, true),
        (None, false),
    ] {
        let mut data = Fixture::new(vec![commit(HEAD, Some("foreign@example.test"), None, &[])]);
        data.responses.insert(
            format!("{BASE}/branches"),
            json!([{"name":"main","commit":{"id":HEAD}}]),
        );
        data.responses.insert(format!("{BASE}/activities/feeds"), if activity_present { json!([{"op_type":"create_repo","repo_id":1,"act_user":actor.map(|login| json!({"login":login})),"user_id":1}]) } else { json!([]) });
        let fixture = serve(data).await;
        let workspace = fixture
            .provider
            .workspace(&repository(), &CancellationToken::new(), true)
            .await
            .unwrap();
        let task = &workspace["tasks"][0];
        assert_eq!(task["hasAccountCommits"], false);
        match actor {
            Some(actor) => {
                assert_eq!(task["hasAccountCreation"], actor == "current");
                assert_eq!(workspace["warnings"], json!([]));
            }
            None => {
                assert!(task["hasAccountCreation"].is_null());
                assert!(
                    text(task, "participationError").contains(if activity_present {
                        "仓库创建者身份无法确认"
                    } else {
                        "未找到可核对的仓库创建活动"
                    })
                );
            }
        }
    }
}

#[tokio::test]
async fn default_mode_skips_participation_reads_and_negative_results_are_cached() {
    let fixture = serve(Fixture::new(vec![commit(
        HEAD,
        Some("foreign@example.test"),
        None,
        &[],
    )]))
    .await;
    let workspace = fixture
        .provider
        .workspace(&repository(), &CancellationToken::new(), false)
        .await
        .unwrap();
    assert!(workspace["tasks"][0]["hasAccountCommits"].is_null());
    assert!(!fixture
        .fixture
        .calls
        .lock()
        .await
        .contains(&"/user/emails".into()));
    for _ in 0..2 {
        assert_eq!(
            fixture
                .provider
                .account_participation(&repository(), HEAD, &CancellationToken::new())
                .await
                .unwrap()["hasAccountCommits"],
            false
        );
    }
    assert_eq!(
        fixture
            .fixture
            .calls
            .lock()
            .await
            .iter()
            .filter(|path| *path == "/user/emails")
            .count(),
        1
    );
}
