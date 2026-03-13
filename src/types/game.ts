export type FarmStage = 'empty' | 'watering' | 'sprout' | 'tree' | 'fruit' | 'fallow' | 'overworked';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type CropCategory = 'fruit' | 'animal';

export interface CropDef {
  id: string;
  emoji: string;
  category: CropCategory;
  rarity: Rarity;
  weight: number;
}

export interface FarmCell {
  keyCode: string;
  label: string;
  stage: FarmStage;
  hitCount: number;
  cropId: string | null;
  isGolden: boolean;
  row: number;
  col: number;
  width: number;
  fallowUntil: number | null;
  harvestTimestamps: number[];
  overworkedUntil: number | null;
  hasPest: boolean;
  pestSince: number | null;
  preOverworkedStage: FarmStage | null;
  preOverworkedHitCount: number;
}

export interface DailyEntry {
  date: string;       // 'YYYY-MM-DD'
  keyPresses: number;
  harvests: number;
  pestsRemoved: number;
}

export interface GameState {
  cells: Record<string, FarmCell>;
  totalHarvested: number;
  harvestsByCrop: Record<string, number>;
  goldenHarvests: Record<string, number>;
  totalKeyPresses: Record<string, number>;
  totalPestsRemoved: number;
  dailyStats: DailyEntry[];
  workers: number;
  workerSpeed: number; // speed upgrade level (1-based)
  animals: AnimalInstance[];
}

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
  restUntil: number;
  workCount: number;
}

// ── Worker upgrade tiers ────────────────────────────────────────────
export interface WorkerTier {
  harvests: number;   // total harvests required
  species: number;    // unique species discovered
  golden: number;     // golden harvests required
}

export const WORKER_TIERS: WorkerTier[] = [
  { harvests: 0,      species: 0,  golden: 0 },   // Worker 1: free
  { harvests: 500,    species: 20, golden: 3 },    // Worker 2
  { harvests: 2000,   species: 50, golden: 15 },   // Worker 3
  { harvests: 5000,   species: 75, golden: 40 },   // Worker 4
  { harvests: 10000,  species: 90, golden: 80 },   // Worker 5
];

export const MAX_WORKERS = WORKER_TIERS.length;

// ── Worker speed upgrade tiers ──────────────────────────────────────
export interface SpeedTier {
  harvests: number;
  pestsRemoved: number;
  intervalMin: number; // ms
  intervalMax: number; // ms
}

export const SPEED_TIERS: SpeedTier[] = [
  { harvests: 0,    pestsRemoved: 0,    intervalMin: 60000,  intervalMax: 90000 },  // Lv1: 60-90s
  { harvests: 500,  pestsRemoved: 100,  intervalMin: 45000,  intervalMax: 60000 },  // Lv2: 45-60s
  { harvests: 1500, pestsRemoved: 400,  intervalMin: 30000,  intervalMax: 45000 },  // Lv3: 30-45s
  { harvests: 4000, pestsRemoved: 1000, intervalMin: 20000,  intervalMax: 30000 },  // Lv4: 20-30s
  { harvests: 8000, pestsRemoved: 2000, intervalMin: 12000,  intervalMax: 20000 },  // Lv5: 12-20s
];

export const MAX_SPEED_LEVEL = SPEED_TIERS.length;

export const STAGE_THRESHOLDS: Record<string, number> = {
  empty: 5,
  watering: 12,
  sprout: 23,
  tree: 38,
  fruit: 0,
  fallow: 0,
  overworked: 0,
};

export const NEXT_STAGE: Record<string, FarmStage | null> = {
  empty: 'watering',
  watering: 'sprout',
  sprout: 'tree',
  tree: 'fruit',
  fruit: null,
  fallow: null,
  overworked: null,
};

export const FALLOW_HARVEST_LIMIT = 3;
export const FALLOW_WINDOW_MS = 10 * 60_000;
export const FALLOW_DURATION_MS = 3 * 60_000;

export const OVERWORK_PRESS_LIMIT = 30;
export const OVERWORK_WINDOW_MS = 5_000;
export const OVERWORK_DURATION_MS = 20_000;

export const PEST_INTERVAL_MIN_MS = 40_000;    // 40 seconds
export const PEST_INTERVAL_MAX_MS = 80_000;    // 80 seconds

// Pest spawn speed multiplier per worker speed level (faster workers → more pests)
export const PEST_SPEED_MULTIPLIER = [1.0, 0.85, 0.7, 0.55, 0.4];
export const PEST_MAX_CONCURRENT = 8;          // max pests on board at once
export const PEST_EXPIRE_MS = 600_000;         // pests auto-disappear after 10 minutes

export const GOLDEN_CHANCE = 0.01;

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
