import type { Pt } from './Collision';
import type { ChampionType } from '../config/championAnimations';

/** One floor prop cut from a level's prop sheet. (x, y) is the GROUND-CONTACT point (world px). */
export interface PropDef {
  key: string;
  x: number;
  y: number;
  scale: number;
  footprint?: [number, number]; // collision ellipse [rx, ry] centred on the ground point
  flat?: boolean; // ground decal, always drawn under the player
}

/** Soft fog bank: [asset key, x, y, scale, alpha, drift px, period ms] */
export type FogBank = readonly [string, number, number, number, number, number, number];

export interface AtmosphereConfig {
  fogBanks: readonly FogBank[];
  motes: readonly (readonly [number, number, number])[]; // x, y, scale
  spirits: readonly (readonly [number, number, number])[]; // x, y, scale
  tints: { dust: number; motes: number; shards: number };
}

/** A place enemies walk in from (world px). Used instead of the default ring when a level defines them. */
export interface EnemyEntry {
  id: string;
  x: number;
  y: number;
}

/**
 * Everything that makes one level different from another. The game systems (scene, player, camera, depth sorting,
 * collision, lighting overlays, atmosphere, waves) are shared and read this.
 * All coordinates are WORLD pixels == pixels of the level's master image.
 */
export interface LevelData {
  id: string; // texture-key namespace, e.g. 'level1'
  title: string;
  subtitle: string;
  assetBase: string; // e.g. 'assets/level1/'
  masterFile: string; // inside assetBase
  world: { width: number; height: number };
  floorCenter: { x: number; y: number };
  playerStart: { x: number; y: number };
  walkable: Pt[];
  blockers: Pt[][];
  ellipseBlockers: [number, number, number, number][];
  props: PropDef[];
  /** Level has public/assets/<id>/anim.json: looping sprite sheets (flames, waterfalls) cut from an animated master. */
  animated?: boolean;
  atmosphere: AtmosphereConfig;
  /** Which enemy types the wave script spawns as its "light" (swarm) and "heavy" units. */
  roster: { light: ChampionType; heavy: ChampionType };
  /** Optional navigation waypoints for routing enemies around obstacles (e.g. central beacon/altar). */
  navWaypoints?: Pt[];
  /** Optional enemy entry markers. Without them enemies spawn on a ring around floorCenter (Level 1). */
  entries?: EnemyEntry[];
  /** Optional scene to start after the last wave is cleared. */
  nextScene?: string;
}
