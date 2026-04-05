/**
 * Tests for Game class logic.
 *
 * Game is heavily coupled to the DOM and to rendering/input subsystems.
 * We test it by:
 *  1. Stubbing all browser globals before module import
 *  2. Exercising public methods and observable state
 */

import { GameElement }       from '../src/js/element.js';
import { ConnectionManager } from '../src/js/connection.js';
import { ELEM_DEFS, HEADER_H, ROW_H } from '../src/js/config.js';
import { LEVELS } from '../src/js/levels.js';

// ── Browser global stubs (must be set before Game import) ────────────────

global.Image = class {
  constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; }
};

function makeCtxStub() {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set() { return true; },
  });
}

// Minimal DOM node factory (supports addEventListener, classList, dataset, style, etc.)
function makeNode(tagName = 'div') {
  const listeners = {};
  const node = {
    tagName,
    textContent: '',
    innerHTML:   '',
    hidden:      false,
    className:   '',
    dataset:     {},
    style:       {},
    children:    [],
    classList: {
      _classes: new Set(),
      add(c)        { this._classes.add(c); },
      remove(c)     { this._classes.delete(c); },
      contains(c)   { return this._classes.has(c); },
      toggle(c, f)  {
        const force = f !== undefined ? f : !this._classes.has(c);
        force ? this._classes.add(c) : this._classes.delete(c);
      },
    },
    addEventListener(ev, fn) {
      if (!listeners[ev]) listeners[ev] = [];
      listeners[ev].push(fn);
    },
    _fire(ev, data) {
      for (const fn of listeners[ev] ?? []) fn(data ?? {});
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelectorAll(sel) { return []; },
    closest(sel)  { return null; },
    getContext()  { return makeCtxStub(); },
    getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
    width:  800,
    height: 600,
  };
  return node;
}

function makeDocumentStub() {
  const nodes = {
    'desk':                   makeNode('canvas'),
    'status':                 makeNode(),
    'elem-count':             makeNode(),
    'win-badge':              makeNode(),
    'btn-next-level':         makeNode('button'),
    'btn-prev-level':         makeNode('button'),
    'sidebar':                makeNode(),
    'sidebar-header':         makeNode(),
    'sidebar-cards':          makeNode(),
    'sidebar-nav':            makeNode(),
    'sidebar-section-label':  makeNode(),
    'btn-reset':              makeNode('button'),
    'level-title':              makeNode(),
    'level-description-popup':  makeNode(),
    'btn-info':                 makeNode('button'),
    'btn-zoom-in':            makeNode('button'),
    'btn-zoom-out':           makeNode('button'),
    'btn-center':             makeNode('button'),
  };

  return {
    _nodes: nodes,
    getElementById(id) { return nodes[id] ?? null; },
    createElement(tag) { return makeNode(tag); },
    querySelectorAll(sel) { return []; },
    addEventListener() {},
  };
}

const fakeDoc = makeDocumentStub();
global.document = fakeDoc;

global.window = {
  devicePixelRatio: 1,
  addEventListener: () => {},
  location: { href: '' },
};

global.requestAnimationFrame = () => {};
global.setTimeout  = () => 0;
global.clearTimeout = () => {};

// ── Import Game after globals are set ─────────────────────────────────────

const { Game } = await import('../src/js/game.js');

// ── Helpers ───────────────────────────────────────────────────────────────

function resetFakeDoc() {
  const nodes = fakeDoc._nodes;
  nodes['win-badge'].hidden      = true;
  nodes['btn-next-level'].disabled = true;
  nodes['btn-prev-level'].disabled = true;
  nodes['status'].textContent = '';
}

function freshGame() {
  GameElement.resetCounter();
  ConnectionManager.resetCounter();
  resetFakeDoc();
  return new Game();
}

// ── Constructor ───────────────────────────────────────────────────────────

describe('Game constructor', () => {
  test('creates without throwing', () => {
    expect(() => freshGame()).not.toThrow();
  });

  test('levelIndex starts at 0', () => {
    const game = freshGame();
    expect(game.levelIndex).toBe(0);
  });

  test('elements array is populated with demand elements from level 0', () => {
    const game = freshGame();
    expect(game.elements.length).toBe(LEVELS[0].demands.length);
  });

  test('elemMap mirrors elements array', () => {
    const game = freshGame();
    expect(game.elemMap.size).toBe(game.elements.length);
    for (const el of game.elements) {
      expect(game.elemMap.get(el.id)).toBe(el);
    }
  });

  test('all demand elements have def.preset truthy', () => {
    const game = freshGame();
    for (const el of game.elements) {
      expect(el.def.preset).toBeTruthy();
    }
  });

  test('canvas property points to the canvas element', () => {
    const game = freshGame();
    expect(game.canvas).toBe(fakeDoc._nodes['desk']);
  });

  test('connMgr is a ConnectionManager', () => {
    const game = freshGame();
    expect(game.connMgr).toBeInstanceOf(ConnectionManager);
  });

  test('win badge is hidden initially', () => {
    const game = freshGame();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(true);
  });

  test('next level button is enabled initially (non-last level)', () => {
    const game = freshGame();
    expect(fakeDoc._nodes['btn-next-level'].disabled).toBe(false);
  });

  test('status message is set after construction', () => {
    freshGame();
    expect(fakeDoc._nodes['status'].textContent.length).toBeGreaterThan(0);
  });
});

// ── reset() ───────────────────────────────────────────────────────────────

describe('Game.reset()', () => {
  test('repopulates elements to match level demand count', () => {
    const game = freshGame();
    const expected = LEVELS[0].demands.length;
    // Add an extra element to verify reset clears it
    game.elements.push({ id: 'fake', def: {} });
    game.reset();
    expect(game.elements.length).toBe(expected);
  });

  test('clears connections', () => {
    const game = freshGame();
    game.connMgr.connections.push({ id: 'fake' });
    game.reset();
    expect(game.connMgr.connections).toHaveLength(0);
  });

  test('hides win badge on reset', () => {
    const game = freshGame();
    fakeDoc._nodes['win-badge'].hidden = false;
    game.reset();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(true);
  });

  test('next level button remains enabled after reset (non-last level)', () => {
    const game = freshGame();
    game.reset();
    expect(fakeDoc._nodes['btn-next-level'].disabled).toBe(false);
  });

  test('elemMap has same size as elements array after reset', () => {
    const game = freshGame();
    game.reset();
    expect(game.elemMap.size).toBe(game.elements.length);
  });

  test('demand elements are spaced vertically', () => {
    const game = freshGame();
    const demandH = HEADER_H + ROW_H;
    const gap     = 16;
    for (let i = 1; i < game.elements.length; i++) {
      const dy = game.elements[i].y - game.elements[i - 1].y;
      expect(dy).toBeGreaterThanOrEqual(demandH + gap - 1);
    }
  });

  test('sets a non-empty status message', () => {
    const game = freshGame();
    fakeDoc._nodes['status'].textContent = '';
    game.reset();
    expect(fakeDoc._nodes['status'].textContent.length).toBeGreaterThan(0);
  });

  test('resets GameElement counter (IDs restart from 0)', () => {
    const game = freshGame();
    game.reset();
    // After reset, first demand element should be elem_0
    expect(game.elements[0].id).toBe('elem_0');
  });
});

// ── checkWin() ────────────────────────────────────────────────────────────

describe('Game.checkWin()', () => {
  test('does not show win badge when demands have no supply', () => {
    const game = freshGame();
    game.checkWin();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(true);
  });

  test('returns without throwing when elements list is empty', () => {
    const game = freshGame();
    game.elements.length = 0;
    expect(() => game.checkWin()).not.toThrow();
  });

  test('returns without throwing when no preset elements exist', () => {
    const game = freshGame();
    for (const el of game.elements) el.def = { ...el.def, preset: false };
    expect(() => game.checkWin()).not.toThrow();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(true);
  });

  test('shows win badge when computeActivePct returns 100% for all demands', () => {
    const game = freshGame();
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      for (const el of elements) activePct.set(el, 100);
      return { activePct, flow: new Map(), received: new Map() };
    };
    game.checkWin();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(false);
  });

  test('hides win badge when demands are only partially satisfied (50%)', () => {
    const game = freshGame();
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      for (const el of elements) activePct.set(el, 50);
      return { activePct, flow: new Map(), received: new Map() };
    };
    game.checkWin();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(true);
  });

  test('sets status text to a satisfaction message when won', () => {
    const game = freshGame();
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      for (const el of elements) activePct.set(el, 100);
      return { activePct, flow: new Map(), received: new Map() };
    };
    game.checkWin();
    expect(fakeDoc._nodes['status'].textContent).toMatch(/satisfied/i);
  });

  test('shows next level button when won and not on last level', () => {
    if (LEVELS.length < 2) return; // skip if only one level
    const game = freshGame();
    expect(game.levelIndex).toBe(0);
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      for (const el of elements) activePct.set(el, 100);
      return { activePct, flow: new Map(), received: new Map() };
    };
    game.checkWin();
    expect(fakeDoc._nodes['btn-next-level'].disabled).toBe(false);
  });

  test('disables next level button when on the last level', () => {
    GameElement.resetCounter();
    ConnectionManager.resetCounter();
    resetFakeDoc();
    const game = new Game(LEVELS.length - 1); // start at last level
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      for (const el of elements) activePct.set(el, 100);
      return { activePct, flow: new Map(), received: new Map() };
    };
    game.checkWin();
    expect(fakeDoc._nodes['btn-next-level'].disabled).toBe(true);
  });

  test('next level button stays enabled when demands are not fully satisfied', () => {
    const game = freshGame();
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      for (const el of elements) activePct.set(el, 99);
      return { activePct, flow: new Map(), received: new Map() };
    };
    game.checkWin();
    expect(fakeDoc._nodes['btn-next-level'].disabled).toBe(false);
  });
});

// ── checkWin() — requiredLatency ──────────────────────────────────────────

describe('Game.checkWin() with requiredLatency', () => {
  // Helper: mock computeActivePct to return controlled activePct and latency
  function mockCompute(game, { activePctVal = 100, latencyVal = 1 } = {}) {
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      const latency   = new Map();
      for (const el of elements) {
        activePct.set(el, activePctVal);
        latency.set(el, latencyVal);
      }
      return { activePct, latency, flow: new Map(), received: new Map() };
    };
  }

  test('wins when demand has no requiredLatency (latency is irrelevant)', () => {
    const game = freshGame();
    mockCompute(game, { activePctVal: 100, latencyVal: 99 });
    // strip requiredLatency so this tests the "no requirement" case
    for (const el of game.elements) {
      const { requiredLatency: _, ...rest } = el.def;
      el.def = rest;
    }
    game.checkWin();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(false);
  });

  test('wins when latency meets requiredLatency', () => {
    const game = freshGame();
    mockCompute(game, { activePctVal: 100, latencyVal: 3 });
    for (const el of game.elements) el.def = { ...el.def, requiredLatency: 3 };
    game.checkWin();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(false);
  });

  test('wins when latency is below requiredLatency', () => {
    const game = freshGame();
    mockCompute(game, { activePctVal: 100, latencyVal: 2 });
    for (const el of game.elements) el.def = { ...el.def, requiredLatency: 3 };
    game.checkWin();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(false);
  });

  test('does not win when latency exceeds requiredLatency', () => {
    const game = freshGame();
    mockCompute(game, { activePctVal: 100, latencyVal: 5 });
    for (const el of game.elements) el.def = { ...el.def, requiredLatency: 3 };
    game.checkWin();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(true);
  });

  test('status message mentions latency when latency requirement unmet', () => {
    const game = freshGame();
    mockCompute(game, { activePctVal: 100, latencyVal: 5 });
    for (const el of game.elements) el.def = { ...el.def, requiredLatency: 3 };
    game.checkWin();
    expect(fakeDoc._nodes['status'].textContent.toLowerCase()).toMatch(/latency/);
  });

  test('does not win when demand is satisfied but another demand has unmet latency', () => {
    const game = freshGame();
    const elements = game.elements;
    if (elements.length < 2) return; // need at least 2 demands
    // First demand: latency OK; second demand: latency too high
    game.connMgr.computeActivePct = (els) => {
      const activePct = new Map();
      const latency   = new Map();
      for (const el of els) { activePct.set(el, 100); latency.set(el, 1); }
      latency.set(elements[1], 5); // second demand exceeds its limit
      return { activePct, latency, flow: new Map(), received: new Map() };
    };
    elements[1].def = { ...elements[1].def, requiredLatency: 3 };
    game.checkWin();
    expect(fakeDoc._nodes['win-badge'].hidden).toBe(true);
  });
});

// ── ConnectionManager integration ─────────────────────────────────────────

describe('ConnectionManager used by Game', () => {
  test('connMgr.reset() empties connections', () => {
    const game = freshGame();
    game.connMgr.connections.push({ id: 'c0', fromId: 'x', toId: 'y', fromPort: 0, toPort: 0 });
    game.connMgr.reset();
    expect(game.connMgr.connections).toHaveLength(0);
  });

  test('connMgr.selectedConn is null after reset', () => {
    const game = freshGame();
    game.connMgr.selectedConn = { id: 'fake' };
    game.connMgr.reset();
    expect(game.connMgr.selectedConn).toBeNull();
  });
});

// ── Element management ────────────────────────────────────────────────────

describe('manual element placement and deletion', () => {
  test('adding element to elements + elemMap stays consistent', () => {
    const game = freshGame();
    const def  = ELEM_DEFS.Storage;
    const el   = new GameElement('Storage', 100, 100, def);
    game.elements.push(el);
    game.elemMap.set(el.id, el);
    expect(game.elements.length).toBe(LEVELS[0].demands.length + 1);
    expect(game.elemMap.get(el.id)).toBe(el);
  });

  test('deleting element removes it from elements and elemMap', () => {
    const game = freshGame();
    const def  = ELEM_DEFS.Storage;
    const el   = new GameElement('Storage', 100, 100, def);
    game.elements.push(el);
    game.elemMap.set(el.id, el);

    game.connMgr.deleteConnectedTo(el);
    game.elements.splice(game.elements.indexOf(el), 1);
    game.elemMap.delete(el.id);

    expect(game.elemMap.has(el.id)).toBe(false);
    expect(game.elements.includes(el)).toBe(false);
  });

  test('deleting element that has connections removes those connections', () => {
    const game = freshGame();
    const storDef  = ELEM_DEFS.Storage;
    const dbDef    = ELEM_DEFS.Database;
    const src = new GameElement('Storage',  0, 0, storDef);
    const dst = new GameElement('Database', 300, 0, dbDef);
    game.elements.push(src, dst);
    game.elemMap.set(src.id, src);
    game.elemMap.set(dst.id, dst);

    game.connMgr.connections.push({
      id: 'c0', fromId: src.id, fromPort: 0, toId: dst.id, toPort: 0
    });
    expect(game.connMgr.connections).toHaveLength(1);

    game.connMgr.deleteConnectedTo(src);
    expect(game.connMgr.connections).toHaveLength(0);
  });
});

// ── Elements limit ────────────────────────────────────────────────────────

describe('elements limit', () => {
  function gameWithLimit(limit) {
    GameElement.resetCounter();
    ConnectionManager.resetCounter();
    resetFakeDoc();
    fakeDoc._nodes['elem-count'].textContent = '';
    const game = new Game();
    LEVELS[0]._origLimit = LEVELS[0].elementsLimit;
    LEVELS[0].elementsLimit = limit;
    game.levelIndex = 0;
    game.reset();
    return game;
  }

  afterEach(() => {
    if (LEVELS[0]._origLimit !== undefined) {
      LEVELS[0].elementsLimit = LEVELS[0]._origLimit;
      delete LEVELS[0]._origLimit;
    }
  });

  test('elem-count shows 0/limit after reset when limited', () => {
    gameWithLimit(3);
    expect(fakeDoc._nodes['elem-count'].textContent).toMatch(/0\/3/);
  });

  test('elem-count shows count after reset when unlimited', () => {
    gameWithLimit(0);
    expect(fakeDoc._nodes['elem-count'].textContent).toMatch(/0 element/);
  });

  test('element count display updates after reset to 0/limit', () => {
    const game = gameWithLimit(5);
    const el = new GameElement('Storage', 100, 100, ELEM_DEFS.Storage);
    game.elements.push(el);
    game.elemMap.set(el.id, el);
    game.reset();
    expect(fakeDoc._nodes['elem-count'].textContent).toMatch(/0\/5/);
  });

  test('elem-count shows "0 elements" (plural) when unlimited and count is 0', () => {
    gameWithLimit(0);
    expect(fakeDoc._nodes['elem-count'].textContent).toBe('0 elements');
  });
});

// ── Level data integrity ──────────────────────────────────────────────────

describe('LEVELS data used by Game', () => {
  test('each level has at least one demand element', () => {
    for (const level of LEVELS) {
      expect(level.demands.length).toBeGreaterThan(0);
    }
  });

  test('each demand element def has a type field', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        expect(typeof demand.type).toBe('string');
      }
    }
  });

  test('each demand element def has preset truthy', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        expect(demand.preset).toBeTruthy();
      }
    }
  });

  test('each level has a non-empty available array', () => {
    for (const level of LEVELS) {
      expect(level.available.length).toBeGreaterThan(0);
    }
  });

  test('each available type is a valid key in ELEM_DEFS', () => {
    for (const level of LEVELS) {
      for (const type of level.available) {
        expect(ELEM_DEFS).toHaveProperty(type);
      }
    }
  });

  test('elementsLimit is a non-negative integer for every level', () => {
    for (const level of LEVELS) {
      expect(typeof level.elementsLimit).toBe('number');
      expect(Number.isInteger(level.elementsLimit)).toBe(true);
      expect(level.elementsLimit).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── startIndex constructor parameter ─────────────────────────────────────

describe('Game constructor startIndex', () => {
  function gameAt(index) {
    GameElement.resetCounter();
    ConnectionManager.resetCounter();
    resetFakeDoc();
    return new Game(index);
  }

  test('startIndex 0 sets levelIndex to 0', () => {
    const game = gameAt(0);
    expect(game.levelIndex).toBe(0);
  });

  test('startIndex 1 sets levelIndex to 1', () => {
    if (LEVELS.length < 2) return;
    const game = gameAt(1);
    expect(game.levelIndex).toBe(1);
  });

  test('startIndex 1 populates elements from level 1 demands', () => {
    if (LEVELS.length < 2) return;
    const game = gameAt(1);
    expect(game.elements.length).toBe(LEVELS[1].demands.length);
  });

  test('omitting startIndex defaults to levelIndex 0', () => {
    const game = freshGame(); // calls new Game() with no args
    expect(game.levelIndex).toBe(0);
  });

  test('elements come from the level at startIndex', () => {
    const idx  = LEVELS.length - 1;
    const game = gameAt(idx);
    expect(game.elements.length).toBe(LEVELS[idx].demands.length);
  });
});

// ── Next Level navigates by URL ───────────────────────────────────────────

describe('Next Level button navigates to URL', () => {
  beforeEach(() => {
    global.window.location.href = '';
  });

  test('checkWin on non-last level enables btn-next-level', () => {
    if (LEVELS.length < 2) return;
    const game = freshGame(); // level 0
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      for (const el of elements) activePct.set(el, 100);
      return { activePct, flow: new Map(), received: new Map() };
    };
    game.checkWin();
    expect(fakeDoc._nodes['btn-next-level'].disabled).toBe(false);
  });

  test('clicking Next Level navigates to game.html with next slug', () => {
    if (LEVELS.length < 2) return;
    // Win level 0 first so the button is visible
    const game = freshGame();
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      for (const el of elements) activePct.set(el, 100);
      return { activePct, flow: new Map(), received: new Map() };
    };
    game.checkWin();
    // Fire the btn-next-level click
    fakeDoc._nodes['btn-next-level']._fire('click');
    expect(global.window.location.href).toContain('game.html');
    expect(global.window.location.href).toContain(LEVELS[1].slug);
  });

  test('Next Level URL contains the correct slug for each level transition', () => {
    for (let i = 0; i < LEVELS.length - 1; i++) {
      global.window.location.href = '';
      GameElement.resetCounter();
      ConnectionManager.resetCounter();
      resetFakeDoc();
      const game = new Game(i);
      game.connMgr.computeActivePct = (elements) => {
        const activePct = new Map();
        for (const el of elements) activePct.set(el, 100);
        return { activePct, flow: new Map(), received: new Map() };
      };
      game.checkWin();
      fakeDoc._nodes['btn-next-level']._fire('click');
      expect(global.window.location.href).toContain(LEVELS[i + 1].slug);
    }
  });

  test('Next Level button stays disabled when winning on the last level', () => {
    const lastIdx = LEVELS.length - 1;
    GameElement.resetCounter();
    ConnectionManager.resetCounter();
    resetFakeDoc();
    const game = new Game(lastIdx);
    game.connMgr.computeActivePct = (elements) => {
      const activePct = new Map();
      for (const el of elements) activePct.set(el, 100);
      return { activePct, flow: new Map(), received: new Map() };
    };
    game.checkWin();
    // On the last level the button must remain hidden even after winning
    expect(fakeDoc._nodes['btn-next-level'].disabled).toBe(true);
  });
});
