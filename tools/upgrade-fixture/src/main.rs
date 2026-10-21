use tauri_plugin_updater::UpdaterExt;
#[path = "../../release-verify/legacy_archive.rs"]
mod legacy_archive;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let endpoint = args.get(1).expect("fixture endpoint required").clone();
    let executable = args.get(2).expect("isolated application path required").clone();
    let report = args.get(3).expect("fixture report path required").clone();
    assert!(executable.contains("gittogether-upgrade-"), "only a fixture copy may be changed");
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let result = async {
                    let update = app.updater_builder().executable_path(executable)
                        .endpoints(vec![url::Url::parse(&endpoint)?])?.build()?.check().await?
                        .ok_or("0.33.0 did not find the release")?;
                    let version = update.version.clone();
                    let bytes = update.download(|_, _| {}, || {}).await?;
                    legacy_archive::verify_macos(&bytes)?;
                    update.install(&bytes)?;
                    Ok::<_, Box<dyn std::error::Error + Send + Sync>>(version)
                }.await;
                match result {
                    Ok(version) => { std::fs::write(report, serde_json::json!({"from":"0.33.0","to":version,"signature":true,"legacyArchive":true,"installed":true}).to_string()).unwrap(); app.exit(0); }
                    Err(error) => { eprintln!("Isolated 0.33.0 upgrade failed: {error}"); app.exit(1); }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("isolated updater runtime");
}
