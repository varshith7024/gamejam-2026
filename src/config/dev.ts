// Which scene the game opens on. Override in the browser with  ?scene=Menu  /  ?scene=Game  /  ?scene=Level1
export const DEFAULT_START_SCENE = 'Level1';
const VALID_SCENES = ['Menu', 'Game', 'Level1'];

export function resolveStartScene(): string {
  const requested = new URLSearchParams(window.location.search).get('scene');
  return requested && VALID_SCENES.includes(requested) ? requested : DEFAULT_START_SCENE;
}
