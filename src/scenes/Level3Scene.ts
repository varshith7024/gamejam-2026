import { GameScene } from './GameScene';
import { LEVEL3 } from '../environment/level3Data';

/** Level 3 "THE ABYSS": Blank boss encounter chamber running the Boss enemy. */
export class Level3Scene extends GameScene {
  constructor() {
    super('Level3', LEVEL3);
  }
}
