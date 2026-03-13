# Animal Character System Design

## Overview

為 KeyFarm 新增動物角色系統，首先實作鴨子。動物在田地上漫遊，與格子互動（施肥、採收），並對滑鼠有反應。

## 資料結構

### AnimalDef（靜態定義）

```typescript
interface AnimalDef {
  id: string;                // 'duck'
  sprites: { idle: string; walk: string; action: string };
  size: number;              // sprite 大小 px
  moveSpeed: number;         // grid units/sec
  zIndexOffset: number;      // 深度排序偏移
  spawnCapTiers: { harvests: number; cap: number }[];
  respawnDelay: [number, number]; // [min, max] 秒
  spawnInterval: [number, number]; // 檢查 spawn 的間隔 [min, max] 秒
  mouseReaction: {
    type: 'flee';
    triggerRadius: number;   // grid units
    fleeDistance: number;    // grid units
    fleeSpeedMultiplier: number;
  };
}
```

### AnimalInstance（場上實體）

```typescript
interface AnimalInstance {
  id: string;                // 'duck-0'
  animalId: string;          // 'duck'
  col: number;
  row: number;
  state: 'idle' | 'walking' | 'working' | 'fleeing' | 'dead';
  facing: 'left' | 'right';
  targetKey: string | null;
  actionType: 'harvest' | 'fertilize' | null;
  // animation timing
  moveStartCol: number;
  moveStartRow: number;
  moveEndCol: number;
  moveEndRow: number;
  moveStartTime: number;
  moveDuration: number;
  workStartTime: number;
  // death
  diedAt: number | null;
}
```

### GameState 新增

```typescript
animals: AnimalInstance[];
```

## 鴨子定義

```typescript
const DUCK_DEF: AnimalDef = {
  id: 'duck',
  sprites: { idle: duckIdleGif, walk: duckWalkGif, action: pukeGif },
  size: 40,
  moveSpeed: 2.5,
  zIndexOffset: 30,
  spawnCapTiers: [
    { harvests: 0, cap: 0 },
    { harvests: 100, cap: 1 },
    { harvests: 500, cap: 2 },
    { harvests: 1500, cap: 3 },
    { harvests: 3000, cap: 4 },
    { harvests: 6000, cap: 5 },
  ],
  respawnDelay: [120, 180],
  spawnInterval: [60, 90],
  mouseReaction: {
    type: 'flee',
    triggerRadius: 2.5,
    fleeDistance: 3,
    fleeSpeedMultiplier: 1.5,
  },
};
```

## 行為邏輯

### 目標選擇優先順序

1. **施肥** — watering/sprout/tree 階段的格子（越早期越優先）
2. **採收** — fruit 階段且作物 category ≠ 'animal'
3. **漫遊** — 隨機選 2~4 格距離內的點

### 格子互動

| 格子 stage | 作物 category | 動作 | 效果 |
|-----------|--------------|------|------|
| watering/sprout/tree | any | fertilize (puke) | stage +1 |
| fruit | fruit (非動物) | harvest | 採收該作物 |
| fruit | animal | 被吃 | 鴨子死亡 |
| empty/fallow/overworked | - | 忽略 | - |

### 動物作物風險

- 鴨子不會主動走向動物 fruit
- 走向目標途中格子變成動物 fruit → 到達後被吃
- 漫遊經過動物 fruit → 30% 機率被吃

### 漫遊

- 隨機選 2~4 grid units 距離內的點
- 到達後 idle 1~3 秒
- 再尋找下一個目標或繼續漫遊

## 滑鼠互動

- 每 frame 檢查滑鼠 grid 座標與鴨子距離
- 距離 < triggerRadius (2.5) → 中斷當前行為，進入 fleeing
- 計算反方向逃跑點（clamp 在網格內）
- 逃跑速度 = moveSpeed × fleeSpeedMultiplier (1.5x)
- 到達後回到 idle，重新找目標
- fleeing 優先級最高，打斷一切

## Spawn 與死亡

### Spawn

- 每 60~90 秒檢查：活著的鴨子 < 當前容量上限 → spawn 一隻
- Spawn 位置：網格邊緣隨機點
- 從邊緣 walk 進場

### 里程碑容量

| 收穫數 | 鴨子上限 |
|--------|---------|
| 0 | 0 |
| 100 | 1 |
| 500 | 2 |
| 1500 | 3 |
| 3000 | 4 |
| 6000 | 5 |

### 死亡

1. 播放死亡動畫（~800ms）：動物 emoji 放大、鴨子縮小消失、羽毛粒子
2. 進入 dead state，記錄 diedAt
3. 120~180 秒後若低於上限 → 新鴨子 spawn

## 渲染

### Sprite

- duck_idle.gif — idle、等待
- duck_walk.gif — walking、fleeing
- puke.gif — 施肥動作

### 渲染方式

- HTML overlay div（同農夫）
- 大小：40×40 px
- Z-index：`Math.round(row * 100) + 30`
- 水平翻轉根據 facing

### 動畫效果

**施肥（~1000ms）：**
- 切換 puke.gif
- 格子綠色光暈
- Stage 跳一級

**採收：** 複用現有 harvest animation + 鴨子上下抖動模擬啄食

**被吃（~800ms）：**
- 動物 emoji 放大彈跳
- 鴨子縮小 + 透明度 → 0
- 白色羽毛粒子散開

**逃跑：** walk gif + 1.5x 速度 + CSS rotate 微傾斜

## 持久化

- `GameState.animals` 存進 store
- 重啟恢復位置和狀態
- dead 狀態保留 diedAt 計算 respawn

## 檔案變更

| 檔案 | 變更 |
|------|------|
| `src/types/game.ts` | 新增 AnimalDef, AnimalInstance, GameState.animals |
| `src/components/animalCharacters.ts` | 新檔 — 動物 AI、移動、行為邏輯 |
| `src/components/FarmCanvas.tsx` | 渲染動物 overlay、傳遞滑鼠座標 |
| `src/hooks/useGameState.ts` | 動物 spawn/death 管理、施肥/採收邏輯 |
| `src/assets/` | 新增 duck_idle.gif, duck_walk.gif, puke.gif |
