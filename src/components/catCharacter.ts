import catIdleGif from "../assets/cat-idle.gif";
import catWalkGif from "../assets/cat-walk.gif";
import catAttackGif from "../assets/cat-attack.gif";
import catFishingGif from "../assets/cat-fishing.gif";
import { gridToScreen } from "../utils/isometric";
import type { FarmCell, AnimalInstance } from "../types/game";

// ── Constants ───────────────────────────────────────────────────────
const CAT_SIZE = 36;
const MOVE_SPEED = 1.8; // grid units per second
const FLEE_SPEED_MULTIPLIER = 1.5;
const FLEE_TRIGGER_RADIUS = 2.0;
const FLEE_DISTANCE = 3;
const FISH_WORK_DURATION = 3000; // ms fishing animation
const ATTACK_DURATION = 600; // ms — same as dog
const FISH_CHANCE = 0.50; // 50% chance per action cycle to go fishing
const FISH_SUCCESS_CHANCE = 0.15; // 15% chance fishing actually catches a fish
const ATTACK_DOG_CHANCE = 0.10; // 10% chance per action cycle to attack dog
const ROAM_IDLE_MIN = 2000;
const ROAM_IDLE_MAX = 5000;
const ROAM_DIST_MIN = 2;
const ROAM_DIST_MAX = 4;
const DOG_ATTACK_RADIUS = 1.0; // grid units — distance to trigger attack on dog
const DOG_FLEE_DISTANCE = 6; // how far the dog runs after being attacked

// Grid bounds (HHKB layout)
const GRID_COL_MIN = 0.5;
const GRID_COL_MAX = 14.5;
const GRID_ROW_MIN = 0;
const GRID_ROW_MAX = 4.5;

type CatDisplayState = "idle" | "walking" | "attack" | "fishing";

const DISPLAY_GIFS: Record<CatDisplayState, string> = {
  idle: catIdleGif,
  walking: catWalkGif,
  attack: catAttackGif,
  fishing: catFishingGif,
};

// ── Inject attack effect CSS ────────────────────────────────────────
const STYLE_ID = "cat-attack-fx";
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes cat-attack-shake {
      0%,100% { translate: 0 0; }
      15% { translate: -2px -1px; }
      30% { translate: 2px 0; }
      45% { translate: -1px 1px; }
      60% { translate: 1px -1px; }
      75% { translate: -1px 0; }
    }
    .cat-attacking {
      animation: cat-attack-shake 0.12s ease-in-out infinite;
      filter: brightness(1.2) drop-shadow(0 0 4px rgba(255,160,60,0.6));
    }
    .cat-impact {
      position: absolute;
      pointer-events: none;
      width: 32px;
      height: 32px;
      animation: dog-impact-burst 0.4s ease-out forwards;
    }
    .cat-slash-mark {
      position: absolute;
      pointer-events: none;
      font-size: 22px;
      animation: dog-slash 0.35s ease-out forwards;
    }
  `;
  document.head.appendChild(style);
}

// ── Cat DOM elements ────────────────────────────────────────────────
const catElements = new Map<string, {
  el: HTMLImageElement;
  displayState: CatDisplayState | null;
}>();

const attackEffects = new Map<string, { els: HTMLElement[]; time: number }>();

// ── Mouse position in grid coordinates ──────────────────────────────
let mouseGridCol = -100;
let mouseGridRow = -100;

export function setCatMousePosition(col: number, row: number): void {
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

function getEdgeSpawnPosition(): { col: number; row: number } {
  const side = Math.floor(Math.random() * 4);
  switch (side) {
    case 0: return { col: randomBetween(GRID_COL_MIN, GRID_COL_MAX), row: GRID_ROW_MIN - 0.5 };
    case 1: return { col: randomBetween(GRID_COL_MIN, GRID_COL_MAX), row: GRID_ROW_MAX + 0.5 };
    case 2: return { col: GRID_COL_MIN - 0.5, row: randomBetween(GRID_ROW_MIN, GRID_ROW_MAX) };
    default: return { col: GRID_COL_MAX + 0.5, row: randomBetween(GRID_ROW_MIN, GRID_ROW_MAX) };
  }
}

function shouldFlee(cat: AnimalInstance): boolean {
  const dist = Math.hypot(mouseGridCol - cat.col, mouseGridRow - cat.row);
  return dist < FLEE_TRIGGER_RADIUS;
}

function getFleeTarget(cat: AnimalInstance): { col: number; row: number } {
  const dx = cat.col - mouseGridCol;
  const dy = cat.row - mouseGridRow;
  const dist = Math.hypot(dx, dy) || 1;
  const normX = dx / dist;
  const normY = dy / dist;
  return {
    col: clampCol(cat.col + normX * FLEE_DISTANCE),
    row: clampRow(cat.row + normY * FLEE_DISTANCE),
  };
}

function getRandomRoamTarget(cat: AnimalInstance): { col: number; row: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = randomBetween(ROAM_DIST_MIN, ROAM_DIST_MAX);
  return {
    col: clampCol(cat.col + Math.cos(angle) * dist),
    row: clampRow(cat.row + Math.sin(angle) * dist * 0.5),
  };
}

function startMoveTo(
  cat: AnimalInstance,
  targetCol: number,
  targetRow: number,
  speedMultiplier: number = 1,
): void {
  const dist = Math.hypot(targetCol - cat.col, targetRow - cat.row);
  cat.moveStartCol = cat.col;
  cat.moveStartRow = cat.row;
  cat.moveEndCol = targetCol;
  cat.moveEndRow = targetRow;
  cat.facingLeft = targetCol < cat.col;
  cat.moveDuration = (dist / (MOVE_SPEED * speedMultiplier)) * 1000;
  cat.moveStartTime = Date.now();
}

/** Find nearest watering cell for fishing. */
function findWaterTarget(
  cat: AnimalInstance,
  cells: Record<string, FarmCell>,
  animals: AnimalInstance[],
): { keyCode: string; col: number; row: number } | null {
  // Get already claimed targets
  const claimed = new Set<string>();
  for (const a of animals) {
    if (a.id !== cat.id && a.targetKey) claimed.add(a.targetKey);
  }

  let best: { keyCode: string; col: number; row: number; dist: number } | null = null;
  for (const [keyCode, cell] of Object.entries(cells)) {
    if (keyCode.startsWith("_gap")) continue;
    if (claimed.has(keyCode)) continue;
    if (cell.stage !== "watering") continue;
    if (cell.hasPest) continue;

    const col = cell.col + cell.width / 2;
    const row = cell.row + 0.5;
    const dist = Math.hypot(col - cat.col, row - cat.row);
    if (!best || dist < best.dist) {
      best = { keyCode, col, row, dist };
    }
  }
  return best;
}

// ── Callbacks interface ─────────────────────────────────────────────
export interface CatCallbacks {
  onWaterToFish: (keyCode: string) => void;
  onDogScared: (dogId: string, fleeCol: number, fleeRow: number) => void;
}

// ── Create ──────────────────────────────────────────────────────────
export function createCat(id: string, now: number): AnimalInstance {
  const spawn = getEdgeSpawnPosition();
  const targetCol = randomBetween(GRID_COL_MIN + 1, GRID_COL_MAX - 1);
  const targetRow = randomBetween(GRID_ROW_MIN + 0.5, GRID_ROW_MAX - 0.5);
  const dist = Math.hypot(targetCol - spawn.col, targetRow - spawn.row);

  return {
    id,
    animalId: "cat",
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

// ── Update single cat ───────────────────────────────────────────────
function updateSingleCat(
  cat: AnimalInstance,
  now: number,
  animals: AnimalInstance[],
  cells: Record<string, FarmCell>,
  callbacks: CatCallbacks,
): void {
  if (cat.state === "dead") return;

  // Mouse flee check (highest priority)
  if (cat.state !== "working" && cat.state !== "fleeing" && shouldFlee(cat)) {
    const fleeTarget = getFleeTarget(cat);
    cat.state = "fleeing";
    cat.targetKey = null;
    cat.actionType = null;
    startMoveTo(cat, fleeTarget.col, fleeTarget.row, FLEE_SPEED_MULTIPLIER);
    return;
  }

  switch (cat.state) {
    case "idle": {
      if (now < cat.nextActionTime) break;

      // Find the dog
      const dog = animals.find(a => a.animalId === "dog" && a.state !== "dead");

      // Chance to attack dog
      if (dog && Math.random() < ATTACK_DOG_CHANCE) {
        const dogDist = Math.hypot(dog.col - cat.col, dog.row - cat.row);
        if (dogDist < DOG_ATTACK_RADIUS) {
          // Close enough — attack!
          cat.state = "working";
          cat.workStartTime = now;
          cat.targetKey = dog.id;
          cat.actionType = "harvest"; // reuse for "attack dog"
          cat.facingLeft = dog.col < cat.col;
          break;
        }
        // Walk toward dog
        cat.targetKey = dog.id;
        cat.actionType = "harvest";
        cat.state = "walking";
        startMoveTo(cat, dog.col, dog.row);
        break;
      }

      // Chance to fish (convert water → fish)
      if (Math.random() < FISH_CHANCE) {
        const waterTarget = findWaterTarget(cat, cells, animals);
        if (waterTarget) {
          const dist = Math.hypot(waterTarget.col - cat.col, waterTarget.row - cat.row);
          if (dist < 0.3) {
            cat.col = waterTarget.col;
            cat.row = waterTarget.row;
            cat.targetKey = waterTarget.keyCode;
            cat.actionType = "fertilize"; // reuse for "fishing"
            cat.state = "working";
            cat.workStartTime = now;
            break;
          }
          cat.targetKey = waterTarget.keyCode;
          cat.actionType = "fertilize";
          cat.state = "walking";
          startMoveTo(cat, waterTarget.col, waterTarget.row);
          break;
        }
      }

      // Otherwise roam
      const roamTarget = getRandomRoamTarget(cat);
      cat.targetKey = null;
      cat.actionType = null;
      cat.state = "walking";
      startMoveTo(cat, roamTarget.col, roamTarget.row);
      break;
    }

    case "walking": {
      // If targeting the dog, track its live position
      if (cat.actionType === "harvest" && cat.targetKey) {
        const dog = animals.find(a => a.id === cat.targetKey);
        if (!dog || dog.state === "dead") {
          // Dog gone — idle
          cat.state = "idle";
          cat.targetKey = null;
          cat.actionType = null;
          cat.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
          break;
        }

        const dogDist = Math.hypot(dog.col - cat.col, dog.row - cat.row);
        if (dogDist < DOG_ATTACK_RADIUS) {
          // Close enough to attack
          cat.state = "working";
          cat.workStartTime = now;
          cat.facingLeft = dog.col < cat.col;
          break;
        }

        // Update move target to dog's current position
        const elapsed = now - cat.moveStartTime;
        const dt = Math.min(elapsed / 1000, 0.1);
        cat.moveStartTime = now;
        const dx = dog.col - cat.col;
        const dy = dog.row - cat.row;
        const dist = Math.hypot(dx, dy);
        const step = MOVE_SPEED * dt;
        const norm = Math.min(1, step / dist);
        cat.col = clampCol(cat.col + dx * norm);
        cat.row = clampRow(cat.row + dy * norm);
        cat.facingLeft = dog.col < cat.col;
        break;
      }

      // Normal walking (to water target or roam)
      const elapsed = now - cat.moveStartTime;
      const t = Math.min(1, elapsed / cat.moveDuration);
      const eased = easeInOutQuad(t);
      cat.col = cat.moveStartCol + (cat.moveEndCol - cat.moveStartCol) * eased;
      cat.row = cat.moveStartRow + (cat.moveEndRow - cat.moveStartRow) * eased;

      if (t >= 1) {
        cat.col = cat.moveEndCol;
        cat.row = cat.moveEndRow;

        if (cat.targetKey && cat.actionType === "fertilize") {
          // Arrived at water cell — start fishing
          const cell = cells[cat.targetKey];
          if (cell && cell.stage === "watering" && !cell.hasPest) {
            cat.state = "working";
            cat.workStartTime = now;
            break;
          }
          // Water cell no longer valid
          cat.targetKey = null;
          cat.actionType = null;
        }

        cat.state = "idle";
        cat.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
      }
      break;
    }

    case "working": {
      // Attacking dog
      if (cat.actionType === "harvest" && cat.targetKey) {
        if (now >= cat.workStartTime + ATTACK_DURATION) {
          const dog = animals.find(a => a.id === cat.targetKey);
          if (dog && dog.state !== "dead") {
            // Make dog flee far away
            const dx = dog.col - cat.col;
            const dy = dog.row - cat.row;
            const dist = Math.hypot(dx, dy) || 1;
            const fleeCol = clampCol(dog.col + (dx / dist) * DOG_FLEE_DISTANCE);
            const fleeRow = clampRow(dog.row + (dy / dist) * DOG_FLEE_DISTANCE * 0.5);
            callbacks.onDogScared(dog.id, fleeCol, fleeRow);
          }
          cat.state = "idle";
          cat.targetKey = null;
          cat.actionType = null;
          cat.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
        }
        break;
      }

      // Fishing (water → fish, only sometimes succeeds)
      if (cat.actionType === "fertilize" && cat.targetKey) {
        if (now >= cat.workStartTime + FISH_WORK_DURATION) {
          const cell = cells[cat.targetKey];
          if (cell && cell.stage === "watering" && !cell.hasPest && Math.random() < FISH_SUCCESS_CHANCE) {
            callbacks.onWaterToFish(cat.targetKey);
          }
          cat.state = "idle";
          cat.targetKey = null;
          cat.actionType = null;
          cat.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
        }
        break;
      }

      // Fallback
      cat.state = "idle";
      cat.targetKey = null;
      cat.actionType = null;
      cat.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
      break;
    }

    case "fleeing": {
      const elapsed = now - cat.moveStartTime;
      const t = Math.min(1, elapsed / cat.moveDuration);
      const eased = easeInOutQuad(t);
      cat.col = cat.moveStartCol + (cat.moveEndCol - cat.moveStartCol) * eased;
      cat.row = cat.moveStartRow + (cat.moveEndRow - cat.moveStartRow) * eased;

      if (t >= 1) {
        cat.col = cat.moveEndCol;
        cat.row = cat.moveEndRow;
        cat.state = "idle";
        cat.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
      } else if (shouldFlee(cat)) {
        const newFleeTarget = getFleeTarget(cat);
        const currentCol = cat.col;
        const currentRow = cat.row;
        cat.moveStartCol = currentCol;
        cat.moveStartRow = currentRow;
        cat.moveEndCol = newFleeTarget.col;
        cat.moveEndRow = newFleeTarget.row;
        cat.facingLeft = newFleeTarget.col < currentCol;
        const dist = Math.hypot(newFleeTarget.col - currentCol, newFleeTarget.row - currentRow);
        cat.moveDuration = (dist / (MOVE_SPEED * FLEE_SPEED_MULTIPLIER)) * 1000;
        cat.moveStartTime = now;
      }
      break;
    }
  }
}

// ── Render single cat ───────────────────────────────────────────────
function renderSingleCat(
  cat: AnimalInstance,
  overlay: HTMLDivElement,
  originX: number,
  originY: number,
  flipFactor: number,
  tileW: number,
  tileH: number,
): void {
  if (cat.state === "dead") return;

  let entry = catElements.get(cat.id);

  if (!entry) {
    const img = document.createElement("img");
    img.src = catIdleGif;
    img.style.position = "absolute";
    img.style.pointerEvents = "none";
    img.style.imageRendering = "pixelated";
    img.dataset.catId = cat.id;
    overlay.appendChild(img);
    entry = { el: img, displayState: "idle" };
    catElements.set(cat.id, entry);
  }

  // Switch GIF based on state
  let wantDisplay: CatDisplayState = "idle";
  const isAttacking = cat.state === "working" && cat.actionType === "harvest";
  const isFishing = cat.state === "working" && cat.actionType === "fertilize";
  if (cat.state === "walking" || cat.state === "fleeing") {
    wantDisplay = "walking";
  } else if (isAttacking) {
    wantDisplay = "attack";
  } else if (isFishing) {
    wantDisplay = "fishing";
  }

  if (entry.displayState !== wantDisplay) {
    entry.el.src = DISPLAY_GIFS[wantDisplay];
    entry.displayState = wantDisplay;
  }

  // Attack shake class
  if (isAttacking && !entry.el.classList.contains("cat-attacking")) {
    entry.el.classList.add("cat-attacking");
  } else if (!isAttacking && entry.el.classList.contains("cat-attacking")) {
    entry.el.classList.remove("cat-attacking");
  }

  // Convert grid position to screen
  const screen = gridToScreen(cat.col, cat.row, tileW, tileH, originX, originY, flipFactor);
  const drawX = screen.x;
  const drawY = screen.y - 8;

  const flipSign = flipFactor < 0 ? -1 : 1;
  const scaleX = (cat.facingLeft ? -1 : 1) * flipSign;

  entry.el.style.width = `${CAT_SIZE}px`;
  entry.el.style.height = `${CAT_SIZE}px`;
  entry.el.style.opacity = "1";
  entry.el.style.transform = `translate(${drawX - CAT_SIZE / 2}px, ${drawY - CAT_SIZE}px) scaleX(${scaleX})`;
  entry.el.style.zIndex = String(Math.round(cat.row * 100) + 32);

  // Spawn impact effects when attacking dog
  if (isAttacking) {
    const existing = attackEffects.get(cat.id);
    const now = Date.now();
    if (!existing || now - existing.time > 400) {
      if (existing) {
        for (const el of existing.els) el.remove();
        attackEffects.delete(cat.id);
      }
      const effectX = drawX + (cat.facingLeft ? -14 : 14);
      const effectY = drawY - CAT_SIZE * 0.5;
      const els: HTMLElement[] = [];

      const burst = document.createElement("div");
      burst.className = "cat-impact";
      burst.style.left = `${effectX - 16}px`;
      burst.style.top = `${effectY - 16}px`;
      burst.innerHTML = `<svg width="32" height="32" viewBox="0 0 40 40">
        <polygon points="20,2 24,14 37,14 27,22 31,35 20,27 9,35 13,22 3,14 16,14"
          fill="rgba(255,200,60,0.9)" stroke="rgba(255,140,30,0.8)" stroke-width="1"/>
      </svg>`;
      burst.style.zIndex = String(Math.round(cat.row * 100) + 33);
      overlay.appendChild(burst);
      els.push(burst);

      const slash = document.createElement("div");
      slash.className = "cat-slash-mark";
      slash.style.left = `${effectX - 6}px`;
      slash.style.top = `${effectY - 14}px`;
      slash.textContent = "🐾";
      slash.style.zIndex = String(Math.round(cat.row * 100) + 34);
      overlay.appendChild(slash);
      els.push(slash);

      attackEffects.set(cat.id, { els, time: now });
    }
  } else {
    const fx = attackEffects.get(cat.id);
    if (fx) {
      for (const el of fx.els) el.remove();
      attackEffects.delete(cat.id);
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────

export function updateCats(
  now: number,
  animals: AnimalInstance[],
  cells: Record<string, FarmCell>,
  callbacks: CatCallbacks,
): void {
  for (const cat of animals) {
    if (cat.animalId !== "cat") continue;
    updateSingleCat(cat, now, animals, cells, callbacks);
  }
}

export function renderCats(
  animals: AnimalInstance[],
  overlay: HTMLDivElement,
  originX: number,
  originY: number,
  flipFactor: number,
  tileW: number,
  tileH: number,
): void {
  const activeIds = new Set<string>();

  for (const cat of animals) {
    if (cat.animalId !== "cat") continue;
    activeIds.add(cat.id);
    renderSingleCat(cat, overlay, originX, originY, flipFactor, tileW, tileH);
  }

  // Remove orphaned DOM elements
  for (const [id, entry] of catElements) {
    if (!activeIds.has(id)) {
      entry.el.remove();
      catElements.delete(id);
    }
  }
}

export function cleanupCats(): void {
  for (const [, entry] of catElements) {
    entry.el.remove();
  }
  catElements.clear();
  for (const [, fx] of attackEffects) {
    for (const el of fx.els) el.remove();
  }
  attackEffects.clear();
}
