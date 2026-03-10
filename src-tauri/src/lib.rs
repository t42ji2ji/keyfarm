use rdev::{listen, Event, EventType, Key};
use serde::Serialize;
use std::thread;
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[derive(Clone, Serialize)]
struct KeyPressEvent {
    key_code: String,
}

fn key_to_string(key: Key) -> Option<String> {
    match key {
        Key::Escape => Some("Escape".into()),
        Key::Num1 => Some("Num1".into()),
        Key::Num2 => Some("Num2".into()),
        Key::Num3 => Some("Num3".into()),
        Key::Num4 => Some("Num4".into()),
        Key::Num5 => Some("Num5".into()),
        Key::Num6 => Some("Num6".into()),
        Key::Num7 => Some("Num7".into()),
        Key::Num8 => Some("Num8".into()),
        Key::Num9 => Some("Num9".into()),
        Key::Num0 => Some("Num0".into()),
        Key::Minus => Some("Minus".into()),
        Key::Equal => Some("Equal".into()),
        Key::BackSlash => Some("BackSlash".into()),
        Key::BackQuote => Some("BackQuote".into()),
        Key::Tab => Some("Tab".into()),
        Key::KeyQ => Some("KeyQ".into()),
        Key::KeyW => Some("KeyW".into()),
        Key::KeyE => Some("KeyE".into()),
        Key::KeyR => Some("KeyR".into()),
        Key::KeyT => Some("KeyT".into()),
        Key::KeyY => Some("KeyY".into()),
        Key::KeyU => Some("KeyU".into()),
        Key::KeyI => Some("KeyI".into()),
        Key::KeyO => Some("KeyO".into()),
        Key::KeyP => Some("KeyP".into()),
        Key::LeftBracket => Some("LeftBracket".into()),
        Key::RightBracket => Some("RightBracket".into()),
        Key::Delete => Some("Delete".into()),
        Key::ControlLeft => Some("ControlLeft".into()),
        Key::KeyA => Some("KeyA".into()),
        Key::KeyS => Some("KeyS".into()),
        Key::KeyD => Some("KeyD".into()),
        Key::KeyF => Some("KeyF".into()),
        Key::KeyG => Some("KeyG".into()),
        Key::KeyH => Some("KeyH".into()),
        Key::KeyJ => Some("KeyJ".into()),
        Key::KeyK => Some("KeyK".into()),
        Key::KeyL => Some("KeyL".into()),
        Key::SemiColon => Some("SemiColon".into()),
        Key::Quote => Some("Quote".into()),
        Key::Return => Some("Return".into()),
        Key::ShiftLeft => Some("ShiftLeft".into()),
        Key::KeyZ => Some("KeyZ".into()),
        Key::KeyX => Some("KeyX".into()),
        Key::KeyC => Some("KeyC".into()),
        Key::KeyV => Some("KeyV".into()),
        Key::KeyB => Some("KeyB".into()),
        Key::KeyN => Some("KeyN".into()),
        Key::KeyM => Some("KeyM".into()),
        Key::Comma => Some("Comma".into()),
        Key::Dot => Some("Dot".into()),
        Key::Slash => Some("Slash".into()),
        Key::ShiftRight => Some("ShiftRight".into()),
        Key::Function => Some("Function".into()),
        _ => None,
    }
}

fn start_keyboard_listener(app_handle: tauri::AppHandle) {
    thread::spawn(move || {
        listen(move |event: Event| {
            if let EventType::KeyPress(key) = event.event_type {
                if let Some(key_code) = key_to_string(key) {
                    let _ = app_handle.emit("key-press", KeyPressEvent { key_code });
                }
            }
        })
        .expect("Failed to listen to keyboard events");
    });
}

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show/Hide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => toggle_window(app),
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            start_keyboard_listener(app.handle().clone());
            setup_tray(app)?;

            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyK);
            app.global_shortcut().register(shortcut)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
