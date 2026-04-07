/**
 * Tests for main.js bootstrapping logic.
 *
 * main.js is a side-effect module: on import it calls
 * window.addEventListener('DOMContentLoaded', ...).
 * We stub all browser globals before dynamic import so we can observe the
 * sequence: import → DOMContentLoaded → requestAnimationFrame → new Game().
 */

import { jest } from '@jest/globals';

// ── Browser global stubs (set before any module import) ──────────────────────

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
      add(c)       { this._classes.add(c); },
      remove(c)    { this._classes.delete(c); },
      contains(c)  { return this._classes.has(c); },
      toggle(c, f) {
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
    querySelectorAll()  { return []; },
    closest()           { return null; },
    getContext()        { return makeCtxStub(); },
    getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
    width: 800, height: 600,
  };
  return node;
}

function makeDocumentStub() {
  const nodes = {
    'desk':           makeNode('canvas'),
    'status':         makeNode(),
    'elem-count':     makeNode(),
    'budget-count':   makeNode(),
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
    'btn-snap-grid':          makeNode('button'),
  };
  return {
    _nodes: nodes,
    getElementById(id) { return nodes[id] ?? null; },
    createElement(tag) { return makeNode(tag); },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
}

global.document = makeDocumentStub();

// Capture rAF callbacks so we can fire them manually
let rafCallback = null;
global.requestAnimationFrame = jest.fn(cb => { rafCallback = cb; });

// Capture window.addEventListener calls
const windowListeners = {};
global.window = {
  devicePixelRatio: 1,
  addEventListener: jest.fn((ev, fn) => {
    if (!windowListeners[ev]) windowListeners[ev] = [];
    windowListeners[ev].push(fn);
  }),
  location: { search: '', href: '' },
};

global.setTimeout  = () => 0;
global.clearTimeout = () => {};

// ── Import main.js (registers DOMContentLoaded) ───────────────────────────────
// We import game.js first so it is already cached when main.js imports it.
await import('../src/js/game.js');
await import('../src/js/main.js');

// ── Helper to fire simulated events ──────────────────────────────────────────
async function fireDOMContentLoaded() {
  for (const fn of windowListeners['DOMContentLoaded'] ?? []) await fn();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('main.js bootstrap', () => {
  test('window.addEventListener was called with "DOMContentLoaded"', () => {
    const calls = global.window.addEventListener.mock.calls;
    const found  = calls.some(([ev]) => ev === 'DOMContentLoaded');
    expect(found).toBe(true);
  });

  test('requestAnimationFrame is NOT called before DOMContentLoaded fires', () => {
    // rAF should not have been called yet – the module only registered the
    // DOMContentLoaded handler, it has not been triggered in this scope yet.
    // We verify the count is 0 for calls that came from main.js's listener
    // by checking that rafCallback was only set during fireDOMContentLoaded.
    const countBefore = global.requestAnimationFrame.mock.calls.length;
    // No DOMContentLoaded fired yet in this describe block → rAF not called
    expect(countBefore).toBe(0);
  });

  test('requestAnimationFrame is called after DOMContentLoaded fires', async () => {
    rafCallback = null;
    global.requestAnimationFrame.mockClear();
    await fireDOMContentLoaded();
    expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  test('Game is NOT constructed before rAF callback runs', async () => {
    // After DOMContentLoaded but before rAF callback, Game is not yet new'd.
    // We can verify this by checking that requestAnimationFrame was called
    // but rafCallback (the rAF cb) has not yet been invoked.
    global.requestAnimationFrame.mockClear();
    rafCallback = null;
    await fireDOMContentLoaded();
    // rAF registered but not yet fired
    expect(rafCallback).not.toBeNull();
    // Game constructor would call renderer.render → requestAnimationFrame again;
    // that second rAF call happens only once the constructor runs.
    // At this point we have exactly 1 rAF call (from the DOMContentLoaded cb).
    expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  test('rAF callback runs without throwing (constructs Game)', async () => {
    global.requestAnimationFrame.mockClear();
    rafCallback = null;
    await fireDOMContentLoaded();
    expect(() => {
      if (rafCallback) rafCallback(0);
    }).not.toThrow();
  });

  test('after rAF callback, requestAnimationFrame is called again (game loop)', async () => {
    global.requestAnimationFrame.mockClear();
    rafCallback = null;
    await fireDOMContentLoaded();
    const callsAfterDOMCL = global.requestAnimationFrame.mock.calls.length;
    if (rafCallback) rafCallback(0);
    // Game's render loop schedules another rAF
    expect(global.requestAnimationFrame.mock.calls.length).toBeGreaterThan(callsAfterDOMCL);
  });
});
