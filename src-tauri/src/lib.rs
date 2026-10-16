mod sidecar;



use tauri::Manager;



#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {

    tauri::Builder::default()

        .plugin(tauri_plugin_dialog::init())

        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = sidecar::spawn_stickers_api(&handle) {
                    eprintln!("[stickers-tauri] {}", e);
                }
            });
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
            }
            Ok(())
        })

        .run(tauri::generate_context!())

        .expect("failed to run Stickers");

}


