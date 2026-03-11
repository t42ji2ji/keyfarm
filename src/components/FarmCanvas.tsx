import { useRef, useEffect, useCallback } from 'react';
import type { GameState, FarmStage } from '../types/game';
import { HHKB_ROWS } from '../data/hhkbLayout';
import type { AnimationState } from '../hooks/useGameState';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CROP_MAP, CROP_PARTICLE_COLORS } from '../data/crops';
import {
  computeBlockVertices,
  computeCanvasBounds,
  hitTestBlock,
  darkenColor,
  fillPoly,
  polygonCentroid,
  type IsoBlock,
} from '../utils/isometric';

const TILE_W = 64;
const TILE_H = 32;
const PADDING = 40;
const HIT_FLASH_DURATION = 200;
const HARVEST_DURATION = 700;

const STAGE_DEPTH: Record<FarmStage, number> = {
  empty: 8,
  watering: 12,
  sprout: 16,
  tree: 22,
  fruit: 26,
  fallow: 6,
  overworked: 10,
};

const MAX_DEPTH = 26;

const STAGE_COLORS: Record<FarmStage, string> = {
  empty: '#8B7355',
  watering: '#4A90D9',
  sprout: '#7EC850',
  tree: '#2D8B46',
  fruit: '#FF6B6B',
  fallow: '#8B8B8B',
  overworked: '#FF4500',
};

const LEFT_FACE_FACTOR = 0.55;
const FRONT_FACE_FACTOR = 0.75;

const STAGE_EMOJI: Record<FarmStage, string> = {
  empty: '',
  watering: '\uD83D\uDCA7',
  sprout: '\uD83C\uDF31',
  tree: '\uD83C\uDF33',
  fruit: '',
  fallow: '',
  overworked: '',
};

const RARITY_BLOCK_COLORS: Record<string, string> = {
  common: '#FF6B6B',
  uncommon: '#4ADE80',
  rare: '#60A5FA',
  legendary: '#F59E0B',
};

// Export canvas dimensions so App can compute scale
const _bounds = computeCanvasBounds(TILE_W, TILE_H, MAX_DEPTH, PADDING);
export const CANVAS_WIDTH = _bounds.width;
export const CANVAS_HEIGHT = _bounds.height;

/** Map mouse event to canvas-pixel coordinates (accounts for CSS transform). */
function canvasCoords(e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

interface FarmCanvasProps {
  gameState: GameState;
  animations: AnimationState;
  onHarvest: (keyCode: string) => void;
  onRemovePest: (keyCode: string) => void;
}

export function FarmCanvas({ gameState, animations, onHarvest, onRemovePest }: FarmCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellBlocksRef = useRef<Map<string, IsoBlock>>(new Map());
  const rafRef = useRef<number>(0);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const { width: canvasWidth, height: canvasHeight, originX, originY } = _bounds;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = Date.now();
    let hasActiveAnimations = false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cellBlocksRef.current.clear();

    HHKB_ROWS.forEach((row, rowIdx) => {
      let colOffset = 0;

      row.forEach((keyDef) => {
        const cell = gameStateRef.current.cells[keyDef.keyCode];
        const stage = cell?.stage || 'empty';
        const depth = STAGE_DEPTH[stage];

        // Determine block color: override for fruit stage based on rarity
        let color = STAGE_COLORS[stage];
        if (stage === 'fruit' && cell?.cropId) {
          const crop = CROP_MAP[cell.cropId];
          if (crop) color = RARITY_BLOCK_COLORS[crop.rarity];
        }

        const block = computeBlockVertices(
          colOffset, rowIdx, keyDef.width, depth,
          TILE_W, TILE_H, originX, originY,
        );

        cellBlocksRef.current.set(keyDef.keyCode, block);

        // Check animations
        const hitTime = animations.recentHits.get(keyDef.keyCode);
        const hitAge = hitTime ? now - hitTime : Infinity;
        const isHitFlashing = hitAge < HIT_FLASH_DURATION;

        const harvestTime = animations.recentHarvests.get(keyDef.keyCode);
        const harvestAge = harvestTime ? now - harvestTime : Infinity;
        const isHarvestSparkle = harvestAge < HARVEST_DURATION;

        if (isHitFlashing || isHarvestSparkle) hasActiveAnimations = true;

        if (hitTime && hitAge > HIT_FLASH_DURATION) {
          animations.recentHits.delete(keyDef.keyCode);
        }
        if (harvestTime && harvestAge > HARVEST_DURATION) {
          animations.recentHarvests.delete(keyDef.keyCode);
          animations.harvestFruits.delete(keyDef.keyCode);
          animations.harvestGolden.delete(keyDef.keyCode);
        }

        // Pest removal animation
        const pestRemovalTime = animations.recentPestRemovals.get(keyDef.keyCode);
        const pestRemovalAge = pestRemovalTime ? now - pestRemovalTime : Infinity;
        const isPestRemoving = pestRemovalAge < HARVEST_DURATION;
        if (isPestRemoving) hasActiveAnimations = true;
        if (pestRemovalTime && pestRemovalAge > HARVEST_DURATION) {
          animations.recentPestRemovals.delete(keyDef.keyCode);
        }

        ctx.save();

        // Hit flash: scale bounce around top face centroid
        if (isHitFlashing) {
          const progress = hitAge / HIT_FLASH_DURATION;
          const scale = 1 + 0.08 * Math.sin(progress * Math.PI);
          const center = polygonCentroid(block.top);
          ctx.translate(center.x, center.y);
          ctx.scale(scale, scale);
          ctx.translate(-center.x, -center.y);
        }

        // Draw 3 faces: right (darkest), front (medium), top (brightest)
        fillPoly(ctx, block.right, darkenColor(color, LEFT_FACE_FACTOR));
        fillPoly(ctx, block.front, darkenColor(color, FRONT_FACE_FACTOR));
        fillPoly(ctx, block.top, color);

        // Hit flash: white overlay on all faces
        if (isHitFlashing) {
          const progress = hitAge / HIT_FLASH_DURATION;
          const alpha = 0.4 * (1 - progress);
          const overlayColor = `rgba(255, 255, 255, ${alpha})`;
          fillPoly(ctx, block.top, overlayColor, false);
          fillPoly(ctx, block.right, overlayColor, false);
          fillPoly(ctx, block.front, overlayColor, false);
        }

        // Emoji centered on top face
        const topCenter = polygonCentroid(block.top);

        let emoji = '';
        if (stage === 'fruit' && cell?.cropId) {
          emoji = CROP_MAP[cell.cropId]?.emoji || '\uD83C\uDF4E';
        } else if (stage === 'fallow') {
          emoji = '\uD83D\uDCA4';
        } else if (stage === 'overworked') {
          emoji = '\uD83D\uDD12';
        } else {
          emoji = STAGE_EMOJI[stage] || '';
        }

        if (emoji) {
          ctx.font = '20px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, topCenter.x, topCenter.y - 2);
        }

        // Golden visual effects
        if (cell?.isGolden && stage === 'fruit') {
          hasActiveAnimations = true;

          // 1. Gold glow on emoji (redraw with shadow)
          ctx.save();
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 15;
          ctx.font = '20px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(CROP_MAP[cell.cropId!]?.emoji || '', topCenter.x, topCenter.y - 2);
          ctx.restore();

          // 2. Orbiting sparkle particles (3 sparkles rotating)
          for (let i = 0; i < 3; i++) {
            const angle = (now / 800) + (Math.PI * 2 * i) / 3;
            const radius = 12;
            const sx = topCenter.x + Math.cos(angle) * radius;
            const sy = topCenter.y + Math.sin(angle) * radius * 0.5 - 2;
            ctx.font = '8px serif';
            ctx.textAlign = 'center';
            ctx.fillText('\u2728', sx, sy);
          }

          // 3. Gold shimmer on tile top face
          const shimmerAlpha = 0.15 + 0.1 * Math.sin(now / 300);
          fillPoly(ctx, block.top, `rgba(255, 215, 0, ${shimmerAlpha})`, false);
        }

        // Pest overlay (bug with wiggle)
        if (cell?.hasPest && ['watering', 'sprout', 'tree', 'fruit'].includes(stage)) {
          hasActiveAnimations = true;
          const wiggle = Math.sin(now / 150) * 3;
          ctx.font = '18px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('\uD83D\uDC1B', topCenter.x + wiggle, topCenter.y - 2);
        }

        // Overworked countdown
        if (stage === 'overworked' && cell?.overworkedUntil) {
          hasActiveAnimations = true;
          const remaining = Math.max(0, Math.ceil((cell.overworkedUntil - now) / 1000));
          ctx.font = 'bold 10px sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${remaining}s`, topCenter.x, topCenter.y + 10);
        }

        // Fallow timer
        if (stage === 'fallow' && cell?.fallowUntil) {
          hasActiveAnimations = true;
          const remainingSec = Math.max(0, Math.ceil((cell.fallowUntil - now) / 1000));
          const remainingMin = Math.floor(remainingSec / 60);
          const remainingS = remainingSec % 60;
          ctx.font = 'bold 9px sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${remainingMin}:${String(remainingS).padStart(2, '0')}`, topCenter.x, topCenter.y + 10);
        }

        // Key label on top face with isometric surface transform
        if (keyDef.label) {
          const nx = TILE_W / 2;
          const ny = TILE_H / 2;
          const len = Math.sqrt(nx * nx + ny * ny);

          // Base label (dark)
          ctx.save();
          ctx.translate(topCenter.x, topCenter.y + 6);
          ctx.transform(nx / len, ny / len, -nx / len, ny / len, 0, 0);
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = darkenColor(color, 0.65);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(keyDef.label, 0, 0);
          ctx.restore();

          // Progress overlay on label text (fills from bottom to top)
          if (cell && stage !== 'fruit' && stage !== 'empty' && stage !== 'fallow' && stage !== 'overworked') {
            const threshold = { watering: 15, sprout: 30, tree: 50 }[stage] || 1;
            const progress = cell.hitCount / threshold;
            if (progress > 0) {
              ctx.save();
              ctx.translate(topCenter.x, topCenter.y + 6);
              ctx.transform(nx / len, ny / len, -nx / len, ny / len, 0, 0);
              // Clip: reveal from bottom up based on progress
              const textH = 14;
              const clipTop = textH / 2 - textH * progress;
              ctx.beginPath();
              ctx.rect(-30, clipTop, 60, textH * progress);
              ctx.clip();
              ctx.font = 'bold 11px sans-serif';
              ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(keyDef.label, 0, 0);
              ctx.restore();
            }
          }
        }

        ctx.restore();

        // Harvest animation (drawn after restore, above the block)
        if (isHarvestSparkle && harvestTime) {
          const progress = harvestAge / HARVEST_DURATION;
          const center = polygonCentroid(block.top);
          const cropId = animations.harvestFruits.get(keyDef.keyCode) || 'apple';
          const harvestEmoji = CROP_MAP[cropId]?.emoji || '\uD83C\uDF4E';
          const particleColor = CROP_PARTICLE_COLORS[cropId] || '#FF3B30';
          const wasGolden = animations.harvestGolden.get(keyDef.keyCode) || false;

          ctx.save();

          // Phase 1: White flash on block (0-25%)
          if (progress < 0.25) {
            const flashAlpha = 0.5 * (1 - progress / 0.25);
            const flashColor = `rgba(255, 255, 255, ${flashAlpha})`;
            fillPoly(ctx, block.top, flashColor, false);
            fillPoly(ctx, block.right, flashColor, false);
            fillPoly(ctx, block.front, flashColor, false);
          }

          // Phase 2: Emoji floats up, grows, and fades (0-60%)
          if (progress < 0.6) {
            const ep = progress / 0.6;
            const emojiY = center.y - 2 - ep * 35;
            const emojiScale = 1 + ep * 0.4;
            ctx.globalAlpha = 1 - ep;
            ctx.font = `${Math.round(20 * emojiScale)}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(harvestEmoji, center.x, emojiY);
            ctx.globalAlpha = 1;
          }

          // Phase 3: Colored particle burst (10-90%)
          if (progress > 0.1 && progress < 0.9) {
            const bp = (progress - 0.1) / 0.8;
            ctx.globalAlpha = 1 - bp;
            for (let i = 0; i < 10; i++) {
              const angle = (Math.PI * 2 * i) / 10 + ((harvestTime % 628) / 100);
              const speed = 25 + ((harvestTime * (i + 7)) % 15);
              const px = center.x + Math.cos(angle) * speed * bp;
              const py = center.y + Math.sin(angle) * speed * bp
                         + 30 * bp * bp; // gravity
              const size = 2.5 * (1 - bp * 0.7);
              ctx.fillStyle = particleColor;
              ctx.beginPath();
              ctx.arc(px, py, size, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }

          // Phase 4: Gold sparkle ring (30-100%)
          if (progress > 0.3) {
            const sp = (progress - 0.3) / 0.7;
            ctx.globalAlpha = 0.8 * (1 - sp);
            const sparkleR = 10 + sp * 25;
            for (let i = 0; i < 5; i++) {
              const angle = (Math.PI * 2 * i) / 5 + sp * Math.PI * 1.5;
              const sx = center.x + Math.cos(angle) * sparkleR;
              const sy = center.y + Math.sin(angle) * sparkleR * 0.6; // flatten for iso
              const starSize = 2.5 * (1 - sp);
              ctx.fillStyle = '#FFD700';
              ctx.beginPath();
              ctx.arc(sx, sy, starSize, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }

          // Extra gold particle burst for golden harvests
          if (wasGolden && progress > 0.05 && progress < 0.85) {
            const bp = (progress - 0.05) / 0.8;
            ctx.globalAlpha = (1 - bp) * 0.9;
            for (let i = 0; i < 8; i++) {
              const angle = (Math.PI * 2 * i) / 8 + ((harvestTime % 314) / 50);
              const speed = 30 + ((harvestTime * (i + 3)) % 20);
              const px = center.x + Math.cos(angle) * speed * bp;
              const py = center.y + Math.sin(angle) * speed * bp * 0.7
                         + 20 * bp * bp;
              const size = 3 * (1 - bp * 0.6);
              ctx.fillStyle = '#FFD700';
              ctx.beginPath();
              ctx.arc(px, py, size, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }

          ctx.restore();
        }

        // Pest removal animation (bug flies away + green puff)
        if (isPestRemoving && pestRemovalTime) {
          const progress = pestRemovalAge / HARVEST_DURATION;
          const center = polygonCentroid(block.top);

          ctx.save();

          // Phase 1: Green flash on block (0-20%)
          if (progress < 0.2) {
            const flashAlpha = 0.4 * (1 - progress / 0.2);
            const flashColor = `rgba(100, 220, 100, ${flashAlpha})`;
            fillPoly(ctx, block.top, flashColor, false);
          }

          // Phase 2: Bug flies away upward and shrinks (0-50%)
          if (progress < 0.5) {
            const ep = progress / 0.5;
            const bugY = center.y - 2 - ep * 40;
            const bugX = center.x + Math.sin(ep * Math.PI * 3) * 8;
            ctx.globalAlpha = 1 - ep;
            ctx.font = `${Math.round(18 * (1 - ep * 0.5))}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\uD83D\uDC1B', bugX, bugY);
            ctx.globalAlpha = 1;
          }

          // Phase 3: Green particle puff (10-70%)
          if (progress > 0.1 && progress < 0.7) {
            const bp = (progress - 0.1) / 0.6;
            ctx.globalAlpha = (1 - bp) * 0.7;
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI * 2 * i) / 6 + ((pestRemovalTime % 628) / 100);
              const speed = 18 + ((pestRemovalTime * (i + 5)) % 10);
              const px = center.x + Math.cos(angle) * speed * bp;
              const py = center.y + Math.sin(angle) * speed * bp * 0.6;
              const size = 2 * (1 - bp * 0.8);
              ctx.fillStyle = '#4ADE80';
              ctx.beginPath();
              ctx.arc(px, py, size, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }

          ctx.restore();
        }

        colOffset += keyDef.width;
      });
    });

    if (hasActiveAnimations) {
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [animations, originX, originY]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameState, draw]);

  const harvestedRef = useRef<Set<string>>(new Set());

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = canvasCoords(e, canvas);

    let overFruit = false;
    for (const [keyCode, block] of cellBlocksRef.current.entries()) {
      if (hitTestBlock(x, y, block)) {
        const cell = gameStateRef.current.cells[keyCode];

        // Pest removal (priority over harvest)
        if (cell?.hasPest) {
          overFruit = true; // reuse cursor change
          if (!harvestedRef.current.has(keyCode + '_pest')) {
            harvestedRef.current.add(keyCode + '_pest');
            onRemovePest(keyCode);
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(draw);
          }
        } else {
          harvestedRef.current.delete(keyCode + '_pest');
        }

        // Fruit harvest
        if (cell?.stage === 'fruit') {
          overFruit = true;
          if (!harvestedRef.current.has(keyCode)) {
            harvestedRef.current.add(keyCode);
            onHarvest(keyCode);
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(draw);
          }
        }
      } else {
        harvestedRef.current.delete(keyCode);
        harvestedRef.current.delete(keyCode + '_pest');
      }
    }
    canvas.style.cursor = overFruit ? 'grab' : 'default';
  }, [onHarvest, onRemovePest, draw]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    getCurrentWindow().startDragging();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      style={{ display: 'block' }}
    />
  );
}
