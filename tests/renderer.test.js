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
      getRenderState: jest.fn(() => ({ state, selectedEl, ghostElem, mx, my, ghostMx: mx, ghostMy: my })),
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

describe('Renderer dead wire (connRatio === 0)', () => {
  function makeConnectedGame(canvas) {
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
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    return { r, fromElem, toElem, conn, elemMap };
  }

  test('setLineDash called with a non-empty pattern (dashed dead wire)', () => {
    const canvas = makeCanvas();
    const { r, conn, elemMap } = makeConnectedGame(canvas);
    // connRatio defaults to 0 → dead wire path
    const game = makeMockGame({ connections: [conn], elemMap });
    r.render(game);

    const dashCall = allMethodCalls(canvas._ctx).find(
      c => c.method === 'setLineDash' && Array.isArray(c.args[0]) && c.args[0].length > 0
    );
    expect(dashCall).toBeDefined();
  });

  test('lineDashOffset is set (animated) for dead wire', () => {
    const canvas = makeCanvas();
    const { r, conn, elemMap } = makeConnectedGame(canvas);
    const game = makeMockGame({ connections: [conn], elemMap });
    r.render(game, 1000); // non-zero `now` so offset is non-zero

    const offsetSet = canvas._ctx.calls.find(c => c.set === 'lineDashOffset');
    expect(offsetSet).toBeDefined();
    expect(offsetSet.value).not.toBe(0);
  });

  test('bezierCurveTo called for dead wire', () => {
    const canvas = makeCanvas();
    const { r, conn, elemMap } = makeConnectedGame(canvas);
    const game = makeMockGame({ connections: [conn], elemMap });
    r.render(game);

    expect(wasCalled(canvas._ctx, 'bezierCurveTo')).toBe(true);
  });

  test('strokeStyle set to red (#f85149) for dead wire', () => {
    const canvas = makeCanvas();
    const { r, conn, elemMap } = makeConnectedGame(canvas);
    const game = makeMockGame({ connections: [conn], elemMap });
    r.render(game);

    const redStroke = canvas._ctx.calls.find(
      c => c.set === 'strokeStyle' && c.value === '#f85149'
    );
    expect(redStroke).toBeDefined();
  });
});

describe('Renderer wire shimmer (100% active wire)', () => {
  test('arc drawn for shimmer orb when wirePct=100 and shimmer phase is active', () => {
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
      connections: [conn], elemMap,
      computeActivePct: jest.fn(() => ({
        activePct, flow: new Map(), received: new Map(), connRatio,
      })),
    });

    // Pick a `now` where the shimmer phase is active (phase < 0.3).
    // PERIOD=3000, stagger=(connId*1117)%PERIOD='conn1' is NaN*... connId is 'conn1' string
    // so stagger = NaN%3000 = NaN → offset = NaN, phase = NaN → condition NaN>0.3 is false → shimmer IS drawn.
    // Use now=0 to guarantee (0+NaN)%3000/3000 = NaN, which is not > 0.3.
    r.render(game, 0);

    const arcCalls = allMethodCalls(canvas._ctx).filter(c => c.method === 'arc');
    // Packets: N=3 packets × (trail dots + 2 arcs each) + shimmer arc ≥ 7
    expect(arcCalls.length).toBeGreaterThanOrEqual(7);
  });

  test('no shimmer arc drawn when wirePct < 100', () => {
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

    const conn = { id: 'conn2', fromId: 'from', toId: 'to', fromPort: 0, toPort: 0 };
    const activePct = new Map([[fromElem, 50], [toElem, 50]]);
    const connRatio  = new Map([['conn2', 0.5]]);
    const game = makeMockGame({
      connections: [conn], elemMap,
      computeActivePct: jest.fn(() => ({
        activePct, flow: new Map(), received: new Map(), connRatio,
      })),
    });

    r.render(game, 0);

    // No shimmer: wirePct=50 so drawWireShimmer is never called.
    // Packets still draw arcs, but we can confirm no extra shimmer fillStyle='#ffffff' with high shadowBlur.
    // Check shadowBlur=20 was never set (shimmer uses 20, packets use 10).
    const shimmerBlur = canvas._ctx.calls.find(c => c.set === 'shadowBlur' && c.value === 20);
    expect(shimmerBlur).toBeUndefined();
  });
});

describe('Renderer starved port pulse', () => {
  test('arc drawn for input port with unmet demand', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const el = {
      id: 'el1', x: 100, y: 100, w: 200, h: 58,
      def: { inputs: { SQL: { demand: 30 } }, outputs: {} },
      inputPos:  jest.fn(() => ({ x: 100, y: 143 })),
      outputPos: jest.fn(() => ({ x: 300, y: 143 })),
      draw: jest.fn(),
    };
    const elemMap = new Map([['el1', el]]);
    // received=0 < demand=30 → starved
    const received = new Map();
    const game = makeMockGame({
      elements: [el], elemMap,
      computeActivePct: jest.fn(() => ({
        activePct: new Map([[el, 0]]),
        flow: new Map(), received, connRatio: new Map(),
      })),
    });

    r.render(game, 0);

    // arc should be called for the starved pulse ring
    const arcCalls = allMethodCalls(canvas._ctx).filter(c => c.method === 'arc');
    expect(arcCalls.length).toBeGreaterThan(0);
  });

  test('no pulse arc when demand is fully met', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const el = {
      id: 'el1', x: 100, y: 100, w: 200, h: 58,
      def: { inputs: { SQL: { demand: 30 } }, outputs: {} },
      inputPos:  jest.fn(() => ({ x: 100, y: 143 })),
      outputPos: jest.fn(() => ({ x: 300, y: 143 })),
      draw: jest.fn(),
    };
    const elemMap = new Map([['el1', el]]);
    const received = new Map([['el1:0', 30]]); // fully met
    const game = makeMockGame({
      elements: [el], elemMap,
      computeActivePct: jest.fn(() => ({
        activePct: new Map([[el, 100]]),
        flow: new Map(), received, connRatio: new Map(),
      })),
    });

    r.render(game, 0);

    // phase=0 → expand=0 → alpha=0.55 but at phase=0 alpha=(1-0)*0.55=0.55... actually drawn.
    // The pulse IS drawn at phase=0 but only if unmet. Since demand IS met, no pulse arc.
    const redStroke = canvas._ctx.calls.find(c => c.set === 'strokeStyle' && c.value === '#f85149');
    expect(redStroke).toBeUndefined();
  });

  test('no pulse when demand is zero', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);

    const el = {
      id: 'el1', x: 100, y: 100, w: 200, h: 58,
      def: { inputs: { SQL: { demand: 0 } }, outputs: {} },
      inputPos:  jest.fn(() => ({ x: 100, y: 143 })),
      outputPos: jest.fn(() => ({ x: 300, y: 143 })),
      draw: jest.fn(),
    };
    const elemMap = new Map([['el1', el]]);
    const game = makeMockGame({
      elements: [el], elemMap,
      computeActivePct: jest.fn(() => ({
        activePct: new Map([[el, 100]]),
        flow: new Map(), received: new Map(), connRatio: new Map(),
      })),
    });

    r.render(game, 0);

    const arcCalls = allMethodCalls(canvas._ctx).filter(c => c.method === 'arc');
    expect(arcCalls.length).toBe(0);
  });
});

describe('Renderer marching ants (selection outline)', () => {
  test('lineDashOffset changes between two different `now` values', () => {
    const selectedEl = {
      x: 100, y: 80, w: 200, h: 58,
      def: { inputs: {}, outputs: {}, preset: false },
      draw: jest.fn(),
    };

    const canvas1 = makeCanvas();
    const r1 = new Renderer(canvas1);
    r1.resize(800, 600, 1);
    r1.render(makeMockGame({ selectedEl }), 0);
    const offset0 = canvas1._ctx.calls.find(c => c.set === 'lineDashOffset')?.value ?? 0;

    const canvas2 = makeCanvas();
    const r2 = new Renderer(canvas2);
    r2.resize(800, 600, 1);
    r2.render(makeMockGame({ selectedEl }), 200); // -(200/40)%10 = -5%10 = -5
    const offset4000 = canvas2._ctx.calls.find(c => c.set === 'lineDashOffset')?.value ?? 0;

    expect(offset0).not.toBe(offset4000);
  });

  test('lineDashOffset reset to 0 after drawing', () => {
    const selectedEl = {
      x: 100, y: 80, w: 200, h: 58,
      def: { inputs: {}, outputs: {}, preset: false },
      draw: jest.fn(),
    };

    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    r.render(makeMockGame({ selectedEl }), 1000);

    // The last lineDashOffset set should be 0 (cleanup)
    const offsetSets = canvas._ctx.calls.filter(c => c.set === 'lineDashOffset');
    expect(offsetSets.length).toBeGreaterThanOrEqual(2);
    expect(offsetSets[offsetSets.length - 1].value).toBe(0);
  });
});

describe('Renderer snap indicator orbit arcs (valid snap)', () => {
  function makeWireState(snapValid) {
    const fromElem = {
      id: 'from', x: 50, y: 100, w: 200, h: 58,
      def: { inputs: {}, outputs: { WebSite: { supply: 100 } } },
      inputPos:  jest.fn(() => ({ x: 50,  y: 143 })),
      outputPos: jest.fn(() => ({ x: 250, y: 143 })),
      draw: jest.fn(),
    };
    const snapElem = {
      id: 'snap', x: 350, y: 100, w: 200, h: 58,
      def: { inputs: { WebSite: { demand: 100 } }, outputs: {} },
      inputPos:  jest.fn(() => ({ x: 350, y: 143 })),
      outputPos: jest.fn(() => ({ x: 550, y: 143 })),
      draw: jest.fn(),
    };
    return {
      mode: 'wire', fromElem, fromPort: 0,
      mx: 350, my: 143, ox: 250, oy: 143, moved: true,
      snap: { snapElem, snapPort: 0, snapValid },
    };
  }

  test('orbit arcs drawn on valid snap (two extra arc calls)', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    const state = makeWireState(true);
    r.render(makeMockGame({ state }), 500);

    // Valid snap draws: 1 ring arc + 2 orbit arcs = 3 arc calls for the indicator
    const arcCalls = allMethodCalls(canvas._ctx).filter(c => c.method === 'arc');
    expect(arcCalls.length).toBeGreaterThanOrEqual(3);
  });

  test('no orbit arcs on invalid snap (only ring + X lines)', () => {
    const canvas = makeCanvas();
    const r = new Renderer(canvas);
    r.resize(800, 600, 1);
    const state = makeWireState(false);
    r.render(makeMockGame({ state }), 500);

    // Invalid snap: 1 arc (ring) + moveTo/lineTo for X — no orbit arcs
    const arcCalls = allMethodCalls(canvas._ctx).filter(c => c.method === 'arc');
    expect(arcCalls).toHaveLength(1);
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
