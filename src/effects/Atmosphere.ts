import Phaser from 'phaser';
import { DEPTH } from '../environment/Level1Environment';
import { LEVEL1 } from '../environment/level1Data';

const BASE = 'assets/level1/atmos/';
const FOG = ['fog_wide', 'fog_puff', 'fog_wisp', 'fog_cloud'] as const;

/**
 * Subtle Level 1 atmosphere: drifting fog banks and spirit lights (from the supplied atmosphere sheet),
 * plus a few procedural particle emitters (dust, dark ash, light motes) and a screen vignette.
 * Everything is slow and low-alpha so it never hurts combat readability.
 */
export class Atmosphere {
  constructor(private scene: Phaser.Scene) {}

  static preload(scene: Phaser.Scene) {
    scene.load.setPath(BASE);
    for (const k of [...FOG, 'motes', 'spirits', 'dust']) scene.load.image(`atmos_${k}`, `atmos_${k}.png`);
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
    const banks = [
      // key, x, y, scale, alpha, drift px, period ms   (camera shows roughly x 177..1457, y 151..871)
      ['fog_wide', 330, 840, 1.9, 0.55, 110, 26000],
      ['fog_wide', 1250, 850, 1.9, 0.5, -110, 30000],
      ['fog_cloud', 230, 230, 1.5, 0.4, 70, 22000],
      ['fog_cloud', 1380, 250, 1.5, 0.35, -70, 24000],
      ['fog_puff', 215, 640, 1.5, 0.4, 40, 20000],
      ['fog_wisp', 760, 850, 1.6, 0.35, 90, 28000],
      // thin ground haze that crosses the playable floor (kept very faint)
      ['fog_wisp', 650, 560, 1.7, 0.12, 160, 36000],
      ['fog_cloud', 1000, 430, 1.3, 0.09, -140, 40000],
    ] as const;
    banks.forEach(([key, x, y, scale, alpha, drift, period], i) => {
      const s = this.scene.add.image(x, y, `atmos_${key}`).setScale(scale).setAlpha(alpha).setDepth(DEPTH.atmosphere);
      this.scene.tweens.add({ targets: s, x: x + drift, duration: period, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 900 });
      this.scene.tweens.add({ targets: s, alpha: alpha * 0.6, duration: period * 0.55, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 400 });
    });
  }

  /** The supplied "light motes" and "spirit wisp" crops, drifting slowly with additive blending. */
  private createSheetSprites() {
    const motes = [
      [520, 430, 1.1],
      [1120, 560, 1.0],
    ] as const;
    motes.forEach(([x, y, sc], i) => {
      const s = this.scene.add.image(x, y, 'atmos_motes').setScale(sc).setAlpha(0.32).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.atmosphere);
      this.scene.tweens.add({ targets: s, y: y - 40, x: x + 30, alpha: 0.12, duration: 7000 + i * 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    const spirits = [
      [330, 620],
      [1260, 480],
    ] as const;
    spirits.forEach(([x, y], i) => {
      const s = this.scene.add.image(x, y, 'atmos_spirits').setScale(1.2).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.atmosphere);
      this.scene.tweens.add({ targets: s, y: y - 60, alpha: 0.15, duration: 9000 + i * 2500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  }

  private createEmitters() {
    const { width, height } = LEVEL1.world;
    // helper: fade in and out over a particle's life
    const lifeFade = (peak: number) => ({ onEmit: () => 0, onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(Math.PI * t) * peak });

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
        tint: 0xdedbe8,
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
        tint: 0x9ff4ff,
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
        tint: 0x050408,
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
      const g = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      c.refresh();
    }
    this.scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.screen);
  }
}
