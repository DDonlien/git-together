use super::*;
use axum::{
    extract::State,
    http::{header, HeaderMap, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::sync::Arc;
use tokio::sync::{Mutex, Notify};

const TOKEN: &str = "fixture-token";
const ADVERTISEMENT: &str = "001f# service=git-receive-pack\n00000000";

struct Fixture {
    metadata: Value,
    metadata_status: StatusCode,
    git_status: StatusCode,
    git_content_type: &'static str,
    git_body: &'static str,
    delay_git: bool,
    git_started: Notify,
    calls: Mutex<Vec<(Method, String, String)>>,
}

impl Default for Fixture {
    fn default() -> Self {
        Self {
            metadata: json!({"id":1,"full_name":"fixture/project","permissions":{"pull":true,"push":true},"archived":false,"mirror":false}),
            metadata_status: StatusCode::OK,
            git_status: StatusCode::OK,
            git_content_type: "application/x-git-receive-pack-advertisement",
            git_body: ADVERTISEMENT,
            delay_git: false,
            git_started: Notify::new(),
            calls: Mutex::new(Vec::new()),
        }
    }
}

async fn serve(fixture: Fixture) -> (Provider, Value, Value, Arc<Fixture>, tokio::task::JoinHandle<()>) {
    async fn handle(State(f): State<Arc<Fixture>>, method: Method, uri: Uri, headers: HeaderMap) -> Response {
        let auth = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).unwrap_or("").to_owned();
        f.calls.lock().await.push((method, uri.to_string(), auth));
        if uri.path() == "/api/v1/repos/fixture/project" {
            return (f.metadata_status, Json(f.metadata.clone())).into_response();
        }
        if uri.path() == "/fixture/project.git/info/refs" {
            if f.delay_git {
                f.git_started.notify_one();
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            }
            let mut response = (f.git_status, [(header::CONTENT_TYPE, f.git_content_type)], f.git_body).into_response();
            if f.git_status == StatusCode::TOO_MANY_REQUESTS {
                response.headers_mut().insert(header::RETRY_AFTER, "120".parse().unwrap());
            }
            if f.git_status.is_redirection() {
                response.headers_mut().insert(header::LOCATION, "/stolen".parse().unwrap());
            }
            return response;
        }
        StatusCode::NOT_FOUND.into_response()
    }
    let fixture = Arc::new(fixture);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let host = format!("http://{}", listener.local_addr().unwrap());
    let app = Router::new().fallback(handle).with_state(fixture.clone());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });
    let account = json!({"id":"fixture-account","provider":"gitea","host":host,"login":"current"});
    let repo = json!({"id":"fixture-account:1","remoteId":1,"fullName":"fixture/project","url":format!("{host}/fixture/project"),"available":true,"permissions":{"push":true}});
    let provider = Provider::new(account.clone(), TOKEN.into(), crate::provider::client().unwrap());
    let saved = json!({"account":account,"token":TOKEN});
    (provider, saved, repo, fixture, server)
}

async fn check(fixture: Fixture) -> (Value, Vec<(Method, String, String)>) {
    let (provider, saved, repo, fixture, server) = serve(fixture).await;
    let snapshot = inspect(&saved, &provider, &[repo], &CancellationToken::new()).await.unwrap();
    let calls = fixture.calls.lock().await.clone();
    server.abort();
    assert!(!snapshot.to_string().contains(TOKEN));
    (snapshot["repositories"][0].clone(), calls)
}

#[tokio::test]
async fn gitea_confirms_role_and_authenticated_receive_pack_without_writes() {
    let (row, calls) = check(Fixture::default()).await;
    assert_eq!(row["read"], "granted");
    assert_eq!(row["write"], "granted");
    assert!(row["reason"].as_str().unwrap().contains("分支保护"));
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0], (Method::GET, "/api/v1/repos/fixture/project?".into(), format!("token {TOKEN}")));
    assert_eq!(calls[1], (Method::GET, "/fixture/project.git/info/refs?service=git-receive-pack".into(), format!("Basic {}", STANDARD.encode(format!("current:{TOKEN}")))));
}

#[tokio::test]
async fn gitea_does_not_confuse_read_only_role_or_archived_mirror_with_writable() {
    for (field, reason) in [("role", "角色"), ("archived", "归档"), ("mirror", "镜像")] {
        let mut fixture = Fixture::default();
        if field == "role" { fixture.metadata["permissions"]["push"] = json!(false); }
        else { fixture.metadata[field] = json!(true); }
        let (row, calls) = check(fixture).await;
        assert_eq!(row["write"], "denied");
        assert!(row["reason"].as_str().unwrap().contains(reason));
        assert_eq!(calls.len(), 1, "no receive-pack probe is needed for {field}");
    }
}

#[tokio::test]
async fn gitea_denied_receive_pack_is_not_overridden_by_write_role() {
    let fixture = Fixture { git_status: StatusCode::FORBIDDEN, ..Fixture::default() };
    let (row, calls) = check(fixture).await;
    assert_eq!(row["read"], "granted");
    assert_eq!(row["write"], "denied");
    assert_eq!(calls.len(), 2);
}

#[tokio::test]
async fn gitea_rate_limited_forbidden_response_is_not_a_permission_denial() {
    let fixture = Fixture { git_status: StatusCode::FORBIDDEN, git_content_type: "application/json", git_body: r#"{"message":"rate limit exceeded"}"#, ..Fixture::default() };
    let (row, _) = check(fixture).await;
    assert_eq!(row["read"], "granted");
    assert_eq!(row["write"], "unknown");
    assert!(row["reason"].as_str().unwrap().contains("频率受限"));
}

#[tokio::test]
async fn gitea_missing_or_mismatched_role_stays_unknown() {
    for mismatch in [false, true] {
        let mut fixture = Fixture::default();
        if mismatch { fixture.metadata["id"] = json!(2); }
        else { fixture.metadata["permissions"].as_object_mut().unwrap().remove("push"); }
        let (row, calls) = check(fixture).await;
        assert_eq!(row["write"], "unknown");
        assert_eq!(calls.len(), 1);
    }
}

#[tokio::test]
async fn gitea_unexpected_git_responses_stay_unknown_and_never_follow_redirects() {
    for (status, content_type, body) in [
        (StatusCode::OK, "text/html", ADVERTISEMENT),
        (StatusCode::OK, "application/x-git-receive-pack-advertisement", "not a git advertisement"),
        (StatusCode::UNAUTHORIZED, "text/plain", ""),
        (StatusCode::NOT_FOUND, "text/plain", ""),
        (StatusCode::TOO_MANY_REQUESTS, "text/plain", ""),
        (StatusCode::INTERNAL_SERVER_ERROR, "text/plain", ""),
        (StatusCode::FOUND, "text/plain", ""),
    ] {
        let fixture = Fixture { git_status: status, git_content_type: content_type, git_body: body, ..Fixture::default() };
        let (row, calls) = check(fixture).await;
        assert_eq!(row["read"], "granted", "{status}");
        assert_eq!(row["write"], "unknown", "{status}");
        assert_eq!(calls.len(), 2, "{status}");
    }
}

#[tokio::test]
async fn gitea_missing_metadata_and_cancelled_checks_stay_unknown() {
    let fixture = Fixture { metadata_status: StatusCode::NOT_FOUND, ..Fixture::default() };
    let (row, calls) = check(fixture).await;
    assert_eq!(row["write"], "unknown");
    assert_eq!(calls.len(), 1);

    let (provider, saved, repo, _, server) = serve(Fixture::default()).await;
    let cancel = CancellationToken::new();
    cancel.cancel();
    assert!(inspect(&saved, &provider, &[repo], &cancel).await.is_err());
    server.abort();
}

#[tokio::test]
async fn gitea_cancels_an_in_flight_receive_pack_check() {
    let (provider, saved, repo, fixture, server) = serve(Fixture { delay_git: true, ..Fixture::default() }).await;
    let cancel = CancellationToken::new();
    let request_cancel = cancel.clone();
    let request = tokio::spawn(async move { inspect(&saved, &provider, &[repo], &request_cancel).await });
    tokio::time::timeout(std::time::Duration::from_secs(5), fixture.git_started.notified()).await.unwrap();
    cancel.cancel();
    let result = tokio::time::timeout(std::time::Duration::from_secs(2), request).await.unwrap().unwrap();
    assert!(result.is_err());
    server.abort();
}
