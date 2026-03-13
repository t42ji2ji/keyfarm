import duckIdleGif from "../assets/duck-idle.gif";
import duckWalkGif from "../assets/duck-walk.gif";
import pukeGif from "../assets/puke.gif";
import { gridToScreen } from "../utils/isometric";
import type { FarmCell, AnimalInstance } from "../types/game";
import { CROP_MAP } from "../data/crops";

// ── Constants ───────────────────────────────────────────────────────
const DUCK_SIZE = 28;
const MOVE_SPEED = 1.2; // grid units per second
const FLEE_SPEED_MULTIPLIER = 1.5;
const WORK_DURATION = 2500;
const REST_DURATION = 180_000; // 3 minutes rest after work streak
const WORKS_BEFORE_REST_MIN = 3;
const WORKS_BEFORE_REST_MAX = 4;
const FLEE_TRIGGER_RADIUS = 2.5; // grid units
const FLEE_DISTANCE = 3;
const ROAM_IDLE_MIN = 1000;
const ROAM_IDLE_MAX = 3000;
const ROAM_DIST_MIN = 2;
const ROAM_DIST_MAX = 4;
const DEATH_ANIM_DURATION = 1500;
const DEATH_FLOAT_HEIGHT = 60; // px to float upward

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

const WATER_ROAM_CHANCE = 0.6; // chance to roam toward a watering cell

/** Get a random roam destination within grid bounds, biased toward watering cells. */
function getRandomRoamTarget(
  duck: AnimalInstance,
  cells: Record<string, FarmCell>,
): { col: number; row: number } {
  // Try to roam toward a watering cell
  if (Math.random() < WATER_ROAM_CHANCE) {
    const waterCells: { col: number; row: number }[] = [];
    for (const [keyCode, cell] of Object.entries(cells)) {
      if (keyCode.startsWith("_gap")) continue;
      if (cell.stage === "watering") {
        waterCells.push({ col: cell.col + cell.width / 2, row: cell.row + 0.5 });
      }
    }
    if (waterCells.length > 0) {
      const target = waterCells[Math.floor(Math.random() * waterCells.length)];
      // Add slight offset so ducks don't stack exactly on the cell
      return {
        col: clampCol(target.col + randomBetween(-0.5, 0.5)),
        row: clampRow(target.row + randomBetween(-0.3, 0.3)),
      };
    }
  }

  // Fallback: random direction
  const angle = Math.random() * Math.PI * 2;
  const dist = randomBetween(ROAM_DIST_MIN, ROAM_DIST_MAX);
  return {
    col: clampCol(duck.col + Math.cos(angle) * dist),
    row: clampRow(duck.row + Math.sin(angle) * dist * 0.5),
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

      // Resting after work — roam only, no work targets
      const isResting = now < duck.restUntil;

      const target = isResting ? null : findTarget(duck, animals, cells);
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
        // Roam — prefer watering cells
        const roamTarget = getRandomRoamTarget(duck, cells);
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
              callbacks.onHarvest(duck.targetKey);
            }
          }
        }
        duck.state = "idle";
        duck.targetKey = null;
        duck.actionType = null;
        duck.workCount += 1;
        const restThreshold = Math.floor(randomBetween(WORKS_BEFORE_REST_MIN, WORKS_BEFORE_REST_MAX + 1));
        if (duck.workCount >= restThreshold) {
          duck.restUntil = now + REST_DURATION;
          duck.workCount = 0;
        }
        duck.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
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

  // Handle dead ducks — float upward + fade out (ascending)
  if (duck.state === "dead") {
    if (entry) {
      if (duck.diedAt && now - duck.diedAt < DEATH_ANIM_DURATION) {
        const progress = (now - duck.diedAt) / DEATH_ANIM_DURATION;
        // Ease out for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 2);
        const floatY = -eased * DEATH_FLOAT_HEIGHT;
        // Fade to semi-transparent then fully transparent
        const opacity = Math.max(0, 1 - progress * 1.2);
        const screen = gridToScreen(duck.col, duck.row, tileW, tileH, originX, originY, flipFactor);
        const baseX = screen.x - DUCK_SIZE / 2;
        const baseY = screen.y - 8 - DUCK_SIZE;
        // Gentle sway while ascending
        const sway = Math.sin(progress * Math.PI * 3) * 4;
        entry.el.style.transform = `translate(${baseX + sway}px, ${baseY + floatY}px)`;
        entry.el.style.opacity = String(opacity);
        entry.el.style.filter = `brightness(1.5) saturate(0.3)`;
      } else {
        entry.el.style.filter = "";
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
    restUntil: 0,
    workCount: 0,
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
