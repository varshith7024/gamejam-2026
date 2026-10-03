// Which scene the game opens on. Override in the browser with ?scene=Game / ?scene=Level1
export const DEFAULT_START_SCENE = 'Game';
const VALID_SCENES = ['Game', 'Level1'];

export function resolveStartScene(): string {
  const requested = new URLSearchParams(window.location.search).get('scene');
  return requested && VALID_SCENES.includes(requested) ? requested : DEFAULT_START_SCENE;
}
