import { HHKB_ROWS } from '../data/hhkbLayout';

export interface Point {
  x: number;
  y: number;
}

export interface IsoBlock {
  top: Point[];   // 4 vertices of top face (diamond)
  right: Point[]; // 4 vertices of the darker side face
  front: Point[]; // 4 vertices of the lighter side face
}

/** Convert grid coordinates to screen position (isometric 2:1 projection).
 *  flipFactor: 1 = normal (camera top-left), -1 = flipped (camera top-right). */
export function gridToScreen(
  col: number,
  row: number,
  tileW: number,
  tileH: number,
  originX: number,
  originY: number,
  flipFactor: number = 1,
): Point {
  return {
    x: originX + (col - row) * tileW / 2 * flipFactor,
    y: originY + (col + row) * tileH / 2,
  };
}

/** Compute the 3 visible face polygons for an isometric block.
 *  flipFactor controls which side face is visible. */
export function computeBlockVertices(
  col: number,
  row: number,
  width: number,
  depth: number,
  tileW: number,
  tileH: number,
  originX: number,
  originY: number,
  flipFactor: number = 1,
): IsoBlock {
  // Base corners at grid level
  const baseNW = gridToScreen(col, row, tileW, tileH, originX, originY, flipFactor);
  const baseNE = gridToScreen(col + width, row, tileW, tileH, originX, originY, flipFactor);
  const baseSE = gridToScreen(col + width, row + 1, tileW, tileH, originX, originY, flipFactor);
  const baseSW = gridToScreen(col, row + 1, tileW, tileH, originX, originY, flipFactor);

  // Top face corners (shifted up by depth)
  const topNW: Point = { x: baseNW.x, y: baseNW.y - depth };
  const topNE: Point = { x: baseNE.x, y: baseNE.y - depth };
  const topSE: Point = { x: baseSE.x, y: baseSE.y - depth };
  const topSW: Point = { x: baseSW.x, y: baseSW.y - depth };

  // Both visible side faces always share the SE corner (diamond bottom).
  // In normal view: right=NE-SE (screen-right), front=SW-SE (screen-bottom-left).
  // In flipped view the faces swap roles: right=SW-SE (screen-right), front=NE-SE (screen-left).
  if (flipFactor < 0) {
    return {
      top: [topNW, topNE, topSE, topSW],
      right: [topSW, topSE, baseSE, baseSW], // SW-SE edge, now screen-right, darker
      front: [topNE, topSE, baseSE, baseNE], // NE-SE edge, now screen-left, lighter
    };
  }

  return {
    top: [topNW, topNE, topSE, topSW],
    right: [topNE, topSE, baseSE, baseNE],  // NE-SE edge, screen-right, darker
    front: [topSW, topSE, baseSE, baseSW],  // SW-SE edge, screen-bottom-left, lighter
  };
}

/** Calculate canvas dimensions and origin to fit the full HHKB layout. */
export function computeCanvasBounds(
  tileW: number,
  tileH: number,
  maxDepth: number,
  padding: number,
  flipFactor: number = 1,
): { width: number; height: number; originX: number; originY: number } {
  const maxCols = HHKB_ROWS.reduce((max, row) => {
    const rowCols = row.reduce((sum, k) => sum + k.width, 0);
    return Math.max(max, rowCols);
  }, 0);
  const numRows = HHKB_ROWS.length;

  // (col - row) * flipFactor ranges depend on flipFactor sign
  const a = -numRows * flipFactor;
  const b = maxCols * flipFactor;
  const minXfactor = Math.min(a, b);
  const maxXfactor = Math.max(a, b);

  const minX = minXfactor * tileW / 2;
  const maxX = maxXfactor * tileW / 2;
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
