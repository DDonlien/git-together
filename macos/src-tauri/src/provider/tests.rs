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
    total_counts: BTreeMap<String, String>,
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
            total_counts: BTreeMap::new(),
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
        if let Some(total) = fixture.total_counts.get(&path) {
            response.headers_mut().insert("x-total-count", total.parse().unwrap());
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

#[tokio::test]
async fn gitea_null_empty_repository_is_a_complete_workspace() {
    for include_total in [false, true] {
        let mut fixture = Fixture::new(vec![]);
        fixture.responses.insert(format!("{BASE}/branches"), Value::Null);
        if include_total {
            fixture.total_counts.insert(format!("{BASE}/branches"), "0".into());
        }
        let test = serve(fixture).await;
        let workspace = test.provider.workspace(&repository(), &CancellationToken::new(), false).await.unwrap();
        assert_eq!(workspace["tasks"], json!([]));
        assert_eq!(workspace["commits"], json!([]));
        assert_eq!(workspace["complete"], true);
        assert_eq!(workspace["branchesComplete"], true);
        assert_eq!(workspace["warnings"], json!([]));
        assert_eq!(*test.fixture.calls.lock().await, vec![format!("{BASE}/branches")]);
    }
}

#[tokio::test]
async fn invalid_branch_objects_and_contradictory_null_headers_are_not_empty_repositories() {
    for (body, has_next, total) in [
        (json!({"unexpected": true}), false, "0"),
        (Value::Null, true, "0"),
        (Value::Null, false, "1"),
        (Value::Null, false, "invalid"),
    ] {
        let mut fixture = Fixture::new(vec![]);
        let path = format!("{BASE}/branches");
        fixture.responses.insert(path.clone(), body);
        if has_next {
            fixture.next_pages.insert(path.clone());
        }
        fixture.total_counts.insert(path, total.into());
        let test = serve(fixture).await;
        let error = test.provider.branches(&repository(), &CancellationToken::new()).await.unwrap_err();
        assert!(error.contains("远端分支返回格式无效"), "{error}");
    }
}

#[tokio::test]
async fn null_on_later_branch_page_does_not_discard_previously_read_branches() {
    let mut fixture = Fixture::new(vec![]);
    fixture.next_pages.insert(format!("{BASE}/branches"));
    fixture.responses.insert(format!("{BASE}/branches?page=2"), Value::Null);
    let test = serve(fixture).await;
    let error = test.provider.branches(&repository(), &CancellationToken::new()).await.unwrap_err();
    assert!(error.contains("远端分支返回格式无效"), "{error}");
}

#[tokio::test]
async fn forbidden_branch_reads_still_report_permission_errors() {
    let mut fixture = Fixture::new(vec![]);
    fixture.failures.insert(format!("{BASE}/branches"), StatusCode::FORBIDDEN);
    let test = serve(fixture).await;
    let error = test.provider.branches(&repository(), &CancellationToken::new()).await.unwrap_err();
    assert!(error.contains("HTTP 403"), "{error}");
}

fn commit(id: &str, email: Option<&str>, login: Option<&str>, parents: &[&str]) -> Value {
    json!({
        "sha":id,"author":login.map(|login| json!({"login":login})),
        "commit":{"message":"Imported history","author":{"name":"Original author","email":email,"date":"2026-10-12T00:00:00Z"},"tree":{"sha":TREE}},
        "parents":parents.iter().map(|id| json!({"sha":id})).collect::<Vec<_>>()
    })
}

#[tokio::test]
async fn dashboard_summary_reads_only_branch_metadata() {
    let test = serve(Fixture::new(vec![])).await;
    let summary = test.provider.workspace_summary(&repository(), &CancellationToken::new()).await.unwrap();
    assert_eq!(summary["summaryOnly"], true);
    assert_eq!(summary["tasks"].as_array().unwrap().len(), 2);
    assert_eq!(summary["tasks"][0]["head"], HEAD);
    assert_eq!(summary["commits"], json!([]));
    assert_eq!(*test.fixture.calls.lock().await, vec![format!("{BASE}/branches")]);
}

#[tokio::test]
async fn opened_repository_reads_history_without_participation_lookups() {
    let test = serve(Fixture::new(vec![commit(HEAD, Some("author@example.test"), None, &[])])).await;
    let workspace = test.provider.workspace(&repository(), &CancellationToken::new(), false).await.unwrap();
    assert_eq!(workspace["commits"].as_array().unwrap().len(), 1);
    let calls = test.fixture.calls.lock().await;
    assert!(calls.iter().any(|call| call.ends_with("/commits")));
    assert!(!calls.iter().any(|call| call.contains("/activities/") || call.contains("/emails") || call == "/user"));
}
