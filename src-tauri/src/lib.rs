use serde::Serialize;
use std::cell::RefCell;
use std::ffi::c_void;
use std::ptr;
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

// --- CoreGraphics Event Tap (replaces rdev to avoid TSM threading crash on macOS 26) ---

type CGEventTapProxy = *const c_void;
type CGEventRef = *const c_void;
type CFMachPortRef = *const c_void;
type CFRunLoopSourceRef = *const c_void;
type CFRunLoopRef = *const c_void;
type CFStringRef = *const c_void;

const K_CG_HID_EVENT_TAP: u32 = 0;
const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;
const K_CG_EVENT_KEY_DOWN: u64 = 10;
const K_CG_EVENT_FLAGS_CHANGED: u64 = 12;
const K_CG_KEYBOARD_EVENT_KEYCODE: u32 = 9;

const CG_EVENT_MASK: u64 = (1 << K_CG_EVENT_KEY_DOWN) | (1 << K_CG_EVENT_FLAGS_CHANGED);

// Modifier flag masks
const K_CG_EVENT_FLAG_MASK_SHIFT: u64 = 0x00020000;
const K_CG_EVENT_FLAG_MASK_CONTROL: u64 = 0x00040000;
const K_CG_EVENT_FLAG_MASK_FN: u64 = 0x00800000;

extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: u64,
        callback: extern "C" fn(CGEventTapProxy, u32, CGEventRef, *mut c_void) -> CGEventRef,
        user_info: *mut c_void,
    ) -> CFMachPortRef;

    fn CFMachPortCreateRunLoopSource(
        allocator: *const c_void,
        port: CFMachPortRef,
        order: i64,
    ) -> CFRunLoopSourceRef;

    fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
    fn CFRunLoopRun();
    fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
    fn CGEventGetFlags(event: CGEventRef) -> u64;
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);

    static kCFRunLoopCommonModes: CFStringRef;
}

/// Map macOS virtual keycodes to our key name strings.
/// This avoids calling TSMGetInputSourceProperty which crashes on background threads in macOS 26.
fn virtual_keycode_to_string(keycode: u16) -> Option<String> {
    match keycode {
        0 => Some("KeyA".into()),
        1 => Some("KeyS".into()),
        2 => Some("KeyD".into()),
        3 => Some("KeyF".into()),
        4 => Some("KeyH".into()),
        5 => Some("KeyG".into()),
        6 => Some("KeyZ".into()),
        7 => Some("KeyX".into()),
        8 => Some("KeyC".into()),
        9 => Some("KeyV".into()),
        11 => Some("KeyB".into()),
        12 => Some("KeyQ".into()),
        13 => Some("KeyW".into()),
        14 => Some("KeyE".into()),
        15 => Some("KeyR".into()),
        16 => Some("KeyY".into()),
        17 => Some("KeyT".into()),
        18 => Some("Num1".into()),
        19 => Some("Num2".into()),
        20 => Some("Num3".into()),
        21 => Some("Num4".into()),
        22 => Some("Num6".into()),
        23 => Some("Num5".into()),
        24 => Some("Equal".into()),
        25 => Some("Num9".into()),
        26 => Some("Num7".into()),
        27 => Some("Minus".into()),
        28 => Some("Num8".into()),
        29 => Some("Num0".into()),
        30 => Some("RightBracket".into()),
        31 => Some("KeyO".into()),
        32 => Some("KeyU".into()),
        33 => Some("LeftBracket".into()),
        34 => Some("KeyI".into()),
        35 => Some("KeyP".into()),
        36 => Some("Return".into()),
        37 => Some("KeyL".into()),
        38 => Some("KeyJ".into()),
        39 => Some("Quote".into()),
        40 => Some("KeyK".into()),
        41 => Some("SemiColon".into()),
        42 => Some("BackSlash".into()),
        43 => Some("Comma".into()),
        44 => Some("Slash".into()),
        45 => Some("KeyN".into()),
        46 => Some("KeyM".into()),
        47 => Some("Dot".into()),
        48 => Some("Tab".into()),
        50 => Some("BackQuote".into()),
        51 => Some("Delete".into()),
        53 => Some("Escape".into()),
        // Modifier keys (handled via kCGEventFlagsChanged)
        56 => Some("ShiftLeft".into()),
        59 => Some("ControlLeft".into()),
        60 => Some("ShiftRight".into()),
        63 => Some("Function".into()),
        _ => None,
    }
}

/// Check if a modifier key was pressed (not released) based on flags
fn is_modifier_press(keycode: u16, flags: u64) -> bool {
    match keycode {
        56 | 60 => flags & K_CG_EVENT_FLAG_MASK_SHIFT != 0,
        59 => flags & K_CG_EVENT_FLAG_MASK_CONTROL != 0,
        63 => flags & K_CG_EVENT_FLAG_MASK_FN != 0,
        _ => false,
    }
}

thread_local! {
    static APP_HANDLE: RefCell<Option<tauri::AppHandle>> = const { RefCell::new(None) };
    static EVENT_TAP_REF: RefCell<CFMachPortRef> = const { RefCell::new(ptr::null()) };
}

extern "C" fn event_tap_callback(
    _proxy: CGEventTapProxy,
    event_type: u32,
    event: CGEventRef,
    _user_info: *mut c_void,
) -> CGEventRef {
    // Re-enable tap if it was disabled by timeout
    if event_type == 0xFFFFFFFE {
        EVENT_TAP_REF.with(|tap| {
            let tap = *tap.borrow();
            if !tap.is_null() {
                unsafe { CGEventTapEnable(tap, true) };
            }
        });
        return event;
    }

    let keycode = unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) } as u16;

    // For flagsChanged events, only emit on key press (not release)
    if event_type == K_CG_EVENT_FLAGS_CHANGED as u32 {
        let flags = unsafe { CGEventGetFlags(event) };
        if !is_modifier_press(keycode, flags) {
            return event;
        }
    }

    if let Some(key_name) = virtual_keycode_to_string(keycode) {
        APP_HANDLE.with(|h| {
            if let Some(handle) = h.borrow().as_ref() {
                let _ = handle.emit("key-press", KeyPressEvent { key_code: key_name });
            }
        });
    }

    event
}

fn start_keyboard_listener(app_handle: tauri::AppHandle) {
    thread::spawn(move || {
        APP_HANDLE.with(|h| {
            *h.borrow_mut() = Some(app_handle);
        });

        unsafe {
            let tap = CGEventTapCreate(
                K_CG_HID_EVENT_TAP,
                K_CG_HEAD_INSERT_EVENT_TAP,
                K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                CG_EVENT_MASK,
                event_tap_callback,
                ptr::null_mut(),
            );

            if tap.is_null() {
                eprintln!("Failed to create event tap. Grant Accessibility permission in System Settings.");
                return;
            }

            EVENT_TAP_REF.with(|t| {
                *t.borrow_mut() = tap;
            });

            let source = CFMachPortCreateRunLoopSource(ptr::null(), tap, 0);
            let run_loop = CFRunLoopGetCurrent();
            CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
            CFRunLoopRun();
        }
    });
}

// --- Window / Tray / Shortcut ---

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
