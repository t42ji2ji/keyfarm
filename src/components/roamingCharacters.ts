import farmerIdleGif from "../assets/farmer-idle.gif";
import farmerWalkGif from "../assets/farmer-walk.gif";
import farmerHarvestGif from "../assets/farmer-harvest.gif";
import farmerAttackGif from "../assets/farmer-attack.gif";
import { gridToScreen } from "../utils/isometric";
import type { FarmCell } from "../types/game";
import { SPEED_TIERS } from "../types/game";

// ── Constants ───────────────────────────────────────────────────────
const FARMER_SIZE = 56;
const MOVE_SPEED = 3; // grid units per second
const WORK_DURATION = 1000; // ms to play harvest/attack animation before triggering
const NO_TARGET_RETRY = 3000; // retry interval when no target found

// Starting positions for each worker
const SPAWN_POSITIONS = [
  { col: 7.5, row: 2 },
  { col: 3, row: 1 },
  { col: 12, row: 3 },
  { col: 5, row: 0.5 },
  { col: 10, row: 3.5 },
];

// ── Farmer state ────────────────────────────────────────────────────
type FarmerDisplayState = "idle" | "walking" | "harvest" | "attack";

const DISPLAY_GIFS: Record<FarmerDisplayState, string> = {
  idle: farmerIdleGif,
  walking: farmerWalkGif,
  harvest: farmerHarvestGif,
  attack: farmerAttackGif,
};

interface FarmerState {
  id: number;
  col: number;
  row: number;
  startCol: number;
  startRow: number;
  targetCol: number;
  targetRow: number;
  moveStartTime: number;
  moveDuration: number;
  state: "idle" | "walking" | "working";
  facingLeft: boolean;
  el: HTMLImageElement | null;
  displayState: FarmerDisplayState | null;
  nextActionTime: number;
  targetKeyCode: string | null;
  targetType: "harvest" | "pest" | null;
  workEndTime: number;
}

let farmers: FarmerState[] = [];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Get keyCodes already targeted by other farmers (walking to or working on). */
function getClaimedTargets(excludeId: number): Set<string> {
  const claimed = new Set<string>();
  for (const f of farmers) {
    if (f.id !== excludeId && f.targetKeyCode) {
      claimed.add(f.targetKeyCode);
    }
  }
  return claimed;
}

function findTarget(
  farmer: FarmerState,
  cells: Record<string, FarmCell>
): {
  keyCode: string;
  col: number;
  row: number;
  type: "harvest" | "pest";
} | null {
  const claimed = getClaimedTargets(farmer.id);

  const targets: {
    keyCode: string;
    col: number;
    row: number;
    type: "harvest" | "pest";
    dist: number;
  }[] = [];

  for (const [keyCode, cell] of Object.entries(cells)) {
    if (keyCode.startsWith("_gap")) continue;
    if (claimed.has(keyCode)) continue;

    const col = cell.col + cell.width / 2;
    const row = cell.row + 0.5;
    const dist = Math.hypot(col - farmer.col, row - farmer.row);

    if (cell.hasPest) {
      targets.push({ keyCode, col, row, type: "pest", dist });
    } else if (cell.stage === "fruit") {
      targets.push({ keyCode, col, row, type: "harvest", dist });
    }
  }

  if (targets.length === 0) return null;

  // Prioritize pests first, then pick closest
  targets.sort((a, b) => {
    if (a.type === "pest" && b.type !== "pest") return -1;
    if (a.type !== "pest" && b.type === "pest") return 1;
    return a.dist - b.dist;
  });

  return targets[0];
}

function createFarmer(id: number, now: number): FarmerState {
  const pos = SPAWN_POSITIONS[id] ?? SPAWN_POSITIONS[0];
  return {
    id,
    col: pos.col,
    row: pos.row,
    startCol: pos.col,
    startRow: pos.row,
    targetCol: pos.col,
    targetRow: pos.row,
    moveStartTime: 0,
    moveDuration: 0,
    state: "idle",
    facingLeft: false,
    el: null,
    displayState: null,
    nextActionTime: now + randomBetween(3000, 5000) + id * 2000, // stagger starts
    targetKeyCode: null,
    targetType: null,
    workEndTime: 0,
  };
}

function updateSingleFarmer(
  farmer: FarmerState,
  now: number,
  cells: Record<string, FarmCell>,
  callbacks: FarmerCallbacks,
  speedLevel: number
): void {
  const tier = SPEED_TIERS[speedLevel - 1] ?? SPEED_TIERS[0];
  switch (farmer.state) {
    case "idle": {
      if (now >= farmer.nextActionTime) {
        const target = findTarget(farmer, cells);
        if (target) {
          const dist = Math.hypot(
            target.col - farmer.col,
            target.row - farmer.row
          );

          // If already at target, skip to working
          if (dist < 0.3) {
            farmer.col = target.col;
            farmer.row = target.row;
            farmer.targetKeyCode = target.keyCode;
            farmer.targetType = target.type;
            farmer.state = "working";
            farmer.workEndTime = now + WORK_DURATION;
            break;
          }

          farmer.startCol = farmer.col;
          farmer.startRow = farmer.row;
          farmer.targetCol = target.col;
          farmer.targetRow = target.row;
          farmer.targetKeyCode = target.keyCode;
          farmer.targetType = target.type;
          farmer.facingLeft = target.col < farmer.col;
          farmer.moveDuration = (dist / MOVE_SPEED) * 1000;
          farmer.moveStartTime = now;
          farmer.state = "walking";
        } else {
          farmer.nextActionTime = now + NO_TARGET_RETRY;
        }
      }
      break;
    }

    case "walking": {
      const elapsed = now - farmer.moveStartTime;
      const t = Math.min(1, elapsed / farmer.moveDuration);
      const eased = easeInOutQuad(t);
      farmer.col =
        farmer.startCol + (farmer.targetCol - farmer.startCol) * eased;
      farmer.row =
        farmer.startRow + (farmer.targetRow - farmer.startRow) * eased;

      if (t >= 1) {
        farmer.col = farmer.targetCol;
        farmer.row = farmer.targetRow;
        farmer.state = "working";
        farmer.workEndTime = now + WORK_DURATION;
      }
      break;
    }

    case "working": {
      if (now >= farmer.workEndTime) {
        if (farmer.targetKeyCode) {
          const cell = cells[farmer.targetKeyCode];
          if (cell) {
            if (farmer.targetType === "pest" && cell.hasPest) {
              callbacks.onRemovePest(farmer.targetKeyCode);
            } else if (
              farmer.targetType === "harvest" &&
              cell.stage === "fruit"
            ) {
              callbacks.onHarvest(farmer.targetKeyCode);
            }
          }
        }
        farmer.state = "idle";
        farmer.targetKeyCode = null;
        farmer.targetType = null;
        farmer.nextActionTime =
          now + randomBetween(tier.intervalMin, tier.intervalMax);
      }
      break;
    }
  }
}

function renderSingleFarmer(
  farmer: FarmerState,
  overlay: HTMLDivElement,
  originX: number,
  originY: number,
  flipFactor: number,
  tileW: number,
  tileH: number
): void {
  // Create DOM element on first render
  if (!farmer.el) {
    const img = document.createElement("img");
    img.src = farmerIdleGif;
    img.style.position = "absolute";
    img.style.pointerEvents = "none";
    img.style.imageRendering = "pixelated";
    img.dataset.farmerId = String(farmer.id);
    overlay.appendChild(img);
    farmer.el = img;
    farmer.displayState = "idle";
  }

  // Switch GIF based on state
  let wantDisplay: FarmerDisplayState = "idle";
  if (farmer.state === "walking") {
    wantDisplay = "walking";
  } else if (farmer.state === "working") {
    wantDisplay = farmer.targetType === "pest" ? "attack" : "harvest";
  }
  if (farmer.displayState !== wantDisplay) {
    farmer.el.src = DISPLAY_GIFS[wantDisplay];
    farmer.displayState = wantDisplay;
  }

  // Convert grid position to screen — feet at tile center
  const screen = gridToScreen(
    farmer.col,
    farmer.row,
    tileW,
    tileH,
    originX,
    originY,
    flipFactor
  );
  const drawX = screen.x;
  const drawY = screen.y - 8;

  const flipSign = flipFactor < 0 ? -1 : 1;
  const scaleX = (farmer.facingLeft ? -1 : 1) * flipSign;

  farmer.el.style.width = `${FARMER_SIZE}px`;
  farmer.el.style.height = `${FARMER_SIZE}px`;
  farmer.el.style.opacity = "1";
  farmer.el.style.transform = `translate(${drawX - FARMER_SIZE / 2}px, ${drawY - FARMER_SIZE}px) scaleX(${scaleX})`;
  farmer.el.style.zIndex = String(Math.round(farmer.row * 100) + 50);
}

// ── Callbacks interface ─────────────────────────────────────────────
export interface FarmerCallbacks {
  onHarvest: (keyCode: string) => void;
  onRemovePest: (keyCode: string) => void;
}

// ── Public API ──────────────────────────────────────────────────────

export function updateFarmer(
  now: number,
  cells: Record<string, FarmCell>,
  callbacks: FarmerCallbacks,
  workerCount: number,
  speedLevel: number = 1
): void {
  // Spawn new farmers if needed
  while (farmers.length < workerCount) {
    farmers.push(createFarmer(farmers.length, now));
  }

  // Remove excess farmers if workerCount decreased (unlikely but safe)
  while (farmers.length > workerCount) {
    const removed = farmers.pop();
    removed?.el?.remove();
  }

  for (const f of farmers) {
    updateSingleFarmer(f, now, cells, callbacks, speedLevel);
  }
}

export function renderFarmer(
  overlay: HTMLDivElement,
  originX: number,
  originY: number,
  flipFactor: number,
  tileW: number,
  tileH: number
): void {
  for (const f of farmers) {
    renderSingleFarmer(f, overlay, originX, originY, flipFactor, tileW, tileH);
  }
}

export function cleanupFarmer(): void {
  for (const f of farmers) {
    f.el?.remove();
  }
  farmers = [];
}

export function hasFarmer(): boolean {
  return farmers.length > 0;
}
