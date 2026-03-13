# Animal Character System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a duck character that roams the farm grid, fertilizes growing tiles (stage +1), harvests fruit, flees from the mouse cursor, and can be eaten by animal-type crops.

**Architecture:** Parallel system to existing farmer workers. New `animalCharacters.ts` module handles duck AI (movement, target selection, mouse flee, death). New callbacks in `useGameState` handle fertilize and duck death. Ducks render as HTML overlay sprites (same approach as farmers). Milestone-based capacity unlocking with time-based spawning.

**Tech Stack:** TypeScript, React, Canvas 2D + HTML overlay, Tauri store persistence.

---

### Task 1: Copy assets and add types

**Files:**
- Copy: `~/Desktop/duck_idle.gif` → `src/assets/duck-idle.gif`
- Copy: `~/Desktop/duck_walk.gif` → `src/assets/duck-walk.gif`
- Copy: `~/Desktop/puke.gif` → `src/assets/puke.gif`
- Modify: `src/types/game.ts`

**Step 1: Copy assets**

```bash
cp ~/Desktop/duck_idle.gif src/assets/duck-idle.gif
cp ~/Desktop/duck_walk.gif src/assets/duck-walk.gif
cp ~/Desktop/puke.gif src/assets/puke.gif
```

**Step 2: Add types to `src/types/game.ts`**

After the existing `SpeedTier` interface (line 75), add:

```typescript
// ── Animal character types ─────────────────────────────────────────
export interface AnimalDef {
  id: string;
  sprites: { idle: string; walk: string; action: string };
  size: number;
  moveSpeed: number;
  zIndexOffset: number;
  spawnCapTiers: { harvests: number; cap: number }[];
  respawnDelay: [number, number]; // [min, max] seconds
  spawnInterval: [number, number]; // [min, max] seconds
  mouseReaction: {
    type: 'flee';
    triggerRadius: number;
    fleeDistance: number;
    fleeSpeedMultiplier: number;
  };
}

export interface AnimalInstance {
  id: string;
  animalId: string;
  col: number;
  row: number;
  state: 'idle' | 'walking' | 'working' | 'fleeing' | 'dead';
  facingLeft: boolean;
  targetKey: string | null;
  actionType: 'harvest' | 'fertilize' | null;
  moveStartCol: number;
  moveStartRow: number;
  moveEndCol: number;
  moveEndRow: number;
  moveStartTime: number;
  moveDuration: number;
  workStartTime: number;
  diedAt: number | null;
  nextActionTime: number;
}
```

**Step 3: Add `animals` field to `GameState` interface (line 49)**

```typescript
export interface GameState {
  cells: Record<string, FarmCell>;
  totalHarvested: number;
  harvestsByCrop: Record<string, number>;
  goldenHarvests: Record<string, number>;
  totalKeyPresses: Record<string, number>;
  totalPestsRemoved: number;
  dailyStats: DailyEntry[];
  workers: number;
  workerSpeed: number;
  animals: AnimalInstance[];  // <-- NEW
}
```

**Step 4: Add duck spawn tier constants**

After `GOLDEN_CHANCE` (line 123), add:

```typescript
export const DUCK_SPAWN_TIERS: { harvests: number; cap: number }[] = [
  { harvests: 0, cap: 0 },
  { harvests: 100, cap: 1 },
  { harvests: 500, cap: 2 },
  { harvests: 1500, cap: 3 },
  { harvests: 3000, cap: 4 },
  { harvests: 6000, cap: 5 },
];

export const DUCK_SPAWN_INTERVAL: [number, number] = [60_000, 90_000]; // ms
export const DUCK_RESPAWN_DELAY: [number, number] = [120_000, 180_000]; // ms
```

**Step 5: Commit**

```bash
git add src/assets/duck-idle.gif src/assets/duck-walk.gif src/assets/puke.gif src/types/game.ts
git commit -m "feat: add animal character types and duck assets"
```

---

### Task 2: Create `animalCharacters.ts` — core duck AI

**Files:**
- Create: `src/components/animalCharacters.ts`

**Step 1: Create the file with full duck AI**

This module mirrors `roamingCharacters.ts` architecture. Key differences:
- Ducks have a `fleeing` state for mouse avoidance
- Target selection: fertilize (growing tiles) > harvest (non-animal fruit) > roam
- Mouse position checked every frame; triggers flee if within radius
- Grid bounds: col 0-15, row 0-4.5 (HHKB grid)

```typescript
import duckIdleGif from "../assets/duck-idle.gif";
import duckWalkGif from "../assets/duck-walk.gif";
import pukeGif from "../assets/puke.gif";
import { gridToScreen } from "../utils/isometric";
import type { FarmCell, AnimalInstance } from "../types/game";
import { CROP_MAP } from "../data/crops";

// ── Constants ───────────────────────────────────────────────────────
const DUCK_SIZE = 40;
const MOVE_SPEED = 2.5; // grid units per second
const FLEE_SPEED_MULTIPLIER = 1.5;
const WORK_DURATION = 1000;
const FLEE_TRIGGER_RADIUS = 2.5; // grid units
const FLEE_DISTANCE = 3;
const NO_TARGET_RETRY = 3000;
const ROAM_IDLE_MIN = 1000;
const ROAM_IDLE_MAX = 3000;
const ROAM_DIST_MIN = 2;
const ROAM_DIST_MAX = 4;
const ANIMAL_EAT_CHANCE = 0.3; // chance of being eaten when roaming past animal fruit
const DEATH_ANIM_DURATION = 800;

// Grid bounds (HHKB layout)
const GRID_COL_MIN = 0.5;
const GRID_COL_MAX = 14.5;
const GRID_ROW_MIN = 0;
const GRID_ROW_MAX = 4.5;

type DuckDisplayState = "idle" | "walking" | "puke" | "dead";

const DISPLAY_GIFS: Record<DuckDisplayState, string> = {
  idle: duckIdleGif,
  walking: duckWalkGif,
  puke: pukeGif,
  dead: duckIdleGif, // will be hidden via opacity
};

// ── Duck DOM elements (parallel to farmer.el approach) ──────────────
const duckElements = new Map<string, {
  el: HTMLImageElement;
  displayState: DuckDisplayState | null;
}>();

// ── Mouse position in grid coordinates ──────────────────────────────
let mouseGridCol = -100;
let mouseGridRow = -100;

export function setMouseGridPosition(col: number, row: number): void {
  mouseGridCol = col;
  mouseGridRow = row;
}

// ── Helpers ─────────────────────────────────────────────────────────
function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clampCol(col: number): number {
  return Math.max(GRID_COL_MIN, Math.min(GRID_COL_MAX, col));
}

function clampRow(row: number): number {
  return Math.max(GRID_ROW_MIN, Math.min(GRID_ROW_MAX, row));
}

/** Get spawn position at a random grid edge. */
function getEdgeSpawnPosition(): { col: number; row: number } {
  const side = Math.floor(Math.random() * 4);
  switch (side) {
    case 0: return { col: randomBetween(GRID_COL_MIN, GRID_COL_MAX), row: GRID_ROW_MIN - 0.5 };
    case 1: return { col: randomBetween(GRID_COL_MIN, GRID_COL_MAX), row: GRID_ROW_MAX + 0.5 };
    case 2: return { col: GRID_COL_MIN - 0.5, row: randomBetween(GRID_ROW_MIN, GRID_ROW_MAX) };
    default: return { col: GRID_COL_MAX + 0.5, row: randomBetween(GRID_ROW_MIN, GRID_ROW_MAX) };
  }
}

/** Get keyCodes already targeted by other ducks. */
function getClaimedTargets(animals: AnimalInstance[], excludeId: string): Set<string> {
  const claimed = new Set<string>();
  for (const a of animals) {
    if (a.id !== excludeId && a.targetKey) {
      claimed.add(a.targetKey);
    }
  }
  return claimed;
}

/** Check if mouse is close enough to trigger flee. */
function shouldFlee(duck: AnimalInstance): boolean {
  const dist = Math.hypot(mouseGridCol - duck.col, mouseGridRow - duck.row);
  return dist < FLEE_TRIGGER_RADIUS;
}

/** Calculate flee destination (opposite direction from mouse). */
function getFleeTarget(duck: AnimalInstance): { col: number; row: number } {
  const dx = duck.col - mouseGridCol;
  const dy = duck.row - mouseGridRow;
  const dist = Math.hypot(dx, dy) || 1;
  const normX = dx / dist;
  const normY = dy / dist;
  return {
    col: clampCol(duck.col + normX * FLEE_DISTANCE),
    row: clampRow(duck.row + normY * FLEE_DISTANCE),
  };
}

// Stage priority for fertilizing (lower stage = higher priority)
const FERTILIZE_PRIORITY: Record<string, number> = {
  watering: 0,
  sprout: 1,
  tree: 2,
};

/** Find best target for a duck: fertilize > harvest > null (roam). */
function findTarget(
  duck: AnimalInstance,
  animals: AnimalInstance[],
  cells: Record<string, FarmCell>,
): { keyCode: string; col: number; row: number; type: "harvest" | "fertilize" } | null {
  const claimed = getClaimedTargets(animals, duck.id);

  const targets: {
    keyCode: string;
    col: number;
    row: number;
    type: "harvest" | "fertilize";
    priority: number;
    dist: number;
  }[] = [];

  for (const [keyCode, cell] of Object.entries(cells)) {
    if (keyCode.startsWith("_gap")) continue;
    if (claimed.has(keyCode)) continue;
    if (cell.hasPest) continue;

    const col = cell.col + cell.width / 2;
    const row = cell.row + 0.5;
    const dist = Math.hypot(col - duck.col, row - duck.row);

    // Fertilize targets: growing stages
    if (cell.stage === "watering" || cell.stage === "sprout" || cell.stage === "tree") {
      targets.push({
        keyCode, col, row,
        type: "fertilize",
        priority: FERTILIZE_PRIORITY[cell.stage] ?? 9,
        dist,
      });
    }
    // Harvest targets: non-animal fruit only
    else if (cell.stage === "fruit" && cell.cropId) {
      const crop = CROP_MAP[cell.cropId];
      if (crop && crop.category !== "animal") {
        targets.push({
          keyCode, col, row,
          type: "harvest",
          priority: 10, // lower priority than fertilize
          dist,
        });
      }
    }
  }

  if (targets.length === 0) return null;

  // Sort: fertilize first (by stage priority), then harvest, then by distance
  targets.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.dist - b.dist;
  });

  return targets[0];
}

/** Get a random roam destination within grid bounds. */
function getRandomRoamTarget(duck: AnimalInstance): { col: number; row: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = randomBetween(ROAM_DIST_MIN, ROAM_DIST_MAX);
  return {
    col: clampCol(duck.col + Math.cos(angle) * dist),
    row: clampRow(duck.row + Math.sin(angle) * dist * 0.5), // flatter movement for isometric
  };
}

/** Start moving a duck to a target position. */
function startMoveTo(
  duck: AnimalInstance,
  targetCol: number,
  targetRow: number,
  speedMultiplier: number = 1,
): void {
  const dist = Math.hypot(targetCol - duck.col, targetRow - duck.row);
  duck.moveStartCol = duck.col;
  duck.moveStartRow = duck.row;
  duck.moveEndCol = targetCol;
  duck.moveEndRow = targetRow;
  duck.facingLeft = targetCol < duck.col;
  duck.moveDuration = (dist / (MOVE_SPEED * speedMultiplier)) * 1000;
  duck.moveStartTime = Date.now();
}

// ── Callbacks interface ─────────────────────────────────────────────
export interface AnimalCallbacks {
  onHarvest: (keyCode: string) => void;
  onFertilize: (keyCode: string) => void;
  onDuckEaten: (duckId: string) => void;
}

/** Check if duck is near an animal-type fruit cell and might get eaten. */
function checkAnimalDanger(
  duck: AnimalInstance,
  cells: Record<string, FarmCell>,
): string | null {
  // Check all fruit cells with animal category near the duck
  for (const [keyCode, cell] of Object.entries(cells)) {
    if (keyCode.startsWith("_gap")) continue;
    if (cell.stage !== "fruit" || !cell.cropId) continue;
    const crop = CROP_MAP[cell.cropId];
    if (!crop || crop.category !== "animal") continue;

    const cellCol = cell.col + cell.width / 2;
    const cellRow = cell.row + 0.5;
    const dist = Math.hypot(cellCol - duck.col, cellRow - duck.row);
    if (dist < 0.8) {
      return keyCode;
    }
  }
  return null;
}

// ── Update single duck ──────────────────────────────────────────────
function updateSingleDuck(
  duck: AnimalInstance,
  now: number,
  animals: AnimalInstance[],
  cells: Record<string, FarmCell>,
  callbacks: AnimalCallbacks,
): void {
  if (duck.state === "dead") return;

  // ── Mouse flee check (highest priority, interrupts everything except dead/working-completion) ──
  if (duck.state !== "working" && duck.state !== "fleeing" && shouldFlee(duck)) {
    const fleeTarget = getFleeTarget(duck);
    duck.state = "fleeing";
    duck.targetKey = null;
    duck.actionType = null;
    startMoveTo(duck, fleeTarget.col, fleeTarget.row, FLEE_SPEED_MULTIPLIER);
    return;
  }

  switch (duck.state) {
    case "idle": {
      if (now < duck.nextActionTime) break;

      // Check for nearby animal danger while idle
      const dangerKey = checkAnimalDanger(duck, cells);
      if (dangerKey && Math.random() < ANIMAL_EAT_CHANCE) {
        duck.state = "dead";
        duck.diedAt = now;
        callbacks.onDuckEaten(duck.id);
        break;
      }

      const target = findTarget(duck, animals, cells);
      if (target) {
        const dist = Math.hypot(target.col - duck.col, target.row - duck.row);
        if (dist < 0.3) {
          duck.col = target.col;
          duck.row = target.row;
          duck.targetKey = target.keyCode;
          duck.actionType = target.type;
          duck.state = "working";
          duck.workStartTime = now;
          break;
        }
        duck.targetKey = target.keyCode;
        duck.actionType = target.type;
        duck.state = "walking";
        startMoveTo(duck, target.col, target.row);
      } else {
        // Roam randomly
        const roamTarget = getRandomRoamTarget(duck);
        duck.targetKey = null;
        duck.actionType = null;
        duck.state = "walking";
        startMoveTo(duck, roamTarget.col, roamTarget.row);
      }
      break;
    }

    case "walking": {
      const elapsed = now - duck.moveStartTime;
      const t = Math.min(1, elapsed / duck.moveDuration);
      const eased = easeInOutQuad(t);
      duck.col = duck.moveStartCol + (duck.moveEndCol - duck.moveStartCol) * eased;
      duck.row = duck.moveStartRow + (duck.moveEndRow - duck.moveStartRow) * eased;

      if (t >= 1) {
        duck.col = duck.moveEndCol;
        duck.row = duck.moveEndRow;

        // Check animal danger on arrival
        const dangerKey = checkAnimalDanger(duck, cells);
        if (dangerKey) {
          // If we were walking toward a target that became animal fruit, definitely eaten
          if (duck.targetKey && dangerKey === duck.targetKey) {
            duck.state = "dead";
            duck.diedAt = now;
            callbacks.onDuckEaten(duck.id);
            break;
          }
          // Random encounter while roaming
          if (Math.random() < ANIMAL_EAT_CHANCE) {
            duck.state = "dead";
            duck.diedAt = now;
            callbacks.onDuckEaten(duck.id);
            break;
          }
        }

        if (duck.targetKey) {
          // Verify target is still valid
          const cell = cells[duck.targetKey];
          if (cell) {
            const isValidFertilize = duck.actionType === "fertilize" &&
              ["watering", "sprout", "tree"].includes(cell.stage) && !cell.hasPest;
            const isValidHarvest = duck.actionType === "harvest" &&
              cell.stage === "fruit" && cell.cropId &&
              CROP_MAP[cell.cropId]?.category !== "animal";

            if (isValidFertilize || isValidHarvest) {
              duck.state = "working";
              duck.workStartTime = now;
              break;
            }
          }
          // Target invalid, go idle
          duck.targetKey = null;
          duck.actionType = null;
        }

        duck.state = "idle";
        duck.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
      }
      break;
    }

    case "working": {
      if (now >= duck.workStartTime + WORK_DURATION) {
        if (duck.targetKey) {
          const cell = cells[duck.targetKey];
          if (cell) {
            if (duck.actionType === "fertilize" &&
                ["watering", "sprout", "tree"].includes(cell.stage) && !cell.hasPest) {
              callbacks.onFertilize(duck.targetKey);
            } else if (duck.actionType === "harvest" &&
                       cell.stage === "fruit" && cell.cropId) {
              const crop = CROP_MAP[cell.cropId];
              if (crop && crop.category === "animal") {
                // Arrived at what became animal fruit — eaten!
                duck.state = "dead";
                duck.diedAt = now;
                callbacks.onDuckEaten(duck.id);
                break;
              }
              callbacks.onHarvest(duck.targetKey);
            }
          }
        }
        duck.state = "idle";
        duck.targetKey = null;
        duck.actionType = null;
        duck.nextActionTime = now + randomBetween(NO_TARGET_RETRY, NO_TARGET_RETRY * 2);
      }
      break;
    }

    case "fleeing": {
      const elapsed = now - duck.moveStartTime;
      const t = Math.min(1, elapsed / duck.moveDuration);
      const eased = easeInOutQuad(t);
      duck.col = duck.moveStartCol + (duck.moveEndCol - duck.moveStartCol) * eased;
      duck.row = duck.moveStartRow + (duck.moveEndRow - duck.moveStartRow) * eased;

      if (t >= 1) {
        duck.col = duck.moveEndCol;
        duck.row = duck.moveEndRow;
        duck.state = "idle";
        duck.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
      } else if (shouldFlee(duck)) {
        // Still in flee range — update flee target
        const newFleeTarget = getFleeTarget(duck);
        const currentCol = duck.col;
        const currentRow = duck.row;
        duck.moveStartCol = currentCol;
        duck.moveStartRow = currentRow;
        duck.moveEndCol = newFleeTarget.col;
        duck.moveEndRow = newFleeTarget.row;
        duck.facingLeft = newFleeTarget.col < currentCol;
        const dist = Math.hypot(newFleeTarget.col - currentCol, newFleeTarget.row - currentRow);
        duck.moveDuration = (dist / (MOVE_SPEED * FLEE_SPEED_MULTIPLIER)) * 1000;
        duck.moveStartTime = now;
      }
      break;
    }
  }
}

// ── Render single duck ──────────────────────────────────────────────
function renderSingleDuck(
  duck: AnimalInstance,
  overlay: HTMLDivElement,
  originX: number,
  originY: number,
  flipFactor: number,
  tileW: number,
  tileH: number,
  now: number,
): void {
  let entry = duckElements.get(duck.id);

  // Handle dead ducks
  if (duck.state === "dead") {
    if (entry) {
      if (duck.diedAt && now - duck.diedAt < DEATH_ANIM_DURATION) {
        // Death animation: shrink + fade
        const progress = (now - duck.diedAt) / DEATH_ANIM_DURATION;
        const scale = 1 - progress;
        const opacity = 1 - progress;
        const screen = gridToScreen(duck.col, duck.row, tileW, tileH, originX, originY, flipFactor);
        entry.el.style.transform = `translate(${screen.x - DUCK_SIZE / 2}px, ${screen.y - 8 - DUCK_SIZE}px) scale(${scale})`;
        entry.el.style.opacity = String(opacity);
      } else {
        entry.el.remove();
        duckElements.delete(duck.id);
      }
    }
    return;
  }

  // Create DOM element on first render
  if (!entry) {
    const img = document.createElement("img");
    img.src = duckIdleGif;
    img.style.position = "absolute";
    img.style.pointerEvents = "none";
    img.style.imageRendering = "pixelated";
    img.dataset.duckId = duck.id;
    overlay.appendChild(img);
    entry = { el: img, displayState: "idle" };
    duckElements.set(duck.id, entry);
  }

  // Switch GIF based on state
  let wantDisplay: DuckDisplayState = "idle";
  if (duck.state === "walking" || duck.state === "fleeing") {
    wantDisplay = "walking";
  } else if (duck.state === "working" && duck.actionType === "fertilize") {
    wantDisplay = "puke";
  } else if (duck.state === "working" && duck.actionType === "harvest") {
    wantDisplay = "idle"; // pecking simulated via CSS
  }

  if (entry.displayState !== wantDisplay) {
    entry.el.src = DISPLAY_GIFS[wantDisplay];
    entry.displayState = wantDisplay;
  }

  // Convert grid position to screen
  const screen = gridToScreen(duck.col, duck.row, tileW, tileH, originX, originY, flipFactor);
  const drawX = screen.x;
  const drawY = screen.y - 8;

  const flipSign = flipFactor < 0 ? -1 : 1;
  const scaleX = (duck.facingLeft ? -1 : 1) * flipSign;

  // Flee tilt effect
  let rotation = 0;
  if (duck.state === "fleeing") {
    rotation = duck.facingLeft ? 5 : -5;
  }

  // Harvest pecking effect
  let peckY = 0;
  if (duck.state === "working" && duck.actionType === "harvest") {
    peckY = Math.sin(now / 100 * Math.PI) * 3;
  }

  entry.el.style.width = `${DUCK_SIZE}px`;
  entry.el.style.height = `${DUCK_SIZE}px`;
  entry.el.style.opacity = "1";
  entry.el.style.transform = `translate(${drawX - DUCK_SIZE / 2}px, ${drawY - DUCK_SIZE + peckY}px) scaleX(${scaleX}) rotate(${rotation}deg)`;
  entry.el.style.zIndex = String(Math.round(duck.row * 100) + 30);
}

// ── Public API ──────────────────────────────────────────────────────

export function createDuck(id: string, now: number): AnimalInstance {
  const spawn = getEdgeSpawnPosition();
  // Walk-in target: a random position inside the grid
  const targetCol = randomBetween(GRID_COL_MIN + 1, GRID_COL_MAX - 1);
  const targetRow = randomBetween(GRID_ROW_MIN + 0.5, GRID_ROW_MAX - 0.5);
  const dist = Math.hypot(targetCol - spawn.col, targetRow - spawn.row);

  return {
    id,
    animalId: "duck",
    col: spawn.col,
    row: spawn.row,
    state: "walking",
    facingLeft: targetCol < spawn.col,
    targetKey: null,
    actionType: null,
    moveStartCol: spawn.col,
    moveStartRow: spawn.row,
    moveEndCol: targetCol,
    moveEndRow: targetRow,
    moveStartTime: now,
    moveDuration: (dist / MOVE_SPEED) * 1000,
    workStartTime: 0,
    diedAt: null,
    nextActionTime: 0,
  };
}

export function updateDucks(
  now: number,
  animals: AnimalInstance[],
  cells: Record<string, FarmCell>,
  callbacks: AnimalCallbacks,
): void {
  for (const duck of animals) {
    if (duck.animalId !== "duck") continue;
    updateSingleDuck(duck, now, animals, cells, callbacks);
  }
}

export function renderDucks(
  animals: AnimalInstance[],
  overlay: HTMLDivElement,
  originX: number,
  originY: number,
  flipFactor: number,
  tileW: number,
  tileH: number,
): void {
  const now = Date.now();
  const activeIds = new Set<string>();

  for (const duck of animals) {
    if (duck.animalId !== "duck") continue;
    activeIds.add(duck.id);
    renderSingleDuck(duck, overlay, originX, originY, flipFactor, tileW, tileH, now);
  }

  // Remove orphaned DOM elements
  for (const [id, entry] of duckElements) {
    if (!activeIds.has(id)) {
      entry.el.remove();
      duckElements.delete(id);
    }
  }
}

export function cleanupDucks(): void {
  for (const [, entry] of duckElements) {
    entry.el.remove();
  }
  duckElements.clear();
}

export { DEATH_ANIM_DURATION };
```

**Step 2: Verify it compiles**

```bash
cd /Users/dora/work/keyfarm && npm run build 2>&1 | head -20
```

Expected: may have errors from GameState change — that's OK, will fix in next task.

**Step 3: Commit**

```bash
git add src/components/animalCharacters.ts
git commit -m "feat: add duck AI module with movement, flee, fertilize, and death logic"
```

---

### Task 3: Update `useGameState` — fertilize callback, spawn system, persistence

**Files:**
- Modify: `src/hooks/useGameState.ts`

**Step 1: Add `animals` to default state and parsing**

In `defaultState()` (line 54-66), add `animals: []`:

```typescript
function defaultState(): GameState {
  return {
    cells: createInitialCells(),
    totalHarvested: 0,
    harvestsByCrop: {},
    goldenHarvests: {},
    totalKeyPresses: {},
    totalPestsRemoved: 0,
    dailyStats: [],
    workers: 1,
    workerSpeed: 1,
    animals: [],
  };
}
```

In `parseState()` (around line 114-124), add animals parsing:

```typescript
return {
  cells,
  totalHarvested: (parsed.totalHarvested as number) ?? 0,
  harvestsByCrop,
  goldenHarvests,
  totalKeyPresses: (parsed.totalKeyPresses as Record<string, number>) ?? {},
  totalPestsRemoved: (parsed.totalPestsRemoved as number) ?? 0,
  dailyStats: (parsed.dailyStats as DailyEntry[]) ?? [],
  workers: Math.max(1, Math.min(MAX_WORKERS, (parsed.workers as number) ?? 1)),
  workerSpeed: Math.max(1, Math.min(MAX_SPEED_LEVEL, (parsed.workerSpeed as number) ?? 1)),
  animals: (parsed.animals as AnimalInstance[]) ?? [],
};
```

**Step 2: Add imports**

At top of file, add to the imports from `../types/game`:

```typescript
import type { GameState, FarmStage, FarmCell, DailyEntry, AnimalInstance } from '../types/game';
```

And add:

```typescript
import {
  // ...existing imports...
  DUCK_SPAWN_TIERS,
  DUCK_SPAWN_INTERVAL,
  DUCK_RESPAWN_DELAY,
  NEXT_STAGE,
} from '../types/game';
import { createDuck } from '../components/animalCharacters';
```

**Step 3: Add `fertilize` callback**

After the `harvest` callback (around line 459), add:

```typescript
const fertilize = useCallback((keyCode: string) => {
  setGameState((prev) => {
    const c = prev.cells[keyCode];
    if (!c) return prev;
    if (!['watering', 'sprout', 'tree'].includes(c.stage)) return prev;
    if (c.hasPest) return prev;

    const nextStage = NEXT_STAGE[c.stage];
    if (!nextStage) return prev;

    let newCropId = c.cropId;
    let newIsGolden = c.isGolden;

    // If advancing from empty-equivalent to watering, assign crop
    // (shouldn't happen for fertilize, but just in case)
    if (c.stage === 'empty' && nextStage === 'watering') {
      newCropId = getRandomCrop().id;
    }

    // If advancing to fruit, roll for golden
    if (nextStage === 'fruit') {
      newIsGolden = Math.random() < GOLDEN_CHANCE;
    }

    return {
      ...prev,
      cells: {
        ...prev.cells,
        [keyCode]: {
          ...c,
          stage: nextStage,
          hitCount: 0,
          cropId: newCropId,
          isGolden: newIsGolden,
        },
      },
    };
  });
}, []);
```

**Step 4: Add duck spawn timer**

After the pest spawning useEffect (around line 401), add:

```typescript
// --- Duck spawning timer ---
useEffect(() => {
  let timeout: number;
  let nextDuckId = 0;

  const scheduleDuckSpawn = () => {
    const delay = randomBetween(DUCK_SPAWN_INTERVAL[0], DUCK_SPAWN_INTERVAL[1]);
    timeout = window.setTimeout(() => {
      const now = Date.now();
      setGameState((prev) => {
        // Calculate current cap based on total harvests
        let cap = 0;
        for (const tier of DUCK_SPAWN_TIERS) {
          if (prev.totalHarvested >= tier.harvests) cap = tier.cap;
        }

        // Count alive ducks
        const aliveDucks = prev.animals.filter(
          a => a.animalId === 'duck' && a.state !== 'dead'
        );

        // Check if dead ducks can be respawned
        const updatedAnimals = prev.animals.filter(a => {
          if (a.state === 'dead' && a.diedAt) {
            const deadTime = now - a.diedAt;
            const maxDelay = DUCK_RESPAWN_DELAY[1];
            return deadTime < maxDelay + 5000; // keep dead duck for animation, clean up after
          }
          return true;
        });

        if (aliveDucks.length < cap) {
          // Check if any dead duck has completed respawn delay
          const canSpawn = aliveDucks.length < cap;
          if (canSpawn) {
            const id = `duck-${Date.now()}-${nextDuckId++}`;
            const newDuck = createDuck(id, now);
            scheduleDuckSpawn();
            return { ...prev, animals: [...updatedAnimals, newDuck] };
          }
        }

        scheduleDuckSpawn();
        if (updatedAnimals.length !== prev.animals.length) {
          return { ...prev, animals: updatedAnimals };
        }
        return prev;
      });
    }, delay);
  };

  scheduleDuckSpawn();
  return () => clearTimeout(timeout);
}, []);
```

Note: `randomBetween` is defined locally—add at top of file near `getToday`:

```typescript
function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
```

**Step 5: Add `duckEaten` handler and expose `setAnimals` for duck updates**

After `fertilize`, add:

```typescript
const updateAnimals = useCallback((animals: AnimalInstance[]) => {
  setGameState((prev) => ({ ...prev, animals }));
}, []);
```

**Step 6: Update return value**

```typescript
return {
  gameState,
  harvest,
  removePest,
  hireWorker,
  upgradeWorkerSpeed,
  fertilize,
  updateAnimals,
  animations: animRef.current,
};
```

**Step 7: Commit**

```bash
git add src/hooks/useGameState.ts
git commit -m "feat: add fertilize callback, duck spawn system, and animal persistence"
```

---

### Task 4: Integrate ducks into `FarmCanvas`

**Files:**
- Modify: `src/components/FarmCanvas.tsx`

**Step 1: Add imports**

Add at top of file:

```typescript
import {
  updateDucks,
  renderDucks,
  cleanupDucks,
  setMouseGridPosition,
} from './animalCharacters';
```

**Step 2: Update FarmCanvasProps**

Add new props:

```typescript
interface FarmCanvasProps {
  gameState: GameState;
  animations: AnimationState;
  onHarvest: (keyCode: string) => void;
  onRemovePest: (keyCode: string) => void;
  onFertilize: (keyCode: string) => void;        // NEW
  onDuckEaten: (duckId: string) => void;          // NEW
  onAnimalsUpdated: (animals: AnimalInstance[]) => void; // NEW
  onDragStart?: () => void;
  viewMode: 'farm' | 'heatmap';
  flipX: boolean;
}
```

Update destructuring:

```typescript
export function FarmCanvas({
  gameState, animations, onHarvest, onRemovePest, onFertilize, onDuckEaten, onAnimalsUpdated,
  onDragStart, viewMode, flipX,
}: FarmCanvasProps) {
```

**Step 3: Add cleanup for ducks**

In the cleanup useEffect (line 110-112):

```typescript
useEffect(() => {
  return () => {
    cleanupFarmer();
    cleanupDucks();
  };
}, []);
```

**Step 4: Add mouse-to-grid conversion for duck flee**

In the `handleMouseMove` callback, add mouse grid position tracking. We need to convert screen coordinates to grid coordinates. Add a helper function before the component:

```typescript
/** Convert screen coordinates back to approximate grid position. */
function screenToGrid(
  screenX: number,
  screenY: number,
  tileW: number,
  tileH: number,
  originX: number,
  originY: number,
  flipFactor: number,
): { col: number; row: number } {
  // Inverse of: x = originX + (col - row) * tileW/2 * flipFactor
  //             y = originY + (col + row) * tileH/2
  const sx = (screenX - originX) / (tileW / 2 * flipFactor);
  const sy = (screenY - originY) / (tileH / 2);
  // sx = col - row, sy = col + row
  const col = (sx + sy) / 2;
  const row = (sy - sx) / 2;
  return { col, row };
}
```

In `handleMouseMove`, after `const { x, y } = canvasCoords(...)`, add:

```typescript
// Update mouse grid position for duck flee behavior
const gridPos = screenToGrid(x, y, TILE_W, TILE_H,
  _boundsNormal.originX * (1 - (1 - flipFactorRef.current) / 2) +
  _boundsFlipped.originX * ((1 - flipFactorRef.current) / 2),
  _boundsNormal.originY, flipFactorRef.current);
setMouseGridPosition(gridPos.col, gridPos.row);
```

**Step 5: Add duck update and render in draw loop**

In the `draw` callback, after the farmer section (around line 292), add:

```typescript
// ── Duck characters ──
updateDucks(now, gameStateRef.current.animals, gameStateRef.current.cells, {
  onHarvest: (keyCode: string) => onHarvest(keyCode),
  onFertilize: (keyCode: string) => onFertilize(keyCode),
  onDuckEaten: (duckId: string) => onDuckEaten(duckId),
});
if (overlayRef.current) {
  renderDucks(
    gameStateRef.current.animals,
    overlayRef.current,
    originX, originY, flipFactor, TILE_W, TILE_H,
  );
}
```

**Step 6: Add `onFertilize` and `onDuckEaten` to useCallback deps**

Update the draw useCallback dependencies:

```typescript
}, [animations, viewMode, onHarvest, onRemovePest, onFertilize, onDuckEaten]);
```

**Step 7: Commit**

```bash
git add src/components/FarmCanvas.tsx
git commit -m "feat: integrate duck rendering and mouse interaction into FarmCanvas"
```

---

### Task 5: Wire up `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Step 1: Read App.tsx to understand current props passed to FarmCanvas**

Read `src/App.tsx` and find where `<FarmCanvas>` is rendered.

**Step 2: Pass new props to FarmCanvas**

From `useGameState`, destructure `fertilize` and `updateAnimals`. Add callbacks:

```typescript
const { gameState, harvest, removePest, hireWorker, upgradeWorkerSpeed, fertilize, updateAnimals, animations } = useGameState();
```

Then add a `handleDuckEaten` callback:

```typescript
const handleDuckEaten = useCallback((duckId: string) => {
  // Duck death is handled internally — just mark the duck as dead in state
  // The duck is already set to dead in animalCharacters.ts, but we need to sync state
  const now = Date.now();
  const updatedAnimals = gameState.animals.map(a =>
    a.id === duckId ? { ...a, state: 'dead' as const, diedAt: now } : a
  );
  updateAnimals(updatedAnimals);
}, [gameState.animals, updateAnimals]);
```

Pass to FarmCanvas:

```tsx
<FarmCanvas
  gameState={gameState}
  animations={animations}
  onHarvest={harvest}
  onRemovePest={removePest}
  onFertilize={fertilize}
  onDuckEaten={handleDuckEaten}
  onAnimalsUpdated={updateAnimals}
  onDragStart={...}
  viewMode={...}
  flipX={...}
/>
```

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire duck callbacks through App to FarmCanvas"
```

---

### Task 6: Add fertilize animation to canvas

**Files:**
- Modify: `src/hooks/useGameState.ts` (add fertilize to AnimationState)
- Modify: `src/components/farmRenderers.ts` (add fertilize animation)
- Modify: `src/components/FarmCanvas.tsx` (draw fertilize animation)

**Step 1: Add fertilize tracking to AnimationState**

In `useGameState.ts`, update `AnimationState` interface:

```typescript
export interface AnimationState {
  recentHits: Map<string, number>;
  recentHarvests: Map<string, number>;
  harvestFruits: Map<string, string>;
  harvestGolden: Map<string, boolean>;
  recentPestRemovals: Map<string, number>;
  recentFertilizes: Map<string, number>;  // NEW
}
```

Add to `animRef.current` initialization:

```typescript
recentFertilizes: new Map(),
```

In the `fertilize` callback, add animation tracking before `setGameState`:

```typescript
const fertilize = useCallback((keyCode: string) => {
  animRef.current.recentFertilizes.set(keyCode, Date.now());
  setGameState((prev) => {
    // ... existing logic
  });
}, []);
```

**Step 2: Add `drawFertilizeAnimation` to farmRenderers.ts**

```typescript
/** Draw the fertilize animation: green glow + upward sparkle. */
export function drawFertilizeAnimation(
  ctx: CanvasRenderingContext2D,
  block: IsoBlock,
  fertilizeAge: number,
  fertilizeDuration: number,
  fertilizeTime: number,
): void {
  const progress = fertilizeAge / fertilizeDuration;
  const center = polygonCentroid(block.top);

  ctx.save();

  // Green glow on block
  if (progress < 0.4) {
    const flashAlpha = 0.5 * (1 - progress / 0.4);
    const flashColor = `rgba(74, 222, 128, ${flashAlpha})`;
    fillPoly(ctx, block.top, flashColor, false);
    fillPoly(ctx, block.right, flashColor, false);
    fillPoly(ctx, block.front, flashColor, false);
  }

  // Rising arrow/sparkle
  if (progress < 0.7) {
    const ep = progress / 0.7;
    const arrowY = center.y - 2 - ep * 35;
    ctx.globalAlpha = 1 - ep;
    ctx.font = `${Math.round(s(16) * (1 + ep * 0.3))}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✨', center.x, arrowY);
    ctx.globalAlpha = 1;
  }

  // Green particles rising
  if (progress > 0.05 && progress < 0.8) {
    const bp = (progress - 0.05) / 0.75;
    ctx.globalAlpha = (1 - bp) * 0.8;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + ((fertilizeTime % 628) / 100);
      const speed = 20 + ((fertilizeTime * (i + 3)) % 12);
      const px = center.x + Math.cos(angle) * speed * bp;
      const py = center.y + Math.sin(angle) * speed * bp * 0.5 - bp * 20;
      const size = 2.5 * (1 - bp * 0.7);
      ctx.fillStyle = '#4ADE80';
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
```

**Step 3: Draw fertilize animation in FarmCanvas draw loop**

In the per-cell loop, after the pest removal animation block (around line 278), add:

```typescript
const fertilizeTime = animations.recentFertilizes.get(keyDef.keyCode);
const fertilizeAge = fertilizeTime ? now - fertilizeTime : Infinity;
const isFertilizing = fertilizeAge < HARVEST_DURATION;
if (isFertilizing) hasActiveAnimations = true;
if (fertilizeTime && fertilizeAge > HARVEST_DURATION) {
  animations.recentFertilizes.delete(keyDef.keyCode);
}

// ... after pest removal animation draw:
if (isFertilizing && fertilizeTime) {
  drawFertilizeAnimation(ctx, block, fertilizeAge, HARVEST_DURATION, fertilizeTime);
}
```

**Step 4: Commit**

```bash
git add src/hooks/useGameState.ts src/components/farmRenderers.ts src/components/FarmCanvas.tsx
git commit -m "feat: add green glow fertilize animation on canvas"
```

---

### Task 7: Build and test

**Step 1: Build the project**

```bash
cd /Users/dora/work/keyfarm && npm run build
```

Fix any TypeScript errors.

**Step 2: Run dev server and test manually**

```bash
npm run tauri dev
```

Verify:
- Ducks spawn from grid edges after reaching 100 harvests (or temporarily lower threshold for testing)
- Ducks walk to growing tiles and play puke.gif → tile advances one stage
- Ducks walk to non-animal fruit → harvest animation plays
- Moving mouse near duck → duck flees in opposite direction
- Duck walks near animal-type fruit → 30% chance of death animation
- Ducks persist across app restart

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues and polish duck character system"
```

---

### Summary of all files changed

| File | Change type |
|------|-------------|
| `src/assets/duck-idle.gif` | New (copy) |
| `src/assets/duck-walk.gif` | New (copy) |
| `src/assets/puke.gif` | New (copy) |
| `src/types/game.ts` | Modified (add types + constants) |
| `src/components/animalCharacters.ts` | New (duck AI module) |
| `src/hooks/useGameState.ts` | Modified (fertilize, spawn, persistence) |
| `src/components/FarmCanvas.tsx` | Modified (render, mouse, callbacks) |
| `src/components/farmRenderers.ts` | Modified (fertilize animation) |
| `src/App.tsx` | Modified (wire callbacks) |
