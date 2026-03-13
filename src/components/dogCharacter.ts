import dogIdleGif from "../assets/dog-idle.gif";
import dogWalkGif from "../assets/dog-walk.gif";
import dogAttackGif from "../assets/dog-attack.gif";
import { gridToScreen } from "../utils/isometric";
import type { AnimalInstance } from "../types/game";

// ── Constants ───────────────────────────────────────────────────────
const DOG_SIZE = 52;
const CHASE_SPEED = 3.0; // grid units per second
const ATTACK_RADIUS = 1.0; // grid units — distance to trigger attack
const ATTACK_DURATION = 600; // ms
const IDLE_NEAR_MOUSE_RADIUS = 1.5; // if mouse is this close, idle
const CHASE_MAX_RADIUS = 6.0; // beyond this, dog ignores mouse and roams
const MOUSE_IDLE_TIMEOUT = 3000; // ms — if mouse doesn't move for this long, dog roams
const IDLE_PAUSE_MIN = 300;
const IDLE_PAUSE_MAX = 800;
const ROAM_IDLE_MIN = 2000;
const ROAM_IDLE_MAX = 5000;
const ROAM_DIST_MIN = 2;
const ROAM_DIST_MAX = 4;
const ROAM_SPEED = 1.5; // slower than chase

// Grid bounds (HHKB layout)
const GRID_COL_MIN = 0.5;
const GRID_COL_MAX = 14.5;
const GRID_ROW_MIN = 0;
const GRID_ROW_MAX = 4.5;

type DogDisplayState = "idle" | "walking" | "attack";

const DISPLAY_GIFS: Record<DogDisplayState, string> = {
  idle: dogIdleGif,
  walking: dogWalkGif,
  attack: dogAttackGif,
};

// ── Inject attack effect CSS ────────────────────────────────────────
const STYLE_ID = "dog-attack-fx";
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes dog-attack-shake {
      0%,100% { translate: 0 0; }
      15% { translate: -3px -1px; }
      30% { translate: 3px 0; }
      45% { translate: -2px 1px; }
      60% { translate: 2px -1px; }
      75% { translate: -1px 0; }
    }
    @keyframes dog-impact-burst {
      0% { scale: 0.3; opacity: 1; }
      50% { scale: 1.1; opacity: 0.9; }
      100% { scale: 1.4; opacity: 0; }
    }
    @keyframes dog-slash {
      0% { clip-path: inset(100% 0 0 0); opacity: 1; }
      40% { clip-path: inset(0 0 0 0); opacity: 1; }
      100% { clip-path: inset(0 0 0 0); opacity: 0; }
    }
    .dog-attacking {
      animation: dog-attack-shake 0.15s ease-in-out infinite;
      filter: brightness(1.3) drop-shadow(0 0 6px rgba(255,80,80,0.6));
    }
    .dog-impact {
      position: absolute;
      pointer-events: none;
      width: 40px;
      height: 40px;
      animation: dog-impact-burst 0.4s ease-out forwards;
    }
    .dog-slash-mark {
      position: absolute;
      pointer-events: none;
      font-size: 28px;
      animation: dog-slash 0.35s ease-out forwards;
    }
  `;
  document.head.appendChild(style);
}

// ── Dog DOM elements ────────────────────────────────────────────────
const dogElements = new Map<string, {
  el: HTMLImageElement;
  displayState: DogDisplayState | null;
}>();

// Track active impact effects
const attackEffects = new Map<string, { els: HTMLElement[]; time: number }>;

// ── Mouse position in grid coordinates ──────────────────────────────
let mouseCol = 7;
let mouseRow = 2;
let mouseLastMoveTime = 0;

export function setDogMousePosition(col: number, row: number): void {
  if (Math.abs(col - mouseCol) > 0.05 || Math.abs(row - mouseRow) > 0.05) {
    mouseLastMoveTime = Date.now();
  }
  mouseCol = col;
  mouseRow = row;
}

function isMouseActive(now: number): boolean {
  return mouseLastMoveTime > 0 && now - mouseLastMoveTime < MOUSE_IDLE_TIMEOUT;
}

// ── Helpers ─────────────────────────────────────────────────────────
function clampCol(col: number): number {
  return Math.max(GRID_COL_MIN, Math.min(GRID_COL_MAX, col));
}

function clampRow(row: number): number {
  return Math.max(GRID_ROW_MIN, Math.min(GRID_ROW_MAX, row));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function getRandomRoamTarget(dog: AnimalInstance): { col: number; row: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = randomBetween(ROAM_DIST_MIN, ROAM_DIST_MAX);
  return {
    col: clampCol(dog.col + Math.cos(angle) * dist),
    row: clampRow(dog.row + Math.sin(angle) * dist * 0.5),
  };
}

/** Should the dog chase the mouse? */
function shouldChase(dog: AnimalInstance, now: number): boolean {
  if (!isMouseActive(now)) return false;
  const dist = Math.hypot(mouseCol - dog.col, mouseRow - dog.row);
  return dist > IDLE_NEAR_MOUSE_RADIUS && dist < CHASE_MAX_RADIUS;
}

// ── Callbacks ───────────────────────────────────────────────────────
export interface DogCallbacks {
  onDuckAttacked: (duckId: string) => void;
}

// ── Create ──────────────────────────────────────────────────────────
export function createDog(id: string, now: number): AnimalInstance {
  return {
    id,
    animalId: "dog",
    col: 7,
    row: 2,
    state: "idle",
    facingLeft: false,
    targetKey: null,
    actionType: null,
    moveStartCol: 7,
    moveStartRow: 2,
    moveEndCol: 7,
    moveEndRow: 2,
    moveStartTime: now,
    moveDuration: 0,
    workStartTime: 0,
    diedAt: null,
    nextActionTime: 0,
    restUntil: 0,
    workCount: 0,
  };
}

// ── Update single dog ───────────────────────────────────────────────
function updateSingleDog(
  dog: AnimalInstance,
  now: number,
  animals: AnimalInstance[],
  callbacks: DogCallbacks,
): void {
  // Find nearest alive duck
  let nearestDuck: AnimalInstance | null = null;
  let nearestDist = Infinity;
  for (const a of animals) {
    if (a.animalId !== "duck" || a.state === "dead") continue;
    const dist = Math.hypot(a.col - dog.col, a.row - dog.row);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestDuck = a;
    }
  }

  switch (dog.state) {
    case "idle": {
      if (now < dog.nextActionTime) break;

      // Check for nearby duck to attack
      if (nearestDuck && nearestDist < ATTACK_RADIUS) {
        dog.state = "working";
        dog.workStartTime = now;
        dog.targetKey = nearestDuck.id;
        dog.facingLeft = nearestDuck.col < dog.col;
        break;
      }

      // Chase mouse if active and within range
      if (shouldChase(dog, now)) {
        dog.state = "walking";
        dog.moveStartTime = now;
        dog.facingLeft = mouseCol < dog.col;
        break;
      }

      // Otherwise roam randomly
      const roamTarget = getRandomRoamTarget(dog);
      dog.state = "fleeing"; // reuse fleeing state for roaming
      dog.moveStartCol = dog.col;
      dog.moveStartRow = dog.row;
      dog.moveEndCol = roamTarget.col;
      dog.moveEndRow = roamTarget.row;
      dog.facingLeft = roamTarget.col < dog.col;
      const roamDist = Math.hypot(roamTarget.col - dog.col, roamTarget.row - dog.row);
      dog.moveDuration = (roamDist / ROAM_SPEED) * 1000;
      dog.moveStartTime = now;
      break;
    }

    case "walking": {
      // Check for nearby duck to attack (interrupts chase)
      if (nearestDuck && nearestDist < ATTACK_RADIUS) {
        dog.state = "working";
        dog.workStartTime = now;
        dog.targetKey = nearestDuck.id;
        dog.facingLeft = nearestDuck.col < dog.col;
        break;
      }

      // If mouse became inactive or too far, stop chasing → idle (will roam next)
      if (!shouldChase(dog, now)) {
        dog.state = "idle";
        dog.nextActionTime = now + IDLE_PAUSE_MIN + Math.random() * (IDLE_PAUSE_MAX - IDLE_PAUSE_MIN);
        break;
      }

      // Direct lerp toward mouse each frame using delta time
      const dx = mouseCol - dog.col;
      const dy = mouseRow - dog.row;
      const dist = Math.hypot(dx, dy);

      if (dist < IDLE_NEAR_MOUSE_RADIUS) {
        dog.state = "idle";
        dog.nextActionTime = now + IDLE_PAUSE_MIN + Math.random() * (IDLE_PAUSE_MAX - IDLE_PAUSE_MIN);
        break;
      }

      const dt = Math.min((now - dog.moveStartTime) / 1000, 0.1);
      dog.moveStartTime = now;
      const step = CHASE_SPEED * dt;
      const norm = Math.min(1, step / dist);
      dog.col = clampCol(dog.col + dx * norm);
      dog.row = clampRow(dog.row + dy * norm);
      dog.facingLeft = mouseCol < dog.col;
      break;
    }

    // Roaming (reuses "fleeing" state)
    case "fleeing": {
      // Mouse started moving nearby → interrupt roam, go chase
      if (shouldChase(dog, now)) {
        dog.state = "walking";
        dog.moveStartTime = now;
        dog.facingLeft = mouseCol < dog.col;
        break;
      }

      // Check for nearby duck to attack
      if (nearestDuck && nearestDist < ATTACK_RADIUS) {
        dog.state = "working";
        dog.workStartTime = now;
        dog.targetKey = nearestDuck.id;
        dog.facingLeft = nearestDuck.col < dog.col;
        break;
      }

      // Interpolate along roam path
      const elapsed = now - dog.moveStartTime;
      const t = Math.min(1, elapsed / dog.moveDuration);
      dog.col = dog.moveStartCol + (dog.moveEndCol - dog.moveStartCol) * t;
      dog.row = dog.moveStartRow + (dog.moveEndRow - dog.moveStartRow) * t;

      if (t >= 1) {
        dog.col = dog.moveEndCol;
        dog.row = dog.moveEndRow;
        dog.state = "idle";
        dog.nextActionTime = now + randomBetween(ROAM_IDLE_MIN, ROAM_IDLE_MAX);
      }
      break;
    }

    case "working": {
      // Attack animation
      if (now >= dog.workStartTime + ATTACK_DURATION) {
        if (dog.targetKey) {
          callbacks.onDuckAttacked(dog.targetKey);
        }
        dog.state = "idle";
        dog.targetKey = null;
        dog.nextActionTime = now + IDLE_PAUSE_MIN + Math.random() * (IDLE_PAUSE_MAX - IDLE_PAUSE_MIN);
      }
      break;
    }
  }
}

// ── Render single dog ───────────────────────────────────────────────
function renderSingleDog(
  dog: AnimalInstance,
  overlay: HTMLDivElement,
  originX: number,
  originY: number,
  flipFactor: number,
  tileW: number,
  tileH: number,
): void {
  let entry = dogElements.get(dog.id);

  // Create DOM element on first render
  if (!entry) {
    const img = document.createElement("img");
    img.src = dogIdleGif;
    img.style.position = "absolute";
    img.style.pointerEvents = "none";
    img.style.imageRendering = "pixelated";
    img.dataset.dogId = dog.id;
    overlay.appendChild(img);
    entry = { el: img, displayState: "idle" };
    dogElements.set(dog.id, entry);
  }

  // Switch GIF based on state
  let wantDisplay: DogDisplayState = "idle";
  const isAttacking = dog.state === "working";
  if (dog.state === "walking" || dog.state === "fleeing") {
    wantDisplay = "walking";
  } else if (isAttacking) {
    wantDisplay = "attack";
  }

  if (entry.displayState !== wantDisplay) {
    entry.el.src = DISPLAY_GIFS[wantDisplay];
    entry.displayState = wantDisplay;
  }

  // Attack shake class
  if (isAttacking && !entry.el.classList.contains("dog-attacking")) {
    entry.el.classList.add("dog-attacking");
  } else if (!isAttacking && entry.el.classList.contains("dog-attacking")) {
    entry.el.classList.remove("dog-attacking");
  }

  // Convert grid position to screen
  const screen = gridToScreen(dog.col, dog.row, tileW, tileH, originX, originY, flipFactor);
  const drawX = screen.x;
  const drawY = screen.y - 8;

  const flipSign = flipFactor < 0 ? -1 : 1;
  const scaleX = (dog.facingLeft ? -1 : 1) * flipSign;

  entry.el.style.width = `${DOG_SIZE}px`;
  entry.el.style.height = `${DOG_SIZE}px`;
  entry.el.style.opacity = "1";
  entry.el.style.transform = `translate(${drawX - DOG_SIZE / 2}px, ${drawY - DOG_SIZE}px) scaleX(${scaleX})`;
  entry.el.style.zIndex = String(Math.round(dog.row * 100) + 35);

  // Spawn impact effects when attack starts (re-trigger every 400ms)
  if (isAttacking) {
    const existing = attackEffects.get(dog.id);
    const now = Date.now();
    if (!existing || now - existing.time > 400) {
      // Clean up previous round
      if (existing) {
        for (const el of existing.els) el.remove();
        attackEffects.delete(dog.id);
      }
      const effectX = drawX + (dog.facingLeft ? -18 : 18);
      const effectY = drawY - DOG_SIZE * 0.5;
      const els: HTMLElement[] = [];

      // Impact burst (star shape via SVG)
      const burst = document.createElement("div");
      burst.className = "dog-impact";
      burst.style.left = `${effectX - 20}px`;
      burst.style.top = `${effectY - 20}px`;
      burst.innerHTML = `<svg width="40" height="40" viewBox="0 0 40 40">
        <polygon points="20,2 24,14 37,14 27,22 31,35 20,27 9,35 13,22 3,14 16,14"
          fill="rgba(255,220,80,0.9)" stroke="rgba(255,160,40,0.8)" stroke-width="1"/>
      </svg>`;
      burst.style.zIndex = String(Math.round(dog.row * 100) + 36);
      overlay.appendChild(burst);
      els.push(burst);

      // Slash marks
      const slash = document.createElement("div");
      slash.className = "dog-slash-mark";
      slash.style.left = `${effectX - 8}px`;
      slash.style.top = `${effectY - 18}px`;
      slash.textContent = "💥";
      slash.style.zIndex = String(Math.round(dog.row * 100) + 37);
      overlay.appendChild(slash);
      els.push(slash);

      attackEffects.set(dog.id, { els, time: Date.now() });
    }
  } else {
    // Clean up effects when attack ends
    const fx = attackEffects.get(dog.id);
    if (fx) {
      for (const el of fx.els) el.remove();
      attackEffects.delete(dog.id);
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────

export function updateDogs(
  now: number,
  animals: AnimalInstance[],
  callbacks: DogCallbacks,
): void {
  for (const dog of animals) {
    if (dog.animalId !== "dog") continue;
    updateSingleDog(dog, now, animals, callbacks);
  }
}

export function renderDogs(
  animals: AnimalInstance[],
  overlay: HTMLDivElement,
  originX: number,
  originY: number,
  flipFactor: number,
  tileW: number,
  tileH: number,
): void {
  const activeIds = new Set<string>();

  for (const dog of animals) {
    if (dog.animalId !== "dog") continue;
    activeIds.add(dog.id);
    renderSingleDog(dog, overlay, originX, originY, flipFactor, tileW, tileH);
  }

  // Remove orphaned DOM elements
  for (const [id, entry] of dogElements) {
    if (!activeIds.has(id)) {
      entry.el.remove();
      dogElements.delete(id);
    }
  }
}

export function cleanupDogs(): void {
  for (const [, entry] of dogElements) {
    entry.el.remove();
  }
  dogElements.clear();
  for (const [, fx] of attackEffects) {
    for (const el of fx.els) el.remove();
  }
  attackEffects.clear();
}
