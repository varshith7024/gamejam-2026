# How we work (Team SuperThick)

1. Never push to `main`. Create a branch per feature: `git checkout -b feature/enemy-ai`
2. Commit small and often, with clear messages. Do not squash history (it is audited).
3. Before pushing: `npm run format && npm run typecheck`
4. Open a Pull Request. Another teammate reviews, then merge.
5. Numbers go in `src/config/balance.ts`. Text goes in `src/config/text.ts`.
6. Asset naming: `enemy_crawler_walk_01.png` (lowercase, underscores).
7. Added an asset or used an AI tool? Update `CREDITS.md` in the SAME commit.
8. Only free / CC0 / CC BY / open-source / AI-generated assets. No paid assets.
9. Do not paste in whole starter kits or other people's games.
