import { GameScene } from './GameScene';
import { LEVEL2 } from '../environment/level2Data';

/** Level 2 "THE CONDUIT": the shared game scene (player, camera, depth, lighting, waves) running on Level 2 data. */
export class Level2Scene extends GameScene {
  constructor() {
    super('Level2', LEVEL2);
  }
}
