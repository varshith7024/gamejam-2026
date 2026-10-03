// ALL tunable numbers live here. Change a number, save, and the game reloads.
export const BALANCE = {
  // Light (the "health bar")
  startLight: 0.4, // 0 = pitch black, 1 = pure white
  dimPerSecond: 0.02, // how fast the screen dims on its own
  killLightGain: 0.04, // light gained per kill
  playerHitPenalty: 0.1, // light lost when an enemy touches the player
  girlHitPenalty: 0.08, // light lost when an enemy reaches the girl

  // Player
  playerSpeed: 320,
  playerRadius: 14,
  bulletSpeed: 700,
  shootCooldown: 0.18, // seconds between shots
  dashSpeed: 1100,
  dashDuration: 0.15,
  dashCooldown: 0.8,

  // Level 1 prototype (temporary test player + camera)
  level1PlayerSpeed: 250, // px/s in world space (a body is ~72px tall)
  level1FootRadiusX: 14, // walkable-area footprint of the player (ellipse, 3/4 view = squashed)
  level1FootRadiusY: 7,
  level1CameraZoom: 1.4, // camera zoom level (>1 = zoomed in, reveals more world through movement)
  level1CameraFollow: 1.0, // 0 = fixed camera, 1 = fully centred on the player
  level1CameraSmoothing: 5, // higher = snappier camera

  // Girl (in the centre)
  girlRadius: 30,

  // Enemies
  enemyRadius: 16,
  enemyHp: 1,
  enemyBaseSpeed: 70,
  enemySpeedGrowth: 0.15, // extra speed per second survived
  enemyMaxSpeed: 220,

  // Spawning (seconds between enemies, shrinks over time)
  spawnStartInterval: 1.4,
  spawnMinInterval: 0.35,
  spawnRamp: 0.004,

  // Scoring
  killPoints: 100,
  maxRiskMultiplier: 5, // multiplier when you kill in near-total darkness
};
