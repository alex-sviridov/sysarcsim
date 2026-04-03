import { loadElemDefs } from './config.js';
import { loadLevels } from './levels.js';
import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadElemDefs(), loadLevels()]);
  // One rAF delay ensures the flex layout has been computed before we read
  // the canvas bounding rect for the initial resize.
  requestAnimationFrame(() => new Game());
});
