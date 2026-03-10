# KeyFarm Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a desktop pet app shaped like an HHKB keyboard farm, where keystrokes grow fruit trees.

**Architecture:** Tauri v2 app with Rust backend handling global keyboard listening via `rdev`, emitting key events to a React + Canvas frontend that renders the HHKB farm grid. Game state persisted as local JSON.

**Tech Stack:** Tauri v2, Rust, rdev, React, TypeScript, HTML Canvas, serde_json

---

### Task 1: Scaffold Tauri v2 + React project

**Files:**
- Create: `keyfarm/` (entire project scaffold)

**Step 1: Create Tauri project**

Run:
```bash
cd /Users/dora/work
npm create tauri-app@latest keyfarm -- --manager npm --template react-ts
```

**Step 2: Install dependencies & verify build**

Run:
```bash
cd /Users/dora/work/keyfarm
npm install
npm run tauri dev
```

Expected: A default Tauri window opens with React content.

**Step 3: Init git repo & commit**

```bash
cd /Users/dora/work/keyfarm
git init
cp docs/plans/* .  # will handle after scaffold
git add -A
git commit -m "chore: scaffold Tauri v2 + React project"
```

---

### Task 2: Configure transparent window + always on top + draggable

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src/App.css` (transparent background)
- Modify: `src/index.css` (transparent body)
- Modify: `src/App.tsx` (add drag region)

**Step 1: Update tauri.conf.json window config**

In `src-tauri/tauri.conf.json`, set window properties:
```json
{
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "KeyFarm",
        "width": 900,
        "height": 340,
        "transparent": true,
        "alwaysOnTop": true,
        "decorations": false,
        "resizable": true
      }
    ]
  }
}
```

**Step 2: Make HTML/CSS fully transparent**

`src/index.css`:
```css
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}
```

`src/App.css`:
```css
.app-container {
  background: transparent;
  width: 100vw;
  height: 100vh;
}

.drag-region {
  -webkit-app-region: drag;
  height: 24px;
  cursor: move;
}
```

**Step 3: Add drag region to App.tsx**

```tsx
function App() {
  return (
    <div className="app-container">
      <div className="drag-region" data-tauri-drag-region />
      {/* Farm canvas will go here */}
    </div>
  );
}
```

**Step 4: Verify**

Run: `npm run tauri dev`
Expected: Transparent, borderless, always-on-top window that can be dragged.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: transparent window with always-on-top and drag support"
```

---

### Task 3: Define HHKB keyboard layout data + game state types

**Files:**
- Create: `src/data/hhkbLayout.ts`
- Create: `src/types/game.ts`

**Step 1: Create game types**

`src/types/game.ts`:
```typescript
export type FarmStage = 'empty' | 'watering' | 'sprout' | 'tree' | 'fruit';

export type FruitType = 'apple' | 'orange' | 'cherry' | 'grape' | 'peach' | 'lemon';

export interface FarmCell {
  keyCode: string;        // rdev key name, e.g. "KeyA"
  label: string;          // display label, e.g. "A"
  stage: FarmStage;
  hitCount: number;        // current hits in this stage
  fruitType: FruitType | null;
  row: number;
  col: number;
  width: number;           // relative width (1 = standard key)
}

export interface GameState {
  cells: Record<string, FarmCell>;  // keyed by keyCode
  totalHarvested: number;
}

export const STAGE_THRESHOLDS: Record<FarmStage, number> = {
  empty: 5,      // 5 hits → watering
  watering: 15,  // 15 hits → sprout
  sprout: 30,    // 30 hits → tree
  tree: 50,      // 50 hits → fruit
  fruit: 0,      // harvest by mouse
};

export const NEXT_STAGE: Record<FarmStage, FarmStage | null> = {
  empty: 'watering',
  watering: 'sprout',
  sprout: 'tree',
  tree: 'fruit',
  fruit: null,  // reset to empty on harvest
};

export const FRUIT_TYPES: FruitType[] = ['apple', 'orange', 'cherry', 'grape', 'peach', 'lemon'];
```

**Step 2: Create HHKB layout data**

`src/data/hhkbLayout.ts`:
```typescript
import { FarmCell } from '../types/game';

// HHKB layout: 5 rows
// Row 0: Esc 1 2 3 4 5 6 7 8 9 0 - = \ `  (15 keys)
// Row 1: Tab Q W E R T Y U I O P [ ] Del   (14 keys, Tab=1.5w, Del=1.5w)
// Row 2: Ctrl A S D F G H J K L ; ' Return (13 keys, Ctrl=1.75w, Return=2.25w)
// Row 3: Shift Z X C V B N M , . / Shift Fn (13 keys, LShift=2.25w, RShift=1.75w)
// Row 4: Opt Cmd Space Cmd Opt               (5 keys, Space=6.25w) -- skip for POC

interface KeyDef {
  keyCode: string;
  label: string;
  width: number; // 1 = standard key width
}

const ROW_0: KeyDef[] = [
  { keyCode: 'Escape', label: 'Esc', width: 1 },
  { keyCode: 'Num1', label: '1', width: 1 },
  { keyCode: 'Num2', label: '2', width: 1 },
  { keyCode: 'Num3', label: '3', width: 1 },
  { keyCode: 'Num4', label: '4', width: 1 },
  { keyCode: 'Num5', label: '5', width: 1 },
  { keyCode: 'Num6', label: '6', width: 1 },
  { keyCode: 'Num7', label: '7', width: 1 },
  { keyCode: 'Num8', label: '8', width: 1 },
  { keyCode: 'Num9', label: '9', width: 1 },
  { keyCode: 'Num0', label: '0', width: 1 },
  { keyCode: 'Minus', label: '-', width: 1 },
  { keyCode: 'Equal', label: '=', width: 1 },
  { keyCode: 'BackSlash', label: '\\', width: 1 },
  { keyCode: 'BackQuote', label: '`', width: 1 },
];

const ROW_1: KeyDef[] = [
  { keyCode: 'Tab', label: 'Tab', width: 1.5 },
  { keyCode: 'KeyQ', label: 'Q', width: 1 },
  { keyCode: 'KeyW', label: 'W', width: 1 },
  { keyCode: 'KeyE', label: 'E', width: 1 },
  { keyCode: 'KeyR', label: 'R', width: 1 },
  { keyCode: 'KeyT', label: 'T', width: 1 },
  { keyCode: 'KeyY', label: 'Y', width: 1 },
  { keyCode: 'KeyU', label: 'U', width: 1 },
  { keyCode: 'KeyI', label: 'I', width: 1 },
  { keyCode: 'KeyO', label: 'O', width: 1 },
  { keyCode: 'KeyP', label: 'P', width: 1 },
  { keyCode: 'LeftBracket', label: '[', width: 1 },
  { keyCode: 'RightBracket', label: ']', width: 1 },
  { keyCode: 'Delete', label: 'Del', width: 1.5 },
];

const ROW_2: KeyDef[] = [
  { keyCode: 'ControlLeft', label: 'Ctrl', width: 1.75 },
  { keyCode: 'KeyA', label: 'A', width: 1 },
  { keyCode: 'KeyS', label: 'S', width: 1 },
  { keyCode: 'KeyD', label: 'D', width: 1 },
  { keyCode: 'KeyF', label: 'F', width: 1 },
  { keyCode: 'KeyG', label: 'G', width: 1 },
  { keyCode: 'KeyH', label: 'H', width: 1 },
  { keyCode: 'KeyJ', label: 'J', width: 1 },
  { keyCode: 'KeyK', label: 'K', width: 1 },
  { keyCode: 'KeyL', label: 'L', width: 1 },
  { keyCode: 'SemiColon', label: ';', width: 1 },
  { keyCode: 'Quote', label: "'", width: 1 },
  { keyCode: 'Return', label: 'Ret', width: 2.25 },
];

const ROW_3: KeyDef[] = [
  { keyCode: 'ShiftLeft', label: 'Shift', width: 2.25 },
  { keyCode: 'KeyZ', label: 'Z', width: 1 },
  { keyCode: 'KeyX', label: 'X', width: 1 },
  { keyCode: 'KeyC', label: 'C', width: 1 },
  { keyCode: 'KeyV', label: 'V', width: 1 },
  { keyCode: 'KeyB', label: 'B', width: 1 },
  { keyCode: 'KeyN', label: 'N', width: 1 },
  { keyCode: 'KeyM', label: 'M', width: 1 },
  { keyCode: 'Comma', label: ',', width: 1 },
  { keyCode: 'Dot', label: '.', width: 1 },
  { keyCode: 'Slash', label: '/', width: 1 },
  { keyCode: 'ShiftRight', label: 'Shift', width: 1.75 },
  { keyCode: 'Function', label: 'Fn', width: 1 },
];

export const HHKB_ROWS: KeyDef[][] = [ROW_0, ROW_1, ROW_2, ROW_3];

export function createInitialCells(): Record<string, FarmCell> {
  const cells: Record<string, FarmCell> = {};

  HHKB_ROWS.forEach((row, rowIdx) => {
    let colOffset = 0;
    row.forEach((key) => {
      cells[key.keyCode] = {
        keyCode: key.keyCode,
        label: key.label,
        stage: 'empty',
        hitCount: 0,
        fruitType: null,
        row: rowIdx,
        col: colOffset,
        width: key.width,
      };
      colOffset += key.width;
    });
  });

  return cells;
}
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add HHKB layout data and game state types"
```

---

### Task 4: Rust backend — global keyboard listener + emit events

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs` (or `lib.rs` depending on scaffold)
- Modify: `src-tauri/capabilities/default.json` (if needed for permissions)

**Step 1: Add rdev + serde dependencies to Cargo.toml**

Add to `[dependencies]`:
```toml
rdev = "0.5"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**Step 2: Implement keyboard listener in Rust**

```rust
use rdev::{listen, Event, EventType, Key};
use serde::Serialize;
use std::thread;
use tauri::Emitter;

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

pub fn start_keyboard_listener(app_handle: tauri::AppHandle) {
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
```

Wire it up in the Tauri setup:
```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            start_keyboard_listener(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3: Verify**

Run: `npm run tauri dev`
Open browser console via devtools. Listen for `key-press` events.
Expected: Typing on keyboard emits events even when window is not focused.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: global keyboard listener with rdev, emitting key-press events"
```

---

### Task 5: Game state management (React hook)

**Files:**
- Create: `src/hooks/useGameState.ts`

**Step 1: Create game state hook**

`src/hooks/useGameState.ts`:
```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { GameState, FarmCell, FarmStage, STAGE_THRESHOLDS, NEXT_STAGE, FRUIT_TYPES } from '../types/game';
import { createInitialCells } from '../data/hhkbLayout';

const SAVE_KEY = 'keyfarm-save';

function getRandomFruit() {
  return FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
}

function loadState(): GameState {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { cells: createInitialCells(), totalHarvested: 0 };
}

function saveState(state: GameState) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(loadState);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  // Auto-save every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => saveState(stateRef.current), 10000);
    return () => clearInterval(interval);
  }, []);

  // Save on unmount
  useEffect(() => {
    return () => saveState(stateRef.current);
  }, []);

  // Listen for key press events from Rust backend
  useEffect(() => {
    const unlisten = listen<{ key_code: string }>('key-press', (event) => {
      const keyCode = event.payload.key_code;
      setGameState((prev) => {
        const cell = prev.cells[keyCode];
        if (!cell || cell.stage === 'fruit') return prev;

        const newHitCount = cell.hitCount + 1;
        const threshold = STAGE_THRESHOLDS[cell.stage];
        let newStage = cell.stage;
        let newCount = newHitCount;
        let newFruit = cell.fruitType;

        if (newHitCount >= threshold) {
          const next = NEXT_STAGE[cell.stage];
          if (next) {
            newStage = next;
            newCount = 0;
            if (next === 'fruit') {
              newFruit = getRandomFruit();
            }
          }
        }

        // Assign random fruit on first watering
        if (cell.stage === 'empty' && newStage === 'watering' && !newFruit) {
          newFruit = getRandomFruit();
        }

        return {
          ...prev,
          cells: {
            ...prev.cells,
            [keyCode]: {
              ...cell,
              stage: newStage,
              hitCount: newCount,
              fruitType: newFruit,
            },
          },
        };
      });
    });

    return () => { unlisten.then(fn => fn()); };
  }, []);

  const harvest = useCallback((keyCode: string) => {
    setGameState((prev) => {
      const cell = prev.cells[keyCode];
      if (!cell || cell.stage !== 'fruit') return prev;
      return {
        ...prev,
        totalHarvested: prev.totalHarvested + 1,
        cells: {
          ...prev.cells,
          [keyCode]: {
            ...cell,
            stage: 'empty',
            hitCount: 0,
            fruitType: null,
          },
        },
      };
    });
  }, []);

  return { gameState, harvest };
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: game state management hook with keyboard event handling"
```

---

### Task 6: Canvas rendering — HHKB farm grid

**Files:**
- Create: `src/components/FarmCanvas.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Step 1: Create FarmCanvas component**

`src/components/FarmCanvas.tsx`:
```tsx
import { useRef, useEffect, useCallback } from 'react';
import { GameState, FarmStage } from '../types/game';
import { HHKB_ROWS } from '../data/hhkbLayout';

const CELL_SIZE = 52;
const CELL_GAP = 4;
const PADDING = 16;

const STAGE_COLORS: Record<FarmStage, string> = {
  empty: '#8B7355',      // brown soil
  watering: '#4A90D9',   // blue water
  sprout: '#7EC850',     // light green
  tree: '#2D8B46',       // dark green
  fruit: '#FF6B6B',      // red (will vary by fruit)
};

const FRUIT_EMOJI: Record<string, string> = {
  apple: '🍎',
  orange: '🍊',
  cherry: '🍒',
  grape: '🍇',
  peach: '🍑',
  lemon: '🍋',
};

const STAGE_EMOJI: Record<FarmStage, string> = {
  empty: '🟫',
  watering: '💧',
  sprout: '🌱',
  tree: '🌳',
  fruit: '',  // use fruit-specific emoji
};

interface FarmCanvasProps {
  gameState: GameState;
  onHarvest: (keyCode: string) => void;
}

export function FarmCanvas({ gameState, onHarvest }: FarmCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellRectsRef = useRef<Map<string, { x: number; y: number; w: number; h: number }>>(new Map());

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cellRectsRef.current.clear();

    HHKB_ROWS.forEach((row, rowIdx) => {
      let xOffset = PADDING;
      const y = PADDING + rowIdx * (CELL_SIZE + CELL_GAP);

      row.forEach((keyDef) => {
        const cell = gameState.cells[keyDef.keyCode];
        const w = keyDef.width * CELL_SIZE + (keyDef.width - 1) * CELL_GAP;
        const h = CELL_SIZE;

        cellRectsRef.current.set(keyDef.keyCode, { x: xOffset, y, w, h });

        // Background
        const stage = cell?.stage || 'empty';
        ctx.fillStyle = STAGE_COLORS[stage];
        ctx.beginPath();
        ctx.roundRect(xOffset, y, w, h, 8);
        ctx.fill();

        // Emoji
        const emoji = stage === 'fruit' && cell?.fruitType
          ? FRUIT_EMOJI[cell.fruitType] || '🍎'
          : STAGE_EMOJI[stage];

        ctx.font = '24px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, xOffset + w / 2, y + h / 2 - 4);

        // Key label
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(keyDef.label, xOffset + w / 2, y + h - 8);

        // Progress bar
        if (cell && stage !== 'fruit' && stage !== 'empty') {
          const threshold = { watering: 15, sprout: 30, tree: 50 }[stage] || 1;
          const progress = cell.hitCount / threshold;
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(xOffset + 4, y + h - 4, (w - 8) * progress, 2);
        }

        xOffset += w + CELL_GAP;
      });
    });
  }, [gameState]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const [keyCode, cellRect] of cellRectsRef.current.entries()) {
      if (
        x >= cellRect.x && x <= cellRect.x + cellRect.w &&
        y >= cellRect.y && y <= cellRect.y + cellRect.h
      ) {
        const cell = gameState.cells[keyCode];
        if (cell?.stage === 'fruit') {
          onHarvest(keyCode);
          canvas.style.cursor = 'grab';
          return;
        }
      }
    }
    canvas.style.cursor = 'default';
  }, [gameState, onHarvest]);

  // Calculate canvas size
  const maxRowWidth = HHKB_ROWS.reduce((max, row) => {
    const rowWidth = row.reduce((sum, k) => sum + k.width * CELL_SIZE + (k.width - 1) * CELL_GAP + CELL_GAP, 0);
    return Math.max(max, rowWidth);
  }, 0);

  const canvasWidth = maxRowWidth + PADDING * 2;
  const canvasHeight = HHKB_ROWS.length * (CELL_SIZE + CELL_GAP) + PADDING * 2;

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      onMouseMove={handleMouseMove}
      style={{ display: 'block' }}
    />
  );
}
```

**Step 2: Wire up App.tsx**

```tsx
import { FarmCanvas } from './components/FarmCanvas';
import { useGameState } from './hooks/useGameState';
import './App.css';

function App() {
  const { gameState, harvest } = useGameState();

  return (
    <div className="app-container">
      <div className="drag-region" data-tauri-drag-region />
      <FarmCanvas gameState={gameState} onHarvest={harvest} />
    </div>
  );
}

export default App;
```

**Step 3: Verify**

Run: `npm run tauri dev`
Expected: See HHKB-shaped grid of brown soil squares. Typing keys should change their state progressively. Mouse hover on fruiting cells harvests them.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: Canvas rendering of HHKB farm grid with harvest interaction"
```

---

### Task 7: System tray + show/hide toggle

**Files:**
- Modify: `src-tauri/Cargo.toml` (add tray-icon feature)
- Modify: `src-tauri/src/main.rs`
- Add: `src-tauri/icons/tray-icon.png` (32x32 icon)

**Step 1: Enable tray feature in Cargo.toml**

Ensure tauri has `"tray-icon"` feature:
```toml
tauri = { version = "2", features = ["tray-icon"] }
```

**Step 2: Add system tray setup in Rust**

```rust
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::Manager;

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show/Hide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
```

Add to setup:
```rust
.setup(|app| {
    start_keyboard_listener(app.handle().clone());
    setup_tray(app)?;
    Ok(())
})
```

**Step 3: Verify**

Run: `npm run tauri dev`
Expected: Tray icon appears. Right-click shows Show/Hide and Quit. Left-click toggles window visibility.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: system tray with show/hide toggle and quit"
```

---

### Task 8: Global shortcut for show/hide

**Files:**
- Modify: `src-tauri/Cargo.toml` (add global-shortcut plugin)
- Modify: `src-tauri/src/main.rs`

**Step 1: Add global shortcut plugin**

```toml
tauri-plugin-global-shortcut = "2"
```

**Step 2: Register shortcut in Rust**

```rust
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

// In setup:
let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyK);
app.handle().plugin(
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, _shortcut, event| {
            if event == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(),
)?;
app.global_shortcut().register(shortcut)?;
```

**Step 3: Verify**

Run: `npm run tauri dev`
Expected: `Cmd+Shift+K` toggles window visibility.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: global shortcut Cmd+Shift+K to toggle window"
```

---

### Task 9: Polish — hit animation + harvest animation

**Files:**
- Modify: `src/components/FarmCanvas.tsx` (add animation state)
- Modify: `src/hooks/useGameState.ts` (emit animation triggers)

**Step 1: Add simple hit flash animation**

Track recently-hit keys and render a brief flash/scale effect on the canvas. Add a `recentHits` state that clears after 200ms.

**Step 2: Add harvest sparkle**

When a cell is harvested, show a brief sparkle/pop animation at that cell position before it resets.

**Step 3: Verify visually**

Run: `npm run tauri dev`
Expected: Pressing keys shows a quick visual feedback. Harvesting shows a brief sparkle.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: hit and harvest animations"
```

---

### Task 10: Final integration test + cleanup

**Step 1: Full flow test**

Run `npm run tauri dev` and verify:
- [ ] Window is transparent, always on top, draggable
- [ ] Typing keys grows the farmland progressively
- [ ] Fruit appears after enough keystrokes
- [ ] Mouse hover harvests fruit
- [ ] Tray icon works (show/hide/quit)
- [ ] Cmd+Shift+K toggles visibility
- [ ] Close and reopen: state is preserved

**Step 2: Clean up scaffold boilerplate**

Remove default React logos, unused CSS, example components.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: cleanup boilerplate, verify full POC flow"
```
