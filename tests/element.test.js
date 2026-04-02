import { GameElement } from '../src/js/element.js';
import { ELEM_W, HEADER_H, ROW_H, PORT_HIT } from '../src/js/config.js';
import { ELEM_DEFS } from '../src/js/config.js';

// GameElement constructor calls `new Image()` — stub it for Node
global.Image = class {
  constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; }
};

const WEB_SERVER = ELEM_DEFS.WebServer;        // 2 inputs, 1 output  → 2 rows
const STORAGE    = ELEM_DEFS.Storage;          // 0 inputs, 1 output  → 1 row
const DATABASE   = ELEM_DEFS.Database;         // 1 input,  1 output  → 1 row

beforeEach(() => {
  GameElement.resetCounter();
});

describe('GameElement constructor', () => {
  test('assigns sequential IDs', () => {
    const a = new GameElement('Storage', 0, 0, STORAGE);
    const b = new GameElement('Storage', 0, 0, STORAGE);
    expect(a.id).toBe('elem_0');
    expect(b.id).toBe('elem_1');
  });

  test('resetCounter() restarts IDs from 0', () => {
    new GameElement('Storage', 0, 0, STORAGE);
    GameElement.resetCounter();
    const fresh = new GameElement('Storage', 0, 0, STORAGE);
    expect(fresh.id).toBe('elem_0');
  });

  test('stores type, def, x, y', () => {
    const el = new GameElement('WebServer', 42, 99, WEB_SERVER);
    expect(el.type).toBe('WebServer');
    expect(el.def).toBe(WEB_SERVER);
    expect(el.x).toBe(42);
    expect(el.y).toBe(99);
  });

  test('width is always ELEM_W', () => {
    const el = new GameElement('Storage', 0, 0, STORAGE);
    expect(el.w).toBe(ELEM_W);
  });

  test('height = HEADER_H + rows * ROW_H, rows = max(inputs, outputs, 1)', () => {
    // WebServer: 2 inputs, 1 output → 2 rows
    const ws = new GameElement('WebServer', 0, 0, WEB_SERVER);
    expect(ws.h).toBe(HEADER_H + 2 * ROW_H);

    // Storage: 0 inputs, 1 output → max(0,1,1)=1 row
    const st = new GameElement('Storage', 0, 0, STORAGE);
    expect(st.h).toBe(HEADER_H + 1 * ROW_H);
  });
});

describe('inputPos / outputPos', () => {
  test('inputPos(i) is on the left edge (x = el.x)', () => {
    const el = new GameElement('WebServer', 100, 50, WEB_SERVER);
    for (let i = 0; i < 2; i++) {
      expect(el.inputPos(i).x).toBe(100);
    }
  });

  test('outputPos(i) is on the right edge (x = el.x + el.w)', () => {
    const el = new GameElement('WebServer', 100, 50, WEB_SERVER);
    expect(el.outputPos(0).x).toBe(100 + ELEM_W);
  });

  test('port y positions are staggered by ROW_H', () => {
    const el = new GameElement('WebServer', 0, 0, WEB_SERVER);
    const p0 = el.inputPos(0);
    const p1 = el.inputPos(1);
    expect(p1.y - p0.y).toBeCloseTo(ROW_H);
  });

  test('first port y is HEADER_H + 0.5*ROW_H below element top', () => {
    const el = new GameElement('WebServer', 0, 10, WEB_SERVER);
    expect(el.inputPos(0).y).toBeCloseTo(10 + HEADER_H + 0.5 * ROW_H);
  });
});

describe('hitBody', () => {
  let el;
  beforeEach(() => {
    el = new GameElement('WebServer', 100, 50, WEB_SERVER);
    // el: x=100, y=50, w=ELEM_W, h=HEADER_H+2*ROW_H
  });

  test('returns true for point inside element', () => {
    expect(el.hitBody(100 + ELEM_W / 2, 50 + el.h / 2)).toBe(true);
  });

  test('returns true at exact corners', () => {
    expect(el.hitBody(100, 50)).toBe(true);
    expect(el.hitBody(100 + ELEM_W, 50 + el.h)).toBe(true);
  });

  test('returns false for point above element', () => {
    expect(el.hitBody(150, 49)).toBe(false);
  });

  test('returns false for point below element', () => {
    expect(el.hitBody(150, 50 + el.h + 1)).toBe(false);
  });

  test('returns false for point left of element', () => {
    expect(el.hitBody(99, 80)).toBe(false);
  });

  test('returns false for point right of element', () => {
    expect(el.hitBody(100 + ELEM_W + 1, 80)).toBe(false);
  });
});

describe('hitInputPort', () => {
  let el;
  beforeEach(() => {
    // WebServer at origin for easy math
    el = new GameElement('WebServer', 0, 0, WEB_SERVER);
  });

  test('returns port index when clicking within PORT_HIT of port', () => {
    const p0 = el.inputPos(0);
    expect(el.hitInputPort(p0.x + PORT_HIT - 1, p0.y)).toBe(0);
  });

  test('returns 1 for second port', () => {
    const p1 = el.inputPos(1);
    expect(el.hitInputPort(p1.x, p1.y)).toBe(1);
  });

  test('returns -1 when outside PORT_HIT radius of all ports', () => {
    const p0 = el.inputPos(0);
    expect(el.hitInputPort(p0.x + PORT_HIT + 1, p0.y)).toBe(-1);
  });

  test('returns -1 for element with no input ports', () => {
    const st = new GameElement('Storage', 0, 0, STORAGE);
    expect(st.hitInputPort(0, 0)).toBe(-1);
  });
});

describe('hitOutputPort', () => {
  let el;
  beforeEach(() => {
    el = new GameElement('WebServer', 0, 0, WEB_SERVER);
  });

  test('returns 0 when clicking on output port', () => {
    const p = el.outputPos(0);
    expect(el.hitOutputPort(p.x, p.y)).toBe(0);
  });

  test('returns -1 when far from output port', () => {
    expect(el.hitOutputPort(0, 0)).toBe(-1);
  });

  test('returns -1 for element with no output ports (none defined)', () => {
    // Synthetic def with no outputs
    const noOut = new GameElement('X', 0, 0, { inputs: { SQL: { demand: 10 } }, outputs: {} });
    expect(noOut.hitOutputPort(0, 0)).toBe(-1);
  });
});
