import Phaser from 'phaser';
import { WalkableArea, ellipsePolygon, type Pt } from './Collision';
import { LEVEL1 } from './level1Data';
import type { LevelData } from './levelTypes';

// Texture keys are namespaced by level id so several levels can be preloaded side by side.
const masterKey = (l: LevelData) => `${l.id}_master`;
const propKey = (l: LevelData, k: string) => `${l.id}_prop_${k}`;
const manifestKey = (l: LevelData) => `${l.id}_occluders`;

/** Depth layout. Y-sorted things (props, player, occluders) use their ground Y (0..1023) as depth. */
export const DEPTH = {
  base: -10000, // master image: background + midground + floor + baked props
  groundDecal: -9000, // flat decals on the floor, always under the player
  atmosphere: 50000, // fog / motes above all world objects
  screen: 100000, // vignette / title card
};

type OccluderEntry = { key: string; file: string; x: number; y: number; sortY: number };
/** Looping sprite sheet cut from an animated master (flames, waterfalls). sortY null = background layer. */
type AnimEntry = { key: string; file: string; x: number; y: number; w: number; h: number; frames: number; fps: number; sortY: number | null };
const animKey = (l: LevelData) => `${l.id}_anims`;

/**
 * Builds a level's environment from its processed assets (data-driven: Level 1 and Level 2 share this code):
 *   master image (base) -> y-sorted props -> occluder cut-outs of the master (walk-behind).
 * The master image is the canonical camera, so it is drawn at 1:1 and everything else is placed in its pixel space.
 */
export class Level1Environment {
  readonly area: WalkableArea;
  private debugGfx?: Phaser.GameObjects.Graphics;
  private sortLines: { x0: number; x1: number; y: number }[] = [];
  private propOverlays: Phaser.GameObjects.Image[] = [];
  private propDarkOverlays: Phaser.GameObjects.Image[] = [];

  constructor(
    private scene: Phaser.Scene,
    private level: LevelData = LEVEL1,
  ) {
    const blockers: (readonly Pt[])[] = [
      ...level.blockers,
      ...level.ellipseBlockers.map(([cx, cy, rx, ry]) => ellipsePolygon(cx, cy, rx, ry)),
      ...level.props
        .filter((p) => p.footprint)
        .map((p) => ellipsePolygon(p.x, p.y, p.footprint![0], p.footprint![1])),
    ];
    this.area = new WalkableArea(level.walkable, blockers, level.navWaypoints);
    this.build();
  }

  /** Queue every texture this level needs. Occluder images are discovered from the generated manifest. */
  static preload(scene: Phaser.Scene, level: LevelData = LEVEL1) {
    const base = level.assetBase;
    scene.load.setPath(base);
    scene.load.image(masterKey(level), level.masterFile);
    for (const key of new Set(level.props.map((p) => p.key)))
      scene.load.image(propKey(level, key), `props/prop_${key}.png`);
    if (level.animated) {
      scene.load.json(animKey(level), 'anim.json');
      scene.load.once(`filecomplete-json-${animKey(level)}`, (_k: string, _t: string, list: AnimEntry[]) => {
        scene.load.setPath(base);
        for (const a of list) scene.load.spritesheet(a.key, a.file, { frameWidth: a.w, frameHeight: a.h });
      });
    }
    scene.load.json(manifestKey(level), 'occluders.json');
    scene.load.once(
      `filecomplete-json-${manifestKey(level)}`,
      (_k: string, _t: string, list: OccluderEntry[]) => {
        // The loader path is global state (Atmosphere.preload changes it), so set it again before queueing.
        scene.load.setPath(base);
        for (const o of list) scene.load.image(o.key, o.file);
      },
    );
  }

  private build() {
    const { width, height } = this.level.world;
    this.scene.add
      .image(0, 0, masterKey(this.level))
      .setOrigin(0, 0)
      .setDepth(DEPTH.base)
      .setDisplaySize(width, height);

    // Props: origin sits on the ground-contact point, depth = ground Y so the player sorts in front/behind.
    for (const p of this.level.props) {
      const depth = p.flat ? DEPTH.groundDecal : p.y;
      const img = this.scene.add
        .image(p.x, p.y, propKey(this.level, p.key))
        .setOrigin(0.5, 0.86)
        .setScale(p.scale);
      img.setDepth(depth);
      if (!p.flat) this.sortLines.push({ x0: p.x - 30, x1: p.x + 30, y: p.y });

      // Prop blackpoint screen overlay: white silhouette screened over the prop (brightening)
      const overlay = this.scene.add
        .image(p.x, p.y, propKey(this.level, p.key))
        .setOrigin(0.5, 0.86)
        .setScale(p.scale)
        .setDepth(depth + 0.05)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setTintFill(0xffffff)
        .setAlpha(0);
      this.propOverlays.push(overlay);

      // Prop whitepoint dark overlay: black silhouette over the prop (darkening)
      const darkOverlay = this.scene.add
        .image(p.x, p.y, propKey(this.level, p.key))
        .setOrigin(0.5, 0.86)
        .setScale(p.scale)
        .setDepth(depth + 0.06)
        .setTintFill(0x000000)
        .setAlpha(0);
      this.propDarkOverlays.push(darkOverlay);
    }

    // Animated overlays (flames / waterfalls): background ones sit just above the master; ones that belong to a
    // structure the player can walk behind use that structure's sort line, so they sort exactly like occluders.
    if (this.level.animated) {
      const anims = (this.scene.cache.json.get(animKey(this.level)) ?? []) as AnimEntry[];
      for (const a of anims) {
        if (!this.scene.anims.exists(a.key)) {
          this.scene.anims.create({
            key: a.key,
            frames: this.scene.anims.generateFrameNumbers(a.key, { start: 0, end: a.frames - 1 }),
            frameRate: a.fps,
            repeat: -1,
          });
        }
        const sprite = this.scene.add
          .sprite(a.x, a.y, a.key, 0)
          .setOrigin(0, 0)
          .setDepth(a.sortY === null ? DEPTH.base + 1 : a.sortY + 0.52);
        sprite.play(a.key);
      }
    }

    // Occluders: pieces of the master drawn again ABOVE the player while the player is behind them.
    const list = this.scene.cache.json.get(manifestKey(this.level)) as OccluderEntry[];
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

      // Occluder blackpoint screen overlay
      const occOverlay = this.scene.add
        .image(o.x, o.y, o.key)
        .setOrigin(0, 0)
        .setDepth(o.sortY + 0.55)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setTintFill(0xffffff)
        .setAlpha(0);
      this.propOverlays.push(occOverlay);

      // Occluder whitepoint dark overlay
      const occDarkOverlay = this.scene.add
        .image(o.x, o.y, o.key)
        .setOrigin(0, 0)
        .setDepth(o.sortY + 0.56)
        .setTintFill(0x000000)
        .setAlpha(0);
      this.propDarkOverlays.push(occDarkOverlay);
    }
  }

  /** Update the black point lift / white point drop across all level props and occluders */
  setBlackPoint(value: number) {
    if (value >= 0) {
      for (let i = 0; i < this.propOverlays.length; i++) {
        this.propOverlays[i].setAlpha(value);
      }
      for (let i = 0; i < this.propDarkOverlays.length; i++) {
        this.propDarkOverlays[i].setAlpha(0);
      }
    } else {
      const darkness = Math.abs(value);
      for (let i = 0; i < this.propOverlays.length; i++) {
        this.propOverlays[i].setAlpha(0);
      }
      for (let i = 0; i < this.propDarkOverlays.length; i++) {
        this.propDarkOverlays[i].setAlpha(darkness);
      }
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
    g.lineStyle(2, 0xff44ff, 0.95).fillStyle(0xff44ff, 0.3);
    for (const e of this.level.entries ?? []) {
      g.fillCircle(e.x, e.y, 14);
      g.strokeCircle(e.x, e.y, 14);
    }
    if (this.area.navWaypoints.length > 0) {
      g.lineStyle(1.5, 0xffea00, 0.6);
      trace(this.area.navWaypoints);
      g.strokePath();
      g.lineStyle(2, 0xffea00, 0.95).fillStyle(0xffea00, 0.4);
      for (const w of this.area.navWaypoints) {
        g.fillCircle(w[0], w[1], 7);
        g.strokeCircle(w[0], w[1], 7);
      }
    }
    this.debugGfx = g;
  }
}
