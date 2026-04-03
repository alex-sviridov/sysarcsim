// Each level defines:
//   demands   — preset "sink" elements the player must satisfy (have inputs, no outputs)
//   available — element types the player can drag onto the desk

export const LEVELS_API = 'data/levels.json';

// Populated at startup by loadLevels(); referenced by game.js and game-state.js.
export const LEVELS = [];

export async function loadLevels() {
  const res  = await fetch(LEVELS_API);
  const data = await res.json();
  LEVELS.push(...data);
}
