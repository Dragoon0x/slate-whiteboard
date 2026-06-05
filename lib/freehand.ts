import { getStroke } from 'perfect-freehand';
import type { Point } from './types';

// Produce a filled outline polygon for a freehand stroke. The renderer turns the
// returned points into a Path2D. We cache by points-array identity since our
// element updates are immutable (a new points array means the stroke changed).
const cache = new WeakMap<Point[], { size: number; outline: number[][] }>();

export function freehandOutline(points: Point[], size: number): number[][] {
  if (points.length === 0) return [];
  const cached = cache.get(points);
  if (cached && cached.size === size) return cached.outline;

  const outline = getStroke(
    points.map((p) => [p.x, p.y, 0.5]),
    {
      size: Math.max(size * 1.4, 1.5),
      thinning: 0.55,
      smoothing: 0.55,
      streamline: 0.45,
      simulatePressure: true,
      last: true,
    },
  );
  cache.set(points, { size, outline });
  return outline;
}
