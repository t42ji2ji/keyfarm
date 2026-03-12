import type { FarmStage, FarmCell } from '../types/game';
import { CROP_MAP, CROP_PARTICLE_COLORS } from '../data/crops';
import {
  computeBlockVertices,
  darkenColor,
  fillPoly,
  polygonCentroid,
  type IsoBlock,
} from '../utils/isometric';

// ── Shared tile constants ──────────────────────────────────────────
export const TILE_W = 64;
export const TILE_H = 32;

// ── Internal constants ─────────────────────────────────────────────
const LEFT_FACE_FACTOR = 0.55;
const FRONT_FACE_FACTOR = 0.75;

const HEATMAP_DEPTH_MIN = 6;
const HEATMAP_DEPTH_MAX = 28;

const STAGE_EMOJI: Record<FarmStage, string> = {
  empty: '',
  watering: '',
  sprout: '\uD83C\uDF31',
  tree: '\uD83C\uDF33',
  fruit: '',
  fallow: '',
  overworked: '',
};

// ── Types ──────────────────────────────────────────────────────────

/** Bundles commonly-passed draw parameters. */
export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  flipFactor: number;
  originX: number;
  originY: number;
  now: number;
  txNx: number;
  txNy: number;
  txLen: number;
}

// ── Heatmap helpers ────────────────────────────────────────────────

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

/** Draw one heatmap tile: isometric block + key label + press count. Returns the IsoBlock for hit testing. */
export function drawHeatmapTile(
  dc: DrawContext,
  label: string,
  colOffset: number,
  rowIdx: number,
  width: number,
  count: number,
  maxPresses: number,
): IsoBlock {
  const { ctx, flipFactor, originX, originY, txNx, txNy, txLen } = dc;
  const ratio = count / maxPresses;
  const color = heatColor(ratio);
  const depth = HEATMAP_DEPTH_MIN + ratio * (HEATMAP_DEPTH_MAX - HEATMAP_DEPTH_MIN);

  const block = computeBlockVertices(
    colOffset, rowIdx, width, depth,
    TILE_W, TILE_H, originX, originY, flipFactor,
  );

  fillPoly(ctx, block.right, darkenColor(color, LEFT_FACE_FACTOR));
  fillPoly(ctx, block.front, darkenColor(color, FRONT_FACE_FACTOR));
  fillPoly(ctx, block.top, color);

  const topCenter = polygonCentroid(block.top);
  const textColor = ratio > 0.5 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';

  if (label) {
    ctx.save();
    ctx.translate(topCenter.x, topCenter.y - 4);
    ctx.transform(txNx / txLen, txNy * flipFactor / txLen, -txNx * flipFactor / txLen, txNy / txLen, 0, 0);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  if (count > 0) {
    ctx.save();
    ctx.translate(topCenter.x, topCenter.y + 5);
    ctx.transform(txNx / txLen, txNy * flipFactor / txLen, -txNx * flipFactor / txLen, txNy / txLen, 0, 0);
    ctx.font = '9px sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), 0, 0);
    ctx.restore();
  }

  return block;
}

// ── Farm block drawing ─────────────────────────────────────────────

/** Fill the 3 visible faces of an isometric block. */
export function drawFarmBlock(
  ctx: CanvasRenderingContext2D,
  block: IsoBlock,
  color: string,
): void {
  fillPoly(ctx, block.right, darkenColor(color, LEFT_FACE_FACTOR));
  fillPoly(ctx, block.front, darkenColor(color, FRONT_FACE_FACTOR));
  fillPoly(ctx, block.top, color);
}

/** Apply scale transform, draw block, and draw white overlay for a key-press hit flash.
 *  NOTE: The scale transform remains on ctx so subsequent decorations also scale. */
export function drawHitFlash(
  ctx: CanvasRenderingContext2D,
  block: IsoBlock,
  color: string,
  hitAge: number,
  hitFlashDuration: number,
): void {
  const progress = hitAge / hitFlashDuration;
  const scale = 1 + 0.08 * Math.sin(progress * Math.PI);
  const center = polygonCentroid(block.top);
  ctx.translate(center.x, center.y);
  ctx.scale(scale, scale);
  ctx.translate(-center.x, -center.y);

  drawFarmBlock(ctx, block, color);

  const alpha = 0.4 * (1 - progress);
  const overlayColor = `rgba(255, 255, 255, ${alpha})`;
  fillPoly(ctx, block.top, overlayColor, false);
  fillPoly(ctx, block.right, overlayColor, false);
  fillPoly(ctx, block.front, overlayColor, false);
}

// ── Emoji pre-render cache (drawImage interpolates sub-pixel smoothly) ──

const emojiCache = new Map<string, HTMLCanvasElement>();
const EMOJI_SIZE = 40;

function getEmojiCanvas(emoji: string): HTMLCanvasElement {
  let canvas = emojiCache.get(emoji);
  if (canvas) return canvas;
  const dpr = window.devicePixelRatio || 1;
  canvas = document.createElement('canvas');
  canvas.width = EMOJI_SIZE * dpr;
  canvas.height = EMOJI_SIZE * dpr;
  const c = canvas.getContext('2d')!;
  c.scale(dpr, dpr);
  c.font = '20px serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(emoji, EMOJI_SIZE / 2, EMOJI_SIZE / 2);
  emojiCache.set(emoji, canvas);
  return canvas;
}

// ── Decorations ────────────────────────────────────────────────────

/** Draw the emoji corresponding to the current growth stage. */
export function drawStageEmoji(
  ctx: CanvasRenderingContext2D,
  stage: FarmStage,
  cell: FarmCell | undefined,
  topCenter: { x: number; y: number },
  now: number,
): void {
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

  if (!emoji) return;

  if (stage === 'fruit') {
    const floatY = Math.sin(now / 800) * 5;
    const emojiCanvas = getEmojiCanvas(emoji);
    ctx.drawImage(
      emojiCanvas,
      topCenter.x - EMOJI_SIZE / 2,
      topCenter.y - 2 - EMOJI_SIZE / 2 + floatY,
      EMOJI_SIZE, EMOJI_SIZE,
    );
  } else {
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, topCenter.x, topCenter.y - 2);
  }
}

/** Draw a pulsing glow effect on harvest-ready (fruit stage) tiles. */
export function drawHarvestReadyGlow(
  dc: DrawContext,
  block: IsoBlock,
  color: string,
): void {
  const { ctx, now } = dc;
  const topCenter = polygonCentroid(block.top);

  // Breathing pulse (0.6s cycle)
  const pulse = 0.5 + 0.5 * Math.sin(now / 600 * Math.PI * 2);

  // Soft glow under the block
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8 + pulse * 10;
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.beginPath();
  const top = block.top;
  ctx.moveTo(top[0].x, top[0].y);
  for (let i = 1; i < top.length; i++) ctx.lineTo(top[i].x, top[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Pulsing bright overlay on top face
  const overlayAlpha = 0.08 + 0.12 * pulse;
  fillPoly(ctx, block.top, `rgba(255, 255, 255, ${overlayAlpha})`, false);

  // Small floating sparkle dots
  for (let i = 0; i < 4; i++) {
    const angle = (now / 1200) + (Math.PI * 2 * i) / 4;
    const floatY = Math.sin(now / 500 + i * 1.5) * 4;
    const radius = 14;
    const sx = topCenter.x + Math.cos(angle) * radius;
    const sy = topCenter.y + Math.sin(angle) * radius * 0.5 - 6 + floatY;
    const dotAlpha = 0.4 + 0.4 * Math.sin(now / 400 + i * Math.PI * 0.5);
    ctx.fillStyle = `rgba(255, 255, 255, ${dotAlpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw golden glow, sparkles, and shimmer overlay for a golden crop. */
export function drawGoldenEffect(
  dc: DrawContext,
  block: IsoBlock,
  cell: FarmCell,
  topCenter: { x: number; y: number },
): void {
  const { ctx, now } = dc;

  ctx.save();
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 15;
  ctx.font = '20px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(CROP_MAP[cell.cropId!]?.emoji || '', topCenter.x, topCenter.y - 2);
  ctx.restore();

  for (let i = 0; i < 3; i++) {
    const angle = (now / 800) + (Math.PI * 2 * i) / 3;
    const radius = 12;
    const sx = topCenter.x + Math.cos(angle) * radius;
    const sy = topCenter.y + Math.sin(angle) * radius * 0.5 - 2;
    ctx.font = '8px serif';
    ctx.textAlign = 'center';
    ctx.fillText('\u2728', sx, sy);
  }

  const shimmerAlpha = 0.15 + 0.1 * Math.sin(now / 300);
  fillPoly(ctx, block.top, `rgba(255, 215, 0, ${shimmerAlpha})`, false);
}

/** Draw a wiggling bug emoji on a pest-infested tile. */
export function drawPestOverlay(
  ctx: CanvasRenderingContext2D,
  topCenter: { x: number; y: number },
  now: number,
): void {
  const wiggle = Math.sin(now / 150) * 3;
  ctx.font = '18px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\uD83D\uDC1B', topCenter.x + wiggle, topCenter.y - 2);
}

/** Draw overworked or fallow countdown text. */
export function drawCountdownTimer(
  ctx: CanvasRenderingContext2D,
  cell: FarmCell,
  stage: FarmStage,
  topCenter: { x: number; y: number },
  now: number,
): void {
  if (stage === 'overworked' && cell.overworkedUntil) {
    const remaining = Math.max(0, Math.ceil((cell.overworkedUntil - now) / 1000));
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${remaining}s`, topCenter.x, topCenter.y + 10);
  }

  if (stage === 'fallow' && cell.fallowUntil) {
    const remainingSec = Math.max(0, Math.ceil((cell.fallowUntil - now) / 1000));
    const remainingMin = Math.floor(remainingSec / 60);
    const remainingS = remainingSec % 60;
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${remainingMin}:${String(remainingS).padStart(2, '0')}`, topCenter.x, topCenter.y + 10);
  }
}

/** Draw key label text on the top face with isometric transform, plus a progress fill overlay. */
export function drawKeyLabel(
  dc: DrawContext,
  label: string,
  cell: FarmCell | undefined,
  stage: FarmStage,
  color: string,
  topCenter: { x: number; y: number },
): void {
  const { ctx, flipFactor, txNx, txNy, txLen } = dc;

  ctx.save();
  ctx.translate(topCenter.x, topCenter.y + 6);
  ctx.transform(txNx / txLen, txNy * flipFactor / txLen, -txNx * flipFactor / txLen, txNy / txLen, 0, 0);
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = darkenColor(color, 0.65);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0);
  ctx.restore();

  if (cell && stage !== 'fruit' && stage !== 'empty' && stage !== 'fallow' && stage !== 'overworked') {
    const threshold = { watering: 15, sprout: 30, tree: 50 }[stage] || 1;
    const progress = cell.hitCount / threshold;
    if (progress > 0) {
      ctx.save();
      ctx.translate(topCenter.x, topCenter.y + 6);
      ctx.transform(txNx / txLen, txNy * flipFactor / txLen, -txNx * flipFactor / txLen, txNy / txLen, 0, 0);
      const textH = 14;
      const clipTop = textH / 2 - textH * progress;
      ctx.beginPath();
      ctx.rect(-30, clipTop, 60, textH * progress);
      ctx.clip();
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = darkenColor(color, 1.3);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
}

// ── Animations ─────────────────────────────────────────────────────

/** Draw the full harvest animation: rising emoji, particles, sparkles, and optional golden burst. */
export function drawHarvestAnimation(
  ctx: CanvasRenderingContext2D,
  block: IsoBlock,
  cropId: string,
  wasGolden: boolean,
  harvestAge: number,
  harvestDuration: number,
  harvestTime: number,
): void {
  const progress = harvestAge / harvestDuration;
  const center = polygonCentroid(block.top);
  const harvestEmoji = CROP_MAP[cropId]?.emoji || '\uD83C\uDF4E';
  const particleColor = CROP_PARTICLE_COLORS[cropId] || '#FF3B30';

  ctx.save();

  // White flash on block
  if (progress < 0.25) {
    const flashAlpha = 0.5 * (1 - progress / 0.25);
    const flashColor = `rgba(255, 255, 255, ${flashAlpha})`;
    fillPoly(ctx, block.top, flashColor, false);
    fillPoly(ctx, block.right, flashColor, false);
    fillPoly(ctx, block.front, flashColor, false);
  }

  // Rising emoji
  if (progress < 0.75) {
    const ep = progress / 0.75;
    const emojiY = center.y - 2 - ep * 45;
    const emojiScale = 1 + ep * 0.5;
    ctx.globalAlpha = ep < 0.6 ? 1 : 1 - ((ep - 0.6) / 0.4);
    ctx.font = `${Math.round(20 * emojiScale)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(harvestEmoji, center.x, emojiY);
    ctx.globalAlpha = 1;
  }

  // Particles
  if (progress > 0.1 && progress < 0.9) {
    const bp = (progress - 0.1) / 0.8;
    ctx.globalAlpha = 1 - bp;
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + ((harvestTime % 628) / 100);
      const speed = 25 + ((harvestTime * (i + 7)) % 15);
      const px = center.x + Math.cos(angle) * speed * bp;
      const py = center.y + Math.sin(angle) * speed * bp
                 + 30 * bp * bp;
      const size = 2.5 * (1 - bp * 0.7);
      ctx.fillStyle = particleColor;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Sparkles
  if (progress > 0.3) {
    const sp = (progress - 0.3) / 0.7;
    ctx.globalAlpha = 0.8 * (1 - sp);
    const sparkleR = 10 + sp * 25;
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 + sp * Math.PI * 1.5;
      const sx = center.x + Math.cos(angle) * sparkleR;
      const sy = center.y + Math.sin(angle) * sparkleR * 0.6;
      const starSize = 2.5 * (1 - sp);
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(sx, sy, starSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Golden burst
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

/** Draw the pest-removal animation: bug floating away + green particles. */
export function drawPestRemovalAnimation(
  ctx: CanvasRenderingContext2D,
  block: IsoBlock,
  pestRemovalAge: number,
  pestRemovalDuration: number,
  pestRemovalTime: number,
): void {
  const progress = pestRemovalAge / pestRemovalDuration;
  const center = polygonCentroid(block.top);

  ctx.save();

  // Green flash on block
  if (progress < 0.2) {
    const flashAlpha = 0.4 * (1 - progress / 0.2);
    const flashColor = `rgba(100, 220, 100, ${flashAlpha})`;
    fillPoly(ctx, block.top, flashColor, false);
  }

  // Bug floating away
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

  // Green particles
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
