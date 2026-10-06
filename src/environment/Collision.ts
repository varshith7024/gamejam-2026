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
  readonly navRings: readonly (readonly Pt[])[];
  readonly navWaypoints: readonly Pt[];

  constructor(
    readonly walkable: readonly Pt[],
    readonly blockers: readonly (readonly Pt[])[],
    navWaypoints: readonly Pt[] = [],
    navRings?: readonly (readonly Pt[])[],
  ) {
    if (navRings && navRings.length > 0) {
      this.navRings = navRings;
      this.navWaypoints = navRings.flat();
    } else if (navWaypoints.length > 0) {
      this.navRings = [navWaypoints];
      this.navWaypoints = navWaypoints;
    } else {
      this.navRings = [];
      this.navWaypoints = [];
    }
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
    for (let r = 2; r <= 32; r += 2) {
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

      // 4. Corner escape: try reverse tangent along nearby edge so entities never get stuck in acute corners
      if (!moved) {
        for (let i = 0; i < nearby.length; i++) {
          const { edge } = nearby[i];
          const dot = sx * edge.tx + sy * edge.ty;
          const slx = -Math.sign(dot || 1) * subSpeed * 0.6 * edge.tx;
          const sly = -Math.sign(dot || 1) * subSpeed * 0.6 * edge.ty;
          for (const frac of [1.0, 0.5]) {
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
      }

      if (!moved) {
        break; // hard corner
      }
    }

    return { x, y };
  }

  /**
   * Tests if a straight line of sight exists between (x1, y1) and (x2, y2).
   * Checks if either endpoint or midpoint is inside a blocker, if the segment intersects
   * any blocker edge, or passes within padding of a blocker vertex.
   */
  hasLineOfSight(x1: number, y1: number, x2: number, y2: number, padding = 14): boolean {
    const padSq = padding * padding;
    for (const b of this.blockers) {
      if (pointInPolygon(x1, y1, b) || pointInPolygon(x2, y2, b)) {
        return false;
      }
      if (pointInPolygon((x1 + x2) * 0.5, (y1 + y2) * 0.5, b)) {
        return false;
      }
      for (let i = 0; i < b.length; i++) {
        const c = b[i];
        const d = b[(i + 1) % b.length];
        if (lineSegmentsIntersect(x1, y1, x2, y2, c[0], c[1], d[0], d[1])) {
          return false;
        }
        const { distSq, t } = pointToSegmentDistSq(c[0], c[1], x1, y1, x2, y2);
        if (t > 0.001 && t < 0.999 && distSq < padSq) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Tests whether ring rIdx's obstacle currently blocks the line segment from start to target.
   */
  doesRingBlock(rIdx: number, startX: number, startY: number, targetX: number, targetY: number): boolean {
    if (rIdx < 0 || rIdx >= this.navRings.length) return false;
    const ring = this.navRings[rIdx];
    if (ring.length === 0) return false;
    let sumX = 0;
    let sumY = 0;
    for (const p of ring) {
      sumX += p[0];
      sumY += p[1];
    }
    const cx = sumX / ring.length;
    const cy = sumY / ring.length;
    let maxR = 0;
    for (const p of ring) {
      maxR = Math.max(maxR, Math.hypot(p[0] - cx, p[1] - cy));
    }
    const { distSq, t } = pointToSegmentDistSq(cx, cy, startX, startY, targetX, targetY);
    // Obstacle must lie along the segment between start and target (not behind start or beyond target)
    return t >= 0.05 && t <= 0.95 && distSq <= (maxR + 12) * (maxR + 12);
  }

  /**
   * Returns the immediate steering target for navigation from (startX, startY) towards (targetX, targetY).
   * If line of sight is clear, returns (targetX, targetY).
   * If line of sight is blocked by an obstacle, routes through navigation waypoints around the obstacle
   * minimizing the total remaining path distance.
   */
  getSteeringTarget(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    padding = 6,
    prevDir = 0,
    currentWpt = -1,
  ): { x: number; y: number; dir: number; wptIdx: number } {
    // 1. Direct line of sight to target
    if (this.hasLineOfSight(startX, startY, targetX, targetY, padding)) {
      return { x: targetX, y: targetY, dir: 0, wptIdx: -1 };
    }

    if (this.navRings.length === 0) {
      return { x: targetX, y: targetY, dir: 0, wptIdx: -1 };
    }

    // 2. If already navigating along a ring towards a waypoint:
    if (prevDir !== 0 && currentWpt >= 0) {
      const ringIdx = Math.floor(currentWpt / 1000);
      const localIdx = currentWpt % 1000;
      if (ringIdx >= 0 && ringIdx < this.navRings.length) {
        // If entity can already see target with minimal padding, release navigation immediately!
        if (this.hasLineOfSight(startX, startY, targetX, targetY, 4)) {
          return { x: targetX, y: targetY, dir: 0, wptIdx: -1 };
        }

        // If this ring NO LONGER BLOCKS the ray to target (enemy moved past it or behind it),
        // release this ring immediately so it doesn't loop around the cleared prop!
        if (!this.doesRingBlock(ringIdx, startX, startY, targetX, targetY)) {
          currentWpt = -1;
          prevDir = 0;
        } else {
          const ring = this.navRings[ringIdx];
          const N = ring.length;
          if (localIdx >= 0 && localIdx < N) {
            if (!this.hasLineOfSight(startX, startY, ring[localIdx][0], ring[localIdx][1], 4)) {
              currentWpt = -1;
              prevDir = 0;
            } else {
              const dToCurr = Math.hypot(ring[localIdx][0] - startX, ring[localIdx][1] - startY);
              if (dToCurr < 14) {
                // Arrived at current waypoint! Can we see target from this waypoint?
                if (this.hasLineOfSight(ring[localIdx][0], ring[localIdx][1], targetX, targetY, 4)) {
                  return { x: targetX, y: targetY, dir: 0, wptIdx: -1 };
                }
                // Advance to next waypoint along the chosen direction
                const nextLocal = (localIdx + prevDir + N) % N;
                return { x: ring[nextLocal][0], y: ring[nextLocal][1], dir: prevDir, wptIdx: ringIdx * 1000 + nextLocal };
              }
              // Keep moving towards current waypoint
              return { x: ring[localIdx][0], y: ring[localIdx][1], dir: prevDir, wptIdx: currentWpt };
            }
          }
        }
      }
    }

    // 3. New obstacle encounter: find which ring obstructs the path to target closest to start along the ray
    let minRayT = Infinity;
    let chosenRingIdx = -1;
    for (let r = 0; r < this.navRings.length; r++) {
      if (this.doesRingBlock(r, startX, startY, targetX, targetY)) {
        const ring = this.navRings[r];
        let sumX = 0;
        let sumY = 0;
        for (const pt of ring) {
          sumX += pt[0];
          sumY += pt[1];
        }
        const cx = sumX / ring.length;
        const cy = sumY / ring.length;
        const { t } = pointToSegmentDistSq(cx, cy, startX, startY, targetX, targetY);
        if (t < minRayT) {
          minRayT = t;
          chosenRingIdx = r;
        }
      }
    }

    if (chosenRingIdx === -1) {
      return { x: targetX, y: targetY, dir: 0, wptIdx: -1 };
    }

    const wpts = this.navRings[chosenRingIdx];
    const N = wpts.length;
    if (N === 0) {
      return { x: targetX, y: targetY, dir: 0, wptIdx: -1 };
    }

    // Pick entry waypoint visible from entity position, or closest
    let bestEntry = -1;
    let minD = Infinity;
    for (let i = 0; i < N; i++) {
      if (this.hasLineOfSight(startX, startY, wpts[i][0], wpts[i][1], 4)) {
        const d = Math.hypot(wpts[i][0] - startX, wpts[i][1] - startY);
        if (d < minD) {
          minD = d;
          bestEntry = i;
        }
      }
    }
    if (bestEntry === -1) {
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(wpts[i][0] - startX, wpts[i][1] - startY);
        if (d < minD) {
          minD = d;
          bestEntry = i;
        }
      }
    }

    // Pick direction (+1 or -1) that moves closer to target
    const dPlus = Math.hypot(wpts[(bestEntry + 1) % N][0] - targetX, wpts[(bestEntry + 1) % N][1] - targetY);
    const dMinus = Math.hypot(wpts[(bestEntry - 1 + N) % N][0] - targetX, wpts[(bestEntry - 1 + N) % N][1] - targetY);
    const bestDir = dPlus <= dMinus ? 1 : -1;

    const distToEntry = Math.hypot(wpts[bestEntry][0] - startX, wpts[bestEntry][1] - startY);
    if (distToEntry < 14) {
      const nextWpt = (bestEntry + bestDir + N) % N;
      return { x: wpts[nextWpt][0], y: wpts[nextWpt][1], dir: bestDir, wptIdx: chosenRingIdx * 1000 + nextWpt };
    }

    return {
      x: wpts[bestEntry][0],
      y: wpts[bestEntry][1],
      dir: bestDir,
      wptIdx: chosenRingIdx * 1000 + bestEntry,
    };
  }
}
