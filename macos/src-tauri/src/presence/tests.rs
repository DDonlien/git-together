use super::*;
use crate::util::{self, text};
use std::sync::Mutex as StdMutex;
type Calls = Arc<StdMutex<Vec<(String, String, Option<String>, Option<Value>)>>>;
const PASSWORD: &str = "fixture-Password-MUST-NOT-LEAK";
const A: &str = "https://a.example.invalid/";
const B: &str = "https://b.example.invalid/";

fn response(url: &str, email: &str, password: &str) -> Value {
    let id = format!(
        "{}-{}",
        Url::parse(url)
            .unwrap()
            .host_str()
            .unwrap()
            .split('.')
            .next()
            .unwrap(),
        email.split('@').next().unwrap()
    );
    json!({"version":1,"mode":"personal","token":util::digest(format!("{url}:{email}:{password}")),"expiresAt":util::now() as u64+3_600_000,"repositories":[],"organizations":[],"account":{"id":id,"email":email,"displayName":id,"emailVerified":true,"issuer":url,"subject":id,"identityId":util::digest(format!("{url}\0{id}"))}})
}
fn transport(calls: Calls, offline_logout: bool) -> account::TestTransport {
    Arc::new(move |url, method, token, input| {
        calls
            .lock()
            .unwrap()
            .push((url.clone(), method.clone(), token, input.clone()));
        Box::pin(async move {
            match method.as_str() {
                "login" | "register" => Ok(response(
                    &url,
                    text(input.as_ref().unwrap(), "email"),
                    text(input.as_ref().unwrap(), "password"),
                )),
                "logout" | "control/revoke" if offline_logout => {
                    Err("Presence 账号服务连接失败。".into())
                }
                "logout" | "control/revoke" => Ok(json!({"version":1})),
                "catalogue" | "control/catalogue" => Ok(json!({"organizations":[]})),
                _ => Err("Unexpected isolated fixture operation".into()),
            }
        })
    })
}
fn direct(url: &str, email: &str) -> ServerConfiguration {
    let value = response(url, email, PASSWORD);
    let profile = account::profile(&value, url, None).unwrap();
    ServerConfiguration {
        url: url.into(),
        enabled: true,
        token: text(&value, "token").into(),
        expires_at: profile.expires_at,
        user_id: profile.id.clone(),
        device_id: String::new(),
        device_token: String::new(),
        organizations: vec![],
        auth_mode: "direct".into(),
        account: Some(profile),
        issuer_url: String::new(),
        issuer_account: None,
        account_service: Value::Null,
    }
}
fn fixture(
    mut config: Configuration,
    transport: account::TestTransport,
    save_failure: bool,
    read_only: bool,
) -> (tempfile::TempDir, Arc<Presence>) {
    let temporary = tempfile::tempdir().unwrap();
    servers::synchronize_legacy(&mut config);
    validate_configuration(&config).unwrap();
    let (sender, _receiver) = watch::channel(config.clone());
    let service =
        crate::service::Service::new(temporary.path().join("service"), false, "test").unwrap();
    let presence = Arc::new(Presence {
        service,
        root: temporary.path().into(),
        private_directory: temporary.path().join("editor"),
        persistent: false,
        read_only,
        config: sender,
        state: RwLock::new(Status::new(
            &config,
            if read_only {
                "原配置无法读取。".into()
            } else {
                String::new()
            },
        )),
        configure_lock: Mutex::new(()),
        editor_roots: RwLock::new(std::collections::BTreeMap::new()),
        native_projects: Mutex::new(servers::NativeProjects::default()),
        test_http: Some(transport),
        test_save_failure: save_failure,
    });
    (temporary, presence)
}
fn config(rows: Vec<ServerConfiguration>) -> Configuration {
    Configuration {
        enabled: true,
        servers: rows,
        ..Configuration::default()
    }
}
fn login(url: &str, email: &str, scoped: bool) -> Value {
    let mut input = json!({"serverUrl":url,"email":email,"password":PASSWORD});
    if scoped {
        input["serverId"] = json!(util::digest(url));
    }
    input
}

#[tokio::test]
async fn distinct_server_accounts_keep_credentials_scoped_across_logout_and_last_logout() {
    let calls = Calls::default();
    let (_temporary, presence) = fixture(
        config(vec![]),
        transport(calls.clone(), false),
        false,
        false,
    );
    presence
        .command("login", login(A, "same@example.invalid", false))
        .await
        .unwrap();
    let status = presence
        .command("login", login(B, "same@example.invalid", false))
        .await
        .unwrap();
    assert_eq!(status["servers"].as_array().unwrap().len(), 2);
    assert_eq!(status["servers"][0]["authMode"], "direct");
    assert_ne!(
        status["servers"][0]["account"]["id"],
        status["servers"][1]["account"]["id"]
    );
    let b = serde_json::to_value(&presence.config.borrow().servers[1]).unwrap();
    let tokens = presence
        .config
        .borrow()
        .servers
        .iter()
        .map(|server| server.token.clone())
        .collect::<Vec<_>>();
    for token in tokens {
        assert!(!status.to_string().contains(&token));
    }
    assert!(!status.to_string().contains(PASSWORD));
    assert!(!status.to_string().contains("deviceToken"));
    assert!(presence.command("logout", json!({})).await.is_err());
    assert_eq!(presence.config.borrow().servers.len(), 2);
    let status = presence
        .command("logout", json!({"serverId":util::digest(A)}))
        .await
        .unwrap();
    assert_eq!(status["servers"].as_array().unwrap().len(), 1);
    assert_eq!(status["account"]["id"], "b-same");
    assert_eq!(
        serde_json::to_value(&presence.config.borrow().servers[0]).unwrap(),
        b
    );
    assert!(calls
        .lock()
        .unwrap()
        .iter()
        .any(|(url, method, _, _)| url == A && method == "logout"));
    assert!(!calls
        .lock()
        .unwrap()
        .iter()
        .any(|(url, method, _, _)| url == B && method == "logout"));
    let status = presence
        .command("logout", json!({"serverId":util::digest(B)}))
        .await
        .unwrap();
    assert_eq!(status["enabled"], true);
    assert_eq!(status["account"], Value::Null);
    assert_eq!(status["servers"], json!([]));
    presence
        .command("login", login(A, "again@example.invalid", false))
        .await
        .unwrap();
    assert_eq!(presence.config.borrow().servers.len(), 1);
}

#[tokio::test]
async fn explicit_relogin_replaces_only_target_identity_and_discards_revoked_device_credentials() {
    let calls = Calls::default();
    let mut a = direct(A, "same@example.invalid");
    a.device_id = "old-device-a".into();
    a.device_token = "d".repeat(40);
    let mut b = direct(B, "same@example.invalid");
    b.device_id = "device-b".into();
    b.device_token = "e".repeat(40);
    let expected_b = serde_json::to_value(&b).unwrap();
    let (_temporary, presence) = fixture(config(vec![a, b]), transport(calls, false), false, false);
    presence
        .command("login", login(A, "same@example.invalid", true))
        .await
        .unwrap();
    {
        let current = presence.config.borrow();
        assert!(current.servers[0].device_id.is_empty());
        assert!(current.servers[0].device_token.is_empty());
        assert_eq!(
            serde_json::to_value(&current.servers[1]).unwrap(),
            expected_b
        );
    }
    assert_eq!(presence.connection_credentials(A).unwrap().0, "");
    presence
        .command("login", login(A, "different@example.invalid", true))
        .await
        .unwrap();
    assert_eq!(
        presence.config.borrow().servers[0]
            .account
            .as_ref()
            .unwrap()
            .id,
        "a-different"
    );
    assert_eq!(
        serde_json::to_value(&presence.config.borrow().servers[1]).unwrap(),
        expected_b
    );
}

#[test]
fn legacy_migration_normalizes_home_url_without_inventing_foreign_local_profiles() {
    let value = json!({"version":1,"enabled":true,"serverUrl":"https://a.example.invalid:443","serverName":"Fixture","serverToken":"a".repeat(40),"deviceId":"fixture-device","account":{"id":"home-user","email":"same@example.invalid","displayName":"Original identity","emailVerified":true,"expiresAt":u64::MAX,"repositories":[],"mode":"personal"},"servers":[{"url":A,"enabled":true,"token":"a".repeat(40),"expiresAt":u64::MAX,"userId":"home-user","deviceId":"home-device","deviceToken":"c".repeat(40),"organizations":[]},{"url":B,"enabled":false,"token":"b".repeat(40),"expiresAt":u64::MAX,"userId":"different-local-id","deviceId":"foreign-device","deviceToken":"d".repeat(40),"organizations":[]}]});
    let mut migrated: Configuration = serde_json::from_value(value).unwrap();
    migrate_configuration(&mut migrated).unwrap();
    validate_configuration(&migrated).unwrap();
    assert_eq!(migrated.server_url, A);
    assert_eq!(migrated.servers[0].auth_mode, "direct");
    assert_eq!(
        migrated.servers[0].account.as_ref().unwrap().id,
        "home-user"
    );
    assert_eq!(migrated.servers[1].auth_mode, "delegated");
    assert!(migrated.servers[1].account.is_none());
    assert_eq!(migrated.servers[1].issuer_url, A);
    assert_eq!(migrated.servers[1].user_id, "different-local-id");
    assert_eq!(migrated.servers[1].device_token, "d".repeat(40));
    assert!(!migrated.servers[1].enabled);
    let status = serde_json::to_value(Status::new(&migrated, String::new())).unwrap();
    assert_eq!(status["servers"][1]["account"], Value::Null);
    assert_eq!(
        status["servers"][1]["accountSummary"]["displayName"],
        "Original identity"
    );
    assert!(!status.to_string().contains(&"d".repeat(40)));
    migrated.servers[1].url = "https://user:secret@example.invalid/".into();
    assert!(migrate_configuration(&mut migrated).is_err());
}

#[tokio::test]
async fn legacy_delegation_never_silently_follows_a_changed_issuer_account() {
    let a = direct(A, "original@example.invalid");
    let mut b = direct(B, "unrelated@example.invalid");
    b.auth_mode = "delegated".into();
    b.account = None;
    b.issuer_url = A.into();
    b.issuer_account = a.account.clone();
    let calls = Calls::default();
    let (_temporary, presence) = fixture(
        config(vec![a, b]),
        transport(calls.clone(), false),
        false,
        false,
    );
    presence
        .command("login", login(A, "different@example.invalid", true))
        .await
        .unwrap();
    let before = serde_json::to_value(&presence.config.borrow().servers[1]).unwrap();
    let count = calls.lock().unwrap().len();
    let error = presence
        .command(
            "selectServer",
            json!({"serverId":util::digest(B),"enabled":true}),
        )
        .await
        .unwrap_err();
    assert!(error.contains("切换身份"));
    assert_eq!(calls.lock().unwrap().len(), count);
    assert_eq!(
        serde_json::to_value(&presence.config.borrow().servers[1]).unwrap(),
        before
    );
    presence
        .command("logout", json!({"serverId":util::digest(A)}))
        .await
        .unwrap();
    assert_eq!(presence.config.borrow().servers.len(), 1);
    assert_eq!(
        serde_json::to_value(&presence.config.borrow().servers[0]).unwrap(),
        before
    );
}

#[tokio::test]
async fn storage_failures_never_revoke_saved_sessions_and_new_orphan_sessions_are_reported() {
    let calls = Calls::default();
    let (_temporary, presence) = fixture(
        config(vec![
            direct(A, "old@example.invalid"),
            direct(B, "same@example.invalid"),
        ]),
        transport(calls.clone(), true),
        true,
        false,
    );
    let original = serde_json::to_value(&*presence.config.borrow()).unwrap();
    assert!(presence
        .command("logout", json!({"serverId":util::digest(A)}))
        .await
        .unwrap_err()
        .contains("原配置已保留"));
    assert!(calls.lock().unwrap().is_empty());
    let error = presence
        .command("login", login(A, "new@example.invalid", true))
        .await
        .unwrap_err();
    assert!(error.contains("新登录会话暂未撤销"));
    assert!(!error.contains(PASSWORD));
    assert_eq!(
        serde_json::to_value(&*presence.config.borrow()).unwrap(),
        original
    );
    let methods = calls
        .lock()
        .unwrap()
        .iter()
        .map(|(_, method, _, _)| method.clone())
        .collect::<Vec<_>>();
    assert_eq!(methods, ["login", "logout"]);
}

#[tokio::test]
async fn offline_logout_removes_only_local_target_and_reports_failed_remote_revocation() {
    let calls = Calls::default();
    let (_temporary, presence) = fixture(
        config(vec![
            direct(A, "same@example.invalid"),
            direct(B, "same@example.invalid"),
        ]),
        transport(calls, true),
        false,
        false,
    );
    let status = presence
        .command("logout", json!({"serverId":util::digest(A)}))
        .await
        .unwrap();
    assert_eq!(status["servers"].as_array().unwrap().len(), 1);
    assert_eq!(status["servers"][0]["url"], B);
    assert!(text(&status, "error").contains("本机已退出"));
    assert!(text(&status, "error").contains("服务器会话暂未撤销"));
}

#[tokio::test]
async fn logout_revokes_only_target_device_and_account_credentials_after_safe_removal() {
    let calls = Calls::default();
    let mut a = direct(A, "same@example.invalid");
    a.device_id = "device-a".into();
    a.device_token = "d".repeat(40);
    let mut b = direct(B, "same@example.invalid");
    b.device_id = "device-b".into();
    b.device_token = "e".repeat(40);
    let original_b = serde_json::to_value(&b).unwrap();
    let old_session = a.token.clone();
    let (_temporary, presence) = fixture(
        config(vec![a, b]),
        transport(calls.clone(), true),
        false,
        false,
    );
    let status = presence
        .command("logout", json!({"serverId":util::digest(A)}))
        .await
        .unwrap();
    let requests = calls.lock().unwrap().clone();
    assert_eq!(requests.len(), 2);
    assert_eq!(
        requests[0],
        (
            A.into(),
            "control/revoke".into(),
            Some("d".repeat(40)),
            Some(json!({"deviceId":"device-a"}))
        )
    );
    assert_eq!(requests[1].0, A);
    assert_eq!(requests[1].1, "logout");
    assert_eq!(requests[1].2, Some(old_session));
    assert!(text(&status, "error").contains("设备授权暂未确认撤销"));
    assert!(text(&status, "error").contains("服务器会话暂未撤销"));
    assert_eq!(
        serde_json::to_value(&presence.config.borrow().servers[0]).unwrap(),
        original_b
    );
    assert!(!status.to_string().contains(&"d".repeat(40)));
    assert!(!status.to_string().contains(&"e".repeat(40)));
}

#[tokio::test]
async fn failed_config_load_is_read_only_and_preserves_original_bytes_before_any_transport_call() {
    let calls = Calls::default();
    let (temporary, presence) =
        fixture(config(vec![]), transport(calls.clone(), false), false, true);
    let path = temporary.path().join("presence-v1.encrypted");
    let bytes = b"fixture damaged encrypted bytes";
    fs::write(&path, bytes).unwrap();
    for (method, input) in [
        ("configure", json!({"enabled":true})),
        ("login", login(A, "same@example.invalid", false)),
        ("logout", json!({"serverId":util::digest(A)})),
        ("addServer", json!({"serverUrl":A})),
    ] {
        assert!(presence
            .command(method, input)
            .await
            .unwrap_err()
            .contains("原文件已保留"));
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }
    assert!(presence
        .save_account(Configuration::default(), Value::Null, String::new())
        .await
        .is_err());
    assert!(presence
        .save_cached(Configuration::default())
        .await
        .is_err());
    assert!(calls.lock().unwrap().is_empty());
}

#[test]
fn remote_error_messages_cannot_echo_passwords_tokens_or_nested_metadata() {
    let body = format!("{{\"message\":\"{PASSWORD} fixture-secret-token\"}}");
    for status in [
        reqwest::StatusCode::BAD_REQUEST,
        reqwest::StatusCode::UNAUTHORIZED,
        reqwest::StatusCode::INTERNAL_SERVER_ERROR,
    ] {
        let error = account::account_response(status, body.as_bytes()).unwrap_err();
        assert!(!error.contains(PASSWORD));
        assert!(!error.contains("fixture-secret-token"));
    }
    assert_eq!(
        Presence::account_metadata(
            &json!({"version":{"token":"fixture-secret-token"},"mode":"personal"})
        ),
        Value::Null
    );
}

#[tokio::test]
async fn disabled_toggle_and_expired_one_server_do_not_gate_another_login() {
    let mut a = direct(A, "same@example.invalid");
    a.expires_at = 1;
    a.account.as_mut().unwrap().expires_at = 1;
    let mut disabled = config(vec![a]);
    disabled.enabled = false;
    let (_temporary, presence) =
        fixture(disabled, transport(Calls::default(), false), false, false);
    let status = presence
        .command("login", login(B, "same@example.invalid", false))
        .await
        .unwrap();
    assert_eq!(status["enabled"], false);
    assert!(presence.connection_credentials(A).is_err());
    assert!(presence.connection_credentials(B).is_ok());
    presence
        .command("configure", json!({"enabled":true}))
        .await
        .unwrap();
    assert_eq!(presence.config.borrow().servers.len(), 2);
}

#[tokio::test]
async fn queued_mutation_reads_latest_state_and_old_generation_cannot_overwrite_new_identity() {
    let calls = Calls::default();
    let (_temporary, presence) = fixture(
        config(vec![
            direct(A, "old@example.invalid"),
            direct(B, "same@example.invalid"),
        ]),
        transport(calls.clone(), false),
        false,
        false,
    );
    let guard = presence.configure_lock.lock().await;
    let mut queued = Box::pin(presence.command("login", login(A, "new@example.invalid", true)));
    assert!(tokio::time::timeout(Duration::from_millis(10), &mut queued)
        .await
        .is_err());
    assert!(calls.lock().unwrap().is_empty());
    drop(guard);
    queued.await.unwrap();
    assert!(presence.cache_organizations(A, vec![], 0).await.is_err());
    presence
        .remote_update(0, A, Some(vec![]), "old failure".into())
        .await;
    let status = presence.command("status", json!({})).await.unwrap();
    assert_eq!(status["servers"][0]["account"]["id"], "a-new");
    assert_eq!(status["servers"][0]["error"], "");
    assert_eq!(status["servers"][1]["account"]["id"], "b-same");
}

#[tokio::test]
async fn catalogue_and_current_device_detection_use_each_servers_own_credentials() {
    let calls = Calls::default();
    let mut a = direct(A, "same@example.invalid");
    a.device_id = "device-a".into();
    a.device_token = "a".repeat(40);
    let mut b = direct(B, "same@example.invalid");
    b.device_id = "device-b".into();
    b.device_token = "b".repeat(40);
    let (_temporary, presence) = fixture(
        config(vec![a, b]),
        transport(calls.clone(), false),
        false,
        false,
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(25), presence.catalogue_loop(0))
            .await
            .is_err()
    );
    let requests = calls.lock().unwrap().clone();
    for (url, method, token, input) in requests {
        assert_eq!(method, "control/catalogue");
        let suffix = if url == A { "a" } else { "b" };
        assert_eq!(token.unwrap(), suffix.repeat(40));
        assert_eq!(input.unwrap()["deviceId"], format!("device-{suffix}"));
    }
    for url in [A, B] {
        let config = presence.config.borrow().clone();
        let server = config
            .servers
            .iter()
            .find(|server| server.url == url)
            .unwrap();
        let child = server.connection_config(&config);
        assert_eq!(child.account.as_ref().unwrap().id, server.user_id);
        assert!(child.account.is_some());
        let mut sessions = Vec::new();
        for device in ["device-a", "device-b", "another-device"] {
            sessions.push(serde_json::from_value(json!({"sessionId":format!("session-{device}"),"userId":server.user_id,"identityId":server.account.as_ref().unwrap().identity_id,"displayName":"Fixture","avatarUrl":null,"deviceId":device,"alive":true,"lastSeen":1,"projects":[],"isCurrent":true})).unwrap());
        }
        presence
            .remote_update(0, url, Some(sessions), String::new())
            .await;
    }
    let status = presence.command("status", json!({})).await.unwrap();
    let current = status["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|session| session["isCurrent"] == true)
        .collect::<Vec<_>>();
    assert_eq!(current.len(), 2);
    assert!(
        current
            .iter()
            .any(|session| session["serverId"] == util::digest(A)
                && session["deviceId"] == "device-a")
    );
    assert!(
        current
            .iter()
            .any(|session| session["serverId"] == util::digest(B)
                && session["deviceId"] == "device-b")
    );
}
