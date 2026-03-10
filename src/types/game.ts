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
