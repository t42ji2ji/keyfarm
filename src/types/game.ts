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

export interface GameState {
  cells: Record<string, FarmCell>;
  totalHarvested: number;
  harvestsByCrop: Record<string, number>;
  goldenHarvests: Record<string, number>;
  totalKeyPresses: Record<string, number>;
  totalPestsRemoved: number;
}

export const STAGE_THRESHOLDS: Record<string, number> = {
  empty: 3,
  watering: 8,
  sprout: 15,
  tree: 25,
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

export const PEST_INTERVAL_MIN_MS = 180_000;   // 3 minutes
export const PEST_INTERVAL_MAX_MS = 300_000;   // 5 minutes
export const PEST_MAX_CONCURRENT = 8;          // max pests on board at once

export const GOLDEN_CHANCE = 0.01;
