//! ARTOONS Converter — Tauri v2 backend.
//!
//! * `engines` — the Modular Engine Manager (download / verify / install / uninstall).
//! * `native`  — spawns installed engine binaries for conversions.
//! * `files`   — small file-system helpers used by the queue (bytes in / out, paths).

mod engines;
mod files;
mod native;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Modular Engine Manager
            engines::get_modules_status,
            engines::install_module,
            engines::uninstall_module,
            engines::engines_dir_path,
            engines::get_platform,
            // Native conversion
            native::convert_file_native,
            // File helpers
            files::file_info,
            files::read_file_bytes,
            files::write_file_bytes,
            files::resolve_output_path,
            files::default_output_dir,
            files::sha256_file,
            files::open_folder,
            files::reveal_path,
            files::open_external,
            files::exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ARTOONS Converter");
}
