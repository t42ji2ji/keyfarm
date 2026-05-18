import { useCallback, useEffect, useRef, useState } from 'react';
import { FarmCanvas, CANVAS_WIDTH, CANVAS_HEIGHT } from './components/FarmCanvas';
import { StatsPanel } from './components/StatsPanel';
import { useGameState } from './hooks/useGameState';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

function PermissionScreen({ isLinux, onRetry }: { isLinux: boolean; onRetry: () => Promise<boolean> }) {
  const handleOpen = useCallback(() => {
    invoke('request_accessibility');
  }, []);

  const handleClick = useCallback(() => {
    if (isLinux) {
      void onRetry();
      return;
    }
    handleOpen();
  }, [handleOpen, isLinux, onRetry]);

  return (
    <div className="permission-screen" data-tauri-drag-region>
      <div className="permission-card">
        <div className="permission-icon">⌨️</div>
        <h1>Keyboard Access</h1>
        <p>
          KeyFarm needs access to your keyboard to detect keystrokes and grow
          your farm.
        </p>
        <button onClick={handleClick}>
          {isLinux ? 'Retry' : 'Open System Settings'}
        </button>
        <span className="permission-hint">
          {isLinux ? 'Waiting for keyboard access…' : 'Waiting for permission…'}
        </span>
      </div>
    </div>
  );
}

function App() {
  const { gameState, harvest, removePest, hireWorker, upgradeWorkerSpeed, fertilize, updateAnimals, duckAttacked, waterToFish, dogScared, animations } = useGameState();
  const [scale, setScale] = useState(1);
  const [showStats, setShowStats] = useState(false);
  const [viewMode, setViewMode] = useState<'farm' | 'heatmap'>('farm');
  const [isoFlipped, setIsoFlipped] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const isLinux = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('linux');

  const resizeTimerRef = useRef<number>(0);

  const refreshAccess = useCallback(async () => {
    const granted = await invoke<boolean>('check_accessibility');
    if (granted) {
      setPermissionGranted(true);
      invoke('start_listener');
    } else {
      setPermissionGranted(false);
    }
    return granted;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number;
    const check = async () => {
      const granted = await refreshAccess();
      if (cancelled || granted) return;
      timer = window.setInterval(async () => {
        const ok = await refreshAccess();
        if (ok && !cancelled) {
          clearInterval(timer);
        }
      }, 1500);
    };
    check();
    return () => { cancelled = true; clearInterval(timer); };
  }, [refreshAccess]);

  useEffect(() => {
    let mounted = false;
    const updateScale = () => {
      const s = Math.min(
        window.innerWidth / CANVAS_WIDTH,
        window.innerHeight / CANVAS_HEIGHT,
      );
      setScale(s);

      // Show border while resizing, hide after 300ms of no resize
      if (mounted) {
        setIsDragging(true);
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = window.setTimeout(() => setIsDragging(false), 300);
      }
    };
    updateScale();
    mounted = true;
    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
      clearTimeout(resizeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const unlisten = listen('toggle-stats', () => {
      setShowStats((v) => !v);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const unlisten = listen('toggle-heatmap', () => {
      setViewMode((v) => v === 'farm' ? 'heatmap' : 'farm');
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const unlisten = listen('toggle-perspective', () => {
      setIsoFlipped((v) => !v);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const end = () => setIsDragging(false);
    window.addEventListener('mouseup', end);
    window.addEventListener('blur', end);
    const timer = setTimeout(end, 5000);
    return () => {
      window.removeEventListener('mouseup', end);
      window.removeEventListener('blur', end);
      clearTimeout(timer);
    };
  }, [isDragging]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDuckEaten = useCallback((duckId: string) => {
    const now = Date.now();
    const updatedAnimals = gameState.animals.map(a =>
      a.id === duckId ? { ...a, state: 'dead' as const, diedAt: now } : a
    );
    updateAnimals(updatedAnimals);
  }, [gameState.animals, updateAnimals]);

  const handleResizeGrip = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    getCurrentWindow().startResizeDragging('BottomRight' as never);
  }, []);

  if (permissionGranted === null) return null;
  if (!permissionGranted) return <PermissionScreen isLinux={isLinux} onRetry={refreshAccess} />;

  return (
    <div className={`app-container${isDragging ? ' is-dragging' : ''}`}>
      <div
        className="canvas-scaler"
        style={{ transform: `scale(${scale})` }}
      >
        <FarmCanvas gameState={gameState} animations={animations} onHarvest={harvest} onRemovePest={removePest} onFertilize={fertilize} onDuckEaten={handleDuckEaten} onDuckAttacked={duckAttacked} onWaterToFish={waterToFish} onDogScared={dogScared} onDragStart={handleDragStart} viewMode={viewMode} flipX={isoFlipped} />
      </div>
      {showStats && (
        <StatsPanel gameState={gameState} onClose={() => setShowStats(false)} onHireWorker={hireWorker} onUpgradeSpeed={upgradeWorkerSpeed} />
      )}
      <div className="resize-grip" onMouseDown={handleResizeGrip}>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <circle cx="10" cy="2" r="1" fill="rgba(255,255,255,0.4)" />
          <circle cx="6" cy="6" r="1" fill="rgba(255,255,255,0.4)" />
          <circle cx="10" cy="6" r="1" fill="rgba(255,255,255,0.4)" />
          <circle cx="2" cy="10" r="1" fill="rgba(255,255,255,0.4)" />
          <circle cx="6" cy="10" r="1" fill="rgba(255,255,255,0.4)" />
          <circle cx="10" cy="10" r="1" fill="rgba(255,255,255,0.4)" />
        </svg>
      </div>
    </div>
  );
}

export default App;
