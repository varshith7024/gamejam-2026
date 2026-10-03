export type Pt = readonly [number, number];

export function pointInPolygon(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ellipsePolygon(cx: number, cy: number, rx: number, ry: number, steps = 16): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/**
 * Simple walkable-area collision: one walkable polygon minus any number of blocker polygons.
 * The player is tested as a small foot ellipse (so its FEET, not its sprite, collide).
 */
export class WalkableArea {
  constructor(
    readonly walkable: readonly Pt[],
    readonly blockers: readonly (readonly Pt[])[],
  ) {}

  contains(x: number, y: number): boolean {
    if (!pointInPolygon(x, y, this.walkable)) return false;
    return !this.blockers.some((b) => pointInPolygon(x, y, b));
  }

  canStand(x: number, y: number, rx: number, ry: number): boolean {
    if (!this.contains(x, y)) return false;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (!this.contains(x + Math.cos(a) * rx, y + Math.sin(a) * ry)) return false;
    }
    return true;
  }

  /** Move by (dx, dy) in small sub-steps, sliding along edges (tries full move, then X-only, then Y-only). */
  move(x: number, y: number, dx: number, dy: number, rx: number, ry: number): { x: number; y: number } {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (this.canStand(x + sx, y + sy, rx, ry)) {
        x += sx;
        y += sy;
      } else if (sx !== 0 && this.canStand(x + sx, y, rx, ry)) {
        x += sx;
      } else if (sy !== 0 && this.canStand(x, y + sy, rx, ry)) {
        y += sy;
      }
    }
    return { x, y };
  }
}
