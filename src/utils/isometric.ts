import { HHKB_ROWS } from '../data/hhkbLayout';

export interface Point {
  x: number;
  y: number;
}

export interface IsoBlock {
  top: Point[];   // 4 vertices of top face (diamond)
  right: Point[]; // 4 vertices of right side face (NE-SE edge, visible)
  front: Point[]; // 4 vertices of front side face (SW-SE edge, visible)
}

/** Convert grid coordinates to screen position (isometric 2:1 projection). */
export function gridToScreen(
  col: number,
  row: number,
  tileW: number,
  tileH: number,
  originX: number,
  originY: number,
): Point {
  return {
    x: originX + (col - row) * tileW / 2,
    y: originY + (col + row) * tileH / 2,
  };
}

/** Compute the 3 visible face polygons for an isometric block. */
export function computeBlockVertices(
  col: number,
  row: number,
  width: number,
  depth: number,
  tileW: number,
  tileH: number,
  originX: number,
  originY: number,
): IsoBlock {
  // Base corners at grid level
  const baseNW = gridToScreen(col, row, tileW, tileH, originX, originY);
  const baseNE = gridToScreen(col + width, row, tileW, tileH, originX, originY);
  const baseSE = gridToScreen(col + width, row + 1, tileW, tileH, originX, originY);
  const baseSW = gridToScreen(col, row + 1, tileW, tileH, originX, originY);

  // Top face corners (shifted up by depth)
  const topNW: Point = { x: baseNW.x, y: baseNW.y - depth };
  const topNE: Point = { x: baseNE.x, y: baseNE.y - depth };
  const topSE: Point = { x: baseSE.x, y: baseSE.y - depth };
  const topSW: Point = { x: baseSW.x, y: baseSW.y - depth };

  return {
    top: [topNW, topNE, topSE, topSW],
    right: [topNE, topSE, baseSE, baseNE],
    front: [topSW, topSE, baseSE, baseSW],
  };
}

/** Calculate canvas dimensions and origin to fit the full HHKB layout. */
export function computeCanvasBounds(
  tileW: number,
  tileH: number,
  maxDepth: number,
  padding: number,
): { width: number; height: number; originX: number; originY: number } {
  const maxCols = HHKB_ROWS.reduce((max, row) => {
    const rowCols = row.reduce((sum, k) => sum + k.width, 0);
    return Math.max(max, rowCols);
  }, 0);
  const numRows = HHKB_ROWS.length;

  const minX = -numRows * tileW / 2;
  const maxX = maxCols * tileW / 2;
  const minY = -maxDepth;
  const maxY = (maxCols + numRows) * tileH / 2;

  const originX = -minX + padding;
  const originY = -minY + padding;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  return { width, height, originX, originY };
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (
      ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Test if a screen point hits any face of an isometric block. */
export function hitTestBlock(px: number, py: number, block: IsoBlock): boolean {
  return (
    pointInPolygon(px, py, block.top) ||
    pointInPolygon(px, py, block.right) ||
    pointInPolygon(px, py, block.front)
  );
}

/** Darken a hex color by a factor (0–1). */
export function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

/** Draw a filled polygon with optional outline stroke. */
export function fillPoly(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  stroke = true,
): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = darkenColor(color, 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Compute the centroid of a polygon. */
export function polygonCentroid(points: Point[]): Point {
  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / points.length, y: cy / points.length };
}
