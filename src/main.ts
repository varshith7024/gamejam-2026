import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { CreditsScene } from './scenes/CreditsScene';
import { Cutscene1Scene } from './scenes/Cutscene1Scene';
import { Cutscene2Scene } from './scenes/Cutscene2Scene';
import { PointsScene } from './scenes/PointsScene';
import { GameScene } from './scenes/GameScene';
import { Level1Scene } from './scenes/Level1Scene';
import { Level2Scene } from './scenes/Level2Scene';
import { Level3Scene } from './scenes/Level3Scene';
import { GameOverScene } from './scenes/GameOverScene';

(window as unknown as { game: Phaser.Game }).game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  scene: [BootScene, MainMenuScene, CreditsScene, Cutscene1Scene, Cutscene2Scene, PointsScene, GameScene, Level1Scene, Level2Scene, Level3Scene, GameOverScene],
});
