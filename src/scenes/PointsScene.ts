import Phaser from 'phaser';

export class PointsScene extends Phaser.Scene {
  private score = 0;
  private hasContinued = false;

  constructor() {
    super('Points');
  }

  init(data?: { score?: number }) {
    this.hasContinued = false;
    this.score = data?.score ?? (this.registry.get('finalScore') || 0);
  }

  create() {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    // Pure white background
    this.cameras.main.setBackgroundColor('#ffffff');
    this.cameras.main.fadeIn(600, 255, 255, 255);

    // Audio: start main theme smoothly if not already playing
    this.startMusic();

    // Format score
    const scoreFormatted = (this.score || 0).toLocaleString();

    // Main Quote: Centered vertically and horizontally
    // "You forced her to burn bright for <X> lumens before the page tore"
    const message = `"You forced her to burn bright for ${scoreFormatted} lumens\nbefore the page tore"`;

    const quoteText = this.add.text(centerX, centerY - 32, message, {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '28px',
      color: '#000000',
      align: 'center',
      lineSpacing: 18,
      fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0.5);

    // Fade in text gracefully
    quoteText.setAlpha(0);
    this.tweens.add({
      targets: quoteText,
      alpha: 1,
      duration: 800,
      ease: 'Power2',
    });

    // --- "CONTINUE" BUTTON ---
    const btnW = 180;
    const btnH = 46;
    const btnY = centerY + 65;

    const btnContainer = this.add.container(centerX, btnY);
    btnContainer.setAlpha(0);

    const btnGfx = this.add.graphics();
    btnGfx.fillStyle(0x000000, 1.0);
    btnGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    btnGfx.lineStyle(2, 0x000000, 1.0);
    btnGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);

    const btnText = this.add.text(0, 0, 'CONTINUE', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ffffff',
      letterSpacing: 4,
    }).setOrigin(0.5);

    const hitZone = this.add.zone(0, 0, btnW, btnH).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    btnContainer.add([btnGfx, btnText, hitZone]);

    // Fade in continue button
    this.tweens.add({
      targets: btnContainer,
      alpha: 1,
      duration: 800,
      delay: 300,
      ease: 'Power2',
    });

    const onContinue = () => {
      if (this.hasContinued) return;
      this.hasContinued = true;

      // Smooth fade to black into the Credits scene
      this.cameras.main.fade(500, 0, 0, 0);
      this.time.delayedCall(500, () => {
        this.scene.start('Credits');
      });
    };

    // Button hover effects
    hitZone.on('pointerover', () => {
      btnGfx.clear();
      btnGfx.fillStyle(0xffffff, 1.0);
      btnGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      btnGfx.lineStyle(2, 0x000000, 1.0);
      btnGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      btnText.setColor('#000000');
    });

    hitZone.on('pointerout', () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x000000, 1.0);
      btnGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      btnGfx.lineStyle(2, 0x000000, 1.0);
      btnGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      btnText.setColor('#ffffff');
    });

    hitZone.on('pointerdown', onContinue);

    // Keyboard navigation shortcuts
    this.input.keyboard?.once('keydown-ENTER', onContinue);
    this.input.keyboard?.once('keydown-SPACE', onContinue);
    this.input.keyboard?.once('keydown-E', onContinue);
  }

  private startMusic() {
    const existing = this.sound.getAll('menumusic');
    for (const m of existing) {
      if (m.isPlaying) {
        return;
      }
    }

    if (!this.sound.locked) {
      const music = this.sound.add('menumusic', { loop: true, volume: 0.50 });
      music.play();
    }
  }
}
