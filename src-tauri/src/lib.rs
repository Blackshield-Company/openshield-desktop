//! OpenShield Desktop — Tauri 2 shell.
//!
//! v0.1 is a thin native window around a SvelteKit SPA. The frontend talks to
//! `openshield serve` directly over HTTP/WebSocket (design doc §3.2), so the
//! Rust side stays minimal; keyring/stronghold token storage is v0.2
//! hardening (design §6).
//!
//! M4 added tauri-plugin-store: pairing credentials ({host, port, token})
//! persist in the app-private data dir — on Android that storage is private
//! to the app. See src/lib/services/storage.ts for the frontend side.
//!
//! M6 (desktop-only, design §8.1) lands the tray + autostart lane:
//!  - System tray icon (Show / Hide / Quit). The window close button hides
//!    to tray instead of exiting — Quit lives on the tray menu so there is
//!    exactly one way to kill the app.
//!  - Autostart via a systemd --user unit
//!    (~/.config/systemd/user/openshield-desktop.service), toggled from
//!    Settings → Desktop. Linux-only; other platforms report unsupported.
//!    Both tray and autostart are `cfg(desktop)`-gated — Pocket (Android)
//!    compiles neither.
//!  - `read_local_token` (desktop only) reads
//!    `~/.config/openshield/desktop.token` so the GUI can attach the bearer
//!    token `openshield serve` requires on every host, including loopback.

use tauri::Manager;

// ── Autostart (systemd --user, Linux) ─────────────────────────────────────

#[cfg(target_os = "linux")]
mod autostart {
    use serde::Serialize;
    use std::path::PathBuf;
    use std::process::Command;

    pub const UNIT_NAME: &str = "openshield-desktop.service";

    #[derive(Serialize)]
    pub struct AutostartStatus {
        pub supported: bool,
        pub enabled: bool,
        pub unit_path: String,
    }

    fn unit_path() -> Result<PathBuf, String> {
        let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
        Ok(PathBuf::from(home)
            .join(".config/systemd/user")
            .join(UNIT_NAME))
    }

    /// Runs `systemctl --user <args>`; Ok(stdout) on exit 0, Err(stderr) otherwise.
    fn systemctl(args: &[&str]) -> Result<String, String> {
        let out = Command::new("systemctl")
            .arg("--user")
            .args(args)
            .output()
            .map_err(|e| format!("failed to launch systemctl: {e}"))?;
        if out.status.success() {
            Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Err(if stderr.is_empty() {
                format!("systemctl exited with {}", out.status)
            } else {
                stderr
            })
        }
    }

    pub fn status() -> Result<AutostartStatus, String> {
        // is-enabled exits non-zero when the unit is missing/disabled — both
        // map to enabled=false, not an error.
        let enabled = systemctl(&["is-enabled", UNIT_NAME])
            .map(|s| s == "enabled")
            .unwrap_or(false);
        Ok(AutostartStatus {
            supported: true,
            enabled,
            unit_path: unit_path()?.display().to_string(),
        })
    }

    pub fn set(enabled: bool) -> Result<AutostartStatus, String> {
        let path = unit_path()?;
        if enabled {
            let exe =
                std::env::current_exe().map_err(|e| format!("cannot resolve current exe: {e}"))?;
            let unit = format!(
                "# OpenShield Desktop — autostart (written by the app, Settings → Desktop)\n\
                 [Unit]\n\
                 Description=OpenShield Desktop\n\
                 After=graphical-session.target\n\
                 \n\
                 [Service]\n\
                 Type=simple\n\
                 ExecStart={}\n\
                 Restart=on-failure\n\
                 RestartSec=5\n\
                 \n\
                 [Install]\n\
                 WantedBy=default.target\n",
                exe.display()
            );
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
            }
            std::fs::write(&path, unit)
                .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
            systemctl(&["daemon-reload"])?;
            systemctl(&["enable", UNIT_NAME])?;
        } else {
            // Disable first (ignore failure — may not be enabled), then remove.
            let _ = systemctl(&["disable", UNIT_NAME]);
            if path.exists() {
                std::fs::remove_file(&path)
                    .map_err(|e| format!("cannot remove {}: {e}", path.display()))?;
            }
            let _ = systemctl(&["daemon-reload"]);
        }
        status()
    }
}

#[cfg(target_os = "linux")]
fn autostart_status_impl() -> Result<serde_json::Value, String> {
    serde_json::to_value(autostart::status()?).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "linux"))]
fn autostart_status_impl() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "supported": false,
        "enabled": false,
        "unit_path": "",
    }))
}

#[cfg(target_os = "linux")]
fn set_autostart_impl(enabled: bool) -> Result<serde_json::Value, String> {
    serde_json::to_value(autostart::set(enabled)?).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "linux"))]
fn set_autostart_impl(_enabled: bool) -> Result<serde_json::Value, String> {
    Err("autostart is only supported on Linux (systemd --user)".to_string())
}

#[tauri::command]
fn autostart_status() -> Result<serde_json::Value, String> {
    autostart_status_impl()
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<serde_json::Value, String> {
    set_autostart_impl(enabled)
}

// ── Local serve token (desktop only) ─────────────────────────────────────

#[cfg(desktop)]
#[tauri::command]
fn read_local_token() -> Option<String> {
    let home = std::env::var("HOME").ok().filter(|h| !h.is_empty())?;
    let path = std::path::PathBuf::from(home)
        .join(".config")
        .join("openshield")
        .join("desktop.token");
    let token = std::fs::read_to_string(path).ok()?.trim().to_string();
    if token.is_empty() { None } else { Some(token) }
}

// ── Tray (desktop only) ───────────────────────────────────────────────────

#[cfg(desktop)]
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let show = MenuItem::with_id(app, "tray-show", "Show OpenShield", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "tray-hide", "Hide to Tray", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("OpenShield Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => show_main_window(app),
            "tray-hide" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            // app.exit() bypasses CloseRequested, so the close-to-tray
            // interceptor below cannot swallow a real Quit.
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click toggles the window (menu is right-click).
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        show_main_window(app);
                    }
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// ── Entry ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        autostart_status,
        set_autostart,
        read_local_token
    ]);

    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![autostart_status, set_autostart]);

    #[cfg(desktop)]
    let builder = builder
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close button hides to tray; the only way out is tray → Quit.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running OpenShield Desktop");
}
