import { HEADER_H, ROW_H } from './config.js';
import { GameElement } from './element.js';
import { LEVELS } from './levels.js';
import { ConnectionManager } from './connection.js';

export class GameState {
  // Stable references — ConnectionManager and InputHandler hold these directly.
  // Never reassign; mutate in-place only.
  elements = [];
  elemMap  = new Map(); // id → GameElement

  levelIndex = 0;
  won        = false;

  /** Wipe game-world data and repopulate from the current level. */
  reset(connMgr, cssW, cssH) {
    this.elements.length = 0;
    this.elemMap.clear();
    connMgr.reset();
    GameElement.resetCounter();
    ConnectionManager.resetCounter();
    this.won = false;

    const level  = LEVELS[this.levelIndex];
    const W      = cssW || 640;
    const H      = cssH || 440;
    const demandH = HEADER_H + ROW_H;
    const gap     = 16;
    const totalH  = level.demands.length * demandH + (level.demands.length - 1) * gap;
    const startY  = H / 2 - totalH / 2;
    const demandX = W * 0.65 - 80;

    for (let i = 0; i < level.demands.length; i++) {
      const def = level.demands[i];
      const el  = new GameElement(def.type, demandX, startY + i * (demandH + gap), def);
      this.elements.push(el);
      this.elemMap.set(el.id, el);
    }
  }

  placeElement(x, y, type, elemDefs) {
    const def = elemDefs[type];
    const el  = new GameElement(type, 0, 0, def);
    el.x = x - el.w / 2;
    el.y = y - el.h / 2;
    this.elements.push(el);
    this.elemMap.set(el.id, el);
    return el;
  }

  deleteElement(el, connMgr, input) {
    if (input.state?.mode === 'wire' && input.state.fromElem === el) {
      input.state = null;
    }
    connMgr.deleteConnectedTo(el);
    this.elements.splice(this.elements.indexOf(el), 1);
    this.elemMap.delete(el.id);
    if (input.selectedEl === el) input.selectedEl = null;
  }
}
