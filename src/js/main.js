import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  // One rAF delay ensures the flex layout has been computed before we read
  // the canvas bounding rect for the initial resize.
  requestAnimationFrame(() => new Game());
});
