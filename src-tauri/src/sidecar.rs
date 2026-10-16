use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

static API_CHILD: Mutex<Option<Child>> = Mutex::new(None);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn which_node() -> Result<PathBuf, String> {
    let node = Command::new("where")
        .arg("node")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout)
                    .ok()
                    .and_then(|s| s.lines().next().map(|l| PathBuf::from(l.trim())))
            } else {
                None
            }
        });
    node.filter(|p| p.is_file())
        .ok_or_else(|| "Node.js not found on PATH.".into())
}

fn spawn_node(node: &Path, script: &Path, cwd: &Path) -> Result<(), String> {
    let mut cmd = Command::new(node);
    cmd.current_dir(cwd)
        .arg(script)
        .env("PORT", "3923")
        .env("HOST", "127.0.0.1")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    *API_CHILD.lock().map_err(|e| e.to_string())? = Some(child);
    Ok(())
}

pub fn spawn_stickers_api(app: &AppHandle) -> Result<(), String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        for api_dir in [
            resource_dir.join("stickers-api"),
            resource_dir.join("resources").join("stickers-api"),
        ] {
            let script = api_dir.join("server.cjs");
            if script.is_file() {
                let node = which_node()?;
                return spawn_node(&node, &script, &api_dir);
            }
        }
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let script = manifest.join("../stickers-server/dist/server.cjs");
    if !script.is_file() {
        return Err("Stickers API not built: run npm run build:api from project root.".into());
    }
    let node = which_node()?;
    let cwd = manifest.join("../stickers-server/dist");
    spawn_node(&node, &script, &cwd)
}
