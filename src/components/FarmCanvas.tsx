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
const HARVEST_DURATION = 1200;

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
  overworked: '#D4845A',
};

const LEFT_FACE_FACTOR = 0.55;
const FRONT_FACE_FACTOR = 0.75;

const STAGE_EMOJI: Record<FarmStage, string> = {
  empty: '',
  watering: '',
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

/** Map mouse event to logical canvas coordinates (accounts for CSS transform + dpr). */
function canvasCoords(e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, logicalW: number, logicalH: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (logicalW / rect.width),
    y: (e.clientY - rect.top) * (logicalH / rect.height),
  };
}

/** Map a 0–1 ratio to a cold→hot color (grey → blue → green → yellow → orange → red). */
function heatColor(ratio: number): string {
  if (ratio <= 0) return '#3a3a3a';
  const stops: [number, number, number][] = [
    [58, 130, 220],  // blue  (low)
    [60, 190, 90],   // green
    [240, 220, 50],  // yellow
    [240, 150, 30],  // orange
    [230, 50, 40],   // red   (high)
  ];
  const t = Math.min(ratio, 1) * (stops.length - 1);
  const i = Math.min(Math.floor(t), stops.length - 2);
  const f = t - i;
  const r = Math.round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * f);
  const g = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * f);
  const b = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * f);
  return `rgb(${r},${g},${b})`;
}

const HEATMAP_DEPTH_MIN = 6;
const HEATMAP_DEPTH_MAX = 28;

interface FarmCanvasProps {
  gameState: GameState;
  animations: AnimationState;
  onHarvest: (keyCode: string) => void;
  onRemovePest: (keyCode: string) => void;
  viewMode: 'farm' | 'heatmap';
}

export function FarmCanvas({ gameState, animations, onHarvest, onRemovePest, viewMode }: FarmCanvasProps) {
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

    const dpr = window.devicePixelRatio || 1;
    const now = Date.now();
    let hasActiveAnimations = false;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    cellBlocksRef.current.clear();

    if (viewMode === 'heatmap') {
      // Compute max presses across all keys
      const pressValues = Object.values(gameStateRef.current.totalKeyPresses);
      const maxPresses = pressValues.length > 0 ? Math.max(...pressValues, 1) : 1;

      HHKB_ROWS.forEach((row, rowIdx) => {
        let colOffset = 0;
        row.forEach((keyDef) => {
          const count = gameStateRef.current.totalKeyPresses[keyDef.keyCode] || 0;
          const ratio = count / maxPresses;
          const color = heatColor(ratio);
          const depth = HEATMAP_DEPTH_MIN + ratio * (HEATMAP_DEPTH_MAX - HEATMAP_DEPTH_MIN);

          const block = computeBlockVertices(
            colOffset, rowIdx, keyDef.width, depth,
            TILE_W, TILE_H, originX, originY,
          );
          cellBlocksRef.current.set(keyDef.keyCode, block);

          // Draw 3 faces
          fillPoly(ctx, block.right, darkenColor(color, LEFT_FACE_FACTOR));
          fillPoly(ctx, block.front, darkenColor(color, FRONT_FACE_FACTOR));
          fillPoly(ctx, block.top, color);

          // Draw count number on top face with isometric transform
          const topCenter = polygonCentroid(block.top);
          const nx = TILE_W / 2;
          const ny = TILE_H / 2;
          const len = Math.sqrt(nx * nx + ny * ny);

          ctx.save();
          ctx.translate(topCenter.x, topCenter.y);
          ctx.transform(nx / len, ny / len, -nx / len, ny / len, 0, 0);
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = ratio > 0.5 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(count > 0 ? String(count) : '', 0, 0);
          ctx.restore();

          colOffset += keyDef.width;
        });
      });
      return;
    }

    // --- Farm view ---
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
              ctx.fillStyle = darkenColor(color, 1.3);
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

          // Phase 2: Emoji floats up, grows, then fades (0-75%)
          if (progress < 0.75) {
            const ep = progress / 0.75;
            const emojiY = center.y - 2 - ep * 45;
            const emojiScale = 1 + ep * 0.5;
            // Stay opaque for first 60%, then fade out
            ctx.globalAlpha = ep < 0.6 ? 1 : 1 - ((ep - 0.6) / 0.4);
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
  }, [animations, originX, originY, viewMode]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameState, draw]);

  const harvestedRef = useRef<Set<string>>(new Set());
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (viewModeRef.current === 'heatmap') { canvas.style.cursor = 'default'; return; }
    const { x, y } = canvasCoords(e, canvas, canvasWidth, canvasHeight);

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

  const dpr = window.devicePixelRatio || 1;

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth * dpr}
      height={canvasHeight * dpr}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      style={{ display: 'block', width: canvasWidth, height: canvasHeight }}
    />
  );
}
