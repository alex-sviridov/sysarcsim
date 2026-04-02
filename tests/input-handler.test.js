/**
 * Tests for InputHandler (EventBus-based version) in src/js/input-handler.js
 *
 * Strategy:
 *  - Set up global.document stub BEFORE importing the module
 *  - Capture canvas and document addEventListener calls manually
 *  - Build lightweight mock elements with jest.fn() for hit-testing
 *  - Use the EventBus from source so we can spy on events
 */

import { jest } from '@jest/globals';
import { EventBus, Events } from '../src/js/event-bus.js';

// ── Must stub document BEFORE the import so #bindEvents() works ───────────────

const docListeners = {};
global.document = {
  addEventListener(ev, fn) {
    if (!docListeners[ev]) docListeners[ev] = [];
    docListeners[ev].push(fn);
  },
  querySelectorAll() { return []; },
};

global.window    = { devicePixelRatio: 1, addEventListener() {} };
global.Image     = class { constructor() { this.src = ''; } };
global.setTimeout  = () => 0;
global.clearTimeout = () => {};

function fireDoc(ev, data) {
  for (const fn of docListeners[ev] ?? []) fn(data ?? {});
}

const { InputHandler } = await import('../src/js/input-handler.js');

// ── Constants mirrored from config ────────────────────────────────────────────

const PORT_SNAP   = 28;
const REMOVE_HIT_R = 12;
const HEADER_H    = 28;
const ROW_H       = 30;
const ELEM_W      = 200;

// ── Test infrastructure ───────────────────────────────────────────────────────

/**
 * Per-test canvas + handler setup. We reinitialise canvasListeners for each
 * test to keep handlers isolated.
 */
function makeSetup() {
  const canvasListeners = {};

  const canvas = {
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener(ev, fn) {
      if (!canvasListeners[ev]) canvasListeners[ev] = [];
      canvasListeners[ev].push(fn);
    },
  };

  function fireCanvas(ev, data) {
    for (const fn of canvasListeners[ev] ?? []) fn(data ?? {});
  }

  const bus      = new EventBus();
  const elements = [];

  const connMgr = {
    connections: [],
    selectedConn: null,
    hit:  jest.fn(() => false),
    mid:  jest.fn(() => ({ x: 50, y: 50 })),
    delete: jest.fn(),
  };

  const handler = new InputHandler(canvas, bus, elements, connMgr);

  return { canvas, bus, elements, connMgr, handler, fireCanvas };
}

/**
 * Build a lightweight mock element centred at (x, y) with given def.
 * Hit methods default to "miss" (-1 / false); override per test.
 */
function makeMockEl(x = 100, y = 100, def = null) {
  if (!def) {
    def = {
      inputs:  { SQL: { demand: 30 } },
      outputs: { WebSite: { supply: 100 } },
      preset: false,
    };
  }
  const el = {
    id: `mock_${Math.random()}`,
    x, y,
    w: ELEM_W,
    h: HEADER_H + Math.max(
      Object.keys(def.inputs).length,
      Object.keys(def.outputs).length,
      1
    ) * ROW_H,
    def,
    hitBody:        jest.fn(() => false),
    hitOutputPort:  jest.fn(() => -1),
    hitInputPort:   jest.fn(() => -1),
    inputPos:       jest.fn(i => ({ x, y: y + HEADER_H + (i + 0.5) * ROW_H })),
    outputPos:      jest.fn(i => ({ x: x + ELEM_W, y: y + HEADER_H + (i + 0.5) * ROW_H })),
  };
  return el;
}

/** Simulate a mouse event with clientX/clientY. Canvas rect is {left:0, top:0}
 *  so clientX/clientY === canvas coords directly.
 */
function mouseEvent(x, y, button = 0) {
  return { clientX: x, clientY: y, button, preventDefault: jest.fn() };
}

// ── getRenderState ─────────────────────────────────────────────────────────────

describe('getRenderState', () => {
  test('initial state: { state:null, selectedEl:null, ghostElem:null, mx:0, my:0 }', () => {
    const { handler } = makeSetup();
    expect(handler.getRenderState()).toEqual({
      state: null, selectedEl: null, ghostElem: null, mx: 0, my: 0,
    });
  });

  test('after PENDING_CHANGED with ghostElem: ghostElem reflects the new value', () => {
    const { handler, bus } = makeSetup();
    const ghost = { x: 0, y: 0, w: 200, h: 58 };
    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: ghost });
    expect(handler.getRenderState().ghostElem).toBe(ghost);
  });

  test('after PENDING_CHANGED with null type: ghostElem is null', () => {
    const { handler, bus } = makeSetup();
    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });
    bus.emit(Events.PENDING_CHANGED, { type: null, ghostElem: null });
    expect(handler.getRenderState().ghostElem).toBeNull();
  });
});

// ── mousedown - button != 0 ───────────────────────────────────────────────────

describe('mousedown - non-left button', () => {
  test('button=1 mousedown: state stays null', () => {
    const { handler, fireCanvas } = makeSetup();
    fireCanvas('mousedown', mouseEvent(100, 100, 1));
    expect(handler.state).toBeNull();
  });
});

// ── mousedown - remove selected connection ─────────────────────────────────────

describe('mousedown - remove selected connection', () => {
  test('click within 12px of mid: emits CONN_DELETE', () => {
    const { handler, bus, connMgr, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.CONN_DELETE, fn);

    const conn = { fromId: 'a', toId: 'b', fromPort: 0, toPort: 0 };
    connMgr.selectedConn = conn;
    connMgr.mid.mockReturnValue({ x: 200, y: 150 });

    // Click exactly at mid (distance = 0 < 12)
    fireCanvas('mousedown', mouseEvent(200, 150));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ conn });
  });

  test('click outside 12px of mid: does NOT emit CONN_DELETE', () => {
    const { handler, bus, connMgr, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.CONN_DELETE, fn);

    const conn = { fromId: 'a', toId: 'b' };
    connMgr.selectedConn = conn;
    connMgr.mid.mockReturnValue({ x: 200, y: 150 });

    fireCanvas('mousedown', mouseEvent(220, 170)); // distance ≈ 28 > 12

    expect(fn).not.toHaveBeenCalled();
  });
});

// ── mousedown - remove selected element ───────────────────────────────────────

describe('mousedown - remove selected element', () => {
  test('click within REMOVE_HIT_R of top-right corner emits ELEMENT_DELETE', () => {
    const { handler, bus, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.ELEMENT_DELETE, fn);

    const el = makeMockEl(100, 100);
    handler.selectedEl = el;

    // Top-right corner is (el.x + el.w, el.y) = (300, 100). Click exactly there.
    fireCanvas('mousedown', mouseEvent(300, 100));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ el });
  });

  test('selectedEl becomes null after delete', () => {
    const { handler, bus, fireCanvas } = makeSetup();
    bus.on(Events.ELEMENT_DELETE, jest.fn());

    const el = makeMockEl(100, 100);
    handler.selectedEl = el;

    fireCanvas('mousedown', mouseEvent(300, 100));

    expect(handler.selectedEl).toBeNull();
  });

  test('does NOT emit ELEMENT_DELETE for preset element', () => {
    const { handler, bus, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.ELEMENT_DELETE, fn);

    const def = { inputs: {}, outputs: {}, preset: true };
    const el  = makeMockEl(100, 100, def);
    handler.selectedEl = el;

    fireCanvas('mousedown', mouseEvent(300, 100));

    expect(fn).not.toHaveBeenCalled();
  });
});

// ── mousedown - complete wire (click-click) ────────────────────────────────────

describe('mousedown - complete wire (click-click)', () => {
  test('when state.mode === "wire" and mousedown: emits WIRE_COMPLETE', () => {
    const { handler, bus, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.WIRE_COMPLETE, fn);

    const fromElem = makeMockEl(50, 100);
    handler.state = { mode: 'wire', fromElem, fromPort: 0, mx: 250, my: 143, ox: 250, oy: 143, moved: false, snap: null };

    fireCanvas('mousedown', mouseEvent(400, 200));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toMatchObject({ fromElem, fromPort: 0 });
  });

  test('state becomes null after click-to-complete', () => {
    const { handler, bus, fireCanvas } = makeSetup();
    bus.on(Events.WIRE_COMPLETE, jest.fn());

    const fromElem = makeMockEl(50, 100);
    handler.state = { mode: 'wire', fromElem, fromPort: 0, mx: 250, my: 143, ox: 250, oy: 143, moved: false, snap: null };

    fireCanvas('mousedown', mouseEvent(400, 200));
    expect(handler.state).toBeNull();
  });
});

// ── mousedown - start wire from output port ────────────────────────────────────

describe('mousedown - start wire from output port', () => {
  test('when element hitOutputPort returns 0: state becomes wire mode', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));

    expect(handler.state).not.toBeNull();
    expect(handler.state.mode).toBe('wire');
    expect(handler.state.fromElem).toBe(el);
    expect(handler.state.fromPort).toBe(0);
  });
});

// ── mousedown - drag element ───────────────────────────────────────────────────

describe('mousedown - drag element', () => {
  test('when element hitBody returns true: state becomes drag mode', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(100, 100);
    el.hitBody.mockReturnValue(true);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(200, 150));

    expect(handler.state).not.toBeNull();
    expect(handler.state.mode).toBe('drag');
    expect(handler.state.elem).toBe(el);
  });

  test('element is moved to end of elements array (z-order raise)', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el1 = makeMockEl(100, 100);
    const el2 = makeMockEl(200, 100);
    el1.hitBody.mockReturnValue(false);
    el2.hitBody.mockReturnValue(false);
    elements.push(el1, el2);

    // Make el1 (index 0) the hit target by scanning from the end:
    // We need the first element in reverse order to be the hit.
    // Override so el1 is the hit when iterated in reverse (i=1 first=el2, then i=0=el1)
    el1.hitBody.mockReturnValue(true);

    fireCanvas('mousedown', mouseEvent(150, 130));

    // el1 should now be at the end of the array
    expect(elements[elements.length - 1]).toBe(el1);
  });
});

// ── mousedown - select connection ──────────────────────────────────────────────

describe('mousedown - select connection', () => {
  test('when connMgr.hit returns true: emits CONN_SELECT with the connection', () => {
    const { handler, bus, connMgr, elements, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.CONN_SELECT, fn);

    const conn = { fromId: 'a', toId: 'b', fromPort: 0, toPort: 0 };
    connMgr.connections.push(conn);
    connMgr.hit.mockReturnValue(true);

    fireCanvas('mousedown', mouseEvent(300, 200));

    expect(fn).toHaveBeenCalledWith({ conn });
  });

  test('selectedEl becomes null when connection is selected', () => {
    const { handler, bus, connMgr, elements, fireCanvas } = makeSetup();
    bus.on(Events.CONN_SELECT, jest.fn());

    const el = makeMockEl(100, 100);
    handler.selectedEl = el;

    const conn = { fromId: 'a', toId: 'b' };
    connMgr.connections.push(conn);
    connMgr.hit.mockReturnValue(true);

    fireCanvas('mousedown', mouseEvent(300, 200));

    expect(handler.selectedEl).toBeNull();
  });
});

// ── mousedown - place pending element ─────────────────────────────────────────

describe('mousedown - place pending element', () => {
  test('when pendingType is set and empty space clicked: emits ELEMENT_PLACE', () => {
    const { handler, bus, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.ELEMENT_PLACE, fn);

    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });

    fireCanvas('mousedown', mouseEvent(400, 300));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toMatchObject({ x: 400, y: 300, type: 'WebServer' });
  });

  test('emits PENDING_CHANGED(null) after placing', () => {
    const { handler, bus, fireCanvas } = makeSetup();
    const fn = jest.fn();

    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });
    bus.on(Events.PENDING_CHANGED, fn);

    fireCanvas('mousedown', mouseEvent(400, 300));

    const found = fn.mock.calls.some(([d]) => d.type === null);
    expect(found).toBe(true);
  });
});

// ── mousedown - deselect on empty space ───────────────────────────────────────

describe('mousedown - deselect on empty space', () => {
  test('no pendingType and empty space: selectedEl becomes null', () => {
    const { handler, bus, fireCanvas } = makeSetup();
    handler.selectedEl = makeMockEl(100, 100);

    fireCanvas('mousedown', mouseEvent(600, 500));

    expect(handler.selectedEl).toBeNull();
  });

  test('no pendingType and empty space: emits CONN_SELECT(null)', () => {
    const { handler, bus, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.CONN_SELECT, fn);

    fireCanvas('mousedown', mouseEvent(600, 500));

    expect(fn).toHaveBeenCalledWith({ conn: null });
  });
});

// ── mousemove - drag mode ─────────────────────────────────────────────────────

describe('mousemove - drag mode', () => {
  test("element's x/y updated to (mx - dx, my - dy)", () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(100, 100);
    el.hitBody.mockReturnValue(true);
    elements.push(el);

    // Start drag
    fireCanvas('mousedown', mouseEvent(150, 130));
    // dx = 150 - el.x = 150 - 100 = 50, dy = 130 - el.y = 130 - 100 = 30

    // Move
    fireDoc('mousemove', mouseEvent(300, 250));

    expect(el.x).toBe(300 - 50); // 250
    expect(el.y).toBe(250 - 30); // 220
  });
});

// ── mousemove - wire mode ─────────────────────────────────────────────────────

describe('mousemove - wire mode', () => {
  test('state.mx and state.my updated to cursor position', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));

    fireDoc('mousemove', mouseEvent(400, 300));

    expect(handler.state.mx).toBe(400);
    expect(handler.state.my).toBe(300);
  });

  test('state.moved becomes true after moving > 4px from origin', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));
    expect(handler.state.moved).toBe(false);

    fireDoc('mousemove', mouseEvent(260, 153)); // 14px away
    expect(handler.state.moved).toBe(true);
  });

  test('state.moved stays false when movement <= 4px', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));
    fireDoc('mousemove', mouseEvent(252, 145)); // ~2.8px
    expect(handler.state.moved).toBe(false);
  });

  test('state.snap updated by findSnapTarget (snap found)', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const fromEl = makeMockEl(50, 100);
    fromEl.hitOutputPort.mockReturnValue(0);
    fromEl.def = { inputs: {}, outputs: { WebSite: { supply: 100 } } };
    fromEl.outputPos.mockImplementation(i => ({ x: 250, y: 143 + i * 30 }));
    elements.push(fromEl);

    // Target element with an input port near our cursor destination
    const toEl = makeMockEl(300, 100);
    toEl.def = { inputs: { WebSite: { demand: 100 } }, outputs: {} };
    toEl.inputPos.mockImplementation(i => ({ x: 300, y: 143 + i * 30 }));
    elements.push(toEl);

    fireCanvas('mousedown', mouseEvent(250, 143));

    // Move close to toEl's input port (300, 143) — within PORT_SNAP=28
    fireDoc('mousemove', mouseEvent(310, 143));

    expect(handler.state.snap).not.toBeNull();
    expect(handler.state.snap.snapElem).toBe(toEl);
    expect(handler.state.snap.snapPort).toBe(0);
  });

  test('snapValid=true when input key matches output type', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const fromEl = makeMockEl(50, 100);
    fromEl.hitOutputPort.mockReturnValue(0);
    fromEl.def = { inputs: {}, outputs: { WebSite: { supply: 100 } } };
    fromEl.outputPos.mockImplementation(i => ({ x: 250, y: 143 }));
    elements.push(fromEl);

    const toEl = makeMockEl(300, 100);
    toEl.def = { inputs: { WebSite: { demand: 100 } }, outputs: {} };
    toEl.inputPos.mockImplementation(() => ({ x: 300, y: 143 }));
    elements.push(toEl);

    fireCanvas('mousedown', mouseEvent(250, 143));
    fireDoc('mousemove', mouseEvent(310, 143));

    expect(handler.state.snap.snapValid).toBe(true);
  });

  test('snapValid=false when types mismatch', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const fromEl = makeMockEl(50, 100);
    fromEl.hitOutputPort.mockReturnValue(0);
    fromEl.def = { inputs: {}, outputs: { WebSite: { supply: 100 } } };
    fromEl.outputPos.mockImplementation(() => ({ x: 250, y: 143 }));
    elements.push(fromEl);

    const toEl = makeMockEl(300, 100);
    toEl.def = { inputs: { SQL: { demand: 30 } }, outputs: {} }; // different type
    toEl.inputPos.mockImplementation(() => ({ x: 300, y: 143 }));
    elements.push(toEl);

    fireCanvas('mousedown', mouseEvent(250, 143));
    fireDoc('mousemove', mouseEvent(310, 143));

    expect(handler.state.snap.snapValid).toBe(false);
  });

  test('element outside PORT_SNAP: state.snap remains null', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const fromEl = makeMockEl(50, 100);
    fromEl.hitOutputPort.mockReturnValue(0);
    fromEl.def = { inputs: {}, outputs: { WebSite: { supply: 100 } } };
    fromEl.outputPos.mockImplementation(() => ({ x: 250, y: 143 }));
    elements.push(fromEl);

    const toEl = makeMockEl(600, 100);
    toEl.def = { inputs: { WebSite: { demand: 100 } }, outputs: {} };
    toEl.inputPos.mockImplementation(() => ({ x: 600, y: 143 }));
    elements.push(toEl);

    fireCanvas('mousedown', mouseEvent(250, 143));
    fireDoc('mousemove', mouseEvent(400, 143)); // far from toEl

    expect(handler.state.snap).toBeNull();
  });
});

// ── mousemove - cursor ────────────────────────────────────────────────────────

describe('mousemove - cursor style', () => {
  test('"grabbing" while in drag mode', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(100, 100);
    el.hitBody.mockReturnValue(true);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(150, 130));
    fireDoc('mousemove', mouseEvent(150, 130));

    expect(handler.canvas.style.cursor).toBe('grabbing');
  });

  test('"crosshair" while in wire mode', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));
    fireDoc('mousemove', mouseEvent(250, 143));

    expect(handler.canvas.style.cursor).toBe('crosshair');
  });

  test('"grab" when hovering over element body (no pendingType)', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(100, 100);
    el.hitBody.mockReturnValue(true);
    el.hitOutputPort.mockReturnValue(-1);
    el.hitInputPort.mockReturnValue(-1);
    elements.push(el);

    fireDoc('mousemove', mouseEvent(150, 130));
    expect(handler.canvas.style.cursor).toBe('grab');
  });

  test('"not-allowed" when hovering over element body with pendingType set', () => {
    const { handler, bus, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(100, 100);
    el.hitBody.mockReturnValue(true);
    el.hitOutputPort.mockReturnValue(-1);
    el.hitInputPort.mockReturnValue(-1);
    elements.push(el);

    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });

    fireDoc('mousemove', mouseEvent(150, 130));
    expect(handler.canvas.style.cursor).toBe('not-allowed');
  });

  test('"crosshair" when hovering over output port', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    el.hitInputPort.mockReturnValue(-1);
    el.hitBody.mockReturnValue(false);
    elements.push(el);

    fireDoc('mousemove', mouseEvent(250, 143));
    expect(handler.canvas.style.cursor).toBe('crosshair');
  });

  test('"crosshair" when hovering over input port', () => {
    const { handler, elements } = makeSetup();

    const el = makeMockEl(100, 100);
    el.hitOutputPort.mockReturnValue(-1);
    el.hitInputPort.mockReturnValue(0);
    el.hitBody.mockReturnValue(false);
    elements.push(el);

    fireDoc('mousemove', mouseEvent(100, 143));
    expect(handler.canvas.style.cursor).toBe('crosshair');
  });

  test('"cell" when pendingType set and hovering over empty space', () => {
    const { handler, bus } = makeSetup();

    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });

    fireDoc('mousemove', mouseEvent(600, 500));
    expect(handler.canvas.style.cursor).toBe('cell');
  });

  test('"default" when nothing special', () => {
    const { handler } = makeSetup();

    fireDoc('mousemove', mouseEvent(600, 500));
    expect(handler.canvas.style.cursor).toBe('default');
  });
});

// ── mouseup - non-left button ─────────────────────────────────────────────────

describe('mouseup - non-left button', () => {
  test('state set to null', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));
    expect(handler.state).not.toBeNull();

    fireDoc('mouseup', mouseEvent(300, 200, 2)); // right button
    expect(handler.state).toBeNull();
  });
});

// ── mouseup - wire not moved (click-click) ────────────────────────────────────

describe('mouseup - wire not moved (click-click)', () => {
  test('wire state stays alive when moved=false on mouseup', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));
    // Do not move (moved stays false)
    fireDoc('mouseup', mouseEvent(250, 143));

    // State should still be wire (click-click pattern: wait for next mousedown)
    expect(handler.state).not.toBeNull();
    expect(handler.state.mode).toBe('wire');
  });
});

// ── mouseup - wire moved (drag-to-connect) ─────────────────────────────────────

describe('mouseup - wire moved (drag-to-connect)', () => {
  test('emits WIRE_COMPLETE when moved=true', () => {
    const { handler, bus, elements, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.WIRE_COMPLETE, fn);

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));
    fireDoc('mousemove', mouseEvent(400, 300)); // triggers moved=true (>4px)
    fireDoc('mouseup', mouseEvent(400, 300));

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('state cleared to null after drag-to-connect', () => {
    const { handler, bus, elements, fireCanvas } = makeSetup();
    bus.on(Events.WIRE_COMPLETE, jest.fn());

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));
    fireDoc('mousemove', mouseEvent(400, 300));
    fireDoc('mouseup', mouseEvent(400, 300));

    expect(handler.state).toBeNull();
  });
});

// ── mouseup - drag not moved (click = select) ─────────────────────────────────

describe('mouseup - drag not moved (click = select)', () => {
  test('selectedEl set to the dragged element when no move occurred', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(100, 100);
    el.hitBody.mockReturnValue(true);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(150, 130));
    // Do NOT move, go straight to mouseup
    fireDoc('mouseup', mouseEvent(150, 130));

    expect(handler.selectedEl).toBe(el);
  });
});

// ── mouseup - drag moved (repositioned) ───────────────────────────────────────

describe('mouseup - drag moved (repositioned)', () => {
  test('selectedEl NOT set when element was actually dragged', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(100, 100);
    el.hitBody.mockReturnValue(true);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(150, 130));
    fireDoc('mousemove', mouseEvent(200, 180)); // >4px move
    fireDoc('mouseup', mouseEvent(200, 180));

    expect(handler.selectedEl).toBeNull();
  });
});

// ── mouseup - sidebar dragging ────────────────────────────────────────────────

describe('mouseup - sidebar dragging, onCanvas, no elem hit', () => {
  test('emits ELEMENT_PLACE { x, y, type: pendingType }', () => {
    const { handler, bus, elements, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.ELEMENT_PLACE, fn);

    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });
    bus.emit(Events.SIDEBAR_DRAG_START, {});

    // mouseup on canvas (within 0..800, 0..600), no element hit
    fireDoc('mouseup', mouseEvent(400, 300));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toMatchObject({ x: 400, y: 300, type: 'WebServer' });
  });

  test('emits PENDING_CHANGED(null) after sidebar drop on canvas', () => {
    const { handler, bus, elements, fireCanvas } = makeSetup();
    const fn = jest.fn();

    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });
    bus.emit(Events.SIDEBAR_DRAG_START, {});
    bus.on(Events.PENDING_CHANGED, fn);

    fireDoc('mouseup', mouseEvent(400, 300));

    const found = fn.mock.calls.some(([d]) => d.type === null);
    expect(found).toBe(true);
  });
});

describe('mouseup - sidebar dragging, offCanvas, moved', () => {
  test('emits PENDING_CHANGED(null) when dropped off canvas after moving', () => {
    const { handler, bus, elements } = makeSetup();
    const fn = jest.fn();

    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });
    bus.emit(Events.SIDEBAR_DRAG_START, {});

    // Move to trigger sidebarDragMoved=true (mouse moves > 4px)
    // The canvas rect is {left:0,top:0,width:800,height:600}
    // mx starts at 0, move to (10, 10) — >4px from origin
    fireDoc('mousemove', mouseEvent(10, 10));

    bus.on(Events.PENDING_CHANGED, fn);

    // Drop off-canvas (negative x)
    fireDoc('mouseup', mouseEvent(-50, 300));

    const found = fn.mock.calls.some(([d]) => d.type === null);
    expect(found).toBe(true);
  });
});

describe('mouseup - sidebar dragging, quick click (no move)', () => {
  test('does NOT emit PENDING_CHANGED when dropped off canvas without moving', () => {
    const { handler, bus, elements } = makeSetup();

    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });
    bus.emit(Events.SIDEBAR_DRAG_START, {});

    const fn = jest.fn();
    bus.on(Events.PENDING_CHANGED, fn);

    // Drop off-canvas without any prior mousemove (sidebarDragMoved stays false)
    fireDoc('mouseup', mouseEvent(-50, 300));

    const nullEmit = fn.mock.calls.some(([d]) => d.type === null);
    expect(nullEmit).toBe(false);
  });
});

// ── contextmenu ───────────────────────────────────────────────────────────────

describe('contextmenu', () => {
  test('on non-preset element body: emits ELEMENT_DELETE', () => {
    const { handler, bus, elements, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.ELEMENT_DELETE, fn);

    const el = makeMockEl(100, 100);
    el.hitBody.mockReturnValue(true);
    elements.push(el);

    fireCanvas('contextmenu', mouseEvent(150, 130));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toMatchObject({ el });
  });

  test('on preset element: does NOT emit ELEMENT_DELETE', () => {
    const { handler, bus, elements, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.ELEMENT_DELETE, fn);

    const def = { inputs: {}, outputs: {}, preset: true };
    const el  = makeMockEl(100, 100, def);
    el.hitBody.mockReturnValue(true);
    elements.push(el);

    fireCanvas('contextmenu', mouseEvent(150, 130));

    expect(fn).not.toHaveBeenCalled();
  });

  test('on empty space: does nothing', () => {
    const { handler, bus, elements, fireCanvas } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.ELEMENT_DELETE, fn);

    fireCanvas('contextmenu', mouseEvent(600, 500));

    expect(fn).not.toHaveBeenCalled();
  });
});

// ── keydown Escape ────────────────────────────────────────────────────────────

describe('keydown Escape', () => {
  test('emits PENDING_CHANGED { type: null, ghostElem: null }', () => {
    const { handler, bus } = makeSetup();
    const fn = jest.fn();
    bus.on(Events.PENDING_CHANGED, fn);

    bus.emit(Events.PENDING_CHANGED, { type: 'WebServer', ghostElem: {} });
    fn.mockClear();

    fireDoc('keydown', { key: 'Escape' });

    expect(fn).toHaveBeenCalledWith({ type: null, ghostElem: null });
  });

  test('if wire mode: state set to null', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(50, 100);
    el.hitOutputPort.mockReturnValue(0);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(250, 143));
    expect(handler.state?.mode).toBe('wire');

    fireDoc('keydown', { key: 'Escape' });

    expect(handler.state).toBeNull();
  });

  test('if not wire mode: state unchanged', () => {
    const { handler, elements, fireCanvas } = makeSetup();

    const el = makeMockEl(100, 100);
    el.hitBody.mockReturnValue(true);
    elements.push(el);

    fireCanvas('mousedown', mouseEvent(150, 130));
    expect(handler.state?.mode).toBe('drag');

    fireDoc('keydown', { key: 'Escape' });

    // Drag state should remain (Escape only clears wire mode)
    expect(handler.state?.mode).toBe('drag');
  });

  test('non-Escape key does nothing to state', () => {
    const { handler } = makeSetup();

    fireDoc('keydown', { key: 'Enter' });
    expect(handler.state).toBeNull();
  });
});
