//! File-system helpers for the conversion queue.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

fn s<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    /// First 64 bytes, used for magic-byte detection in the UI.
    pub head: Vec<u8>,
}

#[tauri::command]
pub fn file_info(paths: Vec<String>) -> Vec<FileInfo> {
    paths
        .into_iter()
        .filter_map(|p| {
            let path = PathBuf::from(&p);
            let meta = fs::metadata(&path).ok()?;
            if !meta.is_file() {
                return None;
            }
            let mut head = vec![0u8; 64];
            let n = File::open(&path).and_then(|mut f| f.read(&mut head)).unwrap_or(0);
            head.truncate(n);
            Some(FileInfo {
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| p.clone()),
                path: p,
                size: meta.len(),
                head,
            })
        })
        .collect()
}

/// Returns raw bytes (delivered to JS as an ArrayBuffer, no JSON overhead).
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Could not read {path}: {e}"))?;
    Ok(tauri::ipc::Response::new(data))
}

/// Accepts a raw binary body; the destination is passed URL-encoded in the `x-path` header.
#[tauri::command]
pub fn write_file_bytes(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("write_file_bytes expects a raw binary body".into());
    };
    let header = request
        .headers()
        .get("x-path")
        .ok_or("Missing x-path header")?
        .to_str()
        .map_err(s)?;
    let path = urlencoding::decode(header).map_err(s)?.into_owned();
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(s)?;
    }
    fs::write(&path, data).map_err(|e| format!("Could not write {path}: {e}"))
}

/// Joins `dir` + `file_name`, appending " (1)", " (2)"… if the file already exists.
#[tauri::command]
pub fn resolve_output_path(dir: String, file_name: String) -> Result<String, String> {
    let dir = PathBuf::from(dir);
    fs::create_dir_all(&dir).map_err(s)?;
    let candidate = dir.join(&file_name);
    if !candidate.exists() {
        return Ok(candidate.to_string_lossy().into_owned());
    }
    let p = Path::new(&file_name);
    let stem = p.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|x| format!(".{}", x.to_string_lossy())).unwrap_or_default();
    for i in 1..10_000 {
        let c = dir.join(format!("{stem} ({i}){ext}"));
        if !c.exists() {
            return Ok(c.to_string_lossy().into_owned());
        }
    }
    Err("Could not find a free output file name".into())
}

#[tauri::command]
pub fn default_output_dir(app: AppHandle) -> Result<String, String> {
    let base = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().home_dir())
        .map_err(s)?;
    Ok(base.join("ARTOONS Converter").to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn sha256_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let mut f = File::open(&path).map_err(s)?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let n = f.read(&mut buf).map_err(s)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
        Ok(hex::encode(hasher.finalize()))
    })
    .await
    .map_err(s)?
}

#[tauri::command]
pub fn open_folder(app: AppHandle, path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(s)?;
    app.opener().open_path(path, None::<&str>).map_err(s)
}

#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(s)
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http(s) links can be opened".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(s)
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}
