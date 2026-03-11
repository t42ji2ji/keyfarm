# Farm Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand keyfarm with 25 crop types (fruits + animals), golden variants, fallow/overworked mechanics, and pest events.

**Architecture:** All changes are frontend-only. New crop data module defines 25 types with weighted random selection. FarmCell gains new fields for fallow/overworked/pest state. FarmCanvas renders new visual states. A timer-based system drives pest spawning and state expiry.

**Tech Stack:** React + TypeScript + Canvas 2D (existing stack, no new deps)

---

### Task 1: Update Type Definitions

**Files:**
- Modify: `src/types/game.ts` (full rewrite)

**Step 1: Replace game.ts with expanded types**

```typescript
// src/types/game.ts

export type FarmStage = 'empty' | 'watering' | 'sprout' | 'tree' | 'fruit' | 'fallow' | 'overworked';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type CropCategory = 'fruit' | 'animal';

export interface CropDef {
  id: string;       // unique key, e.g. "apple", "fox"
  emoji: string;
  category: CropCategory;
  rarity: Rarity;
  weight: number;   // for weighted random selection
}

export interface FarmCell {
  keyCode: string;
  label: string;
  stage: FarmStage;
  hitCount: number;
  cropId: string | null;       // references CropDef.id
  isGolden: boolean;
  row: number;
  col: number;
  width: number;
  // Fallow (over-harvest): 3 harvests in 10 min → fallow 3 min
  fallowUntil: number | null;
  harvestTimestamps: number[];
  // Overworked (high-frequency): 30 presses in 5s → locked 20s
  overworkedUntil: number | null;
  // Pest
  hasPest: boolean;
  pestSince: number | null;
  // Stage saved before overworked (to restore after)
  preOverworkedStage: FarmStage | null;
  preOverworkedHitCount: number;
}

export interface GameState {
  cells: Record<string, FarmCell>;
  totalHarvested: number;
  harvestsByCrop: Record<string, number>;   // cropId -> count
  goldenHarvests: Record<string, number>;   // cropId -> golden count
  totalKeyPresses: Record<string, number>;
}

export const STAGE_THRESHOLDS: Record<string, number> = {
  empty: 5,
  watering: 15,
  sprout: 30,
  tree: 50,
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

// Fallow constants
export const FALLOW_HARVEST_LIMIT = 3;        // harvests within window
export const FALLOW_WINDOW_MS = 10 * 60_000;  // 10 minutes
export const FALLOW_DURATION_MS = 3 * 60_000;  // 3 minutes

// Overworked constants
export const OVERWORK_PRESS_LIMIT = 30;
export const OVERWORK_WINDOW_MS = 5_000;       // 5 seconds
export const OVERWORK_DURATION_MS = 20_000;    // 20 seconds

// Pest constants
export const PEST_INTERVAL_MIN_MS = 30_000;    // 30 seconds
export const PEST_INTERVAL_MAX_MS = 60_000;    // 60 seconds
export const PEST_PENALTY_MS = 30_000;         // 30s before stage regress

// Golden chance
export const GOLDEN_CHANCE = 0.01;             // 1%
```

**Step 2: Commit**

```bash
git add src/types/game.ts
git commit -m "feat: expand FarmCell types for crops, fallow, overworked, pests"
```

---

### Task 2: Create Crop Data Module

**Files:**
- Create: `src/data/crops.ts`

**Step 1: Create crops.ts with all 25 crop definitions and weighted selector**

```typescript
// src/data/crops.ts
import type { CropDef, Rarity } from '../types/game';

export const CROPS: CropDef[] = [
  // Common fruits (weight 8 each = 48 total)
  { id: 'apple',   emoji: '🍎', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'orange',  emoji: '🍊', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'lemon',   emoji: '🍋', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'grape',   emoji: '🍇', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'peach',   emoji: '🍑', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'cherry',  emoji: '🍒', category: 'fruit',  rarity: 'common',   weight: 8 },
  // Uncommon fruits (weight 5 each = 25 total)
  { id: 'strawberry', emoji: '🍓', category: 'fruit', rarity: 'uncommon', weight: 5 },
  { id: 'watermelon', emoji: '🍉', category: 'fruit', rarity: 'uncommon', weight: 5 },
  { id: 'banana',     emoji: '🍌', category: 'fruit', rarity: 'uncommon', weight: 5 },
  { id: 'pear',       emoji: '🍐', category: 'fruit', rarity: 'uncommon', weight: 5 },
  { id: 'kiwi',       emoji: '🥝', category: 'fruit', rarity: 'uncommon', weight: 5 },
  // Rare fruits (weight 3 each = 9 total)
  { id: 'mango',      emoji: '🥭', category: 'fruit', rarity: 'rare',     weight: 3 },
  { id: 'pineapple',  emoji: '🍍', category: 'fruit', rarity: 'rare',     weight: 3 },
  { id: 'blueberry',  emoji: '🫐', category: 'fruit', rarity: 'rare',     weight: 3 },
  // Uncommon animals (weight 2.5 each = 10 total)
  { id: 'chicken', emoji: '🐔', category: 'animal', rarity: 'uncommon', weight: 2.5 },
  { id: 'pig',     emoji: '🐷', category: 'animal', rarity: 'uncommon', weight: 2.5 },
  { id: 'cow',     emoji: '🐮', category: 'animal', rarity: 'uncommon', weight: 2.5 },
  { id: 'sheep',   emoji: '🐑', category: 'animal', rarity: 'uncommon', weight: 2.5 },
  // Rare animals (weight 1.5 each = 4.5 total)
  { id: 'cat',    emoji: '🐱', category: 'animal', rarity: 'rare',      weight: 1.5 },
  { id: 'dog',    emoji: '🐶', category: 'animal', rarity: 'rare',      weight: 1.5 },
  { id: 'rabbit', emoji: '🐰', category: 'animal', rarity: 'rare',      weight: 1.5 },
  // Legendary animals (weight 0.875 each = 3.5 total)
  { id: 'fox',     emoji: '🦊', category: 'animal', rarity: 'legendary', weight: 0.875 },
  { id: 'unicorn', emoji: '🦄', category: 'animal', rarity: 'legendary', weight: 0.875 },
  { id: 'dragon',  emoji: '🐉', category: 'animal', rarity: 'legendary', weight: 0.875 },
  { id: 'panda',   emoji: '🐼', category: 'animal', rarity: 'legendary', weight: 0.875 },
];

// Lookup map: cropId -> CropDef
export const CROP_MAP: Record<string, CropDef> = Object.fromEntries(
  CROPS.map(c => [c.id, c])
);

// Pre-computed total weight
const TOTAL_WEIGHT = CROPS.reduce((sum, c) => sum + c.weight, 0);

/** Weighted random crop selection. */
export function getRandomCrop(): CropDef {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const crop of CROPS) {
    roll -= crop.weight;
    if (roll <= 0) return crop;
  }
  return CROPS[0]; // fallback
}

/** Rarity display color for UI. */
export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#B0B0B0',
  uncommon: '#4ADE80',
  rare: '#60A5FA',
  legendary: '#F59E0B',
};

/** Particle color per crop (for harvest animation). */
export const CROP_PARTICLE_COLORS: Record<string, string> = {
  apple: '#FF3B30', orange: '#FF9500', cherry: '#FF2D55', grape: '#AF52DE',
  peach: '#FFAA85', lemon: '#FFCC00', strawberry: '#FF6B81', watermelon: '#2ECC71',
  banana: '#FFE066', pear: '#A8D86E', kiwi: '#7AB648', mango: '#FFB347',
  pineapple: '#FFD700', blueberry: '#6366F1',
  chicken: '#FFD700', pig: '#FFB6C1', cow: '#D2B48C', sheep: '#F5F5DC',
  cat: '#FFA07A', dog: '#DEB887', rabbit: '#FFC0CB',
  fox: '#FF8C00', unicorn: '#E879F9', dragon: '#EF4444', panda: '#E5E7EB',
};
```

**Step 2: Commit**

```bash
git add src/data/crops.ts
git commit -m "feat: add 25 crop definitions with weighted random selection"
```

---

### Task 3: Update hhkbLayout.ts for New FarmCell Shape

**Files:**
- Modify: `src/data/hhkbLayout.ts:95-116` (`createInitialCells` function)

**Step 1: Update createInitialCells to produce new FarmCell shape**

Change the `createInitialCells` function to initialize all new fields:

```typescript
export function createInitialCells(): Record<string, FarmCell> {
  const cells: Record<string, FarmCell> = {};

  HHKB_ROWS.forEach((row, rowIdx) => {
    let colOffset = 0;
    row.forEach((key) => {
      cells[key.keyCode] = {
        keyCode: key.keyCode,
        label: key.label,
        stage: 'empty',
        hitCount: 0,
        cropId: null,
        isGolden: false,
        row: rowIdx,
        col: colOffset,
        width: key.width,
        fallowUntil: null,
        harvestTimestamps: [],
        overworkedUntil: null,
        hasPest: false,
        pestSince: null,
        preOverworkedStage: null,
        preOverworkedHitCount: 0,
      };
      colOffset += key.width;
    });
  });

  return cells;
}
```

**Step 2: Commit**

```bash
git add src/data/hhkbLayout.ts
git commit -m "feat: update createInitialCells for expanded FarmCell fields"
```

---

### Task 4: Rewrite useGameState Hook

**Files:**
- Modify: `src/hooks/useGameState.ts` (major rewrite)

This is the core logic task. Key changes:
- Replace `getRandomFruit()` with `getRandomCrop()` + golden roll
- Add high-frequency detection (track press timestamps per key)
- Add fallow detection on harvest (check recent harvest timestamps)
- Add pest spawning timer (30-60s random interval)
- Add pest penalty timer (30s → stage regress)
- Add fallow/overworked expiry checks
- Expose `removePest` callback alongside `harvest`

**Step 1: Rewrite the hook**

Key logic additions inside the key-press handler:
```typescript
// High-frequency check: count presses in last 5s
const now = Date.now();
const recentPresses = [...(cell.recentPresses || []), now]
  .filter(t => now - t < OVERWORK_WINDOW_MS);

if (recentPresses.length >= OVERWORK_PRESS_LIMIT && cell.stage !== 'overworked' && cell.stage !== 'fallow') {
  // Enter overworked state
  newCell = {
    ...cell,
    stage: 'overworked',
    overworkedUntil: now + OVERWORK_DURATION_MS,
    preOverworkedStage: cell.stage,
    preOverworkedHitCount: cell.hitCount,
    recentPresses: [],
  };
} else if (cell.stage === 'overworked' || cell.stage === 'fallow') {
  // Ignore presses during lockout
  return prev with only totalKeyPresses updated;
} else if (cell.hasPest) {
  // Ignore presses during pest (growth paused)
  return prev with only totalKeyPresses + recentPresses updated;
} else {
  // Normal growth logic (existing) + recentPresses tracking
}
```

Key logic additions in harvest callback:
```typescript
// Track harvest timestamp
const timestamps = [...(c.harvestTimestamps || []), now]
  .filter(t => now - t < FALLOW_WINDOW_MS);

let newStage: FarmStage = 'empty';
let fallowUntil: number | null = null;

if (timestamps.length >= FALLOW_HARVEST_LIMIT) {
  newStage = 'fallow';
  fallowUntil = now + FALLOW_DURATION_MS;
}
```

New `removePest` callback:
```typescript
const removePest = useCallback((keyCode: string) => {
  setGameState(prev => {
    const c = prev.cells[keyCode];
    if (!c || !c.hasPest) return prev;
    return {
      ...prev,
      cells: {
        ...prev.cells,
        [keyCode]: { ...c, hasPest: false, pestSince: null },
      },
    };
  });
}, []);
```

New timer effect for pest spawning + fallow/overworked expiry:
```typescript
useEffect(() => {
  const tick = () => {
    const now = Date.now();
    setGameState(prev => {
      let changed = false;
      const newCells = { ...prev.cells };

      for (const [key, cell] of Object.entries(newCells)) {
        // Expire overworked
        if (cell.stage === 'overworked' && cell.overworkedUntil && now >= cell.overworkedUntil) {
          newCells[key] = {
            ...cell,
            stage: cell.preOverworkedStage || 'empty',
            hitCount: cell.preOverworkedHitCount,
            overworkedUntil: null,
            preOverworkedStage: null,
            preOverworkedHitCount: 0,
          };
          changed = true;
        }
        // Expire fallow
        if (cell.stage === 'fallow' && cell.fallowUntil && now >= cell.fallowUntil) {
          newCells[key] = {
            ...cell,
            stage: 'empty',
            hitCount: 0,
            fallowUntil: null,
            harvestTimestamps: [],
          };
          changed = true;
        }
        // Pest penalty: regress stage after 30s
        if (cell.hasPest && cell.pestSince && now - cell.pestSince >= PEST_PENALTY_MS) {
          const prevStage = getPreviousStage(cell.stage); // tree→sprout, sprout→watering, etc.
          newCells[key] = {
            ...cell,
            stage: prevStage,
            hitCount: 0,
            hasPest: false,
            pestSince: null,
          };
          changed = true;
        }
      }

      return changed ? { ...prev, cells: newCells } : prev;
    });
  };

  const interval = setInterval(tick, 1000); // check every second
  return () => clearInterval(interval);
}, []);

// Pest spawning: random interval 30-60s
useEffect(() => {
  let timeout: number;
  const schedulePest = () => {
    const delay = PEST_INTERVAL_MIN_MS + Math.random() * (PEST_INTERVAL_MAX_MS - PEST_INTERVAL_MIN_MS);
    timeout = window.setTimeout(() => {
      setGameState(prev => {
        // Find growing cells (watering/sprout/tree) without pest
        const candidates = Object.values(prev.cells).filter(
          c => ['watering', 'sprout', 'tree'].includes(c.stage) && !c.hasPest
        );
        if (candidates.length === 0) return prev;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        return {
          ...prev,
          cells: {
            ...prev.cells,
            [target.keyCode]: { ...target, hasPest: true, pestSince: Date.now() },
          },
        };
      });
      schedulePest(); // schedule next
    }, delay);
  };
  schedulePest();
  return () => clearTimeout(timeout);
}, []);
```

Return value changes:
```typescript
return { gameState, harvest, removePest, animations: animRef.current };
```

**Step 2: Update AnimationState** to include pest removal animations:
```typescript
export interface AnimationState {
  recentHits: Map<string, number>;
  recentHarvests: Map<string, number>;
  harvestFruits: Map<string, string>;    // cropId (not fruitType)
  harvestGolden: Map<string, boolean>;   // was it golden?
  recentPestRemovals: Map<string, number>; // keyCode -> timestamp
}
```

**Step 3: Add save state migration** in `parseState`:
```typescript
// Migrate old fruitType -> cropId
for (const [key, cell] of Object.entries(cells)) {
  if ('fruitType' in cell && !('cropId' in cell)) {
    const oldCell = cell as any;
    cells[key] = {
      ...oldCell,
      cropId: oldCell.fruitType,  // old fruit names match new crop ids
      isGolden: false,
      fallowUntil: null,
      harvestTimestamps: [],
      overworkedUntil: null,
      hasPest: false,
      pestSince: null,
      preOverworkedStage: null,
      preOverworkedHitCount: 0,
    };
    delete (cells[key] as any).fruitType;
  }
}

// Migrate harvestsByFruit -> harvestsByCrop
if ('harvestsByFruit' in parsed && !('harvestsByCrop' in parsed)) {
  state.harvestsByCrop = parsed.harvestsByFruit;
  state.goldenHarvests = {};
}
```

**Step 4: Commit**

```bash
git add src/hooks/useGameState.ts
git commit -m "feat: game logic for crops, fallow, overworked, pests, golden"
```

---

### Task 5: Update FarmCanvas Rendering

**Files:**
- Modify: `src/components/FarmCanvas.tsx` (major changes to draw loop)

**Step 1: Update imports and constants**

Replace `FRUIT_EMOJI`, `FRUIT_PARTICLE_COLORS` with imports from `crops.ts`:
```typescript
import { CROP_MAP, CROP_PARTICLE_COLORS, RARITY_COLORS } from '../data/crops';
```

Add new stage colors/depths:
```typescript
const STAGE_DEPTH: Record<FarmStage, number> = {
  empty: 8, watering: 12, sprout: 16, tree: 22, fruit: 26,
  fallow: 6, overworked: 10,
};

const STAGE_COLORS: Record<FarmStage, string> = {
  empty: '#8B7355', watering: '#4A90D9', sprout: '#7EC850',
  tree: '#2D8B46', fruit: '#FF6B6B',
  fallow: '#8B8B8B', overworked: '#FF4500',
};
```

**Step 2: Update fruit stage color to vary by rarity**

In the draw loop, when stage is 'fruit':
```typescript
const RARITY_BLOCK_COLORS: Record<string, string> = {
  common: '#FF6B6B',
  uncommon: '#4ADE80',
  rare: '#60A5FA',
  legendary: '#F59E0B',
};

// In draw loop:
let color = STAGE_COLORS[stage];
if (stage === 'fruit' && cell?.cropId) {
  const crop = CROP_MAP[cell.cropId];
  if (crop) color = RARITY_BLOCK_COLORS[crop.rarity];
}
```

**Step 3: Update emoji rendering**

Replace the hardcoded FRUIT_EMOJI lookup with:
```typescript
const emoji = stage === 'fruit' && cell?.cropId
  ? (CROP_MAP[cell.cropId]?.emoji || '🍎')
  : stage === 'fallow' ? '💤'
  : stage === 'overworked' ? '🔥'
  : STAGE_EMOJI[stage] || '';

// Pest overlay: draw 🐛 on top of current emoji
if (cell?.hasPest && stage !== 'fallow' && stage !== 'overworked') {
  ctx.font = '18px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Wiggle animation
  const wiggle = Math.sin(now / 150) * 3;
  ctx.fillText('🐛', topCenter.x + wiggle, topCenter.y - 2);
}
```

**Step 4: Add golden visual effects**

After drawing the emoji for golden fruit cells:
```typescript
if (cell?.isGolden && stage === 'fruit') {
  // 1. Gold glow on emoji
  ctx.save();
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 15;
  ctx.font = '20px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(CROP_MAP[cell.cropId!]?.emoji || '', topCenter.x, topCenter.y - 2);
  ctx.restore();

  // 2. Orbiting sparkle particles
  hasActiveAnimations = true; // keep animation loop running
  for (let i = 0; i < 3; i++) {
    const angle = (now / 800) + (Math.PI * 2 * i) / 3;
    const radius = 12;
    const sx = topCenter.x + Math.cos(angle) * radius;
    const sy = topCenter.y + Math.sin(angle) * radius * 0.5 - 2; // flatten for iso
    ctx.font = '8px serif';
    ctx.textAlign = 'center';
    ctx.fillText('✨', sx, sy);
  }

  // 3. Gold shimmer on tile top face
  const shimmerAlpha = 0.15 + 0.1 * Math.sin(now / 300);
  fillPoly(ctx, block.top, `rgba(255, 215, 0, ${shimmerAlpha})`, false);
}
```

**Step 5: Add overworked countdown visual**

For overworked cells, show remaining seconds:
```typescript
if (stage === 'overworked' && cell?.overworkedUntil) {
  hasActiveAnimations = true;
  const remaining = Math.max(0, Math.ceil((cell.overworkedUntil - now) / 1000));
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${remaining}s`, topCenter.x, topCenter.y + 10);
}
```

**Step 6: Update mouse interaction for pest removal**

Add `onRemovePest` prop. In `handleMouseMove`, check for pest cells too:
```typescript
interface FarmCanvasProps {
  gameState: GameState;
  animations: AnimationState;
  onHarvest: (keyCode: string) => void;
  onRemovePest: (keyCode: string) => void;
}

// In handleMouseMove:
if (cell?.hasPest) {
  overFruit = true; // reuse cursor logic
  if (!harvestedRef.current.has(keyCode + '_pest')) {
    harvestedRef.current.add(keyCode + '_pest');
    onRemovePest(keyCode);
    // trigger animation
  }
} else {
  harvestedRef.current.delete(keyCode + '_pest');
}
```

**Step 7: Update harvest animation to use cropId**

Replace `FRUIT_EMOJI[fruitType]` lookups with `CROP_MAP[cropId]?.emoji` and `CROP_PARTICLE_COLORS[cropId]`.

**Step 8: Commit**

```bash
git add src/components/FarmCanvas.tsx
git commit -m "feat: render fallow, overworked, pest, golden, rarity visuals"
```

---

### Task 6: Update StatsPanel

**Files:**
- Modify: `src/components/StatsPanel.tsx`

**Step 1: Replace fruit grid with grouped crop collection**

Group crops by rarity, show emoji + count. Golden shown with ✨ suffix.

```typescript
import { CROPS, CROP_MAP, RARITY_COLORS } from '../data/crops';
import type { Rarity } from '../types/game';

// Group crops by rarity for display
const RARITY_ORDER: Rarity[] = ['legendary', 'rare', 'uncommon', 'common'];
const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary',
};

// In component:
const { harvestsByCrop, goldenHarvests, totalHarvested, totalKeyPresses, cells } = gameState;

// Render grouped by rarity
{RARITY_ORDER.map(rarity => {
  const crops = CROPS.filter(c => c.rarity === rarity);
  return (
    <div key={rarity}>
      <div style={{ color: RARITY_COLORS[rarity], fontSize: 10, fontWeight: 600 }}>
        {RARITY_LABELS[rarity]}
      </div>
      <div style={styles.fruitGrid}>
        {crops.map(crop => {
          const count = harvestsByCrop[crop.id] ?? 0;
          const golden = goldenHarvests[crop.id] ?? 0;
          return (
            <div key={crop.id} style={styles.fruitItem}>
              <span style={styles.fruitEmoji}>{crop.emoji}</span>
              <span style={styles.fruitCount}>{count}</span>
              {golden > 0 && (
                <span style={{ fontSize: 10, color: '#FFD700' }}>✨{golden}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
})}
```

Adjust grid to handle more items:
```typescript
fruitGrid: {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
  gap: 6,
},
```

**Step 2: Commit**

```bash
git add src/components/StatsPanel.tsx
git commit -m "feat: stats panel shows 25 crops grouped by rarity with golden counts"
```

---

### Task 7: Wire Up App.tsx

**Files:**
- Modify: `src/App.tsx:10,46`

**Step 1: Destructure removePest and pass to FarmCanvas**

```typescript
const { gameState, harvest, removePest, animations } = useGameState();

// In JSX:
<FarmCanvas
  gameState={gameState}
  animations={animations}
  onHarvest={harvest}
  onRemovePest={removePest}
/>
```

**Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire removePest through App to FarmCanvas"
```

---

### Task 8: Verify & Polish

**Step 1: Run dev server**

```bash
npm run tauri dev
```

**Step 2: Manual verification checklist**

- [ ] Keys grow through stages as before (empty → watering → sprout → tree → fruit)
- [ ] Fruit stage shows random crop emoji from weighted pool
- [ ] Rare/legendary crops appear less frequently
- [ ] Golden variant appears occasionally with gold glow + sparkles + tile shimmer
- [ ] Hover over fruit auto-harvests (existing behavior preserved)
- [ ] Stats panel shows all 25 crops grouped by rarity
- [ ] Golden harvests tracked separately with ✨ indicator
- [ ] Pressing a key 30+ times in 5s triggers overworked (🔥 + countdown)
- [ ] Overworked expires after 20s, returns to previous stage
- [ ] Harvesting same key 3x in 10min triggers fallow (💤 + grey)
- [ ] Fallow expires after 3min, returns to empty
- [ ] Pests spawn every 30-60s on growing cells
- [ ] Hovering over pest removes it
- [ ] Unremoved pest regresses stage after 30s
- [ ] Old save data migrates correctly (fruitType → cropId)

**Step 3: Final commit**

```bash
git add -A
git commit -m "polish: final adjustments from manual testing"
```
