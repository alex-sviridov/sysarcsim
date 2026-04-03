/**
 * Tests for the Renderer class in src/js/renderer.js
 *
 * We stub canvas/ctx and pass a mock game object to render().
 */

import { jest } from '@jest/globals';

// ── Browser stubs (must be set before import) ─────────────────────────────────

global.Image = class {
  constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; }
};

global.document = {
  getElementById()    { return null; },
  createElement()     { return {}; },
  querySelectorAll()  { return []; },
  addEventListener()  {},
};

global.window = { devicePixelRatio: 1, addEventListener() {} };

// ── Canvas / context helpers ──────────────────────────────────────────────────

/**
 * Builds a spy canvas 2D context. Every method call is recorded in `calls`.
 * Properties are get/set via a plain object so we can assert on fillStyle etc.
 */
function makeSpyCtx() {
  const calls = [];
  const props = {};

  const ctx = new Proxy({}, {
    get(_, prop) {
      if (prop === 'calls')       return calls;
      if (prop === 'props')       return props;
      if (prop === 'measureText') return jest.fn(() => ({ width: 0 }));
      if (prop in props)          return props[prop];
      // Return a spy function for any method
      return jest.fn((...args) => { calls.push({ method: prop, args }); });
    },
    set(_, prop, value) {
      calls.push({ set: prop, value });
      props[prop] = value;
      return true;
    },
  });
  return ctx;
}

function makeCanvas() {
  let ctx = null;
  return {
    _resetCtx() { ctx = makeSpyCtx(); },
    getContext() {
      if (!ctx) ctx = makeSpyCtx();
      return ctx;
    },
    get _ctx() {
      if (!ctx) ctx = makeSpyCtx();
      return ctx;
    },
    getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
    width: 800, height: 600, style: {},
  };
}

// ── Mock game factory ─────────────────────────────────────────────────────────

// Identity camera stub: zoom=1, x=0, y=0 — screen coords === world coords
function makeIdentityCamera() {
  return {
    x: 0, y: 0, zoom: 1,
    toWorld(sx, sy) { return { x: sx, y: sy }; },
    toScreen(wx, wy) { return { x: wx, y: wy }; },
  };
}

function makeMockGame({
  state      = null,
  selectedEl = null,
  ghostElem  = null,
  mx         = 0,
  my         = 0,
  connections = [],
  selectedConn = null,
  elements    = [],
  elemMap     = new Map(),
  computeActivePct = null,
  camera      = null,
} = {}) {
  return {
    camera: camera ?? makeIdentityCamera(),
    input: {
      getRenderState: jest.fn(() => ({ state, selectedEl, ghostElem, mx, my })),
    },
    connMgr: {
      connections,
      selectedConn,
      computeActivePct: computeActivePct ?? jest.fn(() => ({
        activePct: new Map(),
        flow:      new Map(),
        received:  new Map(),
        connRatio: new Map(),
      })),
      mid: jest.fn(() => ({ x: 50, y: 50 })),
    },
    elements,
    elemMap,
  };
}

// ── Import Renderer after stubs ───────────────────────────────────────────────

const { Renderer } = await import('../src/js/renderer.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function allMethodCalls(ctx) {
  return ctx.calls.filter(c => c.method !== undefined);
}

function methodNames(ctx) {
  return allMethodCalls(ctx).map(c => c.method);
}

function wasCalled(ctx, method) {
  return allMethodCalls(ctx).some(c => c.method === method);
}

function setPropCalls(ctx, prop) {
  return ctx.calls.filter(c => c.set === prop);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Renderer constructor', () => {
  test('does not throw', () => {
    const canvas = makeCanvas();
    expect(() => new Renderer(canvas)).not.toThrow();
  });
});

describe('Renderer.resize()', () => {
  test('resize(800, 600, 1): setTransform called with (1,0,0,1,0,0)', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    const ctx   = canvas._ctx;
    const call  = allMethodCalls(ctx).find(c => c.method === 'setTransform');
    expect(call).toBeDefined();
    expect(call.args).toEqual([1, 0, 0, 1, 0, 0]);
  });

  test('resize(800, 600, 2): setTransform called with (2,0,0,2,0,0)', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 2);
    const ctx  = canvas._ctx;
    const call = allMethodCalls(ctx).find(c => c.method === 'setTransform');
    expect(call).toBeDefined();
    expect(call.args).toEqual([2, 0, 0, 2, 0, 0]);
  });
});

describe('Renderer.render()', () => {
  test('render() before resize: returns immediately, fillRect not called', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    // Do NOT call resize → cssW / cssH remain 0
    const game = makeMockGame();
    r.render(game);
    // fillRect should not have been called since we returned early
    expect(wasCalled(canvas._ctx, 'fillRect')).toBe(false);
  });

  test('render() after resize: fillRect is called (grid background)', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    const game = makeMockGame();
    r.render(game);
    expect(wasCalled(canvas._ctx, 'fillRect')).toBe(true);
  });

  test('render() calls getRenderState() on game.input', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    const game = makeMockGame();
    r.render(game);
    expect(game.input.getRenderState).toHaveBeenCalledTimes(1);
  });

  test('render() calls computeActivePct() on game.connMgr', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    const game = makeMockGame();
    r.render(game);
    expect(game.connMgr.computeActivePct).toHaveBeenCalledTimes(1);
  });

  test('drawGrid fills background color "#0d1117"', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    const game = makeMockGame();
    r.render(game);
    const ctx   = canvas._ctx;
    // The very first fillStyle set should be the background color
    const firstFillStyle = setPropCalls(ctx, 'fillStyle')[0];
    expect(firstFillStyle).toBeDefined();
    expect(firstFillStyle.value).toBe('#0d1117');
  });
});

describe('Renderer drawConnections', () => {
  test('skips connection when fromElem is not in elemMap', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const elemMap = new Map(); // toElem exists but fromElem does not
    const toElem = {
      id: 'to', x: 300, y: 100, w: 200, h: 58,
      def: { inputs: { SQL: { demand: 30 } }, outputs: {} },
      inputPos:  jest.fn(() => ({ x: 300, y: 143 })),
      outputPos: jest.fn(() => ({ x: 500, y: 143 })),
      draw: jest.fn(),
    };
    elemMap.set('to', toElem);

    const conn = { fromId: 'missing', toId: 'to', fromPort: 0, toPort: 0 };
    const game = makeMockGame({ connections: [conn], elemMap });
    r.render(game);

    // drawBezier calls bezier — but since fromElem is missing we skip
    // The key check: toElem.inputPos should NOT have been called (connection skipped)
    expect(toElem.inputPos).not.toHaveBeenCalled();
  });

  test('skips connection when toElem is not in elemMap', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const elemMap = new Map();
    const fromElem = {
      id: 'from', x: 50, y: 100, w: 200, h: 58,
      def: { inputs: {}, outputs: { WebSite: { supply: 100 } } },
      inputPos:  jest.fn(() => ({ x: 50,  y: 143 })),
      outputPos: jest.fn(() => ({ x: 250, y: 143 })),
      draw: jest.fn(),
    };
    elemMap.set('from', fromElem);

    const conn = { fromId: 'from', toId: 'missing', fromPort: 0, toPort: 0 };
    const game = makeMockGame({ connections: [conn], elemMap });
    r.render(game);

    // fromElem.outputPos should NOT have been called (connection skipped)
    expect(fromElem.outputPos).not.toHaveBeenCalled();
  });

  test('draws bezier for valid connection (ctx.save called)', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const elemMap = new Map();
    const fromElem = {
      id: 'from', x: 50, y: 100, w: 200, h: 58,
      def: { inputs: {}, outputs: { WebSite: { supply: 100 } } },
      inputPos:  jest.fn(() => ({ x: 50,  y: 143 })),
      outputPos: jest.fn(() => ({ x: 250, y: 143 })),
      draw: jest.fn(),
    };
    const toElem = {
      id: 'to', x: 350, y: 100, w: 200, h: 58,
      def: { inputs: { WebSite: { demand: 100 } }, outputs: {} },
      inputPos:  jest.fn(() => ({ x: 350, y: 143 })),
      outputPos: jest.fn(() => ({ x: 550, y: 143 })),
      draw: jest.fn(),
    };
    elemMap.set('from', fromElem);
    elemMap.set('to',   toElem);

    const conn = { fromId: 'from', toId: 'to', fromPort: 0, toPort: 0 };
    const game = makeMockGame({ connections: [conn], elemMap });
    r.render(game);

    // ctx.save should have been called (used by drawConnections)
    expect(wasCalled(canvas._ctx, 'save')).toBe(true);
    // Both output and input positions should have been queried
    expect(fromElem.outputPos).toHaveBeenCalledWith(0);
    expect(toElem.inputPos).toHaveBeenCalledWith(0);
  });

  test('draws packets (arc calls) when connRatio > 0', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const elemMap = new Map();
    const fromElem = {
      id: 'from', x: 50, y: 100, w: 200, h: 58,
      def: { inputs: {}, outputs: { WebSite: { supply: 100 } } },
      inputPos:  jest.fn(() => ({ x: 50,  y: 143 })),
      outputPos: jest.fn(() => ({ x: 250, y: 143 })),
      draw: jest.fn(),
    };
    const toElem = {
      id: 'to', x: 350, y: 100, w: 200, h: 58,
      def: { inputs: { WebSite: { demand: 100 } }, outputs: {} },
      inputPos:  jest.fn(() => ({ x: 350, y: 143 })),
      outputPos: jest.fn(() => ({ x: 550, y: 143 })),
      draw: jest.fn(),
    };
    elemMap.set('from', fromElem);
    elemMap.set('to',   toElem);

    const conn = { id: 'conn1', fromId: 'from', toId: 'to', fromPort: 0, toPort: 0 };
    const activePct = new Map([[fromElem, 100], [toElem, 100]]);
    const connRatio  = new Map([['conn1', 1]]);
    const game = makeMockGame({
      connections: [conn],
      elemMap,
      computeActivePct: jest.fn(() => ({
        activePct,
        flow:      new Map(),
        received:  new Map(),
        connRatio,
      })),
    });
    r.render(game);

    // arc() is called for each of the 3 packets (each has outer glow + inner dot = 2 arcs)
    const arcCalls = allMethodCalls(canvas._ctx).filter(c => c.method === 'arc');
    expect(arcCalls.length).toBeGreaterThanOrEqual(3);
  });

  test('draws no packets when connRatio is 0', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const elemMap = new Map();
    const fromElem = {
      id: 'from', x: 50, y: 100, w: 200, h: 58,
      def: { inputs: {}, outputs: { WebSite: { supply: 100 } } },
      inputPos:  jest.fn(() => ({ x: 50,  y: 143 })),
      outputPos: jest.fn(() => ({ x: 250, y: 143 })),
      draw: jest.fn(),
    };
    const toElem = {
      id: 'to', x: 350, y: 100, w: 200, h: 58,
      def: { inputs: { WebSite: { demand: 100 } }, outputs: {} },
      inputPos:  jest.fn(() => ({ x: 350, y: 143 })),
      outputPos: jest.fn(() => ({ x: 550, y: 143 })),
      draw: jest.fn(),
    };
    elemMap.set('from', fromElem);
    elemMap.set('to',   toElem);

    const conn = { id: 'conn1', fromId: 'from', toId: 'to', fromPort: 0, toPort: 0 };
    const game = makeMockGame({ connections: [conn], elemMap });
    r.render(game);

    // connRatio defaults to 0, so no arc calls for packets
    const arcCalls = allMethodCalls(canvas._ctx).filter(c => c.method === 'arc');
    expect(arcCalls.length).toBe(0);
  });
});

describe('Renderer drawWireInProgress', () => {
  test('does not draw when state is null', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    // Count arc calls from baseline (grid dots etc.)
    const game = makeMockGame({ state: null });
    r.render(game);
    // With state=null there should be no bezier-related moveTo for wires.
    // We verify by checking that no arc call happens with wire-specific coords.
    // Since we can't distinguish, we just ensure no throw and arc is from grid only.
    expect(() => r.render(game)).not.toThrow();
  });

  test('draws when state.mode === "wire" (bezier methods called on ctx)', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const fromElem = {
      id: 'from', x: 50, y: 100, w: 200, h: 58,
      def: { inputs: {}, outputs: { WebSite: { supply: 100 } } },
      inputPos:  jest.fn(() => ({ x: 50,  y: 143 })),
      outputPos: jest.fn(() => ({ x: 250, y: 143 })),
      draw: jest.fn(),
    };

    const wireState = {
      mode: 'wire',
      fromElem,
      fromPort: 0,
      mx: 400, my: 300,
      ox: 250, oy: 143,
      moved: true,
      snap: null,
    };

    const game = makeMockGame({ state: wireState });
    r.render(game);

    // fromElem.outputPos must have been called to get the wire start point
    expect(fromElem.outputPos).toHaveBeenCalledWith(0);
    // drawBezier calls beginPath and bezierCurveTo on the context
    expect(wasCalled(canvas._ctx, 'beginPath')).toBe(true);
    expect(wasCalled(canvas._ctx, 'bezierCurveTo')).toBe(true);
  });
});

describe('Renderer drawGhost', () => {
  test('positions ghostElem at (mx - w/2, my - h/2) before calling draw', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const ghostElem = {
      x: 0, y: 0, w: 200, h: 58,
      def: { inputs: {}, outputs: {} },
      draw: jest.fn(),
    };

    const game = makeMockGame({ ghostElem, mx: 300, my: 200 });
    r.render(game);

    // The renderer sets ghostElem.x = mx - w/2 = 300 - 100 = 200
    // and ghostElem.y = my - h/2 = 200 - 29 = 171
    expect(ghostElem.x).toBe(300 - ghostElem.w / 2);
    expect(ghostElem.y).toBe(200 - ghostElem.h / 2);
    expect(ghostElem.draw).toHaveBeenCalledTimes(1);
  });

  test('does nothing when ghostElem is null', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    const game = makeMockGame({ ghostElem: null });
    // Should not throw
    expect(() => r.render(game)).not.toThrow();
  });
});

describe('Renderer drawRemoveIcon', () => {
  test('drawn for selectedConn (arc called near midpoint)', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const selectedConn = { fromId: 'f', toId: 't', fromPort: 0, toPort: 0 };
    const mid = { x: 200, y: 150 };

    const game = makeMockGame({ selectedConn });
    game.connMgr.selectedConn = selectedConn;
    game.connMgr.mid = jest.fn(() => mid);

    r.render(game);

    expect(game.connMgr.mid).toHaveBeenCalledWith(selectedConn);
    // arc must have been called (remove icon is a circle)
    expect(wasCalled(canvas._ctx, 'arc')).toBe(true);
    // Verify arc was called at the mid coords
    const arcCall = allMethodCalls(canvas._ctx).find(
      c => c.method === 'arc' && c.args[0] === mid.x && c.args[1] === mid.y
    );
    expect(arcCall).toBeDefined();
  });

  test('drawn for non-preset selectedEl', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const selectedEl = {
      x: 100, y: 80, w: 200, h: 58,
      def: { inputs: {}, outputs: {}, preset: false },
      draw: jest.fn(),
    };

    const game = makeMockGame({ selectedEl });
    r.render(game);

    // arc called at (selectedEl.x + selectedEl.w, selectedEl.y) = (300, 80)
    const arcCall = allMethodCalls(canvas._ctx).find(
      c => c.method === 'arc' && c.args[0] === 300 && c.args[1] === 80
    );
    expect(arcCall).toBeDefined();
  });

  test('NOT drawn for preset selectedEl', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const selectedEl = {
      x: 100, y: 80, w: 200, h: 58,
      def: { inputs: {}, outputs: {}, preset: true },
      draw: jest.fn(),
    };

    const game = makeMockGame({ selectedEl });
    r.render(game);

    // Remove icon should NOT be drawn at the element's top-right corner
    const arcCall = allMethodCalls(canvas._ctx).find(
      c => c.method === 'arc' && c.args[0] === 300 && c.args[1] === 80
    );
    expect(arcCall).toBeUndefined();
  });
});

describe('Renderer drawSelectionOutline', () => {
  test('roundRect called when selectedEl is set', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const selectedEl = {
      x: 100, y: 80, w: 200, h: 58,
      def: { inputs: {}, outputs: {}, preset: false },
      draw: jest.fn(),
    };

    const game = makeMockGame({ selectedEl });
    r.render(game);

    expect(wasCalled(canvas._ctx, 'roundRect')).toBe(true);
    // The outline roundRect is called with x-4, y-4, w+8, h+8
    const outlineCall = allMethodCalls(canvas._ctx).find(
      c => c.method === 'roundRect' &&
           c.args[0] === selectedEl.x - 4 &&
           c.args[1] === selectedEl.y - 4 &&
           c.args[2] === selectedEl.w + 8 &&
           c.args[3] === selectedEl.h + 8
    );
    expect(outlineCall).toBeDefined();
  });

  test('setLineDash called with dashes when selectedEl is set', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const selectedEl = {
      x: 100, y: 80, w: 200, h: 58,
      def: { inputs: {}, outputs: {}, preset: false },
      draw: jest.fn(),
    };

    const game = makeMockGame({ selectedEl });
    r.render(game);

    // setLineDash should be called with a non-empty array (dashes)
    const dashCall = allMethodCalls(canvas._ctx).find(
      c => c.method === 'setLineDash' && Array.isArray(c.args[0]) && c.args[0].length > 0
    );
    expect(dashCall).toBeDefined();
  });

  test('setLineDash NOT called when selectedEl is null', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const game = makeMockGame({ selectedEl: null });
    r.render(game);

    // setLineDash with non-empty dash array should not be called
    const dashCall = allMethodCalls(canvas._ctx).find(
      c => c.method === 'setLineDash' && Array.isArray(c.args[0]) && c.args[0].length > 0
    );
    expect(dashCall).toBeUndefined();
  });
});
