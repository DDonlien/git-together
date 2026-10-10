use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Router,
};
use gittogether_core::{data_root, service::Service, util::Result};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
struct CancelOnDrop(CancellationToken);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
fn trusted(headers: &HeaderMap) -> bool {
    headers.get("host").and_then(|v| v.to_str().ok()) == Some("127.0.0.1:4173")
        && headers
            .get("x-gittogether-client")
            .and_then(|v| v.to_str().ok())
            == Some("1")
        && headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("application/json"))
        && headers
            .get("origin")
            .and_then(|v| v.to_str().ok())
            .is_none_or(|v| v == "http://127.0.0.1:4173")
        && headers
            .get("sec-fetch-site")
            .and_then(|v| v.to_str().ok())
            .is_none_or(|v| v == "same-origin")
}
fn envelope(result: Result<Value>) -> Response {
    let status = if result.is_ok() {
        StatusCode::OK
    } else {
        StatusCode::BAD_REQUEST
    };
    let v = match result {
        Ok(v) => json!({"ok":true,"value":v}),
        Err(e) => json!({"ok":false,"error":e}),
    };
    (
        status,
        [
            (header::CACHE_CONTROL, "no-store"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        axum::Json(v),
    )
        .into_response()
}
async fn import(
    State(service): State<Arc<Service>>,
    Path(method): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !trusted(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let input: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return envelope(Err("请求不是有效 JSON。".into())),
    };
    let cancel = CancellationToken::new();
    let _guard = CancelOnDrop(cancel.clone());
    let result = tokio::spawn(async move { service.handle(&method, input, cancel).await })
        .await
        .map_err(|_| "本地服务操作未完成。".into())
        .and_then(|v| v);
    envelope(result)
}
async fn diagnostics(
    State(service): State<Arc<Service>>,
    Path(method): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !trusted(&headers) || body.len() > 4096 {
        return StatusCode::FORBIDDEN.into_response();
    }
    let input = serde_json::from_slice(&body).unwrap_or(Value::Null);
    envelope(service.diagnostics.command(&method, &input).await)
}
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
async fn run() -> Result<()> {
    let root = data_root()?;
    let service = Service::new(root, false, "preview")?;
    service.authorization.ensure_listener().await?;
    let router = Router::new()
        .route("/api/import/{method}", post(import))
        .route("/api/diagnostics/{method}", post(diagnostics))
        .layer(axum::extract::DefaultBodyLimit::max(32_768))
        .with_state(service.clone());
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 4175))
        .await
        .map_err(|_| "Rust 预览服务端口 4175 已占用，未停止其他进程。")?;
    println!(
        "GitTogether {} Rust 账号服务就绪。",
        gittogether_core::VERSION
    );
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .map_err(|_| "Rust 预览服务未正常结束。")?;
    service.authorization.stop();
    service
        .diagnostics
        .record(&json!({"event":"lifecycle","outcome":"complete"}), false);
    Ok(())
}
