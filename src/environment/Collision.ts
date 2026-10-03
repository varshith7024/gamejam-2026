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

interface Edge {
  readonly a: Pt;
  readonly b: Pt;
  readonly tx: number;
  readonly ty: number;
  readonly len: number;
}

/**
 * Walkable-area collision with wall sliding:
 * one walkable polygon minus any number of blocker polygons.
 * The player is tested as a foot ellipse (so its FEET, not its sprite, collide).
 * When movement into an obstacle or border is blocked, motion smoothly slides along the boundary.
 */
export class WalkableArea {
  private readonly edges: Edge[] = [];

  constructor(
    readonly walkable: readonly Pt[],
    readonly blockers: readonly (readonly Pt[])[],
  ) {
    const addPoly = (poly: readonly Pt[]) => {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const vx = b[0] - a[0];
        const vy = b[1] - a[1];
        const len = Math.hypot(vx, vy);
        if (len > 1e-4) {
          this.edges.push({ a, b, tx: vx / len, ty: vy / len, len });
        }
      }
    };
    addPoly(walkable);
    for (const b of blockers) addPoly(b);
  }

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

  /** Depenetration: if currently slightly out of bounds, find the nearest standable position. */
  resolvePosition(x: number, y: number, rx: number, ry: number): { x: number; y: number } {
    if (this.canStand(x, y, rx, ry)) return { x, y };
    for (let r = 1; r <= 16; r++) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const tx = x + Math.cos(a) * r;
        const ty = y + Math.sin(a) * r;
        if (this.canStand(tx, ty, rx, ry)) return { x: tx, y: ty };
      }
    }
    return { x, y };
  }

  /** Move by (dx, dy) in small sub-steps, smoothly sliding along boundary edges. */
  move(
    x: number,
    y: number,
    dx: number,
    dy: number,
    rx: number,
    ry: number,
  ): { x: number; y: number } {
    const totalDist = Math.hypot(dx, dy);
    if (totalDist === 0) return { x, y };

    if (!this.canStand(x, y, rx, ry)) {
      const resolved = this.resolvePosition(x, y, rx, ry);
      x = resolved.x;
      y = resolved.y;
    }

    const steps = Math.max(1, Math.ceil(totalDist / 3));
    const sx = dx / steps;
    const sy = dy / steps;
    const subSpeed = Math.hypot(sx, sy);
    const Sy = rx / ry; // ellipse squashing factor for distance calculations

    for (let s = 0; s < steps; s++) {
      // 1. Direct step
      if (this.canStand(x + sx, y + sy, rx, ry)) {
        x += sx;
        y += sy;
        continue;
      }

      // 2. Direct step blocked: find nearby boundary edges to slide along
      const px = x;
      const py = y * Sy;
      const nearby: { edge: Edge; dist: number }[] = [];
      const searchRadius = rx * 2.2;

      for (let i = 0; i < this.edges.length; i++) {
        const e = this.edges[i];
        const ax = e.a[0],
          ay = e.a[1] * Sy;
        const bx = e.b[0],
          by = e.b[1] * Sy;
        const vx = bx - ax,
          vy = by - ay;
        const lenSq = vx * vx + vy * vy;
        const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
        const qx = ax + t * vx,
          qy = ay + t * vy;
        const dist = Math.hypot(px - qx, py - qy);
        if (dist <= searchRadius) {
          nearby.push({ edge: e, dist });
        }
      }
      nearby.sort((a, b) => a.dist - b.dist);

      let moved = false;
      for (let i = 0; i < nearby.length; i++) {
        const { edge } = nearby[i];
        const dot = sx * edge.tx + sy * edge.ty;
        if (Math.abs(dot) < 0.001) continue;

        // Slide along wall tangent, preserving momentum responsive to collision angle
        const normDot = Math.min(1, Math.abs(dot) / subSpeed);
        const slideSpeed = Math.sign(dot) * subSpeed * Math.sqrt(normDot);
        const slx = slideSpeed * edge.tx;
        const sly = slideSpeed * edge.ty;

        for (const frac of [1.0, 0.8, 0.6, 0.4, 0.2]) {
          const testX = x + slx * frac;
          const testY = y + sly * frac;
          if (this.canStand(testX, testY, rx, ry)) {
            x = testX;
            y = testY;
            moved = true;
            break;
          }
        }
        if (moved) break;
      }

      // 3. Fallbacks: pure X or pure Y if still blocked
      if (!moved) {
        if (sx !== 0 && this.canStand(x + sx, y, rx, ry)) {
          x += sx;
          moved = true;
        } else if (sy !== 0 && this.canStand(x, y + sy, rx, ry)) {
          y += sy;
          moved = true;
        }
      }

      if (!moved) {
        break; // hard corner
      }
    }

    return { x, y };
  }
}
