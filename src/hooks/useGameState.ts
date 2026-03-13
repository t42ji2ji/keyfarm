import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { LazyStore } from '@tauri-apps/plugin-store';
import type { GameState, FarmStage, FarmCell, DailyEntry, AnimalInstance } from '../types/game';
import {
  STAGE_THRESHOLDS,
  NEXT_STAGE,
  FALLOW_HARVEST_LIMIT,
  FALLOW_WINDOW_MS,
  FALLOW_DURATION_MS,
  OVERWORK_PRESS_LIMIT,
  OVERWORK_WINDOW_MS,
  OVERWORK_DURATION_MS,
  PEST_INTERVAL_MIN_MS,
  PEST_INTERVAL_MAX_MS,
  PEST_EXPIRE_MS,
  GOLDEN_CHANCE,
  WORKER_TIERS,
  MAX_WORKERS,
  SPEED_TIERS,
  MAX_SPEED_LEVEL,
  PEST_SPEED_MULTIPLIER,
  DUCK_SPAWN_TIERS,
  DUCK_SPAWN_INTERVAL,
  DUCK_RESPAWN_DELAY,
} from '../types/game';
import { createDuck } from '../components/animalCharacters';
import { getRandomCrop } from '../data/crops';
import { createInitialCells } from '../data/hhkbLayout';

const STORE_KEY = 'gameState';
const store = new LazyStore('store.json');
const DAILY_STATS_MAX_DAYS = 14;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ensureToday(dailyStats: DailyEntry[]): DailyEntry[] {
  const today = getToday();
  if (dailyStats.length > 0 && dailyStats[dailyStats.length - 1].date === today) {
    return dailyStats;
  }
  return [...dailyStats, { date: today, keyPresses: 0, harvests: 0, pestsRemoved: 0 }]
    .slice(-DAILY_STATS_MAX_DAYS);
}

function incrementDaily(
  dailyStats: DailyEntry[],
  field: 'keyPresses' | 'harvests' | 'pestsRemoved',
): DailyEntry[] {
  const stats = ensureToday(dailyStats);
  const last = stats[stats.length - 1];
  return [...stats.slice(0, -1), { ...last, [field]: last[field] + 1 }];
}

function defaultState(): GameState {
  return {
    cells: createInitialCells(),
    totalHarvested: 0,
    harvestsByCrop: {},
    goldenHarvests: {},
    totalKeyPresses: {},
    totalPestsRemoved: 0,
    dailyStats: [],
    workers: 1,
    workerSpeed: 1,
    animals: [],
  };
}

function parseState(raw: unknown): GameState {
  if (raw && typeof raw === 'object') {
    const parsed = raw as Record<string, unknown>;

    let cells = (parsed.cells as Record<string, FarmCell>) ?? createInitialCells();

    // Migrate old fruitType -> cropId
    for (const [key, cell] of Object.entries(cells)) {
      const anyCell = cell as any;
      if ('fruitType' in anyCell && !('cropId' in anyCell)) {
        cells[key] = {
          ...anyCell,
          cropId: anyCell.fruitType,
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
      // Also ensure new fields exist on cells that already have cropId
      if (!('isGolden' in anyCell)) {
        cells[key] = {
          ...cells[key],
          isGolden: false,
          fallowUntil: cells[key].fallowUntil ?? null,
          harvestTimestamps: cells[key].harvestTimestamps ?? [],
          overworkedUntil: cells[key].overworkedUntil ?? null,
          hasPest: cells[key].hasPest ?? false,
          pestSince: cells[key].pestSince ?? null,
          preOverworkedStage: cells[key].preOverworkedStage ?? null,
          preOverworkedHitCount: cells[key].preOverworkedHitCount ?? 0,
        };
      }
    }

    // Migrate harvestsByFruit -> harvestsByCrop
    const harvestsByCrop = (parsed.harvestsByCrop as Record<string, number>)
      ?? (parsed.harvestsByFruit as Record<string, number>)
      ?? {};
    const goldenHarvests = (parsed.goldenHarvests as Record<string, number>) ?? {};

    return {
      cells,
      totalHarvested: (parsed.totalHarvested as number) ?? 0,
      harvestsByCrop,
      goldenHarvests,
      totalKeyPresses: (parsed.totalKeyPresses as Record<string, number>) ?? {},
      totalPestsRemoved: (parsed.totalPestsRemoved as number) ?? 0,
      dailyStats: (parsed.dailyStats as DailyEntry[]) ?? [],
      workers: Math.max(1, Math.min(MAX_WORKERS, (parsed.workers as number) ?? 1)),
      workerSpeed: Math.max(1, Math.min(MAX_SPEED_LEVEL, (parsed.workerSpeed as number) ?? 1)),
      animals: (parsed.animals as AnimalInstance[]) ?? [],
    };
  }
  return defaultState();
}

async function saveState(state: GameState) {
  await store.set(STORE_KEY, state);
  await store.save();
}

export interface AnimationState {
  recentHits: Map<string, number>;        // keyCode -> timestamp
  recentHarvests: Map<string, number>;     // keyCode -> timestamp
  harvestFruits: Map<string, string>;      // keyCode -> cropId
  harvestGolden: Map<string, boolean>;     // keyCode -> was golden?
  recentPestRemovals: Map<string, number>; // keyCode -> timestamp
  recentFertilizes: Map<string, number>;   // keyCode -> timestamp
}

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(defaultState);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const loadedRef = useRef(false);
  const pressTracker = useRef<Map<string, number[]>>(new Map());
  const animRef = useRef<AnimationState>({
    recentHits: new Map(),
    recentHarvests: new Map(),
    harvestFruits: new Map(),
    harvestGolden: new Map(),
    recentPestRemovals: new Map(),
    recentFertilizes: new Map(),
  });

  // Load saved state from store on mount
  useEffect(() => {
    store.get<GameState>(STORE_KEY).then((raw) => {
      if (raw) {
        const loaded = parseState(raw);
        setGameState(loaded);
        stateRef.current = loaded;
      }
      loadedRef.current = true;
    });
  }, []);

  // Auto-save every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (loadedRef.current) saveState(stateRef.current);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (loadedRef.current) saveState(stateRef.current);
    };
  }, []);

  // Listen for key press events from Rust backend
  useEffect(() => {
    const unlisten = listen<{ key_code: string }>('key-press', (event) => {
      const keyCode = event.payload.key_code;
      animRef.current.recentHits.set(keyCode, Date.now());
      setGameState((prev) => {
        const cell = prev.cells[keyCode];

        // Track total key presses regardless of cell state
        const newTotalKeyPresses = {
          ...prev.totalKeyPresses,
          [keyCode]: (prev.totalKeyPresses[keyCode] ?? 0) + 1,
        };

        const newDailyStats = incrementDaily(prev.dailyStats, 'keyPresses');

        if (!cell) {
          return { ...prev, totalKeyPresses: newTotalKeyPresses, dailyStats: newDailyStats };
        }

        // --- Overworked detection ---
        const now = Date.now();
        const pressTimestamps = pressTracker.current.get(keyCode) || [];
        const recent = [...pressTimestamps, now].filter(t => now - t < OVERWORK_WINDOW_MS);
        pressTracker.current.set(keyCode, recent);

        if (
          recent.length >= OVERWORK_PRESS_LIMIT &&
          cell.stage !== 'overworked' &&
          cell.stage !== 'fallow'
        ) {
          pressTracker.current.set(keyCode, []);
          return {
            ...prev,
            totalKeyPresses: newTotalKeyPresses,
            dailyStats: newDailyStats,
            cells: {
              ...prev.cells,
              [keyCode]: {
                ...cell,
                stage: 'overworked' as FarmStage,
                overworkedUntil: now + OVERWORK_DURATION_MS,
                preOverworkedStage: cell.stage,
                preOverworkedHitCount: cell.hitCount,
              },
            },
          };
        }

        // Skip growth for overworked or fallow cells
        if (cell.stage === 'overworked' || cell.stage === 'fallow') {
          return { ...prev, totalKeyPresses: newTotalKeyPresses, dailyStats: newDailyStats };
        }

        // Skip growth for pest-infested cells
        if (cell.hasPest) {
          return { ...prev, totalKeyPresses: newTotalKeyPresses, dailyStats: newDailyStats };
        }

        // Skip growth for fruit cells (fully grown)
        if (cell.stage === 'fruit') {
          return { ...prev, totalKeyPresses: newTotalKeyPresses, dailyStats: newDailyStats };
        }

        // --- Normal growth ---
        const newHitCount = cell.hitCount + 1;
        const threshold = STAGE_THRESHOLDS[cell.stage];
        let newStage: FarmStage = cell.stage;
        let newCount = newHitCount;
        let newCropId = cell.cropId;
        let newIsGolden = cell.isGolden;

        if (newHitCount >= threshold) {
          const next = NEXT_STAGE[cell.stage];
          if (next) {
            newStage = next;
            newCount = 0;
            if (next === 'fruit') {
              // Roll for golden at fruit stage
              newIsGolden = Math.random() < GOLDEN_CHANCE;
            }
          }
        }

        // Assign random crop on first transition to watering
        if (cell.stage === 'empty' && newStage === 'watering') {
          const crop = getRandomCrop();
          newCropId = crop.id;
        }

        return {
          ...prev,
          totalKeyPresses: newTotalKeyPresses,
          dailyStats: newDailyStats,
          cells: {
            ...prev.cells,
            [keyCode]: {
              ...cell,
              stage: newStage,
              hitCount: newCount,
              cropId: newCropId,
              isGolden: newIsGolden,
            },
          },
        };
      });
    });

    return () => { unlisten.then(fn => fn()); };
  }, []);

  // --- Timer effect for state expiry (1 second interval) ---
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setGameState((prev) => {
        let changed = false;
        const newCells = { ...prev.cells };

        for (const [key, cell] of Object.entries(newCells)) {
          // Overworked expiry
          if (
            cell.stage === 'overworked' &&
            cell.overworkedUntil &&
            now >= cell.overworkedUntil
          ) {
            newCells[key] = {
              ...cell,
              stage: cell.preOverworkedStage ?? 'empty',
              hitCount: cell.preOverworkedHitCount,
              overworkedUntil: null,
              preOverworkedStage: null,
              preOverworkedHitCount: 0,
            };
            changed = true;
            continue;
          }

          // Fallow expiry
          if (
            cell.stage === 'fallow' &&
            cell.fallowUntil &&
            now >= cell.fallowUntil
          ) {
            newCells[key] = {
              ...cell,
              stage: 'empty',
              hitCount: 0,
              fallowUntil: null,
              harvestTimestamps: [],
              cropId: null,
              isGolden: false,
            };
            changed = true;
            continue;
          }

          // Pest auto-expire
          if (cell.hasPest && cell.pestSince && now - cell.pestSince > PEST_EXPIRE_MS) {
            newCells[key] = { ...cell, hasPest: false, pestSince: null };
            changed = true;
            continue;
          }
        }

        if (!changed) return prev;
        return { ...prev, cells: newCells };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // --- Pest spawning timer ---
  useEffect(() => {
    let timeout: number;
    const schedulePest = () => {
      const speedLevel = stateRef.current.workerSpeed;
      const multiplier = PEST_SPEED_MULTIPLIER[speedLevel - 1] ?? 1;
      const minDelay = PEST_INTERVAL_MIN_MS * multiplier;
      const maxDelay = PEST_INTERVAL_MAX_MS * multiplier;
      const delay = minDelay + Math.random() * (maxDelay - minDelay);
      timeout = window.setTimeout(() => {
        setGameState((prev) => {
          // Check max concurrent pests (scales with workers)
          const maxPests = prev.workers * 2;
          const currentPests = Object.values(prev.cells).filter(c => c.hasPest).length;
          if (currentPests >= maxPests) {
            schedulePest();
            return prev;
          }
          const candidates = Object.values(prev.cells).filter(
            c => ['watering', 'sprout', 'tree'].includes(c.stage) && !c.hasPest
          );
          if (candidates.length === 0) {
            schedulePest();
            return prev;
          }
          // Spawn pests scaled by worker count
          const maxSpawn = prev.workers <= 2 ? 1 : prev.workers <= 4 ? 2 : 4;
          const spawnCount = Math.min(
            1 + Math.floor(Math.random() * maxSpawn),
            candidates.length,
            maxPests - currentPests,
          );
          const newCells = { ...prev.cells };
          const shuffled = [...candidates].sort(() => Math.random() - 0.5);
          for (let i = 0; i < spawnCount; i++) {
            const target = shuffled[i];
            newCells[target.keyCode] = { ...target, hasPest: true, pestSince: Date.now() };
          }
          schedulePest();
          return { ...prev, cells: newCells };
        });
      }, delay);
    };
    schedulePest();
    return () => clearTimeout(timeout);
  }, []);

  // --- Duck spawning timer ---
  useEffect(() => {
    let timeout: number;
    let nextDuckId = 0;

    const scheduleDuckSpawn = () => {
      const delay = randomBetween(DUCK_SPAWN_INTERVAL[0], DUCK_SPAWN_INTERVAL[1]);
      timeout = window.setTimeout(() => {
        const now = Date.now();
        setGameState((prev) => {
          // Calculate current cap based on total harvests
          let cap = 0;
          for (const tier of DUCK_SPAWN_TIERS) {
            if (prev.totalHarvested >= tier.harvests) cap = tier.cap;
          }

          // Count alive ducks
          const aliveDucks = prev.animals.filter(
            a => a.animalId === 'duck' && a.state !== 'dead'
          );

          // Clean up dead ducks that have completed respawn delay
          const updatedAnimals = prev.animals.filter(a => {
            if (a.state === 'dead' && a.diedAt) {
              const deadTime = now - a.diedAt;
              const maxDelay = DUCK_RESPAWN_DELAY[1];
              return deadTime < maxDelay + 5000; // keep dead duck for animation, clean up after
            }
            return true;
          });

          if (aliveDucks.length < cap) {
            const id = `duck-${Date.now()}-${nextDuckId++}`;
            const newDuck = createDuck(id, now);
            scheduleDuckSpawn();
            return { ...prev, animals: [...updatedAnimals, newDuck] };
          }

          scheduleDuckSpawn();
          if (updatedAnimals.length !== prev.animals.length) {
            return { ...prev, animals: updatedAnimals };
          }
          return prev;
        });
      }, delay);
    };

    scheduleDuckSpawn();
    return () => clearTimeout(timeout);
  }, []);

  const harvest = useCallback((keyCode: string) => {
    // Capture crop info before state resets it
    const cell = stateRef.current.cells[keyCode];
    if (cell?.cropId) {
      animRef.current.harvestFruits.set(keyCode, cell.cropId);
      animRef.current.harvestGolden.set(keyCode, cell.isGolden);
    }
    animRef.current.recentHarvests.set(keyCode, Date.now());
    setGameState((prev) => {
      const c = prev.cells[keyCode];
      if (!c || c.stage !== 'fruit' || !c.cropId) return prev;

      const now = Date.now();
      const timestamps = [...(c.harvestTimestamps || []), now]
        .filter(t => now - t < FALLOW_WINDOW_MS);

      let newStage: FarmStage = 'empty';
      let fallowUntil: number | null = null;

      if (timestamps.length >= FALLOW_HARVEST_LIMIT) {
        newStage = 'fallow';
        fallowUntil = now + FALLOW_DURATION_MS;
      }

      const newHarvestsByCrop = {
        ...prev.harvestsByCrop,
        [c.cropId]: (prev.harvestsByCrop[c.cropId] ?? 0) + 1,
      };

      const newGoldenHarvests = c.isGolden
        ? {
            ...prev.goldenHarvests,
            [c.cropId]: (prev.goldenHarvests[c.cropId] ?? 0) + 1,
          }
        : prev.goldenHarvests;

      return {
        ...prev,
        totalHarvested: prev.totalHarvested + 1,
        harvestsByCrop: newHarvestsByCrop,
        goldenHarvests: newGoldenHarvests,
        dailyStats: incrementDaily(prev.dailyStats, 'harvests'),
        cells: {
          ...prev.cells,
          [keyCode]: {
            ...c,
            stage: newStage,
            hitCount: 0,
            cropId: null,
            isGolden: false,
            fallowUntil,
            harvestTimestamps: timestamps,
          },
        },
      };
    });
  }, []);

  const removePest = useCallback((keyCode: string) => {
    animRef.current.recentPestRemovals.set(keyCode, Date.now());
    setGameState((prev) => {
      const c = prev.cells[keyCode];
      if (!c || !c.hasPest) return prev;
      return {
        ...prev,
        totalPestsRemoved: (prev.totalPestsRemoved ?? 0) + 1,
        dailyStats: incrementDaily(prev.dailyStats, 'pestsRemoved'),
        cells: {
          ...prev.cells,
          [keyCode]: { ...c, hasPest: false, pestSince: null },
        },
      };
    });
  }, []);

  const fertilize = useCallback((keyCode: string) => {
    animRef.current.recentFertilizes.set(keyCode, Date.now());
    setGameState((prev) => {
      const c = prev.cells[keyCode];
      if (!c) return prev;
      if (!['watering', 'sprout', 'tree'].includes(c.stage)) return prev;
      if (c.hasPest) return prev;

      const nextStage = NEXT_STAGE[c.stage];
      if (!nextStage) return prev;

      let newCropId = c.cropId;
      let newIsGolden = c.isGolden;

      // If advancing to fruit, roll for golden
      if (nextStage === 'fruit') {
        newIsGolden = Math.random() < GOLDEN_CHANCE;
      }

      return {
        ...prev,
        cells: {
          ...prev.cells,
          [keyCode]: {
            ...c,
            stage: nextStage,
            hitCount: 0,
            cropId: newCropId,
            isGolden: newIsGolden,
          },
        },
      };
    });
  }, []);

  const updateAnimals = useCallback((animals: AnimalInstance[]) => {
    setGameState((prev) => ({ ...prev, animals }));
  }, []);

  const upgradeWorkerSpeed = useCallback(() => {
    setGameState((prev) => {
      if (prev.workerSpeed >= MAX_SPEED_LEVEL) return prev;

      const nextTier = SPEED_TIERS[prev.workerSpeed];
      if (!nextTier) return prev;

      if (
        prev.totalHarvested < nextTier.harvests ||
        (prev.totalPestsRemoved ?? 0) < nextTier.pestsRemoved
      ) {
        return prev;
      }

      return { ...prev, workerSpeed: prev.workerSpeed + 1 };
    });
  }, []);

  const hireWorker = useCallback(() => {
    setGameState((prev) => {
      if (prev.workers >= MAX_WORKERS) return prev;

      const nextTier = WORKER_TIERS[prev.workers];
      if (!nextTier) return prev;

      // Check requirements
      const speciesCount = Object.keys(prev.harvestsByCrop).filter(
        id => (prev.harvestsByCrop[id] ?? 0) > 0
      ).length;
      const goldenCount = Object.values(prev.goldenHarvests).reduce((a, b) => a + b, 0);

      if (
        prev.totalHarvested < nextTier.harvests ||
        speciesCount < nextTier.species ||
        goldenCount < nextTier.golden
      ) {
        return prev;
      }

      return { ...prev, workers: prev.workers + 1 };
    });
  }, []);

  return { gameState, harvest, removePest, hireWorker, upgradeWorkerSpeed, fertilize, updateAnimals, animations: animRef.current };
}
