# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# KeyFarm

Tauri v2 desktop app (macOS, Windows, Linux) — React + Vite frontend, Rust backend.

## Dev Commands

```sh
npm install
npm run tauri dev      # Run in development mode
npm run tauri build    # Production build
npm run lint           # ESLint
```

Requires Node.js 22+ and Rust 1.77+.

## Architecture

### Keyboard Event Flow

```
Physical key press
  → Rust: CoreGraphics event tap (macOS) / Win32 hook (Windows)
    / X11 XInput2 raw key events (Linux, default)
    / evdev fallback (Linux when X11 is unavailable)
  → Tauri event: 'key-press' with { key_code: string }
  → React: useGameState.ts listens, updates cells{} in game state
```

The Rust backend (`src-tauri/src/lib.rs`) contains platform-specific keyboard hooks:
- `mac_keyboard` module: CGEventTapCreate for macOS (requires Accessibility permission)
- `win_keyboard` module: SetWindowsHookExW for Windows
- `linux_keyboard` module: X11/XInput2 raw key events by default on Linux, with `evdev` fallback when X11 is unavailable

### Game State (React)

`useGameState` hook (`src/hooks/useGameState.ts`) owns all game logic:
- Cell growth: empty → watering → sprout → tree → fruit (based on `STAGE_THRESHOLDS`)
- Persistence: auto-saves to `store.json` via `@tauri-apps/plugin-store` every 10s
- Events: pest spawning, duck/cat animal spawning, worker timers

State is stored in `LazyStore` and includes: cells, harvests, keyPresses, dailyStats, workers, animals.

### Keyboard Layout

HHKB layout defined in `src/data/hhkbLayout.ts`. Keys have `width` multipliers (Tab=1.5, Ctrl=1.75, etc.). Platform differences (Windows shows CapsLock/Ctrl where macOS shows Ctrl/Fn) are handled by `IS_WINDOWS` constant.

### Frontend Components

- `FarmCanvas.tsx` — renders isometric farm grid on canvas
- `farmRenderers.ts` — drawing functions for each crop stage
- `StatsPanel.tsx` — collection stats, worker management
- `animalCharacters.ts`, `dogCharacter.ts`, `catCharacter.ts` — roaming animal sprites

## Release Process

Build → Sign → Notarize → Staple → Upload R2 → Deploy site

```bash
./sign-and-build.sh   # One-shot (gitignored, contains signing keys)
npx wrangler pages deploy site --project-name keyfarm
```

## Important Paths

| Path | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | Version, window config, bundle targets |
| `src-tauri/src/lib.rs` | Rust entry point, keyboard hooks, tray |
| `src/hooks/useGameState.ts` | Core game logic + state |
| `src/types/game.ts` | All game constants and type definitions |
| `site/` | Static website (deploy after changes) |

## Version Updates

When bumping version, sync across: `tauri.conf.json`, `sign-and-build.sh` DMG path, `site/index.html` download link.
