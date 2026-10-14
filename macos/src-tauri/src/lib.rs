pub const VERSION: &str = env!("GITTOGETHER_VERSION");
pub mod ai;
pub mod credentials;
pub mod diagnostics;
pub mod git;
pub mod files;
pub mod graph_operations;
pub mod github_token;
pub mod oauth;
pub mod operations;
pub mod platform;
pub mod preferences;
pub mod presence;
pub mod remote_control;
mod remote_git;
pub mod provider;
pub mod repository_access;
pub mod proxy;
pub mod service;
pub mod update_archive;
pub mod update_error;
mod updates;
pub mod util;
mod instances;
use serde_json::{json, Value};
use service::Service;
use std::{path::PathBuf, sync::Arc};
use tauri::{Emitter, Manager, State};
use updates::Updates;
pub fn data_root() -> util::Result<PathBuf> {
    instances::data_root()
}
fn envelope(result: util::Result<Value>) -> Value {
    match result {
        Ok(v) => json!({"ok":true,"value":v}),
        Err(e) => json!({"ok":false,"error":e}),
    }
}
#[tauri::command]
async fn import_command(
    service: State<'_, Arc<Service>>,
    method: String,
    input: Value,
    request_id: Option<String>,
) -> util::Result<Value> {
    let _ = request_id;
    Ok(envelope(
        service
            .handle(&method, input, tokio_util::sync::CancellationToken::new())
            .await,
    ))
}
#[tauri::command]
async fn github_web(
    service: State<'_, Arc<Service>>,
    method: String,
    input: Value,
) -> util::Result<Value> {
    Ok(envelope(service.web(&method, input).await))
}
#[tauri::command]
async fn diagnostics_command(
    service: State<'_, Arc<Service>>,
    method: String,
    input: Option<Value>,
) -> util::Result<Value> {
    service
        .diagnostics
        .command(&method, &input.unwrap_or(json!({})))
        .await
}
#[tauri::command]
fn environment() -> Value {
    json!({"nativeGlass":false,"platform":std::env::consts::OS.replace("macos","darwin")})
}
#[tauri::command]
async fn presence_command(
    presence: State<'_, Arc<presence::Presence>>,
    control: State<'_, Arc<remote_control::RemoteControl>>,
    method: String,
    input: Option<Value>,
) -> util::Result<Value> {
    if matches!(method.as_str(),"register"|"login"|"logout"|"configure"|"selectServer"|"removeServer") && control.busy().await {return Ok(envelope(Err("请先等待远端操作结束或中止，再更换账号。".into())));}
    if method=="logout" && presence.signed_in() {control.forget_account(true).await?;}
    let result=presence.command(&method, input.unwrap_or(json!({}))).await;
    Ok(envelope(
        result,
    ))
}
#[tauri::command]
fn set_theme(window: tauri::WebviewWindow, theme: String) -> util::Result<()> {
    let theme = match theme.as_str() {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        "system" => None,
        _ => return Err("无效的界面主题。".into()),
    };
    window.set_theme(theme).map_err(|_| "系统主题更新失败。")?;
    let dark = theme == Some(tauri::Theme::Dark)
        || theme.is_none() && window.theme().ok() == Some(tauri::Theme::Dark);
    window
        .set_background_color(Some(if dark {
            tauri::window::Color(27, 27, 31, 255)
        } else {
            tauri::window::Color(246, 245, 250, 255)
        }))
        .map_err(|_| "窗口背景更新失败。".into())
}
#[tauri::command]
async fn remote_control_command(
    app: tauri::AppHandle,
    control: State<'_, Arc<remote_control::RemoteControl>>, method: String, input: Option<Value>,
) -> util::Result<Value> {
    let result=control.command(&method, input.unwrap_or(json!({}))).await;
    if control.enabled() { remote_tray(&app).map_err(|_|"后台托盘无法启动，请保留窗口运行。")?; }
    else if let Some(tray)=app.tray_by_id("remote-control") { tray.set_visible(false).map_err(|_|"托盘状态更新失败。")?; }
    Ok(envelope(result))
}
fn remote_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(tray)=app.tray_by_id("remote-control") { return tray.set_visible(true); }
    use tauri::{menu::{Menu,MenuItem},tray::TrayIconBuilder};
    let show=MenuItem::with_id(app,"remote-open","打开 GitTogether",true,None::<&str>)?;
    let quit=MenuItem::with_id(app,"remote-quit","退出 GitTogether",true,None::<&str>)?;
    let menu=Menu::with_items(app,&[&show,&quit])?;
    let mut tray=TrayIconBuilder::with_id("remote-control").menu(&menu).tooltip("GitTogether · 远端控制后台").on_menu_event(|app,event|{
        match event.id.as_ref() {
            "remote-open"=>if let Some(window)=app.get_webview_window("main") {
                if window.show().and_then(|_|window.unminimize()).and_then(|_|window.set_focus()).is_err() {
                    app.state::<Arc<Service>>().diagnostics.record(&json!({"event":"window","outcome":"error","method":"background-show"}),false);
                }
            },
            "remote-quit"=>app.exit(0),
            _=>(),
        }
    });
    if let Some(icon)=app.default_window_icon(){tray=tray.icon(icon.clone());}
    tray.build(app)?;
    Ok(())
}
#[tauri::command]
async fn open_github_authorization() -> util::Result<()> {
    service::open("https://github.com/login/device").await
}
#[tauri::command]
async fn legacy_preferences(service: State<'_, Arc<Service>>) -> util::Result<Option<String>> {
    let root = service.root.clone();
    tauri::async_runtime::spawn_blocking(move || preferences::legacy(&root))
        .await
        .map_err(|_| "偏好迁移读取未完成。".to_string())?
}
#[tauri::command]
fn update_status(updates: State<'_, Updates>) -> Value {
    updates.status()
}
#[tauri::command]
async fn update_check(app: tauri::AppHandle, updates: State<'_, Updates>) -> util::Result<Value> {
    Ok(updates.check(&app).await)
}
#[tauri::command]
async fn update_download(updates: State<'_, Updates>) -> util::Result<Value> {
    Ok(updates.download().await)
}
#[tauri::command]
async fn update_install(
    app: tauri::AppHandle,
    service: State<'_, Arc<Service>>,
    updates: State<'_, Updates>,
) -> util::Result<Value> {
    Ok(updates.install(app, &service).await)
}
pub fn run() {
    let mut context = tauri::generate_context!();
    let profile = instances::profile().expect("Invalid instance name");
    // Separate both the lock and on-disk account data for each explicitly opened instance.
    if let Some(id) = &profile { context.config_mut().identifier.push_str(&format!(".instance.p{}", util::digest(id))); }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_|{
            if let Some(window)=app.get_webview_window("main") {
                if window.show().and_then(|_|window.set_focus()).is_err() {
                    if let Some(service)=app.try_state::<Arc<Service>>() {service.diagnostics.record(&json!({"event":"window","outcome":"error","method":"existing-instance"}),false);}
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem};
            let menu = Menu::default(app.handle())?;
            let other = MenuItem::with_id(app, "presence-other-instance", "打开另一个实例", true, None::<&str>)?;
            if let Some(submenu) = menu.items()?.first().and_then(|item| item.as_submenu()) { submenu.append(&other)?; }
            app.set_menu(menu)?;
            if instances::profile().map_err(std::io::Error::other)?.is_some() {
                if let Some(window) = app.get_webview_window("main") { window.set_title("GitTogether · 独立实例")?; }
            }
            let root = data_root().map_err(std::io::Error::other)?;
            let service = Service::new(root.clone(), !cfg!(debug_assertions), "app")
                .map_err(std::io::Error::other)?;
            let presence = presence::Presence::new(root, !cfg!(debug_assertions), service.clone())
                .map_err(std::io::Error::other)?;
            let updates = Updates::new(service.diagnostics.clone());
            app.manage(service.clone());
            let control = remote_control::RemoteControl::new(service.clone(), presence.clone(), !cfg!(debug_assertions))
                .map_err(std::io::Error::other)?;
            if control.enabled() { remote_tray(app.handle())?; }
            app.manage(control);
            app.manage(presence);
            app.manage(updates);
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "presence-other-instance" {
                if let Err(error) = instances::open_other() { app.state::<Arc<Service>>().diagnostics.record(&json!({"event":"window","outcome":"error","method":"open-other-instance","error":error}), false); }
            }
        })
        .on_window_event(|window,event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, position }) = event {
                let service = window.state::<Arc<Service>>();
                match service.file_state.lock().unwrap_or_else(|e| e.into_inner()).drop_files(paths.clone()) {
                    Ok(drop_id) => { let _ = window.emit("gittogether-file-drop", json!({"dropId":drop_id,"position":{"x":position.x,"y":position.y}})); }
                    Err(error) => { let _ = window.emit("gittogether-file-drop", json!({"error":error,"position":{"x":position.x,"y":position.y}})); }
                };
            }
            if let tauri::WindowEvent::CloseRequested {api,..}=event {
                if window.state::<Arc<remote_control::RemoteControl>>().enabled() {
                    api.prevent_close();
                    if window.hide().is_err() {
                        window.state::<Arc<Service>>().diagnostics.record(&json!({"event":"window","outcome":"error","method":"background-hide"}),false);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            import_command,
            github_web,
            diagnostics_command,
            presence_command,
            remote_control_command,
            environment,
            set_theme,
            open_github_authorization,
            legacy_preferences,
            update_status,
            update_check,
            update_download,
            update_install
        ])
        .run(context)
        .expect("GitTogether 原生运行失败。");
}
