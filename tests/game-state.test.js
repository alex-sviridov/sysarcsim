import { jest }               from '@jest/globals';

// GameElement uses `new Image()` in its constructor
global.Image = class { set src(_) {} };

import { GameState }          from '../src/js/game-state.js';
import { GameElement }         from '../src/js/element.js';
import { ConnectionManager }   from '../src/js/connection.js';
import { ELEM_DEFS, HEADER_H, ROW_H } from '../src/js/config.js';
import { LEVELS }              from '../src/js/levels.js';

/** Minimal ConnectionManager stub — only reset() is needed for most tests. */
function makeConnMgr() {
  return {
    reset: jest.fn(),
    deleteConnectedTo: jest.fn(),
    connections: [],
    selectedConn: null,
  };
}

/** Minimal InputHandler stub. */
function makeInput() {
  return { state: null, selectedEl: null };
}

beforeEach(() => {
  GameElement.resetCounter();
  ConnectionManager.resetCounter();
});

// ── Construction ──────────────────────────────────────────────────────────

describe('GameState construction', () => {
  test('starts with empty elements array', () => {
    const gs = new GameState();
    expect(gs.elements).toEqual([]);
  });

  test('starts with empty elemMap', () => {
    const gs = new GameState();
    expect(gs.elemMap.size).toBe(0);
  });

  test('levelIndex defaults to 0', () => {
    const gs = new GameState();
    expect(gs.levelIndex).toBe(0);
  });

  test('won defaults to false', () => {
    const gs = new GameState();
    expect(gs.won).toBe(false);
  });
});

// ── reset() ───────────────────────────────────────────────────────────────

describe('GameState.reset()', () => {
  test('calls connMgr.reset()', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    expect(connMgr.reset).toHaveBeenCalledTimes(1);
  });

  test('sets won to false', () => {
    const gs      = new GameState();
    gs.won        = true;
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    expect(gs.won).toBe(false);
  });

  test('populates elements from level demands', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    const level = LEVELS[0];
    expect(gs.elements).toHaveLength(level.demands.length);
  });

  test('all demand elements are in elemMap', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    for (const el of gs.elements) {
      expect(gs.elemMap.get(el.id)).toBe(el);
    }
  });

  test('all demand elements have preset truthy', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    for (const el of gs.elements) {
      expect(el.def.preset).toBeTruthy();
    }
  });

  test('mutates existing arrays in-place (stable references)', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    const origElements = gs.elements;
    const origElemMap  = gs.elemMap;
    gs.reset(connMgr, 800, 600);
    expect(gs.elements).toBe(origElements);
    expect(gs.elemMap).toBe(origElemMap);
  });

  test('clears elements from a previous reset', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    const firstLen = gs.elements.length;
    gs.reset(connMgr, 800, 600);
    expect(gs.elements).toHaveLength(firstLen);
  });
});

// ── placeElement() ────────────────────────────────────────────────────────

describe('GameState.placeElement()', () => {
  test('adds element to elements array', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    const before = gs.elements.length;
    gs.placeElement(100, 200, 'WebServer', ELEM_DEFS);
    expect(gs.elements).toHaveLength(before + 1);
  });

  test('adds element to elemMap', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(100, 200, 'WebServer', ELEM_DEFS);
    const el = gs.elements[gs.elements.length - 1];
    expect(gs.elemMap.get(el.id)).toBe(el);
  });

  test('positions element centred on (x, y)', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(200, 300, 'WebServer', ELEM_DEFS);
    const el = gs.elements[gs.elements.length - 1];
    expect(el.x).toBeCloseTo(200 - el.w / 2);
    expect(el.y).toBeCloseTo(300 - el.h / 2);
  });

  test('placed element has the requested type', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(0, 0, 'Database', ELEM_DEFS);
    const el = gs.elements[gs.elements.length - 1];
    expect(el.type).toBe('Database');
  });
});

// ── deleteElement() ───────────────────────────────────────────────────────

describe('GameState.deleteElement()', () => {
  test('removes element from elements array', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(100, 100, 'WebServer', ELEM_DEFS);
    const el = gs.elements[gs.elements.length - 1];
    gs.deleteElement(el, connMgr, makeInput());
    expect(gs.elements).not.toContain(el);
  });

  test('removes element from elemMap', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(100, 100, 'WebServer', ELEM_DEFS);
    const el = gs.elements[gs.elements.length - 1];
    gs.deleteElement(el, connMgr, makeInput());
    expect(gs.elemMap.has(el.id)).toBe(false);
  });

  test('calls connMgr.deleteConnectedTo with the element', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(100, 100, 'WebServer', ELEM_DEFS);
    const el = gs.elements[gs.elements.length - 1];
    gs.deleteElement(el, connMgr, makeInput());
    expect(connMgr.deleteConnectedTo).toHaveBeenCalledWith(el);
  });

  test('clears input.selectedEl if it matches the deleted element', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(100, 100, 'WebServer', ELEM_DEFS);
    const el    = gs.elements[gs.elements.length - 1];
    const input = makeInput();
    input.selectedEl = el;
    gs.deleteElement(el, connMgr, input);
    expect(input.selectedEl).toBeNull();
  });

  test('does not clear input.selectedEl if it is a different element', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(100, 100, 'WebServer', ELEM_DEFS);
    gs.placeElement(200, 200, 'Database', ELEM_DEFS);
    const elToDelete = gs.elements[gs.elements.length - 1];
    const other      = gs.elements[gs.elements.length - 2];
    const input = makeInput();
    input.selectedEl = other;
    gs.deleteElement(elToDelete, connMgr, input);
    expect(input.selectedEl).toBe(other);
  });

  test('clears wire state if it was dragging from the deleted element', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(100, 100, 'WebServer', ELEM_DEFS);
    const el    = gs.elements[gs.elements.length - 1];
    const input = makeInput();
    input.state = { mode: 'wire', fromElem: el };
    gs.deleteElement(el, connMgr, input);
    expect(input.state).toBeNull();
  });

  test('does not clear wire state if dragging from a different element', () => {
    const gs      = new GameState();
    const connMgr = makeConnMgr();
    gs.reset(connMgr, 800, 600);
    gs.placeElement(100, 100, 'WebServer', ELEM_DEFS);
    gs.placeElement(200, 200, 'Database', ELEM_DEFS);
    const elToDelete = gs.elements[gs.elements.length - 1];
    const other      = gs.elements[gs.elements.length - 2];
    const input      = makeInput();
    input.state = { mode: 'wire', fromElem: other };
    gs.deleteElement(elToDelete, connMgr, input);
    expect(input.state).not.toBeNull();
  });
});
