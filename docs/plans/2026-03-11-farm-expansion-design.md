# Farm Expansion Design

## 1. Expanded Emoji Collection (~25 types)

### Fruits (14 types)

| Rarity | Emoji | Weight |
|--------|-------|--------|
| Common | 🍎🍊🍋🍇🍑🍒 | 8 each (48 total) |
| Uncommon | 🍓🍉🍌🍐🥝 | 5 each (25 total) |
| Rare | 🥭🍍🫐 | 3 each (9 total) |

### Animals (11 types)

| Rarity | Emoji | Weight |
|--------|-------|--------|
| Uncommon | 🐔🐷🐮🐑 | 2.5 each (10 total) |
| Rare | 🐱🐶🐰 | 1.5 each (4.5 total) |
| Legendary | 🦊🦄🐉🐼 | 0.875 each (3.5 total) |

Total weight: 100. Probability = weight / 100.

### Golden Variant

- Any type has ~1% chance to become golden on fruit stage assignment
- Visual: gold `ctx.shadowColor` glow on emoji + orbiting ✨ particles + gold shimmer on tile top face
- Tracked separately in stats (e.g. "🍎 x24, 🍎✨ x1")
- `isGolden: boolean` flag on FarmCell

## 2. Fallow Systems

### High-Frequency Lockout

- **Trigger**: Key pressed 30+ times within 5 seconds
- **Effect**: Cell enters `overworked` state, locked for 20 seconds
- **Visual**: Block turns orange/red, shows 🔥, countdown effect
- **Behavior**: Key presses do not accumulate during lockout
- **Recovery**: After 20s, returns to previous growth stage (no progress reset)
- **Tracking**: `overworkedUntil: number | null` timestamp on FarmCell

### Over-Harvest Fallow

- **Trigger**: Same key harvested 3 times within 10 minutes
- **Effect**: Cell enters `fallow` state for 3 minutes
- **Visual**: Block turns grey, shows 💤
- **Behavior**: Key presses do not accumulate during fallow
- **Recovery**: After 3 minutes, returns to `empty` state
- **Tracking**: `fallowUntil: number | null` timestamp + `recentHarvests: number[]` timestamps on FarmCell

## 3. Pest System

- **Spawn**: Every 30-60 seconds (random interval), one random growing cell gets a pest
- **Visual**: 🐛 emoji on the block with wiggle animation
- **Effect**: Growth paused while pest is present
- **Removal**: Mouse hover/click on infested cell (same interaction as harvest)
- **Penalty**: If not removed within 30 seconds, growth stage regresses by one level
- **Tracking**: `hasPest: boolean`, `pestSince: number | null` on FarmCell

## 4. Updated FarmCell Type

```typescript
type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
type Category = 'fruit' | 'animal';

interface CropType {
  emoji: string;
  name: string;
  category: Category;
  rarity: Rarity;
  weight: number;
}

interface FarmCell {
  keyCode: string;
  label: string;
  stage: FarmStage; // add 'fallow' | 'overworked' stages
  hitCount: number;
  cropType: CropType | null;  // replaces fruitType
  isGolden: boolean;
  row: number;
  col: number;
  width: number;
  // Fallow tracking
  fallowUntil: number | null;
  overworkedUntil: number | null;
  harvestTimestamps: number[]; // recent harvest times for fallow detection
  // Pest tracking
  hasPest: boolean;
  pestSince: number | null;
  // High-frequency tracking
  recentPresses: number[]; // timestamps for frequency detection
}
```

## 5. Updated FarmStage

```typescript
type FarmStage = 'empty' | 'watering' | 'sprout' | 'tree' | 'fruit' | 'fallow' | 'overworked';
```

## 6. Visual Summary

| State | Block Color | Emoji | Special Effect |
|-------|-------------|-------|----------------|
| empty | brown | - | - |
| watering | blue | 💧 | - |
| sprout | green | 🌱 | - |
| tree | dark green | 🌳 | - |
| fruit | varies by rarity | crop emoji | - |
| fruit (golden) | gold tint | crop emoji | gold glow + ✨ particles + tile shimmer |
| fallow | grey | 💤 | - |
| overworked | orange/red | 🔥 | countdown visual |
| pest | current stage color | 🐛 | wiggle animation |
