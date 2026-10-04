import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { DEPTH } from '../environment/Level1Environment';
import { LEVEL1 } from '../environment/level1Data';
import type { LevelData } from '../environment/levelTypes';

const FOG = ['fog_wide', 'fog_puff', 'fog_wisp', 'fog_cloud'] as const;

/**
 * Subtle atmosphere (shared by every level; each level supplies its own sprites + placements via LevelData.atmosphere): drifting fog banks and spirit lights (from the supplied atmosphere sheet),
 * plus a few procedural particle emitters (dust, dark ash, light motes) and a screen vignette.
 * Everything is slow and low-alpha so it never hurts combat readability.
 */
export class Atmosphere {
  constructor(
    private scene: Phaser.Scene,
    private level: LevelData = LEVEL1,
  ) {}

  // Textures are namespaced by level id so two levels can be preloaded together.
  public static key(level: LevelData, k: string) {
    return `${level.id}_atmos_${k}`;
  }

  static preload(scene: Phaser.Scene, level: LevelData = LEVEL1) {
    scene.load.setPath(`${level.assetBase}atmos/`);
    for (const k of [...FOG, 'motes', 'spirits', 'dust'])
      scene.load.image(Atmosphere.key(level, k), `atmos_${k}.png`);
  }

  create() {
    this.makeParticleTextures();
    this.createFogBanks();
    this.createSheetSprites();
    this.createEmitters();
    this.createVignette();
  }

  private makeParticleTextures() {
    const t = this.scene.textures;
    if (!t.exists('fx_dot')) {
      const c = t.createCanvas('fx_dot', 32, 32)!;
      const ctx = c.getContext();
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
      c.refresh();
    }
    if (!t.exists('fx_shard')) {
      const g = this.scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 1).fillTriangle(0, 4, 9, 0, 5, 9);
      g.generateTexture('fx_shard', 10, 10);
      g.destroy();
    }
  }

  /** Large soft fog banks: heavier in the pits at the arena corners, a few thin ones drifting across the floor. */
  private createFogBanks() {
    const banks = this.level.atmosphere.fogBanks;
    banks.forEach(([key, x, y, scale, alpha, drift, period], i) => {
      const s = this.scene.add
        .image(x, y, Atmosphere.key(this.level, key))
        .setScale(scale)
        .setAlpha(alpha)
        .setDepth(DEPTH.atmosphere);
      this.scene.tweens.add({
        targets: s,
        x: x + drift,
        duration: period,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 900,
      });
      this.scene.tweens.add({
        targets: s,
        alpha: alpha * 0.6,
        duration: period * 0.55,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 400,
      });
    });
  }

  /** The supplied "light motes" and "spirit wisp" crops, drifting slowly with additive blending. */
  private createSheetSprites() {
    const motes = this.level.atmosphere.motes;
    motes.forEach(([x, y, sc], i) => {
      const s = this.scene.add
        .image(x, y, Atmosphere.key(this.level, 'motes'))
        .setScale(sc)
        .setAlpha(0.32)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.atmosphere);
      this.scene.tweens.add({
        targets: s,
        y: y - 40,
        x: x + 30,
        alpha: 0.12,
        duration: 7000 + i * 1800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
    const spirits = this.level.atmosphere.spirits;
    spirits.forEach(([x, y, sc], i) => {
      const s = this.scene.add
        .image(x, y, Atmosphere.key(this.level, 'spirits'))
        .setScale(sc)
        .setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.atmosphere);
      this.scene.tweens.add({
        targets: s,
        y: y - 60,
        alpha: 0.15,
        duration: 9000 + i * 2500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  private createEmitters() {
    const { width, height } = this.level.world;
    const tints = this.level.atmosphere.tints;
    // helper: fade in and out over a particle's life
    const lifeFade = (peak: number) => ({
      onEmit: () => 0,
      onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(Math.PI * t) * peak,
    });

    // Floating dust / ash motes (pale)
    this.scene.add
      .particles(0, 0, 'fx_dot', {
        x: { min: 200, max: width - 150 },
        y: { min: 200, max: height - 150 },
        lifespan: { min: 6000, max: 11000 },
        speedX: { min: -8, max: 14 },
        speedY: { min: -12, max: 2 },
        scale: { min: 0.08, max: 0.22 },
        alpha: lifeFade(0.55),
        frequency: 160,
        quantity: 1,
        tint: tints.dust,
      })
      .setDepth(DEPTH.atmosphere);

    // Supernatural light motes (cool, additive, rising)
    this.scene.add
      .particles(0, 0, 'fx_dot', {
        x: { min: 300, max: width - 250 },
        y: { min: 450, max: height - 150 },
        lifespan: { min: 5000, max: 9000 },
        speedX: { min: -6, max: 6 },
        speedY: { min: -26, max: -10 },
        scale: { min: 0.12, max: 0.3 },
        alpha: lifeFade(0.9),
        frequency: 420,
        quantity: 1,
        tint: tints.motes,
        blendMode: 'ADD',
      })
      .setDepth(DEPTH.atmosphere);

    // Dark corrupted shards drifting on a slow wind
    this.scene.add
      .particles(0, 0, 'fx_shard', {
        x: { min: 100, max: width - 100 },
        y: { min: 100, max: height - 200 },
        lifespan: { min: 7000, max: 12000 },
        speedX: { min: 10, max: 34 },
        speedY: { min: 4, max: 20 },
        rotate: { min: 0, max: 360 },
        scale: { min: 0.5, max: 1.3 },
        alpha: lifeFade(0.6),
        frequency: 520,
        quantity: 1,
        tint: tints.shards,
      })
      .setDepth(DEPTH.atmosphere);
  }

  /** Screen-space darkening toward the corners; keeps focus on the arena. */
  private createVignette() {
    const { width, height } = this.scene.scale;
    const key = 'fx_vignette';
    if (!this.scene.textures.exists(key)) {
      const c = this.scene.textures.createCanvas(key, width, height)!;
      const ctx = c.getContext();
      const g = ctx.createRadialGradient(
        width / 2,
        height / 2,
        height * 0.35,
        width / 2,
        height / 2,
        width * 0.62,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      c.refresh();
    }
    const z = BALANCE.level1CameraZoom ?? 1;
    this.scene.add
      .image(width / 2, height / 2, key)
      .setOrigin(0.5)
      .setScale(1 / z)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen);
  }
}
