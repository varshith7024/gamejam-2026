import Phaser from 'phaser';
import { WalkableArea, ellipsePolygon, type Pt } from './Collision';
import { LEVEL1 } from './level1Data';

const BASE = 'assets/level1/';
const MASTER_KEY = 'level1_master';
const OCCLUDER_MANIFEST_KEY = 'level1_occluders';

/** Depth layout. Y-sorted things (props, player, occluders) use their ground Y (0..1023) as depth. */
export const DEPTH = {
  base: -10000, // master image: background + midground + floor + baked props
  groundDecal: -9000, // flat decals on the floor, always under the player
  atmosphere: 50000, // fog / motes above all world objects
  screen: 100000, // vignette / title card
};

type OccluderEntry = { key: string; file: string; x: number; y: number; sortY: number };

/**
 * Builds the Level 1 scene from the processed assets:
 *   master image (base) -> y-sorted props -> occluder cut-outs of the master (walk-behind).
 * The master image is the canonical camera, so it is drawn at 1:1 and everything else is placed in its pixel space.
 */
export class Level1Environment {
  readonly area: WalkableArea;
  private debugGfx?: Phaser.GameObjects.Graphics;
  private sortLines: { x0: number; x1: number; y: number }[] = [];

  constructor(private scene: Phaser.Scene) {
    const blockers: (readonly Pt[])[] = [
      ...LEVEL1.blockers,
      ...LEVEL1.ellipseBlockers.map(([cx, cy, rx, ry]) => ellipsePolygon(cx, cy, rx, ry)),
      ...LEVEL1.props
        .filter((p) => p.footprint)
        .map((p) => ellipsePolygon(p.x, p.y, p.footprint![0], p.footprint![1])),
    ];
    this.area = new WalkableArea(LEVEL1.walkable, blockers);
    this.build();
  }

  /** Queue every texture this level needs. Occluder images are discovered from the generated manifest. */
  static preload(scene: Phaser.Scene) {
    scene.load.setPath(BASE);
    scene.load.image(MASTER_KEY, 'veil_master.png');
    for (const key of new Set(LEVEL1.props.map((p) => p.key)))
      scene.load.image(`prop_${key}`, `props/prop_${key}.png`);
    scene.load.json(OCCLUDER_MANIFEST_KEY, 'occluders.json');
    scene.load.once(
      `filecomplete-json-${OCCLUDER_MANIFEST_KEY}`,
      (_k: string, _t: string, list: OccluderEntry[]) => {
        // The loader path is global state (Atmosphere.preload changes it), so set it again before queueing.
        scene.load.setPath(BASE);
        for (const o of list) scene.load.image(o.key, o.file);
      },
    );
  }

  private build() {
    const { width, height } = LEVEL1.world;
    this.scene.add
      .image(0, 0, MASTER_KEY)
      .setOrigin(0, 0)
      .setDepth(DEPTH.base)
      .setDisplaySize(width, height);

    // Props: origin sits on the ground-contact point, depth = ground Y so the player sorts in front/behind.
    for (const p of LEVEL1.props) {
      const img = this.scene.add
        .image(p.x, p.y, `prop_${p.key}`)
        .setOrigin(0.5, 0.86)
        .setScale(p.scale);
      img.setDepth(p.flat ? DEPTH.groundDecal : p.y);
      if (!p.flat) this.sortLines.push({ x0: p.x - 30, x1: p.x + 30, y: p.y });
    }

    // Occluders: pieces of the master drawn again ABOVE the player while the player is behind them.
    const list = this.scene.cache.json.get(OCCLUDER_MANIFEST_KEY) as OccluderEntry[];
    for (const o of list) {
      this.scene.add
        .image(o.x, o.y, o.key)
        .setOrigin(0, 0)
        .setDepth(o.sortY + 0.5);
      this.sortLines.push({
        x0: o.x,
        x1: o.x + this.scene.textures.get(o.key).getSourceImage().width,
        y: o.sortY,
      });
    }
  }

  /** Toggleable overlay: walkable polygon (green), blockers (red), y-sort lines (cyan). */
  setDebug(on: boolean) {
    if (!on) {
      this.debugGfx?.destroy();
      this.debugGfx = undefined;
      return;
    }
    const g = this.scene.add.graphics().setDepth(DEPTH.atmosphere + 10);
    const trace = (pts: readonly Pt[]) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath();
    };
    g.lineStyle(2, 0x00ff88, 0.9).fillStyle(0x00ff88, 0.08);
    trace(this.area.walkable);
    g.fillPath();
    g.strokePath();
    g.lineStyle(2, 0xff3355, 0.95).fillStyle(0xff3355, 0.25);
    for (const b of this.area.blockers) {
      trace(b);
      g.fillPath();
      g.strokePath();
    }
    g.lineStyle(2, 0x33ddff, 0.9);
    for (const s of this.sortLines) g.lineBetween(s.x0, s.y, s.x1, s.y);
    this.debugGfx = g;
  }
}
