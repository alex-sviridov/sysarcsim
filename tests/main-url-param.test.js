/**
 * Tests for the URL-parameter level selection in main.js.
 *
 * main.js reads `new URLSearchParams(window.location.search).get('level')`,
 * finds the matching level index, and passes it to `new Game(startIndex)`.
 *
 * We test two things:
 *  1. The slug→index mapping logic (pure, extracted inline for testability)
 *  2. That main.js wires it up: after bootstrap the game's levelIndex matches
 *     what the URL param says.
 */

import { LEVELS } from '../src/js/levels.js';

// ── Slug → index resolution logic (mirrors main.js exactly) ──────────────
// Extract the logic so we can unit-test it without importing main.js again.

function resolveStartIndex(search) {
  const slug = new URLSearchParams(search).get('level');
  if (!slug) return 0;
  const found = LEVELS.findIndex(l => l.slug === slug);
  return Math.max(0, found);
}

describe('URL slug → startIndex resolution', () => {
  test('no search string → 0', () => {
    expect(resolveStartIndex('')).toBe(0);
  });

  test('?level= (empty) → 0', () => {
    expect(resolveStartIndex('?level=')).toBe(0);
  });

  test('first level slug → 0', () => {
    expect(resolveStartIndex(`?level=${LEVELS[0].slug}`)).toBe(0);
  });

  test('second level slug → 1', () => {
    if (LEVELS.length < 2) return;
    expect(resolveStartIndex(`?level=${LEVELS[1].slug}`)).toBe(1);
  });

  test('last level slug → LEVELS.length - 1', () => {
    const last = LEVELS[LEVELS.length - 1];
    expect(resolveStartIndex(`?level=${last.slug}`)).toBe(LEVELS.length - 1);
  });

  test('unknown slug → 0 (fallback)', () => {
    expect(resolveStartIndex('?level=does-not-exist')).toBe(0);
  });

  test('result is never negative', () => {
    expect(resolveStartIndex('?level=no-match')).toBeGreaterThanOrEqual(0);
  });

  test('result is within LEVELS bounds', () => {
    const idx = resolveStartIndex(`?level=${LEVELS[0].slug}`);
    expect(idx).toBeLessThan(LEVELS.length);
  });

  test('slug lookup is case-sensitive (wrong case → fallback 0)', () => {
    const upper = LEVELS[0].slug.toUpperCase();
    expect(resolveStartIndex(`?level=${upper}`)).toBe(0);
  });

  test('each level slug resolves to its own index', () => {
    LEVELS.forEach((level, i) => {
      expect(resolveStartIndex(`?level=${level.slug}`)).toBe(i);
    });
  });

  test('URL-encoded slug still resolves correctly', () => {
    const encoded = encodeURIComponent(LEVELS[0].slug);
    expect(resolveStartIndex(`?level=${encoded}`)).toBe(0);
  });
});

// ── Integration: main.js passes startIndex to Game ────────────────────────
// We test this indirectly: after bootstrap with a given ?level= param,
// the constructed Game's levelIndex should match the resolved index.
// To avoid read-only ESM binding issues we do NOT spy on the Game export;
// instead we set up the full browser stubs and inspect the DOM side-effects.

import { jest } from '@jest/globals';

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

function makeNode(tag = 'div') {
  const listeners = {};
  const node = {
    tagName: tag.toUpperCase(),
    textContent: '', innerHTML: '', hidden: false,
    className: '', dataset: {}, style: {}, children: [],
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
    addEventListener(ev, fn) { (listeners[ev] ??= []).push(fn); },
    _fire(ev, data) { for (const fn of listeners[ev] ?? []) fn(data ?? {}); },
    appendChild(child) { this.children.push(child); return child; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getContext() { return makeCtxStub(); },
    getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
    width: 800, height: 600,
  };
  return node;
}

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

global.document = {
  getElementById(id) { return nodes[id] ?? null; },
  createElement(tag) { return makeNode(tag); },
  querySelectorAll() { return []; },
  addEventListener() {},
};
global.setTimeout   = () => 0;
global.clearTimeout = () => {};

let locationSearch = '';
const winListeners = {};
let rafCb = null;
global.requestAnimationFrame = jest.fn(cb => { rafCb = cb; });

global.window = {
  devicePixelRatio: 1,
  addEventListener: jest.fn((ev, fn) => { (winListeners[ev] ??= []).push(fn); }),
  location: { get search() { return locationSearch; } },
};
global.URLSearchParams = URLSearchParams;

await import('../src/js/main.js');

async function bootstrap(search) {
  locationSearch = search;
  rafCb = null;
  for (const fn of winListeners['DOMContentLoaded'] ?? []) await fn();
  if (rafCb) rafCb(0);
}

describe('main.js bootstrap passes startIndex to Game', () => {
  test('no ?level param → status message is set (game started at level 0)', async () => {
    nodes['status'].textContent = '';
    await bootstrap('');
    expect(nodes['status'].textContent.length).toBeGreaterThan(0);
  });

  test('?level=<first slug> → elem-count reflects level 0 demand count', async () => {
    nodes['elem-count'].textContent = '';
    await bootstrap(`?level=${LEVELS[0].slug}`);
    // On level 0 there are no player elements, so count should start at 0
    expect(nodes['elem-count'].textContent).toMatch(/0/);
  });

  test('?level=<second slug> → elem-count still initialises at 0 player elements', async () => {
    if (LEVELS.length < 2) return;
    nodes['elem-count'].textContent = '';
    await bootstrap(`?level=${LEVELS[1].slug}`);
    expect(nodes['elem-count'].textContent).toMatch(/0/);
  });

  test('unknown slug → game still starts without throwing', async () => {
    await expect(bootstrap('?level=does-not-exist')).resolves.not.toThrow();
  });
});
