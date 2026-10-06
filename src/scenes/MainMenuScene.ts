import Phaser from 'phaser';
import { Level1Environment, DEPTH } from '../environment/Level1Environment';
import { LEVEL1 } from '../environment/level1Data';
import { Atmosphere } from '../effects/Atmosphere';

export class MainMenuScene extends Phaser.Scene {
  private env!: Level1Environment;
  private atmosphere!: Atmosphere;
  private enemy3Sprite!: Phaser.GameObjects.Sprite;
  private animSequence: string[] = ['idle', 'attack', 'disappear', 'appear'];
  private currentAnimIndex = 0;
  private isStartingGame = false;
  private menuMusic?: Phaser.Sound.BaseSound;

  constructor() {
    super('MainMenu');
  }

  create() {
    this.isStartingGame = false;
    this.currentAnimIndex = 0;
    const { width, height } = this.scale;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.menuMusic) {
        this.menuMusic.stop();
        this.menuMusic.destroy();
        this.menuMusic = undefined;
      }
    });

    // Start menu background music
    this.startMenuMusic();

    // 1. Build Level 1 Environment as dynamic moving background
    this.env = new Level1Environment(this, LEVEL1);

    // Subtle atmospheric particles and fog (no vignette overlay to keep camera view completely clear)
    this.atmosphere = new Atmosphere(this, LEVEL1);
    this.atmosphere.create({ vignette: false });

    // Set initial camera position near the center of the ruins
    this.cameras.main.setBackgroundColor('#000000');
    this.cameras.main.setZoom(1.0);
    this.cameras.main.centerOn(LEVEL1.floorCenter.x, LEVEL1.floorCenter.y);

    // 2. Left-Aligned Medieval Fantasy Title & Navigation
    this.createMenuUI(width, height);

    // 3. Huge Enemy3 on the right side vertically centered cycling through forward-facing animations
    this.createShowcaseEnemy3(width, height);

    // Fade camera in from black
    this.cameras.main.fadeIn(800, 0, 0, 0);
  }

  private startMenuMusic() {
    const playMusic = () => {
      if (this.isStartingGame) return;
      this.sound.stopByKey('battleMusic');
      this.sound.stopByKey('victory');

      const existing = this.sound.getAll('menumusic');
      for (const m of existing) {
        if (m.isPlaying) {
          this.menuMusic = m;
          return;
        }
      }

      this.menuMusic = this.sound.add('menumusic', { loop: true, volume: 0.70 });
      this.menuMusic.play();
    };

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, playMusic);
    } else {
      playMusic();
    }
  }

  private createMenuUI(width: number, height: number) {
    const leftMargin = 120;
    const titleY = height * 0.38;

    // Main Game Title: "NEGATIVE SPACE"
    const title = this.add.text(leftMargin, titleY, 'NEGATIVE SPACE', {
      fontFamily: '"Cinzel Decorative", "Cinzel", "Georgia", serif',
      fontSize: '56px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      letterSpacing: 6,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    // Ornate medieval divider line
    this.add.text(leftMargin, titleY + 48, '───────  ✦  ───────', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 4,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    // Menu Buttons (Left-aligned with Title and Divider)
    const btnStartY = titleY + 120;
    const btnSpacing = 58;
    const optionLeftX = leftMargin + 32;

    // --- PLAY BUTTON ---
    const playText = this.add.text(optionLeftX, btnStartY, 'PLAY', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '28px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 8,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    const playDiamondLeft = this.add.text(leftMargin + 8, btnStartY, '✦', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH.screen + 10).setAlpha(0);

    const playDiamondRight = this.add.text(optionLeftX + playText.width + 20, btnStartY, '✦', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH.screen + 10).setAlpha(0);

    // Hit box for mouse interaction (with scrollFactor 0 for accurate screen-space hit testing)
    const playHitBox = this.add.zone(leftMargin, btnStartY, playText.width + 64, 48)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 11)
      .setInteractive({ cursor: 'pointer' });

    playText.setInteractive({ cursor: 'pointer' });

    const onPlay = () => {
      if (this.isStartingGame) return;
      this.isStartingGame = true;

      if (this.menuMusic && this.menuMusic.isPlaying) {
        this.tweens.add({
          targets: this.menuMusic,
          volume: 0,
          duration: 450,
          onComplete: () => {
            this.menuMusic?.stop();
            this.menuMusic?.destroy();
            this.menuMusic = undefined;
          },
        });
      }

      playText.setColor('#ffffff');
      this.cameras.main.fade(500, 0, 0, 0);
      this.time.delayedCall(500, () => {
        this.scene.start('Level1');
      });
    };

    const highlightPlay = (on: boolean) => {
      if (on) {
        playText.setColor('#ffffff');
        playText.setShadow(0, 0, '#ffffff', 12, true, true);
        playDiamondLeft.setAlpha(1);
        playDiamondRight.setAlpha(1);
      } else {
        playText.setColor('#ffffff');
        playText.setShadow(0, 0, '#000000', 0, false, false);
        playDiamondLeft.setAlpha(0);
        playDiamondRight.setAlpha(0);
      }
    };

    playHitBox.on('pointerover', () => highlightPlay(true));
    playHitBox.on('pointerout', () => highlightPlay(false));
    playHitBox.on('pointerdown', onPlay);

    playText.on('pointerover', () => highlightPlay(true));
    playText.on('pointerout', () => highlightPlay(false));
    playText.on('pointerdown', onPlay);

    // --- CREDITS BUTTON ---
    const creditsY = btnStartY + btnSpacing;
    const creditsText = this.add.text(optionLeftX, creditsY, 'CREDITS', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '22px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 6,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    const creditsDiamondLeft = this.add.text(leftMargin + 8, creditsY, '❖', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH.screen + 10).setAlpha(0);

    const creditsDiamondRight = this.add.text(optionLeftX + creditsText.width + 20, creditsY, '❖', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH.screen + 10).setAlpha(0);

    const creditsHitBox = this.add.zone(leftMargin, creditsY, creditsText.width + 64, 44)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 11)
      .setInteractive({ cursor: 'pointer' });

    creditsText.setInteractive({ cursor: 'pointer' });

    const highlightCredits = (on: boolean) => {
      if (on) {
        creditsText.setColor('#ffffff');
        creditsText.setShadow(0, 0, '#ffffff', 10, true, true);
        creditsDiamondLeft.setAlpha(1);
        creditsDiamondRight.setAlpha(1);
      } else {
        creditsText.setColor('#ffffff');
        creditsText.setShadow(0, 0, '#000000', 0, false, false);
        creditsDiamondLeft.setAlpha(0);
        creditsDiamondRight.setAlpha(0);
      }
    };

    creditsHitBox.on('pointerover', () => highlightCredits(true));
    creditsHitBox.on('pointerout', () => highlightCredits(false));

    creditsText.on('pointerover', () => highlightCredits(true));
    creditsText.on('pointerout', () => highlightCredits(false));

    // Keyboard shortcuts [Enter] or [Space] to play
    this.input.keyboard?.once('keydown-ENTER', onPlay);
    this.input.keyboard?.once('keydown-SPACE', onPlay);
  }

  private createShowcaseEnemy3(width: number, height: number) {
    const enemyX = width * 0.74;
    const enemyY = height * 0.50; // Vertically centered

    // Create huge Enemy3 sprite using forward-facing (south) animation
    this.enemy3Sprite = this.add.sprite(enemyX, enemyY, 'Enemy3_idle', 0);
    this.enemy3Sprite.setOrigin(0.5, 0.5);
    this.enemy3Sprite.setScale(2.5); // Huge showcase scale
    this.enemy3Sprite.setScrollFactor(0);
    this.enemy3Sprite.setDepth(DEPTH.screen + 5);

    // Start cycling through Enemy3's forward-facing (south) animations
    this.playNextEnemy3Animation();
  }

  private playNextEnemy3Animation() {
    if (!this.enemy3Sprite || !this.enemy3Sprite.active) return;

    const animKey = this.animSequence[this.currentAnimIndex];
    // Direction 2 is South (facing forward) in standard engine directions
    const fullKey = `Enemy3_${animKey}_2`;

    if (this.anims.exists(fullKey)) {
      this.enemy3Sprite.play(fullKey);
    }

    if (animKey === 'idle') {
      this.time.delayedCall(2600, () => this.advanceAnim());
    } else if (animKey === 'disappear') {
      this.enemy3Sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.enemy3Sprite.setVisible(false);
        this.time.delayedCall(500, () => {
          this.enemy3Sprite.setVisible(true);
          this.advanceAnim();
        });
      });
    } else {
      this.enemy3Sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.time.delayedCall(400, () => this.advanceAnim());
      });
    }
  }

  private advanceAnim() {
    this.currentAnimIndex = (this.currentAnimIndex + 1) % this.animSequence.length;
    this.playNextEnemy3Animation();
  }

  update(time: number) {
    // Cinematic camera sweeping gently around the Level 1 ruins
    const centerX = LEVEL1.floorCenter.x;
    const centerY = LEVEL1.floorCenter.y;
    const cam = this.cameras.main;

    // Smooth sweeping Lissajous camera motion across the ancient arena
    const camX = centerX + Math.sin(time * 0.00035) * 260 + Math.cos(time * 0.00018) * 80;
    const camY = centerY + Math.cos(time * 0.00028) * 140 + Math.sin(time * 0.00015) * 60;
    cam.centerOn(camX, camY);
  }
}
