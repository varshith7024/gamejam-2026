// Which scene the game opens on. Override in the browser with ?scene=Game / ?scene=Level1 / ?scene=Level2
export const DEFAULT_START_SCENE = 'MainMenu';
const VALID_SCENES = ['MainMenu', 'Game', 'Level1', 'Level2', 'Level3', 'GameOver'];

export function resolveStartScene(): string {
  const requested = new URLSearchParams(window.location.search).get('scene');
  return requested && VALID_SCENES.includes(requested) ? requested : DEFAULT_START_SCENE;
}
