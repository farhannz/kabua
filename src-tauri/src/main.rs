// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod method;

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![method::get_login_code, method::get_authenticate_info, method::execute_process])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
