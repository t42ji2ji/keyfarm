import { useRef, useEffect, useCallback } from 'react';
import { GameState, FarmStage } from '../types/game';
import { HHKB_ROWS } from '../data/hhkbLayout';
import { AnimationState } from '../hooks/useGameState';

const CELL_SIZE = 52;
const CELL_GAP = 4;
const PADDING = 16;
const HIT_FLASH_DURATION = 200;
const HARVEST_SPARKLE_DURATION = 400;

const STAGE_COLORS: Record<FarmStage, string> = {
  empty: '#8B7355',      // brown soil
  watering: '#4A90D9',   // blue water
  sprout: '#7EC850',     // light green
  tree: '#2D8B46',       // dark green
  fruit: '#FF6B6B',      // red (will vary by fruit)
};

const FRUIT_EMOJI: Record<string, string> = {
  apple: '\uD83C\uDF4E',
  orange: '\uD83C\uDF4A',
  cherry: '\uD83C\uDF52',
  grape: '\uD83C\uDF47',
  peach: '\uD83C\uDF51',
  lemon: '\uD83C\uDF4B',
};

const STAGE_EMOJI: Record<FarmStage, string> = {
  empty: '\uD83D\uDFEB',
  watering: '\uD83D\uDCA7',
  sprout: '\uD83C\uDF31',
  tree: '\uD83C\uDF33',
  fruit: '',  // use fruit-specific emoji
};

interface FarmCanvasProps {
  gameState: GameState;
  animations: AnimationState;
  onHarvest: (keyCode: string) => void;
}

export function FarmCanvas({ gameState, animations, onHarvest }: FarmCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellRectsRef = useRef<Map<string, { x: number; y: number; w: number; h: number }>>(new Map());
  const rafRef = useRef<number>(0);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = Date.now();
    let hasActiveAnimations = false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cellRectsRef.current.clear();

    HHKB_ROWS.forEach((row, rowIdx) => {
      let xOffset = PADDING;
      const y = PADDING + rowIdx * (CELL_SIZE + CELL_GAP);

      row.forEach((keyDef) => {
        const cell = gameStateRef.current.cells[keyDef.keyCode];
        const w = keyDef.width * CELL_SIZE + (keyDef.width - 1) * CELL_GAP;
        const h = CELL_SIZE;

        cellRectsRef.current.set(keyDef.keyCode, { x: xOffset, y, w, h });

        // Check for hit flash animation
        const hitTime = animations.recentHits.get(keyDef.keyCode);
        const hitAge = hitTime ? now - hitTime : Infinity;
        const isHitFlashing = hitAge < HIT_FLASH_DURATION;

        // Check for harvest sparkle animation
        const harvestTime = animations.recentHarvests.get(keyDef.keyCode);
        const harvestAge = harvestTime ? now - harvestTime : Infinity;
        const isHarvestSparkle = harvestAge < HARVEST_SPARKLE_DURATION;

        if (isHitFlashing || isHarvestSparkle) hasActiveAnimations = true;

        // Clean up old animations
        if (hitTime && hitAge > HIT_FLASH_DURATION) {
          animations.recentHits.delete(keyDef.keyCode);
        }
        if (harvestTime && harvestAge > HARVEST_SPARKLE_DURATION) {
          animations.recentHarvests.delete(keyDef.keyCode);
        }

        ctx.save();

        // Hit flash: scale bounce
        if (isHitFlashing) {
          const progress = hitAge / HIT_FLASH_DURATION;
          const scale = 1 + 0.08 * Math.sin(progress * Math.PI);
          const cx = xOffset + w / 2;
          const cy = y + h / 2;
          ctx.translate(cx, cy);
          ctx.scale(scale, scale);
          ctx.translate(-cx, -cy);
        }

        // Background
        const stage = cell?.stage || 'empty';
        ctx.fillStyle = STAGE_COLORS[stage];

        // Hit flash: brighten
        if (isHitFlashing) {
          const progress = hitAge / HIT_FLASH_DURATION;
          const alpha = 0.4 * (1 - progress);
          ctx.beginPath();
          ctx.roundRect(xOffset, y, w, h, 8);
          ctx.fill();
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.beginPath();
          ctx.roundRect(xOffset, y, w, h, 8);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.roundRect(xOffset, y, w, h, 8);
          ctx.fill();
        }

        // Emoji
        const emoji = stage === 'fruit' && cell?.fruitType
          ? FRUIT_EMOJI[cell.fruitType] || '\uD83C\uDF4E'
          : STAGE_EMOJI[stage];

        ctx.font = '24px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, xOffset + w / 2, y + h / 2 - 4);

        // Key label
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(keyDef.label, xOffset + w / 2, y + h - 8);

        // Progress bar
        if (cell && stage !== 'fruit' && stage !== 'empty') {
          const threshold = { watering: 15, sprout: 30, tree: 50 }[stage] || 1;
          const progress = cell.hitCount / threshold;
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(xOffset + 4, y + h - 4, (w - 8) * progress, 2);
        }

        ctx.restore();

        // Harvest sparkle overlay (drawn after restore so it's not scaled)
        if (isHarvestSparkle) {
          const progress = harvestAge / HARVEST_SPARKLE_DURATION;
          const cx = xOffset + w / 2;
          const cy = y + h / 2;
          const sparkleAlpha = 1 - progress;
          const sparkleRadius = 8 + progress * 20;

          ctx.save();
          ctx.globalAlpha = sparkleAlpha;
          // Draw sparkle particles
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 * i) / 6 + progress * Math.PI;
            const sx = cx + Math.cos(angle) * sparkleRadius;
            const sy = cy + Math.sin(angle) * sparkleRadius;
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(sx, sy, 3 * (1 - progress), 0, Math.PI * 2);
            ctx.fill();
          }
          // Center flash
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(cx, cy, 12 * (1 - progress), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        xOffset += w + CELL_GAP;
      });
    });

    if (hasActiveAnimations) {
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [animations]);

  // Redraw when gameState changes
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameState, draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const [keyCode, cellRect] of cellRectsRef.current.entries()) {
      if (
        x >= cellRect.x && x <= cellRect.x + cellRect.w &&
        y >= cellRect.y && y <= cellRect.y + cellRect.h
      ) {
        const cell = gameStateRef.current.cells[keyCode];
        if (cell?.stage === 'fruit') {
          onHarvest(keyCode);
          // Trigger animation render loop
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(draw);
          return;
        }
      }
    }
  }, [onHarvest, draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let overFruit = false;
    for (const [keyCode, cellRect] of cellRectsRef.current.entries()) {
      if (
        x >= cellRect.x && x <= cellRect.x + cellRect.w &&
        y >= cellRect.y && y <= cellRect.y + cellRect.h
      ) {
        const cell = gameStateRef.current.cells[keyCode];
        if (cell?.stage === 'fruit') {
          overFruit = true;
          break;
        }
      }
    }
    canvas.style.cursor = overFruit ? 'grab' : 'default';
  }, []);

  // Calculate canvas size
  const maxRowWidth = HHKB_ROWS.reduce((max, row) => {
    const rowWidth = row.reduce((sum, k) => sum + k.width * CELL_SIZE + (k.width - 1) * CELL_GAP + CELL_GAP, 0);
    return Math.max(max, rowWidth);
  }, 0);

  const canvasWidth = maxRowWidth + PADDING * 2;
  const canvasHeight = HHKB_ROWS.length * (CELL_SIZE + CELL_GAP) + PADDING * 2;

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      style={{ display: 'block' }}
    />
  );
}
