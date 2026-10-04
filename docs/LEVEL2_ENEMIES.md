# Adding Level 2 enemies

Level 2 ("The Conduit") uses the same wave script as Level 1. Its roster lives in `src/environment/level2Data.ts`:

    roster: { light: 'Yi', heavy: 'Zed' }   // placeholders

To add new enemies:
1. Add their animation config in `src/config/championAnimations.ts` and extend the `ChampionType` union.
2. Preload/register their animations in `src/scenes/BootScene.ts` (same loop as Yi/Zed).
3. Handle the new types in `src/entities/Enemy.ts` (config lookup, attack range/damage/cooldown) and the
   hit-cooldown line in `GameScene.checkEnemyAttackHit` (it checks `'Zed'`).
4. Change the two names in `roster`.

Entry markers (`entries` in `level2Data.ts`) are where enemies appear; press G or use `?debug` to see them.
