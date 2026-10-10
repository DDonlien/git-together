fn main() {
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
