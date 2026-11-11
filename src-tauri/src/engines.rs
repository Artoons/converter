//! Modular Engine Manager.
//!
//! Engines are described in `src-tauri/engines.json` (shared with the React UI).
//! Each engine lists per-platform artifacts (archive URL + pinned SHA-256 + extraction rules).
//! Installing an engine downloads every artifact into `AppLocalData/engines/.downloads`,
//! verifies the SHA-256 while streaming, extracts the binaries into a staging folder and
//! atomically renames it to `AppLocalData/engines/<module_id>/`.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

const MANIFEST_JSON: &str = include_str!("../engines.json");
const MARKER_FILE: &str = ".artoons-engine.json";
pub const PROGRESS_EVENT: &str = "module-download-progress";

fn s<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub engines: Vec<EngineDef>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineDef {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub builtin: bool,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub bins: Vec<String>,
    #[serde(default)]
    pub platforms: HashMap<String, Vec<Artifact>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub url: String,
    #[serde(default)]
    pub sha256: String,
    /// `zip` | `tar.gz` | `tar.xz` | `tar` | `raw`
    pub archive: String,
    #[serde(default)]
    pub extract: Vec<ExtractRule>,
    /// Extract the whole archive (stripping a shared top-level folder, if any).
    #[serde(default)]
    pub extract_all: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExtractRule {
    /// Path suffix inside the archive, matched on path-component boundaries.
    pub from: String,
    /// Destination file name inside the engine folder.
    pub to: String,
}

pub fn manifest() -> Result<Manifest, String> {
    serde_json::from_str(MANIFEST_JSON).map_err(|e| format!("Invalid engine manifest: {e}"))
}

pub fn platform_key() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "windows-x86_64",
        ("windows", "aarch64") => "windows-aarch64",
        ("macos", "x86_64") => "macos-x86_64",
        ("macos", "aarch64") => "macos-aarch64",
        ("linux", "x86_64") => "linux-x86_64",
        ("linux", "aarch64") => "linux-aarch64",
        _ => "unsupported",
    }
}

pub fn exe_name(bin: &str) -> String {
    if cfg!(windows) {
        format!("{bin}.exe")
    } else {
        bin.to_string()
    }
}

pub fn engines_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(s)?.join("engines");
    fs::create_dir_all(&dir).map_err(s)?;
    Ok(dir)
}

#[cfg(unix)]
fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(p)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(p: &Path) -> bool {
    p.is_file()
}

#[cfg(unix)]
fn set_executable(p: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(p).map_err(s)?.permissions();
    perms.set_mode(0o755); // chmod +x
    fs::set_permissions(p, perms).map_err(s)
}

#[cfg(not(unix))]
fn set_executable(_p: &Path) -> Result<(), String> {
    Ok(())
}

/// Absolute path of an installed engine binary (errors if not installed).
pub fn bin_path(app: &AppHandle, engine_id: &str, bin: &str) -> Result<PathBuf, String> {
    let p = engines_dir(app)?.join(engine_id).join(exe_name(bin));
    if is_executable(&p) {
        Ok(p)
    } else {
        Err(format!(
            "The '{engine_id}' engine is not installed. Open Modules → Manage Engines to install it."
        ))
    }
}

fn dir_size(p: &Path) -> u64 {
    let mut total = 0;
    if let Ok(rd) = fs::read_dir(p) {
        for entry in rd.flatten() {
            let path = entry.path();
            match entry.metadata() {
                Ok(m) if m.is_dir() => total += dir_size(&path),
                Ok(m) => total += m.len(),
                Err(_) => {}
            }
        }
    }
    total
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleStatus {
    pub id: String,
    pub name: String,
    pub builtin: bool,
    pub installed: bool,
    /// Whether the manifest has artifacts for this OS/arch.
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallMarker {
    version: Option<String>,
    installed_at: u64,
    platform: String,
}

fn status_for(app: &AppHandle, def: &EngineDef) -> Result<ModuleStatus, String> {
    if def.builtin {
        return Ok(ModuleStatus {
            id: def.id.clone(),
            name: def.name.clone(),
            builtin: true,
            installed: true,
            available: true,
            version: def.version.clone(),
            path: None,
            size_bytes: 0,
        });
    }
    let dir = engines_dir(app)?.join(&def.id);
    let installed = !def.bins.is_empty()
        && def.bins.iter().all(|b| is_executable(&dir.join(exe_name(b))));
    let marker: Option<InstallMarker> = fs::read_to_string(dir.join(MARKER_FILE))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok());
    Ok(ModuleStatus {
        id: def.id.clone(),
        name: def.name.clone(),
        builtin: false,
        installed,
        available: def.platforms.contains_key(platform_key()),
        version: if installed {
            marker.and_then(|m| m.version).or_else(|| def.version.clone())
        } else {
            None
        },
        path: if installed { Some(dir.to_string_lossy().into_owned()) } else { None },
        size_bytes: if installed { dir_size(&dir) } else { 0 },
    })
}

/// Checks `AppLocalData/engines/` to see which engine binaries exist and are executable.
#[tauri::command]
pub fn get_modules_status(app: AppHandle) -> Result<Vec<ModuleStatus>, String> {
    let m = manifest()?;
    m.engines.iter().map(|def| status_for(&app, def)).collect()
}

#[tauri::command]
pub fn engines_dir_path(app: AppHandle) -> Result<String, String> {
    Ok(engines_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_platform() -> String {
    platform_key().to_string()
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub module_id: String,
    /// `downloading` | `verifying` | `extracting` | `finalizing` | `done` | `error`
    pub stage: String,
    pub artifact_index: usize,
    pub artifact_count: usize,
    pub downloaded: u64,
    pub total: Option<u64>,
    /// Overall percentage across all artifacts (0-100).
    pub percent: f64,
    pub message: Option<String>,
}

fn in_flight() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

struct InFlightGuard(String);
impl Drop for InFlightGuard {
    fn drop(&mut self) {
        if let Ok(mut set) = in_flight().lock() {
            set.remove(&self.0);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn emit_progress(
    app: &AppHandle,
    module_id: &str,
    stage: &str,
    idx: usize,
    count: usize,
    downloaded: u64,
    total: Option<u64>,
    message: Option<String>,
) {
    let frac = match (stage, total) {
        ("downloading", Some(t)) if t > 0 => (downloaded as f64 / t as f64).min(1.0),
        ("downloading", _) => 0.0,
        _ => 1.0,
    };
    let count_f = count.max(1) as f64;
    let percent = match stage {
        "done" => 100.0,
        "finalizing" => 99.0,
        _ => ((idx as f64 + frac) / count_f * 97.0).min(97.0),
    };
    let _ = app.emit(
        PROGRESS_EVENT,
        DownloadProgress {
            module_id: module_id.to_string(),
            stage: stage.to_string(),
            artifact_index: idx,
            artifact_count: count,
            downloaded,
            total,
            percent,
            message,
        },
    );
}

async fn download(
    app: &AppHandle,
    client: &reqwest::Client,
    module_id: &str,
    art: &Artifact,
    dest: &Path,
    idx: usize,
    count: usize,
) -> Result<String, String> {
    let resp = client
        .get(&art.url)
        .send()
        .await
        .map_err(|e| format!("Download failed ({}): {e}", art.url))?
        .error_for_status()
        .map_err(|e| format!("Download failed ({}): {e}", art.url))?;
    let total = resp.content_length();
    let mut file = tokio::fs::File::create(dest).await.map_err(s)?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_emit: Option<Instant> = None;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Network error while downloading: {e}"))?;
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(s)?;
        downloaded += chunk.len() as u64;
        if last_emit.map_or(true, |t| t.elapsed() >= Duration::from_millis(120)) {
            emit_progress(app, module_id, "downloading", idx, count, downloaded, total, None);
            last_emit = Some(Instant::now());
        }
    }
    file.flush().await.map_err(s)?;
    emit_progress(app, module_id, "downloading", idx, count, downloaded, Some(downloaded), None);
    Ok(hex::encode(hasher.finalize()))
}

fn verify(art: &Artifact, actual: &str) -> Result<(), String> {
    let expected = art.sha256.trim().to_lowercase();
    if expected.is_empty() {
        let allow = cfg!(debug_assertions) || std::env::var("ARTOONS_ALLOW_UNPINNED").is_ok();
        if allow {
            eprintln!(
                "[artoons] WARNING: no pinned SHA-256 for {} (actual {actual}). Allowed in dev builds only.",
                art.url
            );
            return Ok(());
        }
        return Err(format!(
            "No pinned SHA-256 for {} — refusing to install an unverified binary. \
             Run `npm run pin-hashes` before building a release.",
            art.url
        ));
    }
    if expected != actual {
        return Err(format!(
            "SHA-256 mismatch for {}\n  expected {expected}\n  actual   {actual}",
            art.url
        ));
    }
    Ok(())
}

/// Downloads the platform-specific archive(s) into `AppLocalData/engines/<module_id>/`,
/// verifies SHA-256, sets executable permissions on Unix and emits progress events.
#[tauri::command]
pub async fn install_module(app: AppHandle, module_id: String) -> Result<ModuleStatus, String> {
    let m = manifest()?;
    let def = m
        .engines
        .iter()
        .find(|e| e.id == module_id)
        .cloned()
        .ok_or_else(|| format!("Unknown module '{module_id}'"))?;
    if def.builtin {
        return status_for(&app, &def);
    }
    let artifacts = def
        .platforms
        .get(platform_key())
        .cloned()
        .ok_or_else(|| format!("{} is not available for {}", def.name, platform_key()))?;

    {
        let mut set = in_flight().lock().map_err(s)?;
        if !set.insert(def.id.clone()) {
            return Err(format!("{} is already being installed", def.name));
        }
    }
    let _guard = InFlightGuard(def.id.clone());

    let root = engines_dir(&app)?;
    let staging = root.join(format!("{}.partial", def.id));
    let downloads = root.join(".downloads");

    let result: Result<(), String> = async {
        if staging.exists() {
            fs::remove_dir_all(&staging).map_err(s)?;
        }
        fs::create_dir_all(&staging).map_err(s)?;
        fs::create_dir_all(&downloads).map_err(s)?;

        let client = reqwest::Client::builder()
            .user_agent(concat!("ARTOONS-Converter/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(20))
            .build()
            .map_err(s)?;

        let count = artifacts.len();
        for (idx, art) in artifacts.iter().enumerate() {
            let file = downloads.join(format!("{}-{idx}.download", def.id));
            let hash = download(&app, &client, &def.id, art, &file, idx, count).await?;

            emit_progress(&app, &def.id, "verifying", idx, count, 0, None, None);
            if let Err(e) = verify(art, &hash) {
                let _ = fs::remove_file(&file);
                return Err(e);
            }

            emit_progress(&app, &def.id, "extracting", idx, count, 0, None, None);
            let (a, f, st) = (art.clone(), file.clone(), staging.clone());
            tauri::async_runtime::spawn_blocking(move || extract(&a, &f, &st))
                .await
                .map_err(s)??;
            let _ = fs::remove_file(&file);
        }

        emit_progress(&app, &def.id, "finalizing", count, count, 0, None, None);
        for bin in &def.bins {
            let p = staging.join(exe_name(bin));
            if !p.is_file() {
                return Err(format!(
                    "Expected binary '{}' was not found after extraction",
                    exe_name(bin)
                ));
            }
            set_executable(&p)?;
        }
        let marker = InstallMarker {
            version: def.version.clone(),
            installed_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            platform: platform_key().to_string(),
        };
        fs::write(staging.join(MARKER_FILE), serde_json::to_vec_pretty(&marker).map_err(s)?)
            .map_err(s)?;

        let final_dir = root.join(&def.id);
        if final_dir.exists() {
            fs::remove_dir_all(&final_dir).map_err(s)?;
        }
        fs::rename(&staging, &final_dir).map_err(s)?;
        Ok::<(), String>(())
    }
    .await;

    if let Err(e) = result {
        let _ = fs::remove_dir_all(&staging);
        emit_progress(&app, &def.id, "error", 0, 1, 0, None, Some(e.clone()));
        return Err(e);
    }
    emit_progress(&app, &def.id, "done", 1, 1, 0, None, None);
    status_for(&app, &def)
}

/// Deletes the engine folder from `AppLocalData/engines/` to free up disk space.
#[tauri::command]
pub fn uninstall_module(app: AppHandle, module_id: String) -> Result<ModuleStatus, String> {
    let m = manifest()?;
    let def = m
        .engines
        .iter()
        .find(|e| e.id == module_id)
        .ok_or_else(|| format!("Unknown module '{module_id}'"))?;
    if def.builtin {
        return Err("The core engine is built in and cannot be removed".into());
    }
    if in_flight().lock().map_err(s)?.contains(&def.id) {
        return Err(format!("{} is currently being installed", def.name));
    }
    let dir = engines_dir(&app)?.join(&def.id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Could not remove {}: {e}", dir.display()))?;
    }
    status_for(&app, def)
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

fn extract(art: &Artifact, archive: &Path, dest: &Path) -> Result<(), String> {
    match art.archive.as_str() {
        "raw" => {
            let rule = art
                .extract
                .first()
                .ok_or("A raw artifact needs exactly one extract rule")?;
            fs::copy(archive, safe_join(dest, &rule.to)?).map_err(s)?;
            Ok(())
        }
        "zip" => extract_zip(art, archive, dest),
        "tar" | "tar.gz" | "tgz" | "tar.xz" => extract_tar(art, archive, dest),
        other => Err(format!("Unsupported archive type '{other}'")),
    }
}

fn normalize(name: &str) -> String {
    name.replace('\\', "/").trim_start_matches("./").to_string()
}

fn matches_rule(name: &str, from: &str) -> bool {
    name == from || name.ends_with(&format!("/{from}"))
}

fn common_prefix(names: &[String]) -> Option<String> {
    let first = names.first()?.split('/').next()?.to_string();
    if first.is_empty() {
        return None;
    }
    let prefix = format!("{first}/");
    if names.iter().all(|n| n.starts_with(&prefix)) {
        Some(prefix)
    } else {
        None
    }
}

/// Joins `rel` onto `base`, rejecting absolute paths and `..` (zip-slip protection).
fn safe_join(base: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    for c in rel_path.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(format!("Unsafe path in archive: {rel}")),
        }
    }
    Ok(base.join(rel_path))
}

fn write_entry<R: Read>(reader: &mut R, out: &Path) -> Result<(), String> {
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(s)?;
    }
    let mut f = File::create(out).map_err(s)?;
    io::copy(reader, &mut f).map_err(s)?;
    Ok(())
}

/// Handles one archive entry; returns after writing it (if it matched).
fn handle_entry<R: Read>(
    art: &Artifact,
    prefix: &Option<String>,
    found: &mut [bool],
    name: &str,
    reader: &mut R,
    dest: &Path,
) -> Result<(), String> {
    if art.extract_all {
        let rel = match prefix {
            Some(p) => name.strip_prefix(p.as_str()).unwrap_or(name),
            None => name,
        };
        if rel.is_empty() {
            return Ok(());
        }
        return write_entry(reader, &safe_join(dest, rel)?);
    }
    for (j, rule) in art.extract.iter().enumerate() {
        if !found[j] && matches_rule(name, &rule.from) {
            write_entry(reader, &safe_join(dest, &rule.to)?)?;
            found[j] = true;
            break;
        }
    }
    Ok(())
}

fn check_found(art: &Artifact, found: &[bool]) -> Result<(), String> {
    if art.extract_all {
        return Ok(());
    }
    for (rule, ok) in art.extract.iter().zip(found) {
        if !ok {
            return Err(format!("'{}' was not found inside {}", rule.from, art.url));
        }
    }
    Ok(())
}

fn extract_zip(art: &Artifact, archive: &Path, dest: &Path) -> Result<(), String> {
    let mut zip = zip::ZipArchive::new(File::open(archive).map_err(s)?).map_err(s)?;
    let prefix = if art.extract_all {
        let names: Vec<String> = zip.file_names().map(normalize).collect();
        common_prefix(&names)
    } else {
        None
    };
    let mut found = vec![false; art.extract.len()];
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(s)?;
        if entry.is_dir() {
            continue;
        }
        let name = normalize(entry.name());
        handle_entry(art, &prefix, &mut found, &name, &mut entry, dest)?;
    }
    check_found(art, &found)
}

fn open_tar(art: &Artifact, archive: &Path) -> Result<tar::Archive<Box<dyn Read>>, String> {
    let f = File::open(archive).map_err(s)?;
    let reader: Box<dyn Read> = match art.archive.as_str() {
        "tar.gz" | "tgz" => Box::new(flate2::read::GzDecoder::new(f)),
        "tar.xz" => Box::new(xz2::read::XzDecoder::new(f)),
        "tar" => Box::new(f),
        other => return Err(format!("Unsupported tar flavour '{other}'")),
    };
    Ok(tar::Archive::new(reader))
}

fn extract_tar(art: &Artifact, archive: &Path, dest: &Path) -> Result<(), String> {
    let prefix = if art.extract_all {
        let mut a = open_tar(art, archive)?;
        let mut names = Vec::new();
        for entry in a.entries().map_err(s)? {
            let entry = entry.map_err(s)?;
            let name = normalize(&entry.path().map_err(s)?.to_string_lossy());
            names.push(name);
        }
        common_prefix(&names)
    } else {
        None
    };

    let mut a = open_tar(art, archive)?;
    let mut found = vec![false; art.extract.len()];
    for entry in a.entries().map_err(s)? {
        let mut entry = entry.map_err(s)?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let name = normalize(&entry.path().map_err(s)?.to_string_lossy());
        handle_entry(art, &prefix, &mut found, &name, &mut entry, dest)?;
    }
    check_found(art, &found)
}
