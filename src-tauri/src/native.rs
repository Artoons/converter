//! Native conversions: spawns a downloaded engine binary as a child process,
//! parses progress (FFmpeg) and returns the output path.

use crate::engines;
use serde::Serialize;
use std::collections::VecDeque;
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};

pub const CONVERT_PROGRESS_EVENT: &str = "convert-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConvertProgress {
    job_id: String,
    percent: f64,
}

fn parse_duration(line: &str) -> Option<f64> {
    let idx = line.find("Duration: ")?;
    let ts = line[idx + 10..].split(',').next()?.trim();
    let mut parts = ts.split(':');
    let h: f64 = parts.next()?.parse().ok()?;
    let m: f64 = parts.next()?.parse().ok()?;
    let sec: f64 = parts.next()?.parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + sec)
}

fn to_strings(items: &[&str]) -> Vec<String> {
    items.iter().map(|x| x.to_string()).collect()
}

/// Spawns the appropriate downloaded binary, parses progress and returns the output file path.
///
/// `args` are engine-specific options placed between the input and the output:
/// * ffmpeg:      `ffmpeg -hide_banner -y -i <input> <args…> -progress pipe:1 -nostats <output>`
/// * pandoc:      `pandoc <input> <args…> [--pdf-engine=<typst>] -o <output>`
/// * imagemagick: `magick <input> <args…> <output>`
/// * typst:       `typst compile <args…> <input> <output>`
#[tauri::command]
pub async fn convert_file_native(
    app: AppHandle,
    input_path: String,
    output_path: String,
    engine: String,
    args: Vec<String>,
    job_id: Option<String>,
) -> Result<String, String> {
    let job_id = job_id.unwrap_or_default();
    if !Path::new(&input_path).is_file() {
        return Err(format!("Input file not found: {input_path}"));
    }
    if let Some(parent) = Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let (program, full_args) = match engine.as_str() {
        "ffmpeg" => {
            let bin = engines::bin_path(&app, "ffmpeg", "ffmpeg")?;
            let mut a = to_strings(&["-hide_banner", "-y", "-i"]);
            a.push(input_path.clone());
            a.extend(args);
            a.extend(to_strings(&["-progress", "pipe:1", "-nostats"]));
            a.push(output_path.clone());
            (bin, a)
        }
        "pandoc" => {
            let bin = engines::bin_path(&app, "pandoc", "pandoc")?;
            let mut a = vec![input_path.clone()];
            a.extend(args);
            if output_path.to_lowercase().ends_with(".pdf") {
                let typst = engines::bin_path(&app, "pandoc", "typst")?;
                a.push(format!("--pdf-engine={}", typst.display()));
            }
            a.push("-o".to_string());
            a.push(output_path.clone());
            (bin, a)
        }
        "imagemagick" => {
            let bin = engines::bin_path(&app, "imagemagick", "magick")?;
            let mut a = vec![input_path.clone()];
            a.extend(args);
            a.push(output_path.clone());
            (bin, a)
        }
        "typst" => {
            let bin = engines::bin_path(&app, "pandoc", "typst")?;
            let mut a = vec!["compile".to_string()];
            a.extend(args);
            a.push(input_path.clone());
            a.push(output_path.clone());
            (bin, a)
        }
        other => return Err(format!("Unknown engine '{other}'")),
    };

    let mut cmd = tokio::process::Command::new(&program);
    cmd.args(&full_args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    // Run from the input's folder so relative resources (images in Markdown/HTML) resolve.
    if let Some(dir) = Path::new(&input_path).parent() {
        if dir.is_dir() {
            cmd.current_dir(dir);
        }
    }
    if let Some(dir) = program.parent() {
        if engine == "imagemagick" {
            // Portable ImageMagick looks for its config/coder files next to the binary.
            cmd.env("MAGICK_HOME", dir);
        }
    }
    if engine == "imagemagick" && cfg!(target_os = "linux") {
        cmd.env("APPIMAGE_EXTRACT_AND_RUN", "1");
    }
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start {engine}: {e}"))?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let duration: Arc<Mutex<Option<f64>>> = Arc::new(Mutex::new(None));
    let is_ffmpeg = engine == "ffmpeg";

    // stderr: collect a tail for error messages and sniff the media duration.
    let dur_w = duration.clone();
    let err_task = tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut tail: VecDeque<String> = VecDeque::new();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(d) = parse_duration(&line) {
                if let Ok(mut g) = dur_w.lock() {
                    if g.is_none() {
                        *g = Some(d);
                    }
                }
            }
            if tail.len() >= 25 {
                tail.pop_front();
            }
            tail.push_back(line);
        }
        tail.into_iter().collect::<Vec<_>>().join("\n")
    });

    // stdout: FFmpeg `-progress pipe:1` key=value lines.
    let app_p = app.clone();
    let job_p = job_id.clone();
    let dur_r = duration.clone();
    let out_task = tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if !is_ffmpeg {
                continue;
            }
            let value = line
                .strip_prefix("out_time_us=")
                .or_else(|| line.strip_prefix("out_time_ms="));
            if let Some(v) = value {
                let total = dur_r.lock().ok().and_then(|g| *g);
                if let (Ok(us), Some(total)) = (v.trim().parse::<f64>(), total) {
                    if total > 0.0 {
                        let percent = (us / 1_000_000.0 / total * 100.0).clamp(0.0, 99.0);
                        let _ = app_p.emit(
                            CONVERT_PROGRESS_EVENT,
                            ConvertProgress { job_id: job_p.clone(), percent },
                        );
                    }
                }
            }
        }
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = out_task.await;
    let tail = err_task.await.unwrap_or_default();

    if !status.success() {
        let code = status
            .code()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "signal".into());
        return Err(format!("{engine} failed (exit {code})\n{tail}"));
    }
    if !Path::new(&output_path).exists() {
        return Err(format!("{engine} finished but produced no output file\n{tail}"));
    }
    let _ = app.emit(
        CONVERT_PROGRESS_EVENT,
        ConvertProgress { job_id, percent: 100.0 },
    );
    Ok(output_path)
}
