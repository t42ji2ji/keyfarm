import { useCallback, useEffect, useRef, useState } from 'react';
import { FarmCanvas, CANVAS_WIDTH, CANVAS_HEIGHT } from './components/FarmCanvas';
import { StatsPanel } from './components/StatsPanel';
import { useGameState } from './hooks/useGameState';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

function PermissionScreen() {
  const handleOpen = useCallback(() => {
    invoke('request_accessibility');
  }, []);

  return (
    <div className="permission-screen" data-tauri-drag-region>
      <div className="permission-card">
        <div className="permission-icon">⌨️</div>
        <h1>Keyboard Access</h1>
        <p>
          KeyFarm needs <strong>Accessibility</strong> permission to detect
          keystrokes and grow your farm.
        </p>
        <button onClick={handleOpen}>Open System Settings</button>
        <span className="permission-hint">Waiting for permission…</span>
      </div>
    </div>
  );
}

function App() {
  const { gameState, harvest, removePest, hireWorker, upgradeWorkerSpeed, fertilize, updateAnimals, animations } = useGameState();
  const [scale, setScale] = useState(1);
  const [showStats, setShowStats] = useState(false);
  const [viewMode, setViewMode] = useState<'farm' | 'heatmap'>('farm');
  const [isoFlipped, setIsoFlipped] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const resizeTimerRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number;
    const check = async () => {
      const granted = await invoke<boolean>('check_accessibility');
      if (cancelled) return;
      if (granted) {
        setPermissionGranted(true);
        invoke('start_listener');
      } else {
        setPermissionGranted(false);
        timer = window.setInterval(async () => {
          const ok = await invoke<boolean>('check_accessibility');
          if (ok && !cancelled) {
            setPermissionGranted(true);
            invoke('start_listener');
            clearInterval(timer);
          }
        }, 1500);
      }
    };
    check();
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

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
  if (!permissionGranted) return <PermissionScreen />;

  return (
    <div className={`app-container${isDragging ? ' is-dragging' : ''}`}>
      <div
        className="canvas-scaler"
        style={{ transform: `scale(${scale})` }}
      >
        <FarmCanvas gameState={gameState} animations={animations} onHarvest={harvest} onRemovePest={removePest} onFertilize={fertilize} onDuckEaten={handleDuckEaten} onDragStart={handleDragStart} viewMode={viewMode} flipX={isoFlipped} />
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
