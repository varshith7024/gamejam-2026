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

export function lineSegmentsIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): boolean {
  const d1 = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
  const d2 = (x4 - x3) * (y2 - y3) - (y4 - y3) * (x2 - x3);
  const d3 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const d4 = (x2 - x1) * (y4 - y1) - (y2 - y1) * (x4 - x1);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

export function pointToSegmentDistSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { distSq: number; t: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { distSq: (px - x1) * (px - x1) + (py - y1) * (py - y1), t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const ex = px - projX;
  const ey = py - projY;
  return { distSq: ex * ex + ey * ey, t };
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
  readonly navWaypoints: readonly Pt[];

  constructor(
    readonly walkable: readonly Pt[],
    readonly blockers: readonly (readonly Pt[])[],
    navWaypoints: readonly Pt[] = [],
  ) {
    this.navWaypoints = navWaypoints;
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

  /**
   * Tests if a straight line of sight exists between (x1, y1) and (x2, y2).
   * Checks if the segment intersects any blocker edge, or passes within padding of a blocker vertex.
   */
  hasLineOfSight(x1: number, y1: number, x2: number, y2: number, padding = 14): boolean {
    const padSq = padding * padding;
    for (const b of this.blockers) {
      for (let i = 0; i < b.length; i++) {
        const c = b[i];
        const d = b[(i + 1) % b.length];
        if (lineSegmentsIntersect(x1, y1, x2, y2, c[0], c[1], d[0], d[1])) {
          return false;
        }
        const { distSq, t } = pointToSegmentDistSq(c[0], c[1], x1, y1, x2, y2);
        if (t > 0.08 && t < 0.92 && distSq < padSq) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Returns the immediate steering target for navigation from (startX, startY) towards (targetX, targetY).
   * If line of sight is clear, returns (targetX, targetY).
   * If line of sight is blocked by an obstacle, routes through navigation waypoints around the obstacle.
   */
  getSteeringTarget(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    padding = 14,
  ): { x: number; y: number } {
    if (this.hasLineOfSight(startX, startY, targetX, targetY, padding)) {
      return { x: targetX, y: targetY };
    }

    const wpts = this.navWaypoints;
    if (wpts.length === 0) {
      return { x: targetX, y: targetY };
    }

    const N = wpts.length;
    // Edge distances along the navigation ring
    const edgeDists: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = wpts[i];
      const b = wpts[(i + 1) % N];
      edgeDists.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
    }

    const loopDist = (i: number, j: number): { dist: number; dir: number } => {
      if (i === j) return { dist: 0, dir: 1 };
      let distCW = 0;
      let curr = i;
      while (curr !== j) {
        distCW += edgeDists[curr];
        curr = (curr + 1) % N;
      }
      let distCCW = 0;
      curr = i;
      while (curr !== j) {
        curr = (curr - 1 + N) % N;
        distCCW += edgeDists[curr];
      }
      return distCW <= distCCW ? { dist: distCW, dir: 1 } : { dist: distCCW, dir: -1 };
    };

    let bestDist = Infinity;
    let bestI = -1;
    let bestDir = 1;

    for (let i = 0; i < N; i++) {
      if (!this.hasLineOfSight(startX, startY, wpts[i][0], wpts[i][1], padding)) continue;
      const dStartToI = Math.hypot(wpts[i][0] - startX, wpts[i][1] - startY);

      for (let j = 0; j < N; j++) {
        if (!this.hasLineOfSight(wpts[j][0], wpts[j][1], targetX, targetY, padding)) continue;
        const dJToTarget = Math.hypot(targetX - wpts[j][0], targetY - wpts[j][1]);
        const { dist: dRing, dir } = loopDist(i, j);
        const total = dStartToI + dRing + dJToTarget;
        if (total < bestDist) {
          bestDist = total;
          bestI = i;
          bestDir = dir;
        }
      }
    }

    if (bestI === -1) {
      // Fallback: pick closest waypoint to start
      let closestDist = Infinity;
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(wpts[i][0] - startX, wpts[i][1] - startY);
        if (d < closestDist) {
          closestDist = d;
          bestI = i;
        }
      }
    }

    if (bestI === -1) {
      return { x: targetX, y: targetY };
    }

    // If already at or very close to waypoint bestI, advance along ring in the chosen direction
    const distToBestI = Math.hypot(wpts[bestI][0] - startX, wpts[bestI][1] - startY);
    if (distToBestI < 25) {
      const nextI = (bestI + bestDir + N) % N;
      return { x: wpts[nextI][0], y: wpts[nextI][1] };
    }

    return { x: wpts[bestI][0], y: wpts[bestI][1] };
  }
}
