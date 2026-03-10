import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { GameState, STAGE_THRESHOLDS, NEXT_STAGE, FRUIT_TYPES } from '../types/game';
import { createInitialCells } from '../data/hhkbLayout';

const SAVE_KEY = 'keyfarm-save';

function getRandomFruit() {
  return FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
}

function loadState(): GameState {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore parse errors */ }
  return { cells: createInitialCells(), totalHarvested: 0 };
}

function saveState(state: GameState) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export interface AnimationState {
  recentHits: Map<string, number>;    // keyCode -> timestamp
  recentHarvests: Map<string, number>; // keyCode -> timestamp
}

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(loadState);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const animRef = useRef<AnimationState>({
    recentHits: new Map(),
    recentHarvests: new Map(),
  });

  // Auto-save every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => saveState(stateRef.current), 10000);
    return () => clearInterval(interval);
  }, []);

  // Save on unmount
  useEffect(() => {
    return () => saveState(stateRef.current);
  }, []);

  // Listen for key press events from Rust backend
  useEffect(() => {
    const unlisten = listen<{ key_code: string }>('key-press', (event) => {
      const keyCode = event.payload.key_code;
      animRef.current.recentHits.set(keyCode, Date.now());
      setGameState((prev) => {
        const cell = prev.cells[keyCode];
        if (!cell || cell.stage === 'fruit') return prev;

        const newHitCount = cell.hitCount + 1;
        const threshold = STAGE_THRESHOLDS[cell.stage];
        let newStage = cell.stage;
        let newCount = newHitCount;
        let newFruit = cell.fruitType;

        if (newHitCount >= threshold) {
          const next = NEXT_STAGE[cell.stage];
          if (next) {
            newStage = next;
            newCount = 0;
            if (next === 'fruit') {
              newFruit = getRandomFruit();
            }
          }
        }

        // Assign random fruit on first watering
        if (cell.stage === 'empty' && newStage === 'watering' && !newFruit) {
          newFruit = getRandomFruit();
        }

        return {
          ...prev,
          cells: {
            ...prev.cells,
            [keyCode]: {
              ...cell,
              stage: newStage,
              hitCount: newCount,
              fruitType: newFruit,
            },
          },
        };
      });
    });

    return () => { unlisten.then(fn => fn()); };
  }, []);

  const harvest = useCallback((keyCode: string) => {
    animRef.current.recentHarvests.set(keyCode, Date.now());
    setGameState((prev) => {
      const cell = prev.cells[keyCode];
      if (!cell || cell.stage !== 'fruit') return prev;
      return {
        ...prev,
        totalHarvested: prev.totalHarvested + 1,
        cells: {
          ...prev.cells,
          [keyCode]: {
            ...cell,
            stage: 'empty',
            hitCount: 0,
            fruitType: null,
          },
        },
      };
    });
  }, []);

  return { gameState, harvest, animations: animRef.current };
}
