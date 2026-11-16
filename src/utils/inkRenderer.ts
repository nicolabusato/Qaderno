import { Stroke, StrokePoint } from '../types/qaderno';

export interface RenderStrokeOptions {
  yOffset?: number;
  selected?: boolean;
  dpr?: number;
}

/**
 * Computes stroke bounding box with optional y-offset.
 */
export function getStrokeBounds(stroke: Stroke, yOffset = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of stroke.points) {
    const py = p.y + yOffset;
    if (p.x < minX) minX = p.x;
    if (py < minY) minY = py;
    if (p.x > maxX) maxX = p.x;
    if (py > maxY) maxY = py;
  }
  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  const pad = stroke.width / 2 + 4;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/**
 * Renders a single stroke (freehand Catmull-Rom / dynamic pressure or snapped geometry) onto 2D canvas.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  opts: RenderStrokeOptions = {}
) {
  const { yOffset = 0, selected = false } = opts;
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;

    if (stroke.shapeMeta) {
      drawShapeGeometry(ctx, stroke, yOffset);
    } else {
      drawSmoothPolyline(ctx, pts, yOffset);
    }
  } else {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;

    if (stroke.shapeMeta) {
      ctx.lineWidth = stroke.width;
      drawShapeGeometry(ctx, stroke, yOffset);
    } else if (pts.length === 1) {
      const p = pts[0];
      const r = Math.max(0.8, (stroke.width * (0.65 + p.pressure * 0.7)) / 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y + yOffset, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawVariableWidthSpline(ctx, pts, stroke.width, yOffset);
    }
  }

  if (selected) {
    const b = getStrokeBounds(stroke, yOffset);
    ctx.strokeStyle = 'rgba(28, 28, 30, 0.45)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(b.minX, b.minY, b.width, b.height);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawSmoothPolyline(ctx: CanvasRenderingContext2D, pts: StrokePoint[], yOffset: number) {
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y + yOffset, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y + yOffset);
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2 + yOffset;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y + yOffset, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y + yOffset);
  ctx.stroke();
}

function drawVariableWidthSpline(
  ctx: CanvasRenderingContext2D,
  pts: StrokePoint[],
  baseWidth: number,
  yOffset: number
) {
  let prevWidth = computePointWidth(pts[0], pts[1], baseWidth);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;

    const targetWidth = computePointWidth(p1, p2, baseWidth);
    const segWidth = prevWidth * 0.65 + targetWidth * 0.35;
    prevWidth = segWidth;

    // Catmull-Rom to cubic Bezier control points
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6 + yOffset;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6 + yOffset;

    ctx.beginPath();
    ctx.lineWidth = segWidth;
    ctx.moveTo(p1.x, p1.y + yOffset);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y + yOffset);
    ctx.stroke();
  }
}

function computePointWidth(p1: StrokePoint, p2: StrokePoint, baseWidth: number): number {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const dt = Math.max(1, p2.timestamp - p1.timestamp);
  const velocity = dist / dt; // px per ms
  const velFactor = Math.max(0.74, Math.min(1.16, 1.08 - velocity * 0.14));
  const p = p2.pressure > 0 ? p2.pressure : 0.5;
  const pressFactor = 0.62 + p * 0.76;
  return Math.max(0.8, baseWidth * pressFactor * velFactor);
}

function drawShapeGeometry(ctx: CanvasRenderingContext2D, stroke: Stroke, yOffset: number) {
  const meta = stroke.shapeMeta;
  if (!meta) return;

  if (meta.kind === 'line') {
    ctx.beginPath();
    ctx.moveTo(meta.x1 ?? 0, (meta.y1 ?? 0) + yOffset);
    ctx.lineTo(meta.x2 ?? 0, (meta.y2 ?? 0) + yOffset);
    ctx.stroke();
    return;
  }

  if (meta.kind === 'arrow' || meta.kind === 'doubleArrow') {
    const x1 = meta.x1 ?? 0;
    const y1 = (meta.y1 ?? 0) + yOffset;
    const x2 = meta.x2 ?? 0;
    const y2 = (meta.y2 ?? 0) + yOffset;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const headLen = Math.min(22, Math.max(11, len * 0.2));
    const headAngle = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2 - headLen * Math.cos(angle - headAngle), y2 - headLen * Math.sin(angle - headAngle));
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + headAngle), y2 - headLen * Math.sin(angle + headAngle));
    ctx.stroke();

    if (meta.kind === 'doubleArrow') {
      ctx.beginPath();
      ctx.moveTo(x1 + headLen * Math.cos(angle - headAngle), y1 + headLen * Math.sin(angle - headAngle));
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 + headLen * Math.cos(angle + headAngle), y1 + headLen * Math.sin(angle + headAngle));
      ctx.stroke();
    }
    return;
  }

  if (meta.kind === 'circle' || meta.kind === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      meta.cx ?? 0,
      (meta.cy ?? 0) + yOffset,
      Math.max(2, meta.rx ?? 20),
      Math.max(2, meta.ry ?? 20),
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    return;
  }

  if (meta.kind === 'rectangle' || meta.kind === 'square') {
    const cx = meta.cx ?? 0;
    const cy = (meta.cy ?? 0) + yOffset;
    const rx = meta.rx ?? 30;
    const ry = meta.ry ?? 30;
    ctx.beginPath();
    ctx.rect(cx - rx, cy - ry, rx * 2, ry * 2);
    ctx.stroke();
    return;
  }

  if (meta.kind === 'diamond') {
    const cx = meta.cx ?? 0;
    const cy = (meta.cy ?? 0) + yOffset;
    const rx = meta.rx ?? 30;
    const ry = meta.ry ?? 30;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    ctx.stroke();
    return;
  }

  if (meta.kind === 'hexagon') {
    const cx = meta.cx ?? 0;
    const cy = (meta.cy ?? 0) + yOffset;
    const rx = meta.rx ?? 30;
    const ry = meta.ry ?? 30;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const theta = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(theta) * rx;
      const py = cy + Math.sin(theta) * ry;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    return;
  }

  if (meta.kind === 'star') {
    const cx = meta.cx ?? 0;
    const cy = (meta.cy ?? 0) + yOffset;
    const rx = meta.rx ?? 30;
    const ry = meta.ry ?? 30;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const theta = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const factor = i % 2 === 0 ? 1 : 0.44;
      const px = cx + Math.cos(theta) * rx * factor;
      const py = cy + Math.sin(theta) * ry * factor;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    return;
  }

  if (meta.kind === 'triangle' && meta.vertices && meta.vertices.length === 3) {
    const [v0, v1, v2] = meta.vertices;
    ctx.beginPath();
    ctx.moveTo(v0.x, v0.y + yOffset);
    ctx.lineTo(v1.x, v1.y + yOffset);
    ctx.lineTo(v2.x, v2.y + yOffset);
    ctx.closePath();
    ctx.stroke();
  }
}

/**
 * Smart horizontal straightening for highlighter when drawn predominantly horizontally.
 */
export function maybeStraightenHighlighter(pts: StrokePoint[]): StrokePoint[] {
  if (pts.length < 4) return pts;
  const start = pts[0];
  const end = pts[pts.length - 1];
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  let maxDeviationY = 0;
  const avgY = (start.y + end.y) / 2;
  for (const p of pts) {
    const dev = Math.abs(p.y - avgY);
    if (dev > maxDeviationY) maxDeviationY = dev;
  }
  if (dx > 40 && dy < 16 && maxDeviationY < 16) {
    return [
      { ...start, y: avgY },
      { ...end, y: avgY },
    ];
  }
  return pts;
}

/**
 * Distance from point to segment for accurate hit-testing.
 */
function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function isPointNearStroke(
  px: number,
  py: number,
  stroke: Stroke,
  radius: number,
  yOffset = 0
): boolean {
  const pts = stroke.points;
  if (pts.length === 0) return false;
  const threshold = radius + stroke.width / 2;
  if (pts.length === 1) {
    return Math.hypot(px - pts[0].x, py - (pts[0].y + yOffset)) <= threshold;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distPointToSegment(
      px,
      py,
      pts[i].x,
      pts[i].y + yOffset,
      pts[i + 1].x,
      pts[i + 1].y + yOffset
    );
    if (d <= threshold) return true;
  }
  return false;
}

/**
 * Precision eraser: splits intersected strokes into non-erased sub-segments.
 */
export function applyPrecisionEraser(
  strokes: Stroke[],
  eraserX: number,
  eraserY: number,
  eraserRadius: number,
  getYOffset: (stroke: Stroke) => number
): { updated: Stroke[]; changed: boolean } {
  let changed = false;
  const result: Stroke[] = [];

  for (const stroke of strokes) {
    const yOff = getYOffset(stroke);
    if (!isPointNearStroke(eraserX, eraserY, stroke, eraserRadius, yOff)) {
      result.push(stroke);
      continue;
    }

    changed = true;
    // Densify shape strokes before splitting so shapes erase cleanly
    const sourcePts = stroke.shapeMeta ? densifyPoints(stroke.points, 6) : stroke.points;
    const hitRadius = eraserRadius + stroke.width * 0.35;

    const segments: StrokePoint[][] = [];
    let current: StrokePoint[] = [];

    for (const pt of sourcePts) {
      const inside = Math.hypot(pt.x - eraserX, pt.y + yOff - eraserY) <= hitRadius;
      if (inside) {
        if (current.length >= 2) {
          segments.push(current);
        }
        current = [];
      } else {
        current.push(pt);
      }
    }
    if (current.length >= 2) {
      segments.push(current);
    }

    segments.forEach((segPts, idx) => {
      result.push({
        ...stroke,
        id: idx === 0 ? stroke.id : `${stroke.id}_seg_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        points: segPts,
        shapeMeta: undefined,
      });
    });
  }

  return { updated: result, changed };
}

function densifyPoints(pts: StrokePoint[], stepPx: number): StrokePoint[] {
  if (pts.length < 2) return pts;
  const out: StrokePoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / stepPx));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure: a.pressure + (b.pressure - a.pressure) * t,
        timestamp: a.timestamp + (b.timestamp - a.timestamp) * t,
      });
    }
  }
  return out;
}

/**
 * Ray-casting point-in-polygon for Lasso selection.
 */
export function isPointInPolygon(px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isStrokeSelectedByLasso(
  stroke: Stroke,
  polygon: Array<{ x: number; y: number }>,
  yOffset = 0
): boolean {
  if (stroke.points.length === 0) return false;
  let insideCount = 0;
  for (const p of stroke.points) {
    if (isPointInPolygon(p.x, p.y + yOffset, polygon)) {
      insideCount++;
    }
  }
  return insideCount >= Math.max(1, Math.ceil(stroke.points.length * 0.35));
}

export function translateStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  const nextPoints = stroke.points.map((p) => ({
    ...p,
    x: p.x + dx,
    y: p.y + dy,
  }));
  let nextMeta = stroke.shapeMeta;
  if (nextMeta) {
    nextMeta = {
      ...nextMeta,
      x1: nextMeta.x1 !== undefined ? nextMeta.x1 + dx : undefined,
      y1: nextMeta.y1 !== undefined ? nextMeta.y1 + dy : undefined,
      x2: nextMeta.x2 !== undefined ? nextMeta.x2 + dx : undefined,
      y2: nextMeta.y2 !== undefined ? nextMeta.y2 + dy : undefined,
      cx: nextMeta.cx !== undefined ? nextMeta.cx + dx : undefined,
      cy: nextMeta.cy !== undefined ? nextMeta.cy + dy : undefined,
      vertices: nextMeta.vertices?.map((v) => ({ x: v.x + dx, y: v.y + dy })),
    };
  }
  return {
    ...stroke,
    points: nextPoints,
    shapeMeta: nextMeta,
  };
}
