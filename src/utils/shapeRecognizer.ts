import { RecognizedShapeMeta, StrokePoint } from '../types/qaderno';

interface Pt {
  x: number;
  y: number;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pathLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += dist(pts[i - 1], pts[i]);
  }
  return len;
}

/**
 * 1. Uniform point resampling
 */
export function resamplePoints(pts: Pt[], n: number): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0] }));

  const total = pathLength(pts);
  if (total < 1e-3) return Array.from({ length: n }, () => ({ ...pts[0] }));

  const interval = total / (n - 1);
  const src = pts.map((p) => ({ ...p }));
  const resampled: Pt[] = [{ ...src[0] }];
  let D = 0;

  for (let i = 1; i < src.length; i++) {
    const d = dist(src[i - 1], src[i]);
    if (D + d >= interval) {
      const qx = src[i - 1].x + ((interval - D) / d) * (src[i].x - src[i - 1].x);
      const qy = src[i - 1].y + ((interval - D) / d) * (src[i].y - src[i - 1].y);
      const q = { x: qx, y: qy };
      resampled.push(q);
      src.splice(i, 0, q);
      D = 0;
    } else {
      D += d;
    }
  }
  while (resampled.length < n) {
    resampled.push({ ...src[src.length - 1] });
  }
  return resampled.slice(0, n);
}

/**
 * 2. Ramer-Douglas-Peucker polygonal simplification
 */
function perpendicularDistance(pt: Pt, lineStart: Pt, lineEnd: Pt): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-6) return dist(pt, lineStart);
  return Math.abs(dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / mag;
}

export function ramerDouglasPeucker(pts: Pt[], epsilon: number): Pt[] {
  if (pts.length <= 2) return pts;
  let maxDist = 0;
  let index = 0;
  const end = pts.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(pts[i], pts[0], pts[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = ramerDouglasPeucker(pts.slice(0, index + 1), epsilon);
    const right = ramerDouglasPeucker(pts.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[0], pts[end]];
}

function boundingBox(pts: Pt[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function polygonArea(pts: Pt[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * $1 Unistroke Recognizer helpers (normalized template matching)
 */
const NUM_POINTS = 48;
const SQUARE_SIZE = 200;

function centroid(pts: Pt[]): Pt {
  let x = 0,
    y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function indicativeAngle(pts: Pt[]): number {
  const c = centroid(pts);
  return Math.atan2(c.y - pts[0].y, c.x - pts[0].x);
}

function rotateBy(pts: Pt[], radians: number): Pt[] {
  const c = centroid(pts);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

function scaleTo(pts: Pt[], size: number): Pt[] {
  const b = boundingBox(pts);
  const w = Math.max(b.width, 1);
  const h = Math.max(b.height, 1);
  return pts.map((p) => ({
    x: p.x * (size / w),
    y: p.y * (size / h),
  }));
}

function translateToOrigin(pts: Pt[]): Pt[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

function normalizeUnistroke(pts: Pt[]): Pt[] {
  let res = resamplePoints(pts, NUM_POINTS);
  const angle = indicativeAngle(res);
  res = rotateBy(res, -angle);
  res = scaleTo(res, SQUARE_SIZE);
  res = translateToOrigin(res);
  return res;
}

function pathDistance(a: Pt[], b: Pt[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    d += dist(a[i], b[i]);
  }
  return d / a.length;
}

function distanceAtAngle(pts: Pt[], tmpl: Pt[], theta: number): number {
  const newPts = rotateBy(pts, theta);
  return pathDistance(newPts, tmpl);
}

function distanceAtBestAngle(pts: Pt[], tmpl: Pt[]): number {
  const phi = 0.5 * (-1 + Math.sqrt(5));
  let a = -Math.PI / 4;
  let b = Math.PI / 4;
  const threshold = (2 * Math.PI) / 180;
  let x1 = phi * a + (1 - phi) * b;
  let f1 = distanceAtAngle(pts, tmpl, x1);
  let x2 = (1 - phi) * a + phi * b;
  let f2 = distanceAtAngle(pts, tmpl, x2);
  while (Math.abs(b - a) > threshold) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = phi * a + (1 - phi) * b;
      f1 = distanceAtAngle(pts, tmpl, x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - phi) * a + phi * b;
      f2 = distanceAtAngle(pts, tmpl, x2);
    }
  }
  return Math.min(f1, f2);
}

function buildTemplates() {
  // Circle template
  const circlePts: Pt[] = [];
  for (let i = 0; i <= 36; i++) {
    const t = (i / 36) * Math.PI * 2;
    circlePts.push({ x: Math.cos(t) * 100, y: Math.sin(t) * 100 });
  }
  // Rectangle template
  const rectPts: Pt[] = [
    { x: -100, y: -70 },
    { x: 100, y: -70 },
    { x: 100, y: 70 },
    { x: -100, y: 70 },
    { x: -100, y: -70 },
  ];
  // Triangle template
  const triPts: Pt[] = [
    { x: 0, y: -90 },
    { x: 90, y: 70 },
    { x: -90, y: 70 },
    { x: 0, y: -90 },
  ];
  return {
    circle: normalizeUnistroke(circlePts),
    circleRev: normalizeUnistroke([...circlePts].reverse()),
    rectangle: normalizeUnistroke(rectPts),
    rectangleRev: normalizeUnistroke([...rectPts].reverse()),
    triangle: normalizeUnistroke(triPts),
    triangleRev: normalizeUnistroke([...triPts].reverse()),
  };
}

const TEMPLATES = buildTemplates();

function unistrokeScore(candidate: Pt[], template: Pt[]): number {
  const d = distanceAtBestAngle(candidate, template);
  const halfDiag = 0.5 * Math.hypot(SQUARE_SIZE, SQUARE_SIZE);
  return 1 - d / halfDiag;
}

/**
 * Generates clean geometry points for a recognized shape so it renders & hit-tests seamlessly.
 */
export function buildPointsFromShapeMeta(
  meta: RecognizedShapeMeta,
  basePressure = 0.5,
  timestamp = Date.now()
): StrokePoint[] {
  const mk = (x: number, y: number): StrokePoint => ({
    x,
    y,
    pressure: basePressure,
    timestamp,
  });

  if (meta.kind === 'line') {
    const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = meta;
    return [mk(x1, y1), mk(x2, y2)];
  }

  if (meta.kind === 'arrow') {
    const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = meta;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const headLen = Math.min(22, Math.max(11, len * 0.2));
    const headAngle = Math.PI / 6; // 30 deg symmetric V head
    const leftX = x2 - headLen * Math.cos(angle - headAngle);
    const leftY = y2 - headLen * Math.sin(angle - headAngle);
    const rightX = x2 - headLen * Math.cos(angle + headAngle);
    const rightY = y2 - headLen * Math.sin(angle + headAngle);

    // Shaft -> tip -> left barb -> tip -> right barb
    return [mk(x1, y1), mk(x2, y2), mk(leftX, leftY), mk(x2, y2), mk(rightX, rightY)];
  }

  if (meta.kind === 'doubleArrow') {
    const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = meta;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const headLen = Math.min(20, Math.max(10, len * 0.18));
    const headAngle = Math.PI / 6;
    const tipLx = x2 - headLen * Math.cos(angle - headAngle);
    const tipLy = y2 - headLen * Math.sin(angle - headAngle);
    const tipRx = x2 - headLen * Math.cos(angle + headAngle);
    const tipRy = y2 - headLen * Math.sin(angle + headAngle);
    const startLx = x1 + headLen * Math.cos(angle - headAngle);
    const startLy = y1 + headLen * Math.sin(angle - headAngle);
    const startRx = x1 + headLen * Math.cos(angle + headAngle);
    const startRy = y1 + headLen * Math.sin(angle + headAngle);
    return [
      mk(startLx, startLy),
      mk(x1, y1),
      mk(startRx, startRy),
      mk(x1, y1),
      mk(x2, y2),
      mk(tipLx, tipLy),
      mk(x2, y2),
      mk(tipRx, tipRy),
    ];
  }

  if (meta.kind === 'circle' || meta.kind === 'ellipse') {
    const { cx = 0, cy = 0, rx = 30, ry = 30 } = meta;
    const pts: StrokePoint[] = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      pts.push(mk(cx + Math.cos(theta) * rx, cy + Math.sin(theta) * ry));
    }
    return pts;
  }

  if (meta.kind === 'rectangle' || meta.kind === 'square') {
    const { cx = 0, cy = 0, rx = 40, ry = 40 } = meta;
    return [
      mk(cx - rx, cy - ry),
      mk(cx + rx, cy - ry),
      mk(cx + rx, cy + ry),
      mk(cx - rx, cy + ry),
      mk(cx - rx, cy - ry),
    ];
  }

  if (meta.kind === 'diamond') {
    const { cx = 0, cy = 0, rx = 40, ry = 40 } = meta;
    return [mk(cx, cy - ry), mk(cx + rx, cy), mk(cx, cy + ry), mk(cx - rx, cy), mk(cx, cy - ry)];
  }

  if (meta.kind === 'hexagon') {
    const { cx = 0, cy = 0, rx = 40, ry = 40 } = meta;
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= 6; i++) {
      const theta = (i / 6) * Math.PI * 2 - Math.PI / 2;
      pts.push(mk(cx + Math.cos(theta) * rx, cy + Math.sin(theta) * ry));
    }
    return pts;
  }

  if (meta.kind === 'star') {
    const { cx = 0, cy = 0, rx = 40, ry = 40 } = meta;
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= 10; i++) {
      const theta = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const factor = i % 2 === 0 ? 1 : 0.44;
      pts.push(mk(cx + Math.cos(theta) * rx * factor, cy + Math.sin(theta) * ry * factor));
    }
    return pts;
  }

  if (meta.kind === 'triangle' && meta.vertices && meta.vertices.length === 3) {
    const [v0, v1, v2] = meta.vertices;
    return [mk(v0.x, v0.y), mk(v1.x, v1.y), mk(v2.x, v2.y), mk(v0.x, v0.y)];
  }

  return [];
}

/**
 * Builds a shape directly from start -> current pointer coordinates for the Shape Picker tool.
 */
export function createShapeFromDrag(
  kind: RecognizedShapeMeta['kind'],
  start: Pt,
  current: Pt
): { shapeMeta: RecognizedShapeMeta; points: StrokePoint[] } {
  if (kind === 'line' || kind === 'arrow' || kind === 'doubleArrow') {
    const snapped = snapEndpointAngle(start.x, start.y, current.x, current.y);
    const meta: RecognizedShapeMeta = {
      kind,
      x1: start.x,
      y1: start.y,
      x2: snapped.x2,
      y2: snapped.y2,
    };
    return { shapeMeta: meta, points: buildPointsFromShapeMeta(meta) };
  }

  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const isUniform = kind === 'circle' || kind === 'square' || kind === 'star' || kind === 'hexagon';
  const rx = isUniform ? Math.max(12, Math.max(Math.abs(dx), Math.abs(dy)) / 2) : Math.max(12, Math.abs(dx) / 2);
  const ry = isUniform ? rx : Math.max(12, Math.abs(dy) / 2);

  const cx = start.x + (dx >= 0 ? rx : -rx);
  const cy = start.y + (dy >= 0 ? ry : -ry);

  if (kind === 'triangle') {
    const xMin = Math.min(start.x, current.x);
    const xMax = Math.max(start.x, current.x);
    const yMin = Math.min(start.y, current.y);
    const yMax = Math.max(start.y, current.y);
    const meta: RecognizedShapeMeta = {
      kind: 'triangle',
      cx: (xMin + xMax) / 2,
      cy: (yMin + yMax) / 2,
      vertices: [
        { x: (xMin + xMax) / 2, y: yMin },
        { x: xMax, y: yMax },
        { x: xMin, y: yMax },
      ],
    };
    return { shapeMeta: meta, points: buildPointsFromShapeMeta(meta) };
  }

  const meta: RecognizedShapeMeta = {
    kind,
    cx,
    cy,
    rx,
    ry,
  };
  return { shapeMeta: meta, points: buildPointsFromShapeMeta(meta) };
}

/**
 * Snap line angles to 0°, 45°, 90°, 135°, 180° when within ±5°
 */
function snapEndpointAngle(x1: number, y1: number, x2: number, y2: number): { x2: number; y2: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { x2, y2 };
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapAngles = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  for (const target of snapAngles) {
    if (Math.abs(deg - target) <= 5) {
      const rad = (target * Math.PI) / 180;
      return {
        x2: x1 + Math.cos(rad) * len,
        y2: y1 + Math.sin(rad) * len,
      };
    }
  }
  return { x2, y2 };
}

/**
 * Local deterministic Hold-to-Snap recognizer.
 * Runs in < 5ms with zero external API calls.
 */
export function recognizeLocalShape(rawPoints: StrokePoint[]): {
  shapeMeta: RecognizedShapeMeta;
  snappedPoints: StrokePoint[];
} | null {
  if (rawPoints.length < 6) return null;

  const totalLen = pathLength(rawPoints);
  if (totalLen < 24) return null;

  const bbox = boundingBox(rawPoints);
  const diag = Math.hypot(bbox.width, bbox.height);
  if (diag < 18) return null;

  const start = rawPoints[0];
  const end = rawPoints[rawPoints.length - 1];
  const endToEnd = dist(start, end);
  const closureRatio = endToEnd / totalLen;

  // Resample & simplify via Ramer-Douglas-Peucker
  const uniform = resamplePoints(rawPoints, 64);
  const epsilon = Math.max(6, diag * 0.045);
  const simplified = ramerDouglasPeucker(uniform, epsilon);

  // 1. Check Straight Line: directness ratio >= 0.94 or simplified has 2 vertices
  const directness = endToEnd / totalLen;
  if (directness >= 0.93 || (simplified.length === 2 && closureRatio > 0.7)) {
    const snappedEnd = snapEndpointAngle(start.x, start.y, end.x, end.y);
    const meta: RecognizedShapeMeta = {
      kind: 'line',
      x1: start.x,
      y1: start.y,
      x2: snappedEnd.x2,
      y2: snappedEnd.y2,
    };
    return { shapeMeta: meta, snappedPoints: buildPointsFromShapeMeta(meta) };
  }

  // 2. Check Arrow (open stroke with main shaft + V arrowhead near end)
  // Look for a tip vertex around 65%..92% of path where direction reverses/hooks back for the V head
  if (closureRatio > 0.35 && simplified.length >= 3 && simplified.length <= 7) {
    const arrowCandidate = detectArrow(rawPoints, simplified);
    if (arrowCandidate) {
      return {
        shapeMeta: arrowCandidate,
        snappedPoints: buildPointsFromShapeMeta(arrowCandidate),
      };
    }
  }

  // 3. Closed shapes analysis (Circle/Ellipse, Triangle, Rectangle/Square)
  const isClosed = closureRatio < 0.28 || endToEnd < Math.max(32, diag * 0.32);
  if (!isClosed) return null;

  // Clean closed polygon for circularity & vertex tests
  const closedPoly = [...simplified];
  if (dist(closedPoly[0], closedPoly[closedPoly.length - 1]) > 1) {
    closedPoly.push(closedPoly[0]);
  }
  const perim = pathLength(uniform);
  const area = polygonArea(uniform);
  const circularity = perim > 0 ? (4 * Math.PI * area) / (perim * perim) : 0;

  // $1 Unistroke template scores
  const norm = normalizeUnistroke(rawPoints);
  const circleScore = Math.max(
    unistrokeScore(norm, TEMPLATES.circle),
    unistrokeScore(norm, TEMPLATES.circleRev)
  );
  const rectScore = Math.max(
    unistrokeScore(norm, TEMPLATES.rectangle),
    unistrokeScore(norm, TEMPLATES.rectangleRev)
  );
  const triScore = Math.max(
    unistrokeScore(norm, TEMPLATES.triangle),
    unistrokeScore(norm, TEMPLATES.triangleRev)
  );

  // Dominant vertices (excluding duplicate closing vertex)
  const fineSimplified = ramerDouglasPeucker(uniform, Math.max(8, diag * 0.065));
  const vertexCount =
    dist(fineSimplified[0], fineSimplified[fineSimplified.length - 1]) < diag * 0.2
      ? fineSimplified.length - 1
      : fineSimplified.length;

  // Check Circle / Ellipse first when high circularity or no sharp corners
  if ((circularity > 0.74 && vertexCount >= 5) || (circleScore > 0.8 && circleScore >= rectScore && circleScore >= triScore)) {
    const aspect = bbox.width / Math.max(bbox.height, 1);
    const isPerfectCircle = aspect >= 0.85 && aspect <= 1.15;
    const rx = isPerfectCircle ? (bbox.width + bbox.height) / 4 : bbox.width / 2;
    const ry = isPerfectCircle ? rx : bbox.height / 2;
    const meta: RecognizedShapeMeta = {
      kind: isPerfectCircle ? 'circle' : 'ellipse',
      cx: bbox.cx,
      cy: bbox.cy,
      rx,
      ry,
    };
    return { shapeMeta: meta, snappedPoints: buildPointsFromShapeMeta(meta) };
  }

  // Check Triangle (3 dominant vertices or best $1 triangle match)
  if (vertexCount === 3 || (triScore > 0.72 && triScore > rectScore + 0.04)) {
    const verts = extractThreeVertices(fineSimplified, bbox);
    const meta: RecognizedShapeMeta = {
      kind: 'triangle',
      cx: bbox.cx,
      cy: bbox.cy,
      vertices: verts,
    };
    return { shapeMeta: meta, snappedPoints: buildPointsFromShapeMeta(meta) };
  }

  // Check Rectangle / Square (4 dominant vertices or rectangularity + orthogonality)
  const rectAreaRatio = area / Math.max(bbox.width * bbox.height, 1);
  if (
    vertexCount === 4 ||
    (rectScore > 0.7 && rectAreaRatio > 0.65) ||
    (rectAreaRatio > 0.76 && vertexCount >= 4 && vertexCount <= 6)
  ) {
    const aspect = bbox.width / Math.max(bbox.height, 1);
    const isSquare = aspect >= 0.85 && aspect <= 1.15;
    const rx = isSquare ? (bbox.width + bbox.height) / 4 : bbox.width / 2;
    const ry = isSquare ? rx : bbox.height / 2;
    const meta: RecognizedShapeMeta = {
      kind: isSquare ? 'square' : 'rectangle',
      cx: bbox.cx,
      cy: bbox.cy,
      rx,
      ry,
    };
    return { shapeMeta: meta, snappedPoints: buildPointsFromShapeMeta(meta) };
  }

  // Fallback ellipse if closed & smooth enough
  if (circularity > 0.58) {
    const aspect = bbox.width / Math.max(bbox.height, 1);
    const isPerfectCircle = aspect >= 0.85 && aspect <= 1.15;
    const rx = isPerfectCircle ? (bbox.width + bbox.height) / 4 : bbox.width / 2;
    const ry = isPerfectCircle ? rx : bbox.height / 2;
    const meta: RecognizedShapeMeta = {
      kind: isPerfectCircle ? 'circle' : 'ellipse',
      cx: bbox.cx,
      cy: bbox.cy,
      rx,
      ry,
    };
    return { shapeMeta: meta, snappedPoints: buildPointsFromShapeMeta(meta) };
  }

  return null;
}

function detectArrow(rawPoints: Pt[], simplified: Pt[]): RecognizedShapeMeta | null {
  if (simplified.length < 3) return null;
  const start = simplified[0];

  // Try candidate tip indices in the latter half of the simplified polyline
  let bestTipIdx = -1;
  let maxDistFromStart = 0;
  for (let i = 1; i < simplified.length; i++) {
    const d = dist(start, simplified[i]);
    if (d > maxDistFromStart) {
      maxDistFromStart = d;
      bestTipIdx = i;
    }
  }

  // If tip is the last vertex, check if penultimate segments form a barb (less common)
  // Usually user draws shaft -> tip -> barb1 -> back to tip -> barb2 (so tip is before end!)
  if (bestTipIdx <= 0 || bestTipIdx === simplified.length - 1 || maxDistFromStart < 28) {
    // Also check raw points for a crisp shaft + single/double barb reversal
    let rawTipIdx = -1;
    let rawMax = 0;
    for (let i = Math.floor(rawPoints.length * 0.45); i < rawPoints.length - 2; i++) {
      const d = dist(rawPoints[0], rawPoints[i]);
      if (d > rawMax) {
        rawMax = d;
        rawTipIdx = i;
      }
    }
    if (rawTipIdx < 0) return null;
    const tip = rawPoints[rawTipIdx];
    const shaftLen = dist(rawPoints[0], tip);
    const tailLen = pathLength(rawPoints.slice(rawTipIdx));
    if (shaftLen < 28 || tailLen < 8 || tailLen > shaftLen * 0.85) return null;

    // Verify shaft straightness
    const shaftRaw = rawPoints.slice(0, rawTipIdx + 1);
    const shaftDirectness = shaftLen / Math.max(pathLength(shaftRaw), 1);
    if (shaftDirectness < 0.88) return null;

    const snappedTip = snapEndpointAngle(rawPoints[0].x, rawPoints[0].y, tip.x, tip.y);
    return {
      kind: 'arrow',
      x1: rawPoints[0].x,
      y1: rawPoints[0].y,
      x2: snappedTip.x2,
      y2: snappedTip.y2,
    };
  }

  const tip = simplified[bestTipIdx];
  const shaftDirectness = maxDistFromStart / Math.max(pathLength(simplified.slice(0, bestTipIdx + 1)), 1);
  const headPathLen = pathLength(simplified.slice(bestTipIdx));

  if (shaftDirectness < 0.88) return null;
  if (headPathLen < 8 || headPathLen > maxDistFromStart * 0.9) return null;

  // Ensure the head folds backward relative to shaft direction
  const shaftVec = { x: tip.x - start.x, y: tip.y - start.y };
  const barbVec = { x: simplified[bestTipIdx + 1].x - tip.x, y: simplified[bestTipIdx + 1].y - tip.y };
  const dot = shaftVec.x * barbVec.x + shaftVec.y * barbVec.y;
  if (dot >= 0) return null; // Not pointing backward like an arrowhead barb

  const snappedTip = snapEndpointAngle(start.x, start.y, tip.x, tip.y);
  return {
    kind: 'arrow',
    x1: start.x,
    y1: start.y,
    x2: snappedTip.x2,
    y2: snappedTip.y2,
  };
}

function extractThreeVertices(pts: Pt[], bbox: ReturnType<typeof boundingBox>): Array<{ x: number; y: number }> {
  // Remove closing duplicate if present
  const cleaned =
    pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 25 ? pts.slice(0, -1) : [...pts];

  if (cleaned.length === 3) {
    return cleaned.map((p) => ({ x: p.x, y: p.y }));
  }

  // Pick 3 vertices maximizing triangle area
  if (cleaned.length > 3) {
    let bestArea = -1;
    let bestTri: [Pt, Pt, Pt] = [cleaned[0], cleaned[1], cleaned[2]];
    for (let i = 0; i < cleaned.length; i++) {
      for (let j = i + 1; j < cleaned.length; j++) {
        for (let k = j + 1; k < cleaned.length; k++) {
          const area = polygonArea([cleaned[i], cleaned[j], cleaned[k]]);
          if (area > bestArea) {
            bestArea = area;
            bestTri = [cleaned[i], cleaned[j], cleaned[k]];
          }
        }
      }
    }
    return bestTri.map((p) => ({ x: p.x, y: p.y }));
  }

  return [
    { x: bbox.cx, y: bbox.minY },
    { x: bbox.maxX, y: bbox.maxY },
    { x: bbox.minX, y: bbox.maxY },
  ];
}

/**
 * Real-time resize/reorient after Hold-to-Snap while pointer is still held down.
 */
export function resizeSnappedShapeLive(
  initialMeta: RecognizedShapeMeta,
  currentPt: Pt
): { shapeMeta: RecognizedShapeMeta; points: StrokePoint[] } {
  if (initialMeta.kind === 'line' || initialMeta.kind === 'arrow') {
    const x1 = initialMeta.x1 ?? 0;
    const y1 = initialMeta.y1 ?? 0;
    const snapped = snapEndpointAngle(x1, y1, currentPt.x, currentPt.y);
    const updated: RecognizedShapeMeta = {
      ...initialMeta,
      x1,
      y1,
      x2: snapped.x2,
      y2: snapped.y2,
    };
    return { shapeMeta: updated, points: buildPointsFromShapeMeta(updated) };
  }

  const cx = initialMeta.cx ?? currentPt.x;
  const cy = initialMeta.cy ?? currentPt.y;

  if (initialMeta.kind === 'circle' || initialMeta.kind === 'square') {
    const r = Math.max(12, Math.hypot(currentPt.x - cx, currentPt.y - cy));
    const updated: RecognizedShapeMeta = {
      ...initialMeta,
      cx,
      cy,
      rx: initialMeta.kind === 'square' ? r * Math.SQRT1_2 : r,
      ry: initialMeta.kind === 'square' ? r * Math.SQRT1_2 : r,
    };
    return { shapeMeta: updated, points: buildPointsFromShapeMeta(updated) };
  }

  if (initialMeta.kind === 'ellipse' || initialMeta.kind === 'rectangle') {
    const rx = Math.max(12, Math.abs(currentPt.x - cx));
    const ry = Math.max(12, Math.abs(currentPt.y - cy));
    const updated: RecognizedShapeMeta = { ...initialMeta, cx, cy, rx, ry };
    return { shapeMeta: updated, points: buildPointsFromShapeMeta(updated) };
  }

  if (initialMeta.kind === 'triangle' && initialMeta.vertices) {
    const origVerts = initialMeta.vertices;
    const maxOrigDist = Math.max(
      12,
      ...origVerts.map((v) => Math.hypot(v.x - cx, v.y - cy))
    );
    const newDist = Math.max(14, Math.hypot(currentPt.x - cx, currentPt.y - cy));
    const scale = newDist / maxOrigDist;
    const scaledVerts = origVerts.map((v) => ({
      x: cx + (v.x - cx) * scale,
      y: cy + (v.y - cy) * scale,
    }));
    const updated: RecognizedShapeMeta = { ...initialMeta, vertices: scaledVerts };
    return { shapeMeta: updated, points: buildPointsFromShapeMeta(updated) };
  }

  return { shapeMeta: initialMeta, points: buildPointsFromShapeMeta(initialMeta) };
}
