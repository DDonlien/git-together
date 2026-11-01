fn main() {
    println!("cargo:rustc-check-cfg=cfg(gittogether_lite)");
    let configuration: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string("tauri.conf.json").expect("tauri.conf.json"))
            .expect("Tauri configuration");
    if configuration["identifier"] == "com.gittogether.standalone.lite" {
        println!("cargo:rustc-cfg=gittogether_lite");
    }
    println!("cargo:rerun-if-changed=tauri.conf.json");
    // package.json is the single version source for Cargo, the app and its feeds.
    let manifest: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string("../package.json").expect("package.json"))
            .expect("package manifest");
    println!(
        "cargo:rustc-env=GITTOGETHER_VERSION={}",
        manifest["version"].as_str().expect("version")
    );
    println!("cargo:rerun-if-changed=../package.json");
    tauri_build::build()
}
