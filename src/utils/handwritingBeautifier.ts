import { Stroke, StrokePoint } from '../types/qaderno';

/**
 * Deterministic client-side Handwriting Beautifier:
 * 1. Groups freehand strokes into horizontal writing lines.
 * 2. Fits a linear baseline per line and gently levels slight tilts (<= 14°) to straight horizontal lines.
 * 3. Smooths stroke jitter (weighted moving average + corner preservation) and normalizes pressure.
 */

interface StrokeEntry {
  stroke: Stroke;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  midY: number;
  height: number;
}

function getBounds(pts: StrokePoint[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    midY: (minY + maxY) / 2,
    height: Math.max(4, maxY - minY),
  };
}

/**
 * Corner-preserving curve smoothing: removes hand tremor while preserving sharp letter tips.
 */
function smoothStrokePoints(pts: StrokePoint[], passes = 2): StrokePoint[] {
  if (pts.length <= 3) return pts;
  let current = pts.map((p) => ({ ...p }));

  for (let pass = 0; pass < passes; pass++) {
    const next: StrokePoint[] = [{ ...current[0] }];
    for (let i = 1; i < current.length - 1; i++) {
      const prev = current[i - 1];
      const cur = current[i];
      const nxt = current[i + 1];

      // Measure turn angle to preserve sharp corners (letters like v, w, M, A, t)
      const v1x = cur.x - prev.x;
      const v1y = cur.y - prev.y;
      const v2x = nxt.x - cur.x;
      const v2y = nxt.y - cur.y;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);

      let isCorner = false;
      if (len1 > 0.5 && len2 > 0.5) {
        const cosTheta = (v1x * v2x + v1y * v2y) / (len1 * len2);
        if (cosTheta < 0.35) {
          isCorner = true;
        }
      }

      if (isCorner) {
        next.push({ ...cur });
      } else {
        next.push({
          x: prev.x * 0.22 + cur.x * 0.56 + nxt.x * 0.22,
          y: prev.y * 0.22 + cur.y * 0.56 + nxt.y * 0.22,
          pressure: prev.pressure * 0.25 + cur.pressure * 0.5 + nxt.pressure * 0.25,
          timestamp: cur.timestamp,
        });
      }
    }
    next.push({ ...current[current.length - 1] });
    current = next;
  }

  return current;
}

export function beautifyHandwritingStrokes(
  allStrokes: Stroke[],
  targetIds?: string[],
  getYOffset: (s: Stroke) => number = () => 0
): Stroke[] {
  const isTarget = (s: Stroke) =>
    s.tool === 'pen' &&
    !s.shapeMeta &&
    s.points.length >= 2 &&
    (!targetIds || targetIds.length === 0 || targetIds.includes(s.id));

  const candidates: StrokeEntry[] = [];
  for (const s of allStrokes) {
    if (!isTarget(s)) continue;
    const yOff = getYOffset(s);
    const absPts = s.points.map((p) => ({ ...p, y: p.y + yOff }));
    const b = getBounds(absPts);
    // Ignore huge drawings (diagrams > 130px tall) so we only straighten handwriting lines
    if (b.height > 130) continue;
    candidates.push({
      stroke: s,
      ...b,
    });
  }

  if (candidates.length === 0) return allStrokes;

  // Sort by vertical center then horizontal X to cluster into lines
  const sorted = [...candidates].sort((a, b) => a.midY - b.midY || a.minX - b.minX);
  const lines: StrokeEntry[][] = [];

  for (const item of sorted) {
    let placed = false;
    for (const line of lines) {
      const avgMidY = line.reduce((acc, it) => acc + it.midY, 0) / line.length;
      const avgH = line.reduce((acc, it) => acc + it.height, 0) / line.length;
      const tolerance = Math.max(22, avgH * 0.95);
      if (Math.abs(item.midY - avgMidY) <= tolerance) {
        line.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lines.push([item]);
    }
  }

  // Build corrected map by stroke id
  const correctedById = new Map<string, Stroke>();

  for (const line of lines) {
    // Compute linear regression over all points in the line to detect line tilt
    const lineAbsPoints: Array<{ x: number; y: number }> = [];
    for (const item of line) {
      const yOff = getYOffset(item.stroke);
      for (const p of item.stroke.points) {
        lineAbsPoints.push({ x: p.x, y: p.y + yOff });
      }
    }

    let sumX = 0,
      sumY = 0;
    for (const p of lineAbsPoints) {
      sumX += p.x;
      sumY += p.y;
    }
    const meanX = sumX / lineAbsPoints.length;
    const meanY = sumY / lineAbsPoints.length;

    let num = 0,
      den = 0;
    for (const p of lineAbsPoints) {
      const dx = p.x - meanX;
      num += dx * (p.y - meanY);
      den += dx * dx;
    }
    const slope = den > 100 ? num / den : 0;
    const angle = Math.atan(slope);
    // Straighten lines tilted within ±14 degrees
    const shouldLevel = line.length >= 2 && Math.abs(angle) <= (14 * Math.PI) / 180;
    const cos = shouldLevel ? Math.cos(-angle) : 1;
    const sin = shouldLevel ? Math.sin(-angle) : 0;

    // Also compute average baseline Y for gentle vertical alignment across words on the same line
    const targetMidY = meanY;

    for (const item of line) {
      const yOff = getYOffset(item.stroke);
      const smoothed = smoothStrokePoints(item.stroke.points, 2);

      // Gentle vertical alignment pull (45% toward the line's leveled baseline)
      const itemMidOffset = (targetMidY - item.midY) * 0.45;

      const leveledPoints: StrokePoint[] = smoothed.map((p) => {
        const absY = p.y + yOff;
        let rx = p.x;
        let ry = absY;
        if (shouldLevel) {
          const dx = p.x - meanX;
          const dy = absY - meanY;
          rx = meanX + dx * cos - dy * sin;
          ry = meanY + dx * sin + dy * cos;
        }
        return {
          ...p,
          x: rx,
          y: ry + itemMidOffset - yOff,
          pressure: Math.max(0.35, Math.min(0.75, p.pressure * 0.6 + 0.22)),
        };
      });

      correctedById.set(item.stroke.id, {
        ...item.stroke,
        points: leveledPoints,
      });
    }
  }

  return allStrokes.map((s) => correctedById.get(s.id) ?? s);
}
