import { useRef, useEffect, useCallback } from 'react';
import { GameState, FarmStage } from '../types/game';
import { HHKB_ROWS } from '../data/hhkbLayout';

const CELL_SIZE = 52;
const CELL_GAP = 4;
const PADDING = 16;

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
  onHarvest: (keyCode: string) => void;
}

export function FarmCanvas({ gameState, onHarvest }: FarmCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellRectsRef = useRef<Map<string, { x: number; y: number; w: number; h: number }>>(new Map());

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cellRectsRef.current.clear();

    HHKB_ROWS.forEach((row, rowIdx) => {
      let xOffset = PADDING;
      const y = PADDING + rowIdx * (CELL_SIZE + CELL_GAP);

      row.forEach((keyDef) => {
        const cell = gameState.cells[keyDef.keyCode];
        const w = keyDef.width * CELL_SIZE + (keyDef.width - 1) * CELL_GAP;
        const h = CELL_SIZE;

        cellRectsRef.current.set(keyDef.keyCode, { x: xOffset, y, w, h });

        // Background
        const stage = cell?.stage || 'empty';
        ctx.fillStyle = STAGE_COLORS[stage];
        ctx.beginPath();
        ctx.roundRect(xOffset, y, w, h, 8);
        ctx.fill();

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

        xOffset += w + CELL_GAP;
      });
    });
  }, [gameState]);

  useEffect(() => { draw(); }, [draw]);

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
        const cell = gameState.cells[keyCode];
        if (cell?.stage === 'fruit') {
          onHarvest(keyCode);
          return;
        }
      }
    }
  }, [gameState, onHarvest]);

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
        const cell = gameState.cells[keyCode];
        if (cell?.stage === 'fruit') {
          overFruit = true;
          break;
        }
      }
    }
    canvas.style.cursor = overFruit ? 'grab' : 'default';
  }, [gameState]);

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
