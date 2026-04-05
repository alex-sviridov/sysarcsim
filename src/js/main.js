import { loadElemDefs } from './config.js';
import { loadLevels, LEVELS } from './levels.js';
import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadElemDefs(), loadLevels()]);

  const slug = new URLSearchParams(window.location.search).get('level');
  const startIndex = slug
    ? Math.max(0, LEVELS.findIndex(l => l.slug === slug))
    : 0;

  // One rAF delay ensures the flex layout has been computed before we read
  // the canvas bounding rect for the initial resize.
  requestAnimationFrame(() => new Game(startIndex));
});
