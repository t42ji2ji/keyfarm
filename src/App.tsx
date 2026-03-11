import { useCallback, useEffect, useState } from 'react';
import { FarmCanvas, CANVAS_WIDTH, CANVAS_HEIGHT } from './components/FarmCanvas';
import { StatsPanel } from './components/StatsPanel';
import { useGameState } from './hooks/useGameState';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import './App.css';

function App() {
  const { gameState, harvest, removePest, animations } = useGameState();
  const [scale, setScale] = useState(1);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    const updateScale = () => {
      const s = Math.min(
        window.innerWidth / CANVAS_WIDTH,
        window.innerHeight / CANVAS_HEIGHT,
      );
      setScale(s);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  useEffect(() => {
    const unlisten = listen('toggle-stats', () => {
      setShowStats((v) => !v);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  const handleResizeGrip = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    getCurrentWindow().startResizeDragging('BottomRight' as never);
  }, []);

  return (
    <div className="app-container">
      <div
        className="canvas-scaler"
        style={{ transform: `scale(${scale})` }}
      >
        <FarmCanvas gameState={gameState} animations={animations} onHarvest={harvest} onRemovePest={removePest} />
      </div>
      {showStats && (
        <StatsPanel gameState={gameState} onClose={() => setShowStats(false)} />
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
