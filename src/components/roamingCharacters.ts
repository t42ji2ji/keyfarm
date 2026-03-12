import cameraGif from "../assets/camera.gif";
import cattGif from "../assets/catt.gif";
import coldGif from "../assets/cold.gif";
import danceGif from "../assets/dance.gif";
import dancefrogGif from "../assets/dancefrog.gif";
import gogoGif from "../assets/gogo.gif";
import noGif from "../assets/no.gif";
import runfrongGif from "../assets/runfrong.gif";
import runningGif from "../assets/running.gif";
import { gridToScreen } from "../utils/isometric";

// ── Constants ───────────────────────────────────────────────────────
const MAX_CHARACTERS = 3;
const SPAWN_CHECK_MIN = 8000;
const SPAWN_CHECK_MAX = 15000;
const SPAWN_CHANCE = 0.5;
const LIFESPAN_MIN = 240000;
const LIFESPAN_MAX = 300000;
const FADE_IN_MS = 500;
const FADE_OUT_MS = 1000;
const MOVE_DURATION_MIN = 3500;
const MOVE_DURATION_MAX = 5000;
const IDLE_MIN = 1500;
const IDLE_MAX = 3000;
const SIZE_MIN = 28;
const SIZE_MAX = 36;

// Farm bounds (grid coordinates)
const COL_MIN = 1;
const COL_MAX = 14;
const ROW_MIN = 0;
const ROW_MAX = 4;

// ── GIF sources ─────────────────────────────────────────────────────
const GIF_SRCS = [
  cattGif,
  danceGif,
  dancefrogGif,
  noGif,
  runfrongGif,
  runningGif,
  cameraGif,
  gogoGif,
  coldGif,
];

// ── Character state ─────────────────────────────────────────────────
interface RoamingCharacter {
  id: number;
  gifSrc: string;
  el: HTMLImageElement | null;
  col: number;
  row: number;
  targetCol: number;
  targetRow: number;
  startCol: number;
  startRow: number;
  moveStartTime: number;
  moveDuration: number;
  state: "moving" | "idle";
  idleUntil: number;
  facingLeft: boolean;
  size: number;
  spawnTime: number;
  despawnTime: number;
}

let characters: RoamingCharacter[] = [];
let nextId = 0;
let lastSpawnCheck = 0;
let nextSpawnDelay = randomBetween(SPAWN_CHECK_MIN, SPAWN_CHECK_MAX);

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function pickRandomTarget(
  currentCol: number,
  currentRow: number
): { col: number; row: number } {
  const steps = randomInt(1, 3);
  const dcol = randomInt(-steps, steps);
  const drow = randomInt(-steps, steps);
  const col = Math.max(
    COL_MIN,
    Math.min(COL_MAX, Math.round(currentCol + dcol))
  );
  const row = Math.max(
    ROW_MIN,
    Math.min(ROW_MAX, Math.round(currentRow + drow))
  );
  if (col === Math.round(currentCol) && row === Math.round(currentRow)) {
    return { col: Math.min(COL_MAX, col + 1), row };
  }
  return { col, row };
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ── Public API ──────────────────────────────────────────────────────

export function trySpawnCharacter(now: number): void {
  if (lastSpawnCheck === 0) {
    lastSpawnCheck = now;
    nextSpawnDelay = 1000;
    return;
  }

  if (now - lastSpawnCheck < nextSpawnDelay) return;
  lastSpawnCheck = now;
  nextSpawnDelay = randomBetween(SPAWN_CHECK_MIN, SPAWN_CHECK_MAX);

  if (characters.length >= MAX_CHARACTERS) return;
  if (characters.length > 0 && Math.random() > SPAWN_CHANCE) return;
  if (GIF_SRCS.length === 0) return;

  const gifSrc = GIF_SRCS[randomInt(0, GIF_SRCS.length - 1)];
  const col = randomInt(COL_MIN, COL_MAX);
  const row = randomInt(ROW_MIN, ROW_MAX);
  const lifespan = randomBetween(LIFESPAN_MIN, LIFESPAN_MAX);

  const char: RoamingCharacter = {
    id: nextId++,
    gifSrc,
    el: null,
    col,
    row,
    targetCol: col,
    targetRow: row,
    startCol: col,
    startRow: row,
    moveStartTime: 0,
    moveDuration: 0,
    state: "idle",
    idleUntil: now + randomBetween(IDLE_MIN, IDLE_MAX),
    facingLeft: false,
    size: randomInt(SIZE_MIN, SIZE_MAX),
    spawnTime: now,
    despawnTime: now + lifespan,
  };

  characters.push(char);
}

export function updateCharacters(now: number): void {
  for (const c of characters) {
    if (c.state === "idle" && now >= c.idleUntil) {
      const target = pickRandomTarget(c.col, c.row);
      c.startCol = c.col;
      c.startRow = c.row;
      c.targetCol = target.col;
      c.targetRow = target.row;
      c.moveStartTime = now;
      c.moveDuration = randomBetween(MOVE_DURATION_MIN, MOVE_DURATION_MAX);
      c.facingLeft = target.col < c.col;
      c.state = "moving";
    }

    if (c.state === "moving") {
      const elapsed = now - c.moveStartTime;
      const t = Math.min(1, elapsed / c.moveDuration);
      const eased = easeInOutQuad(t);
      c.col = c.startCol + (c.targetCol - c.startCol) * eased;
      c.row = c.startRow + (c.targetRow - c.startRow) * eased;

      if (t >= 1) {
        c.col = c.targetCol;
        c.row = c.targetRow;
        c.state = "idle";
        c.idleUntil = now + randomBetween(IDLE_MIN, IDLE_MAX);
      }
    }
  }

  // Remove fully faded-out characters and clean up their DOM elements
  characters = characters.filter((c) => {
    const fadeOutEnd = c.despawnTime + FADE_OUT_MS;
    if (now >= fadeOutEnd) {
      c.el?.remove();
      return false;
    }
    return true;
  });
}

export function hasCharacters(): boolean {
  return characters.length > 0;
}

/**
 * Render characters as positioned <img> elements in the overlay div.
 * The browser natively animates GIFs this way.
 */
export function renderCharacters(
  overlay: HTMLDivElement,
  originX: number,
  originY: number,
  flipFactor: number,
  tileW: number,
  tileH: number,
  now: number
): void {
  for (const c of characters) {
    // Create DOM element on first render
    if (!c.el) {
      const img = document.createElement("img");
      img.src = c.gifSrc;
      img.style.position = "absolute";
      img.style.pointerEvents = "none";
      img.style.imageRendering = "auto";
      img.dataset.charId = String(c.id);
      overlay.appendChild(img);
      c.el = img;
    }

    // Compute opacity
    let opacity = 1;
    const fadeInAge = now - c.spawnTime;
    if (fadeInAge < FADE_IN_MS) {
      opacity = fadeInAge / FADE_IN_MS;
    }
    if (now >= c.despawnTime) {
      const fadeOutAge = now - c.despawnTime;
      opacity = Math.max(0, 1 - fadeOutAge / FADE_OUT_MS);
    }

    // Convert grid position to screen (center of tile)
    const screen = gridToScreen(
      c.col + 0.5,
      c.row + 0.5,
      tileW,
      tileH,
      originX,
      originY,
      flipFactor
    );
    const drawX = screen.x;
    const drawY = screen.y - 20;

    const scaleX = c.facingLeft ? -1 : 1;

    c.el.style.width = `${c.size}px`;
    c.el.style.height = `${c.size}px`;
    c.el.style.opacity = String(opacity);
    c.el.style.transform = `translate(${drawX - c.size / 2}px, ${drawY - c.size / 2}px) scaleX(${scaleX})`;
    c.el.style.zIndex = String(Math.round(c.row * 100));
  }
}

/** Clean up all character DOM elements (for unmount). */
export function cleanupCharacters(): void {
  for (const c of characters) {
    c.el?.remove();
  }
  characters = [];
  lastSpawnCheck = 0;
}
