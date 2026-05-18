use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

struct TrayMenuItems {
    show: MenuItem<tauri::Wry>,
    pin: MenuItem<tauri::Wry>,
    heatmap: MenuItem<tauri::Wry>,
    perspective: MenuItem<tauri::Wry>,
}

struct WindowVisible(AtomicBool);
struct WindowPinned(AtomicBool);
struct HeatmapState(AtomicBool);
struct PerspectiveState(AtomicBool);
struct ListenerStarted(AtomicBool);

#[derive(Clone, Serialize)]
struct KeyPressEvent {
    key_code: String,
}

// =============================================================================
// macOS keyboard listener (CoreGraphics Event Tap)
// =============================================================================

#[cfg(target_os = "macos")]
mod mac_keyboard {
    use super::KeyPressEvent;
    use std::cell::RefCell;
    use std::ffi::c_void;
    use std::ptr;
    use std::sync::mpsc;
    use std::thread;
    use tauri::Emitter;

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

    const K_CG_EVENT_FLAG_MASK_SHIFT: u64 = 0x00020000;
    const K_CG_EVENT_FLAG_MASK_CONTROL: u64 = 0x00040000;
    const K_CG_EVENT_FLAG_MASK_ALTERNATE: u64 = 0x00080000;
    const K_CG_EVENT_FLAG_MASK_COMMAND: u64 = 0x00100000;
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

    /// Map macOS virtual keycodes to key name strings.
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
            49 => Some("Space".into()),
            54 => Some("MetaRight".into()),
            55 => Some("MetaLeft".into()),
            56 => Some("ShiftLeft".into()),
            58 => Some("AltLeft".into()),
            59 => Some("ControlLeft".into()),
            60 => Some("ShiftRight".into()),
            61 => Some("AltRight".into()),
            63 => Some("Function".into()),
            _ => None,
        }
    }

    fn is_modifier_press(keycode: u16, flags: u64) -> bool {
        match keycode {
            56 | 60 => flags & K_CG_EVENT_FLAG_MASK_SHIFT != 0,
            58 | 61 => flags & K_CG_EVENT_FLAG_MASK_ALTERNATE != 0,
            55 | 54 => flags & K_CG_EVENT_FLAG_MASK_COMMAND != 0,
            59 => flags & K_CG_EVENT_FLAG_MASK_CONTROL != 0,
            63 => flags & K_CG_EVENT_FLAG_MASK_FN != 0,
            _ => false,
        }
    }

    struct TapContext {
        tx: mpsc::Sender<String>,
        tap: RefCell<CFMachPortRef>,
    }

    extern "C" fn event_tap_callback(
        _proxy: CGEventTapProxy,
        event_type: u32,
        event: CGEventRef,
        user_info: *mut c_void,
    ) -> CGEventRef {
        let ctx = unsafe { &*(user_info as *const TapContext) };

        // Re-enable tap if it was disabled by timeout
        if event_type == 0xFFFFFFFE {
            let tap = *ctx.tap.borrow();
            if !tap.is_null() {
                unsafe { CGEventTapEnable(tap, true) };
            }
            return event;
        }

        let keycode =
            unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) } as u16;

        if event_type == K_CG_EVENT_FLAGS_CHANGED as u32 {
            let flags = unsafe { CGEventGetFlags(event) };
            if !is_modifier_press(keycode, flags) {
                return event;
            }
        }

        if let Some(key_name) = virtual_keycode_to_string(keycode) {
            let _ = ctx.tx.send(key_name);
        }

        event
    }

    pub fn start(app_handle: tauri::AppHandle) {
        let (tx, rx) = mpsc::channel::<String>();

        let handle = app_handle.clone();
        thread::spawn(move || {
            for key_name in rx {
                let _ = handle.emit("key-press", KeyPressEvent { key_code: key_name });
            }
        });

        thread::spawn(move || {
            let ctx: &'static TapContext = Box::leak(Box::new(TapContext {
                tx,
                tap: RefCell::new(ptr::null()),
            }));
            let ctx_ptr = ctx as *const TapContext as *mut c_void;

            unsafe {
                let tap = CGEventTapCreate(
                    K_CG_HID_EVENT_TAP,
                    K_CG_HEAD_INSERT_EVENT_TAP,
                    K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                    CG_EVENT_MASK,
                    event_tap_callback,
                    ctx_ptr,
                );

                if tap.is_null() {
                    eprintln!("Failed to create event tap. Grant Accessibility permission in System Settings.");
                    return;
                }

                *ctx.tap.borrow_mut() = tap;

                let source = CFMachPortCreateRunLoopSource(ptr::null(), tap, 0);
                let run_loop = CFRunLoopGetCurrent();
                CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
                CFRunLoopRun();
            }
        });
    }
}

// =============================================================================
// Windows keyboard listener (Low-level keyboard hook)
// =============================================================================

#[cfg(target_os = "windows")]
mod win_keyboard {
    use super::KeyPressEvent;
    use std::ffi::c_void;
    use std::ptr;
    use std::sync::mpsc;
    use std::sync::OnceLock;
    use std::thread;
    use tauri::Emitter;

    type HHOOK = *mut c_void;
    type HINSTANCE = *mut c_void;
    type HWND = *mut c_void;
    type WPARAM = usize;
    type LPARAM = isize;
    type LRESULT = isize;

    const WH_KEYBOARD_LL: i32 = 13;
    const WM_KEYDOWN: usize = 0x0100;
    const WM_SYSKEYDOWN: usize = 0x0104;

    #[repr(C)]
    struct KBDLLHOOKSTRUCT {
        vk_code: u32,
        scan_code: u32,
        flags: u32,
        time: u32,
        dw_extra_info: usize,
    }

    #[repr(C)]
    struct POINT {
        x: i32,
        y: i32,
    }

    #[repr(C)]
    struct MSG {
        hwnd: HWND,
        message: u32,
        w_param: WPARAM,
        l_param: LPARAM,
        time: u32,
        pt: POINT,
    }

    extern "system" {
        fn SetWindowsHookExW(
            id_hook: i32,
            lpfn: unsafe extern "system" fn(i32, WPARAM, LPARAM) -> LRESULT,
            hmod: HINSTANCE,
            dw_thread_id: u32,
        ) -> HHOOK;
        fn CallNextHookEx(
            hhk: HHOOK,
            n_code: i32,
            w_param: WPARAM,
            l_param: LPARAM,
        ) -> LRESULT;
        fn GetMessageW(
            lp_msg: *mut MSG,
            h_wnd: HWND,
            msg_filter_min: u32,
            msg_filter_max: u32,
        ) -> i32;
        fn GetModuleHandleW(lp_module_name: *const u16) -> HINSTANCE;
    }

    static KEY_SENDER: OnceLock<mpsc::Sender<String>> = OnceLock::new();

    /// Map Windows virtual key codes to key name strings.
    fn vk_to_key_name(vk: u32) -> Option<String> {
        match vk {
            0x41..=0x5A => Some(format!("Key{}", (vk as u8) as char)),
            0x30..=0x39 => Some(format!("Num{}", vk - 0x30)),
            0x20 => Some("Space".into()),
            0x0D => Some("Return".into()),
            0x08 => Some("Delete".into()),
            0x09 => Some("Tab".into()),
            0x1B => Some("Escape".into()),
            0x14 => Some("CapsLock".into()),
            0xA0 => Some("ShiftLeft".into()),
            0xA1 => Some("ShiftRight".into()),
            0xA2 => Some("ControlLeft".into()),
            0xA3 => Some("ControlRight".into()),
            0xA4 => Some("AltLeft".into()),
            0xA5 => Some("AltRight".into()),
            0x5B => Some("MetaLeft".into()),
            0x5C => Some("MetaRight".into()),
            0xBD => Some("Minus".into()),
            0xBB => Some("Equal".into()),
            0xDB => Some("LeftBracket".into()),
            0xDD => Some("RightBracket".into()),
            0xDC => Some("BackSlash".into()),
            0xBA => Some("SemiColon".into()),
            0xDE => Some("Quote".into()),
            0xC0 => Some("BackQuote".into()),
            0xBC => Some("Comma".into()),
            0xBE => Some("Dot".into()),
            0xBF => Some("Slash".into()),
            _ => None,
        }
    }

    unsafe extern "system" fn keyboard_proc(
        n_code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if n_code >= 0 && (w_param == WM_KEYDOWN || w_param == WM_SYSKEYDOWN) {
            let kb = unsafe { &*(l_param as *const KBDLLHOOKSTRUCT) };
            if let Some(key_name) = vk_to_key_name(kb.vk_code) {
                if let Some(tx) = KEY_SENDER.get() {
                    let _ = tx.send(key_name);
                }
            }
        }
        unsafe { CallNextHookEx(ptr::null_mut(), n_code, w_param, l_param) }
    }

    pub fn start(app_handle: tauri::AppHandle) {
        let (tx, rx) = mpsc::channel::<String>();
        let _ = KEY_SENDER.set(tx);

        let handle = app_handle.clone();
        thread::spawn(move || {
            for key_name in rx {
                let _ = handle.emit("key-press", KeyPressEvent { key_code: key_name });
            }
        });

        thread::spawn(move || unsafe {
            let hmod = GetModuleHandleW(ptr::null());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, keyboard_proc, hmod, 0);
            if hook.is_null() {
                eprintln!("Failed to install keyboard hook");
                return;
            }

            // Message pump — required for low-level hooks to receive events
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {}
        });
    }
}

// =============================================================================
// Linux keyboard listener (evdev via kbd-evdev)
// =============================================================================

#[cfg(target_os = "linux")]
mod linux_keyboard {
    use super::KeyPressEvent;
    use evdev::{self, Device as EvdevDevice, EventSummary};
    use std::io;
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::thread;
    use tauri::Emitter;

    /// Map Linux KEY_* codes to key name strings (matching HHKB layout in src/data/hhkbLayout.ts)
    fn evdev_key_to_string(code: u16) -> Option<String> {
        match code {
            // Row 0
            1 => Some("Escape".into()),
            2 => Some("Num1".into()),
            3 => Some("Num2".into()),
            4 => Some("Num3".into()),
            5 => Some("Num4".into()),
            6 => Some("Num5".into()),
            7 => Some("Num6".into()),
            8 => Some("Num7".into()),
            9 => Some("Num8".into()),
            10 => Some("Num9".into()),
            11 => Some("Num0".into()),
            12 => Some("Minus".into()),
            13 => Some("Equal".into()),
            16 => Some("BackQuote".into()),
            // Row 1
            15 => Some("Tab".into()),
            17 => Some("KeyQ".into()),
            18 => Some("KeyW".into()),
            19 => Some("KeyE".into()),
            20 => Some("KeyR".into()),
            21 => Some("KeyT".into()),
            22 => Some("KeyY".into()),
            23 => Some("KeyU".into()),
            24 => Some("KeyI".into()),
            25 => Some("KeyO".into()),
            26 => Some("KeyP".into()),
            27 => Some("LeftBracket".into()),
            14 => Some("Delete".into()),
            28 => Some("Return".into()),
            // Row 2
            58 => Some("CapsLock".into()),
            30 => Some("KeyA".into()),
            31 => Some("KeyS".into()),
            32 => Some("KeyD".into()),
            33 => Some("KeyF".into()),
            34 => Some("KeyG".into()),
            35 => Some("KeyH".into()),
            36 => Some("KeyJ".into()),
            37 => Some("KeyK".into()),
            38 => Some("KeyL".into()),
            39 => Some("SemiColon".into()),
            40 => Some("Quote".into()),
            43 => Some("BackSlash".into()),
            // Row 3
            42 => Some("ShiftLeft".into()),
            44 => Some("KeyZ".into()),
            45 => Some("KeyX".into()),
            46 => Some("KeyC".into()),
            47 => Some("KeyV".into()),
            48 => Some("KeyB".into()),
            49 => Some("KeyN".into()),
            50 => Some("KeyM".into()),
            51 => Some("Comma".into()),
            52 => Some("Dot".into()),
            53 => Some("Slash".into()),
            54 => Some("ShiftRight".into()),
            // Row 4 (bottom row)
            56 => Some("AltLeft".into()),
            29 => Some("MetaLeft".into()), // Ctrl on Linux
            57 => Some("Space".into()),
            125 => Some("MetaRight".into()),
            100 => Some("AltRight".into()),
            86 => Some("BackSlash".into()),
            // RightBracket after Row 1 Ret (code 28) since Linux uses 28 for Return not RightBracket
            _ => None,
        }
    }

    fn looks_like_keyboard(device: &EvdevDevice) -> bool {
        let has_keys = device
            .supported_keys()
            .map_or(false, |keys| keys.iter().next().is_some());
        if !has_keys {
            return false;
        }

        let has_pointer_axes = device
            .supported_relative_axes()
            .map_or(false, |axes| axes.iter().next().is_some())
            || device
                .supported_absolute_axes()
                .map_or(false, |axes| axes.iter().next().is_some());
        if has_pointer_axes {
            return false;
        }

        let name = device.name().unwrap_or("").to_ascii_lowercase();
        if name.contains("keyboard") || name.contains("keypad") || name.contains("kbd") {
            return true;
        }

        device.supported_keys().map_or(false, |keys| {
            keys.contains(evdev::KeyCode::KEY_A)
                || keys.contains(evdev::KeyCode::KEY_ENTER)
                || keys.contains(evdev::KeyCode::KEY_SPACE)
        })
    }

    fn find_keyboard_device() -> Option<(PathBuf, EvdevDevice)> {
        let mut fallback = None;
        for (path, device) in evdev::enumerate() {
            if !looks_like_keyboard(&device) {
                continue;
            }

            let name = device.name().unwrap_or("").to_ascii_lowercase();
            if name.contains("keyboard") || name.contains("keypad") || name.contains("kbd") {
                return Some((path, device));
            }

            if fallback.is_none() {
                fallback = Some((path, device));
            }
        }
        fallback
    }

    pub fn has_keyboard_device() -> bool {
        x11_keyboard::is_available() || find_keyboard_device().is_some()
    }

    pub fn start(app_handle: tauri::AppHandle) {
        let (tx, rx) = mpsc::channel::<String>();

        let handle = app_handle.clone();
        thread::spawn(move || {
            for key_name in rx {
                let _ = handle.emit("key-press", KeyPressEvent { key_code: key_name });
            }
        });

        if x11_keyboard::start(tx.clone()) {
            return;
        }

        thread::spawn(move || {
            let (path, mut device) = match find_keyboard_device() {
                Some(device) => device,
                None => {
                    eprintln!(
                        "Failed to find an accessible keyboard device. Ensure this user can read /dev/input/event*."
                    );
                    return;
                }
            };

            eprintln!(
                "Listening on {} ({})",
                path.display(),
                device.name().unwrap_or("Unnamed device")
            );

            if let Err(e) = device.set_nonblocking(true) {
                eprintln!("Failed to set non-blocking: {}", e);
            }

            loop {
                match device.fetch_events() {
                    Ok(events) => {
                        for event in events {
                            if let EventSummary::Key(_, _, 1) = event.destructure() {
                                let code = event.code();
                                if let Some(name) = evdev_key_to_string(code) {
                                    let _ = tx.send(name);
                                }
                            }
                        }
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                        // no events, continue
                    }
                    Err(e) => {
                        eprintln!("Error reading events: {}", e);
                    }
                }
            }
        });
    }

    mod x11_keyboard {
        use std::collections::HashMap;
        use std::sync::mpsc;

        use x11rb::connection::Connection;
        use x11rb::protocol::xinput::{
            ConnectionExt as XInputConnectionExt, Device, EventMask, XIEventMask,
        };
        use x11rb::protocol::xproto::ConnectionExt as XProtoConnectionExt;
        use x11rb::protocol::Event;
        use x11rb::rust_connection::RustConnection;

        pub fn is_available() -> bool {
            connect_xinput().is_ok()
        }

        pub fn start(tx: mpsc::Sender<String>) -> bool {
            match connect_xinput() {
                Ok((conn, screen_num, keymap)) => {
                    std::thread::spawn(move || listen(conn, screen_num, keymap, tx));
                    true
                }
                Err(e) => {
                    eprintln!("Failed to start X11 keyboard listener: {e}");
                    false
                }
            }
        }

        fn connect_xinput() -> Result<(RustConnection, usize, HashMap<u8, String>), Box<dyn std::error::Error>> {
            let (conn, screen_num) = RustConnection::connect(None)?;
            conn.xinput_xi_query_version(2, 0)?.reply()?;

            let keymap = build_keymap(&conn)?;
            let root = conn.setup().roots[screen_num].root;
            let masks = [EventMask {
                deviceid: u16::from(Device::ALL_MASTER),
                mask: vec![XIEventMask::RAW_KEY_PRESS],
            }];
            conn.xinput_xi_select_events(root, &masks)?.check()?;
            conn.flush()?;

            Ok((conn, screen_num, keymap))
        }

        fn listen(
            conn: RustConnection,
            screen_num: usize,
            mut keymap: HashMap<u8, String>,
            tx: mpsc::Sender<String>,
        ) {
            let root = conn.setup().roots[screen_num].root;
            eprintln!("Listening on X11/XInput2 raw key events for Barrier-compatible input");

            loop {
                match conn.wait_for_event() {
                    Ok(Event::XinputRawKeyPress(event)) => {
                        let keycode = event.detail as u8;
                        if let Some(key_name) = keymap.get(&keycode) {
                            let _ = tx.send(key_name.clone());
                        }
                    }
                    Ok(Event::MappingNotify(_)) => {
                        if let Ok(next_keymap) = build_keymap(&conn) {
                            keymap = next_keymap;
                        }
                        let masks = [EventMask {
                            deviceid: u16::from(Device::ALL_MASTER),
                            mask: vec![XIEventMask::RAW_KEY_PRESS],
                        }];
                        let _ = conn.xinput_xi_select_events(root, &masks);
                        let _ = conn.flush();
                    }
                    Ok(_) => {}
                    Err(e) => {
                        eprintln!("Error reading X11 keyboard event: {e}");
                        break;
                    }
                }
            }
        }

        fn build_keymap<C: Connection>(conn: &C) -> Result<HashMap<u8, String>, Box<dyn std::error::Error>> {
            let setup = conn.setup();
            let min = setup.min_keycode;
            let count = setup.max_keycode - setup.min_keycode + 1;
            let mapping = conn.get_keyboard_mapping(min, count)?.reply()?;
            let mut keymap = HashMap::new();

            for offset in 0..count {
                let keycode = min + offset;
                let start = offset as usize * mapping.keysyms_per_keycode as usize;
                let end = start + mapping.keysyms_per_keycode as usize;
                if let Some(name) = mapping
                    .keysyms
                    .get(start..end)
                    .and_then(|keysyms| keysyms.iter().copied().find_map(keysym_to_key_name))
                {
                    keymap.insert(keycode, name);
                }
            }

            Ok(keymap)
        }

        fn keysym_to_key_name(keysym: u32) -> Option<String> {
            match keysym {
                0x0061..=0x007a => Some(format!("Key{}", (keysym as u8 as char).to_ascii_uppercase())),
                0x0041..=0x005a => Some(format!("Key{}", keysym as u8 as char)),
                0x0030..=0x0039 => Some(format!("Num{}", keysym - 0x0030)),
                0x0020 => Some("Space".into()),
                0xff0d => Some("Return".into()),
                0xff08 => Some("Delete".into()),
                0xff09 => Some("Tab".into()),
                0xff1b => Some("Escape".into()),
                0xffe5 => Some("CapsLock".into()),
                0xffe1 => Some("ShiftLeft".into()),
                0xffe2 => Some("ShiftRight".into()),
                0xffe3 => Some("ControlLeft".into()),
                0xffe4 => Some("ControlRight".into()),
                0xffe9 => Some("AltLeft".into()),
                0xffea => Some("AltRight".into()),
                0xffeb => Some("MetaLeft".into()),
                0xffec => Some("MetaRight".into()),
                0x002d => Some("Minus".into()),
                0x003d => Some("Equal".into()),
                0x005b => Some("LeftBracket".into()),
                0x005d => Some("RightBracket".into()),
                0x005c => Some("BackSlash".into()),
                0x003b => Some("SemiColon".into()),
                0x0027 => Some("Quote".into()),
                0x0060 => Some("BackQuote".into()),
                0x002c => Some("Comma".into()),
                0x002e => Some("Dot".into()),
                0x002f => Some("Slash".into()),
                _ => None,
            }
        }
    }
}

// =============================================================================
// Accessibility permission check (macOS)
// =============================================================================

#[cfg(target_os = "macos")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[tauri::command]
fn check_accessibility() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { AXIsProcessTrusted() }
    }
    #[cfg(target_os = "linux")]
    {
        linux_keyboard::has_keyboard_device()
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "linux")))]
    {
        true
    }
}

#[tauri::command]
fn request_accessibility() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    }
}

#[tauri::command]
fn start_listener(app: tauri::AppHandle) {
    let started = app.state::<ListenerStarted>();
    if !started.0.swap(true, Ordering::SeqCst) {
        start_keyboard_listener(app);
    }
}

// =============================================================================

fn start_keyboard_listener(app_handle: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    mac_keyboard::start(app_handle);

    #[cfg(target_os = "windows")]
    win_keyboard::start(app_handle);

    #[cfg(target_os = "linux")]
    linux_keyboard::start(app_handle);
}

// --- Window / Tray / Shortcut ---

fn toggle_window(app: &tauri::AppHandle) {
    let state = app.state::<WindowVisible>();
    let was_visible = state.0.fetch_xor(true, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("main") {
        if was_visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn update_tray_menu_labels(app: &tauri::AppHandle) {
    let visible = app.state::<WindowVisible>().0.load(Ordering::SeqCst);
    let pinned = app.state::<WindowPinned>().0.load(Ordering::SeqCst);
    let items = app.state::<TrayMenuItems>();
    let _ = items.show.set_text(if visible { "Hide Window" } else { "Show Window" });
    let _ = items.pin.set_text(if pinned { "Unpin from Top" } else { "Pin to Top" });
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Hide Window", true, None::<&str>)?;
    let pin = MenuItem::with_id(app, "pin", "Unpin from Top", true, None::<&str>)?;
    let heatmap = MenuItem::with_id(app, "heatmap", "Heatmap", true, None::<&str>)?;
    let perspective = MenuItem::with_id(app, "perspective", "Perspective: Left", true, None::<&str>)?;
    let stats = MenuItem::with_id(app, "stats", "Stats", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &pin, &heatmap, &perspective, &stats, &quit])?;

    app.manage(TrayMenuItems {
        show: show.clone(),
        pin: pin.clone(),
        heatmap: heatmap.clone(),
        perspective: perspective.clone(),
    });
    app.manage(HeatmapState(AtomicBool::new(false)));
    app.manage(PerspectiveState(AtomicBool::new(false)));

    TrayIconBuilder::new()
        .icon(tauri::include_image!("icons/tray-icon.png"))
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    toggle_window(app);
                    update_tray_menu_labels(app);
                }
                "pin" => {
                    let pinned = app.state::<WindowPinned>();
                    let was_pinned = pinned.0.fetch_xor(true, Ordering::SeqCst);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_always_on_top(!was_pinned);
                    }
                    update_tray_menu_labels(app);
                }
                "heatmap" => {
                    let state = app.state::<HeatmapState>();
                    let was_on = state.0.fetch_xor(true, Ordering::Relaxed);
                    let items = app.state::<TrayMenuItems>();
                    let _ = items.heatmap.set_text(if was_on { "Heatmap" } else { "Heatmap \u{2705}" });
                    let _ = app.emit("toggle-heatmap", ());
                }
                "perspective" => {
                    let state = app.state::<PerspectiveState>();
                    let was_on = state.0.fetch_xor(true, Ordering::Relaxed);
                    let items = app.state::<TrayMenuItems>();
                    let _ = items.perspective.set_text(if was_on { "Perspective: Left" } else { "Perspective: Right" });
                    let _ = app.emit("toggle-perspective", ());
                }
                "stats" => {
                    let visible = app.state::<WindowVisible>();
                    if !visible.0.load(Ordering::SeqCst) {
                        visible.0.store(true, Ordering::SeqCst);
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        update_tray_menu_labels(app);
                    }
                    let _ = app.emit("toggle-stats", ());
                }
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
                update_tray_menu_labels(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        toggle_window(app);
                        update_tray_menu_labels(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            check_accessibility,
            request_accessibility,
            start_listener,
        ])
        .setup(|app| {
            app.manage(ListenerStarted(AtomicBool::new(false)));
            app.manage(WindowVisible(AtomicBool::new(true)));
            app.manage(WindowPinned(AtomicBool::new(true)));
            setup_tray(app)?;

            // Workaround: transparent windows can disappear when dragged to a
            // display with a different backing scale factor (macOS WebKit bug).
            // A debounced 1px resize after move forces a redraw.
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                let pending = Arc::new(AtomicBool::new(false));
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Moved(_) = event {
                        if !pending.swap(true, Ordering::SeqCst) {
                            let w = w.clone();
                            let pending = pending.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(150));
                                if let Ok(size) = w.outer_size() {
                                    let _ = w.set_size(tauri::PhysicalSize::new(
                                        size.width + 1,
                                        size.height,
                                    ));
                                    let _ = w.set_size(size);
                                }
                                pending.store(false, Ordering::SeqCst);
                            });
                        }
                    }
                });
            }

            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyK);
            app.global_shortcut().register(shortcut)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
