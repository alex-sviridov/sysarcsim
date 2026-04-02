import { GameElement } from '../src/js/element.js';
import { ELEM_DEFS, HEADER_H, ROW_H, PORT_R, ELEM_W } from '../src/js/config.js';

// Stub browser APIs
global.Image = class {
  constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; }
};

// Minimal canvas 2D context mock — records method calls
function makeCtx() {
  const calls = [];
  const record = (name) => (...args) => { calls.push({ name, args }); };
  const ctx = {
    _calls: calls,
    save:          record('save'),
    restore:       record('restore'),
    beginPath:     record('beginPath'),
    fill:          record('fill'),
    stroke:        record('stroke'),
    arc:           record('arc'),
    roundRect:     record('roundRect'),
    fillText:      record('fillText'),
    measureText:   () => ({ width: 50 }),
    drawImage:     record('drawImage'),
    fillStyle:     '',
    strokeStyle:   '',
    lineWidth:     1,
    globalAlpha:   1,
    font:          '',
    textAlign:     '',
    textBaseline:  '',
    shadowColor:   '',
    shadowBlur:    0,
    shadowOffsetY: 0,
  };
  return ctx;
}

beforeEach(() => {
  GameElement.resetCounter();
});

// ── draw() — basic invocation ─────────────────────────────────────────────

describe('GameElement.draw() — canvas calls', () => {
  test('calls ctx.save() and ctx.restore() (balanced)', () => {
    const el = new GameElement('Storage', 50, 50, ELEM_DEFS.Storage);
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 100, null);
    const saves    = ctx._calls.filter(c => c.name === 'save').length;
    const restores = ctx._calls.filter(c => c.name === 'restore').length;
    expect(saves).toBeGreaterThan(0);
    expect(saves).toBe(restores);
  });

  test('calls roundRect at least once for element body', () => {
    const el = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 100, null);
    const roundRects = ctx._calls.filter(c => c.name === 'roundRect');
    expect(roundRects.length).toBeGreaterThan(0);
  });

  test('draws an arc per output port', () => {
    const el = new GameElement('WebServer', 0, 0, ELEM_DEFS.WebServer); // 1 output
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 100, null);
    const arcs = ctx._calls.filter(c => c.name === 'arc');
    // 2 input ports + 1 output port = 3 arcs minimum
    expect(arcs.length).toBeGreaterThanOrEqual(3);
  });

  test('draws an arc per input port', () => {
    const el = new GameElement('Database', 0, 0, ELEM_DEFS.Database); // 1 input
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 100, null);
    const arcs = ctx._calls.filter(c => c.name === 'arc');
    expect(arcs.length).toBeGreaterThanOrEqual(1);
  });

  test('draws no input-port arcs for source element (Storage has no inputs)', () => {
    const el = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage); // 0 inputs
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 100, null);
    const arcs = ctx._calls.filter(c => c.name === 'arc');
    // Only 1 arc for the single output port
    expect(arcs.length).toBe(1);
  });
});

// ── draw() — globalAlpha scaling with activePct ───────────────────────────

describe('GameElement.draw() — alpha blending', () => {
  test('globalAlpha is set to 1.0 when activePct = 100', () => {
    const el = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    // alpha = 0.38 + (100/100)*0.62 = 1.0
    const alphas = [];
    const proxy = new Proxy(makeCtx(), {
      set(t, p, v) { if (p === 'globalAlpha') alphas.push(v); t[p] = v; return true; }
    });
    el.draw(proxy, new Set(), 100, null);
    expect(alphas).toContain(1.0);
  });

  test('globalAlpha is set to 0.38 when activePct = 0', () => {
    const el = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    // alpha = 0.38 + (0/100)*0.62 = 0.38
    const alphas = [];
    const proxy = new Proxy(makeCtx(), {
      set(t, p, v) { if (p === 'globalAlpha') alphas.push(v); t[p] = v; return true; }
    });
    el.draw(proxy, new Set(), 0, null);
    expect(alphas).toContain(0.38);
  });

  test('globalAlpha is set to 0.69 when activePct = 50', () => {
    const el = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    // alpha = 0.38 + (50/100)*0.62 = 0.69
    const alphas = [];
    const proxy = new Proxy(makeCtx(), {
      set(t, p, v) { if (p === 'globalAlpha') alphas.push(v); t[p] = v; return true; }
    });
    el.draw(proxy, new Set(), 50, null);
    expect(alphas).toContain(0.69);
  });
});

// ── draw() — preset border rendering ─────────────────────────────────────

describe('GameElement.draw() — preset highlight', () => {
  test('calls ctx.stroke() for preset elements', () => {
    const presetDef = { ...ELEM_DEFS.WebServer, preset: true };
    const el = new GameElement('WebServer', 0, 0, presetDef);
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 100, null);
    expect(ctx._calls.some(c => c.name === 'stroke')).toBe(true);
  });

  // Output ports call ctx.stroke() for their outlines.
  // Preset adds an extra border stroke. We verify preset causes MORE stroke calls.
  test('preset elements produce more stroke calls than non-preset', () => {
    const presetDef    = { ...ELEM_DEFS.Storage, preset: true };
    const nonPresetDef = ELEM_DEFS.Storage;

    const ctxPreset    = makeCtx();
    const ctxNonPreset = makeCtx();
    const elPreset    = new GameElement('Storage', 0, 0, presetDef);
    const elNonPreset = new GameElement('Storage', 0, 0, nonPresetDef);

    elPreset.draw(ctxPreset, new Set(), 100, null);
    elNonPreset.draw(ctxNonPreset, new Set(), 100, null);

    const presetStrokes    = ctxPreset._calls.filter(c => c.name === 'stroke').length;
    const nonPresetStrokes = ctxNonPreset._calls.filter(c => c.name === 'stroke').length;
    expect(presetStrokes).toBeGreaterThan(nonPresetStrokes);
  });
});

// ── draw() — port labels using computeResult ──────────────────────────────

describe('GameElement.draw() — port label text', () => {
  test('calls fillText for each input and output port', () => {
    const el = new GameElement('WebServer', 0, 0, ELEM_DEFS.WebServer); // 2 in, 1 out
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 100, null);
    const texts = ctx._calls.filter(c => c.name === 'fillText');
    // 2 input labels + 1 output label + 1 element label = 4 minimum
    expect(texts.length).toBeGreaterThanOrEqual(4);
  });

  test('uses computeResult.received for input port labels when provided', () => {
    const el = new GameElement('Database', 0, 0, ELEM_DEFS.Database); // 1 input: Storage demand 85
    const received = new Map([[`${el.id}:0`, 42]]);
    const flow     = new Map();
    const computeResult = { received, flow };
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 100, computeResult);
    const texts = ctx._calls.filter(c => c.name === 'fillText').map(c => c.args[0]);
    expect(texts.some(t => typeof t === 'string' && t.includes('42'))).toBe(true);
  });

  test('shows 0/demand when computeResult is null', () => {
    const el = new GameElement('Database', 0, 0, ELEM_DEFS.Database);
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 100, null);
    const texts = ctx._calls.filter(c => c.name === 'fillText').map(c => c.args[0]);
    // recv defaults to 0 → label should contain "0"
    expect(texts.some(t => typeof t === 'string' && t.includes('0'))).toBe(true);
  });
});

// ── draw() — amber overlay for partial activity ───────────────────────────

describe('GameElement.draw() — partial activity amber overlay', () => {
  test('sets amber fillStyle (#e3b341) when activePct is between 0 and 100', () => {
    const el = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    const ctx = makeCtx();
    el.draw(ctx, new Set(), 50, null);
    // The property is set via direct assignment; check what it was last set to
    // during the amber overlay path (between 0 and 100)
    const allFillStyles = [];
    // Re-run with a proxy that captures all fillStyle assignments
    const proxy = new Proxy(ctx, {
      set(target, prop, value) {
        if (prop === 'fillStyle') allFillStyles.push(value);
        target[prop] = value;
        return true;
      }
    });
    el.draw(proxy, new Set(), 50, null);
    expect(allFillStyles).toContain('#e3b341');
  });

  test('does NOT set amber fillStyle (#e3b341) when activePct is 100', () => {
    const el = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    const allFillStyles = [];
    const proxy = new Proxy(makeCtx(), {
      set(target, prop, value) {
        if (prop === 'fillStyle') allFillStyles.push(value);
        target[prop] = value;
        return true;
      }
    });
    el.draw(proxy, new Set(), 100, null);
    expect(allFillStyles).not.toContain('#e3b341');
  });

  test('does NOT set amber fillStyle (#e3b341) when activePct is 0', () => {
    const el = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    const allFillStyles = [];
    const proxy = new Proxy(makeCtx(), {
      set(target, prop, value) {
        if (prop === 'fillStyle') allFillStyles.push(value);
        target[prop] = value;
        return true;
      }
    });
    el.draw(proxy, new Set(), 0, null);
    expect(allFillStyles).not.toContain('#e3b341');
  });
});

// ── draw() — header color matches def.color ───────────────────────────────

describe('GameElement.draw() — header accent color', () => {
  test('sets fillStyle to def.color for header', () => {
    const el = new GameElement('WebServer', 0, 0, ELEM_DEFS.WebServer);
    const allFillStyles = [];
    const proxy = new Proxy(makeCtx(), {
      set(target, prop, value) {
        if (prop === 'fillStyle') allFillStyles.push(value);
        target[prop] = value;
        return true;
      }
    });
    el.draw(proxy, new Set(), 100, null);
    expect(allFillStyles).toContain(ELEM_DEFS.WebServer.color);
  });
});

// ── Dimension helpers used by draw ────────────────────────────────────────

describe('GameElement dimensions — row calculation', () => {
  test('APIGateway: 1 input, 1 output → 1 row', () => {
    const el = new GameElement('APIGateway', 0, 0, ELEM_DEFS.APIGateway);
    expect(el.h).toBe(HEADER_H + 1 * ROW_H);
  });

  test('Storage: 0 inputs, 1 output → 1 row (clamped to 1)', () => {
    const el = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    expect(el.h).toBe(HEADER_H + 1 * ROW_H);
  });

  test('DirectAttachStorage: 0 inputs, 1 output → 1 row', () => {
    const el = new GameElement('DirectAttachStorage', 0, 0, ELEM_DEFS.DirectAttachStorage);
    expect(el.h).toBe(HEADER_H + 1 * ROW_H);
  });

  test('width is always ELEM_W regardless of port count', () => {
    for (const [type, def] of Object.entries(ELEM_DEFS)) {
      const el = new GameElement(type, 0, 0, def);
      expect(el.w).toBe(ELEM_W);
    }
  });
});

// ── Port positions for all element types ──────────────────────────────────

describe('port positions — all element types', () => {
  const cases = Object.entries(ELEM_DEFS);

  test.each(cases)('%s: each inputPos.x equals el.x', (type, def) => {
    const el = new GameElement(type, 77, 33, def);
    const keys = Object.keys(def.inputs);
    for (let i = 0; i < keys.length; i++) {
      expect(el.inputPos(i).x).toBe(77);
    }
  });

  test.each(cases)('%s: each outputPos.x equals el.x + ELEM_W', (type, def) => {
    const el = new GameElement(type, 77, 33, def);
    const keys = Object.keys(def.outputs);
    for (let i = 0; i < keys.length; i++) {
      expect(el.outputPos(i).x).toBe(77 + ELEM_W);
    }
  });

  test.each(cases)('%s: all port y values are within element bounds', (type, def) => {
    const el = new GameElement(type, 0, 0, def);
    const inKeys  = Object.keys(def.inputs);
    const outKeys = Object.keys(def.outputs);
    for (let i = 0; i < inKeys.length;  i++) expect(el.inputPos(i).y).toBeLessThanOrEqual(el.y + el.h);
    for (let i = 0; i < outKeys.length; i++) expect(el.outputPos(i).y).toBeLessThanOrEqual(el.y + el.h);
  });
});

// ── connectedInputs set affects port fill color ───────────────────────────

describe('GameElement.draw() — connectedInputs coloring', () => {
  test('connected vs unconnected port produces different fillStyle sequences', () => {
    const el = new GameElement('Database', 0, 0, ELEM_DEFS.Database); // 1 input
    const collectFills = (connectedInputs) => {
      const fills = [];
      const proxy = new Proxy(makeCtx(), {
        set(t, p, v) { if (p === 'fillStyle') fills.push(v); t[p] = v; return true; }
      });
      el.draw(proxy, connectedInputs, 100, null);
      return fills;
    };

    const fillsUnconnected = collectFills(new Set());
    const fillsConnected   = collectFills(new Set([0]));
    // The sequences should differ because connected uses PORT_COLOR vs '#21262d'
    expect(fillsUnconnected).not.toEqual(fillsConnected);
  });
});
