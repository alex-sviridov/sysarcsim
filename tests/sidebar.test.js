/**
 * Tests for the Sidebar class in src/js/sidebar.js
 *
 * Sidebar interacts with the DOM heavily. We build a rich DOM stub before
 * importing so the module-level references resolve correctly.
 */

import { jest } from '@jest/globals';
import { EventBus, Events } from '../src/js/event-bus.js';
import { ELEM_DEFS } from '../src/js/config.js';
import { LEVELS } from '../src/js/levels.js';

// ── Browser stubs ─────────────────────────────────────────────────────────────

global.Image = class {
  constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; }
};

// ── Smart DOM node factory ────────────────────────────────────────────────────

function makeNode(tagName = 'div') {
  const listeners = {};
  const children  = [];

  const node = {
    tagName,
    textContent: '',
    innerHTML:   '',
    hidden:      false,
    className:   '',
    dataset:     {},
    style:       {},
    get children() { return children; },
    classList: {
      _classes: new Set(),
      add(c)      { this._classes.add(c); },
      remove(c)   { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c);
        } else if (force) {
          this._classes.add(c);
        } else {
          this._classes.delete(c);
        }
      },
    },
    addEventListener(ev, fn) {
      if (!listeners[ev]) listeners[ev] = [];
      listeners[ev].push(fn);
    },
    _fire(ev, data) {
      for (const fn of listeners[ev] ?? []) fn(data ?? {});
    },
    _listeners: listeners,
    appendChild(child) {
      children.push(child);
      child._parent = node;
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
    },
    // querySelectorAll: search own children recursively
    querySelectorAll(sel) {
      const results = [];
      function walk(el) {
        if (!el.children) return;
        for (const child of el.children) {
          if (matchesSel(child, sel)) results.push(child);
          walk(child);
        }
      }
      walk(node);
      return results;
    },
    // closest: walk up the parent chain
    closest(sel) {
      let cur = node;
      while (cur) {
        if (matchesSel(cur, sel)) return cur;
        cur = cur._parent ?? null;
      }
      return null;
    },
    getContext() { return new Proxy({}, { get() { return () => {}; }, set() { return true; } }); },
    getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
    width: 800, height: 600,
    _parent: null,
    // For innerHTML = '' → clear children
    set innerHTML(v) {
      if (v === '') children.length = 0;
    },
    get innerHTML() { return ''; },
    // prevent
    preventDefault: jest.fn(),
  };
  return node;
}

/**
 * Very small CSS-selector matcher for the patterns Sidebar actually uses:
 *  '#sidebar-cards .card--active'
 *  '.card[data-type]'
 *
 * We check both className (string) and classList._classes (Set) so that
 * both `node.className = 'card'` and `node.classList.add('card')` work.
 */
function hasClass(node, cls) {
  if (!node || !node.classList) return false;
  if (node.classList._classes.has(cls)) return true;
  // Also check the plain className string
  const cn = node.className || '';
  return cn.split(/\s+/).includes(cls);
}

function matchesSel(node, sel) {
  if (!node || typeof node !== 'object') return false;

  // Pattern: '.className[data-attr]' → check class and dataset
  const attrMatch = sel.match(/^\.([^[]+)\[data-([^\]]+)\]$/);
  if (attrMatch) {
    const cls  = attrMatch[1];
    const attr = attrMatch[2];
    return hasClass(node, cls) && (attr in (node.dataset || {}));
  }

  // Pattern: '.className' → check class
  const classOnly = sel.match(/^\.([^\s.[#]+)$/);
  if (classOnly) {
    return hasClass(node, classOnly[1]);
  }

  return false;
}

// ── Document stub factory ─────────────────────────────────────────────────────

function makeDocumentStub() {
  const sidebarNode    = makeNode('div');
  const sidebarCards   = makeNode('div');
  const btnNextLevel   = makeNode('button');
  const btnPrevLevel   = makeNode('button');
  const btnReset       = makeNode('button');
  const levelTitle     = makeNode('div');
  const desk           = makeNode('canvas');

  const nodes = {
    sidebar:                    sidebarNode,
    'sidebar-cards':            sidebarCards,
    'btn-next-level':           btnNextLevel,
    'btn-prev-level':           btnPrevLevel,
    'btn-reset':                btnReset,
    'level-title':              levelTitle,
    'level-description-popup':  makeNode('div'),
    'btn-info':                 makeNode('button'),
    'sidebar-section-label':    makeNode('div'),
    desk,
    'win-badge':                makeNode('div'),
    status:                     makeNode('div'),
  };

  return {
    _nodes: nodes,
    getElementById(id) { return nodes[id] ?? null; },
    createElement(tag) {
      const n = makeNode(tag);
      n.innerHTML = ''; // writable dummy
      return n;
    },
    querySelectorAll(sel) {
      // Delegate to the sidebar-cards node for '.card--active' queries
      if (sel.includes('sidebar-cards')) {
        return sidebarCards.querySelectorAll(sel.replace(/^#sidebar-cards\s*/, ''));
      }
      return [];
    },
    addEventListener() {},
  };
}

// ── Apply global document before importing Sidebar ────────────────────────────

let fakeDoc = makeDocumentStub();
global.document = fakeDoc;

global.window = { devicePixelRatio: 1, addEventListener() {} };
global.requestAnimationFrame = () => {};
global.setTimeout  = () => 0;
global.clearTimeout = () => {};

const { Sidebar } = await import('../src/js/sidebar.js');

// ── Test helpers ──────────────────────────────────────────────────────────────

// Canonical level objects — reused so LEVELS.indexOf() works correctly.
const LEVEL_A = { slug: 'level-a', title: 'Level A', description: 'Desc A', demands: [], available: ['WebServer', 'Database'] };
const LEVEL_B = { slug: 'level-b', title: 'Level B', description: 'Desc B', demands: [], available: ['WebServer'] };
const LEVEL_C = { slug: 'level-c', title: 'Level C', description: 'Desc C', demands: [], available: ['Database'] };

beforeEach(() => {
  LEVELS.length = 0;
  LEVELS.push(LEVEL_A, LEVEL_B, LEVEL_C);
});

function freshSetup() {
  fakeDoc = makeDocumentStub();
  global.document = fakeDoc;
  const bus     = new EventBus();
  const sidebar = new Sidebar(bus);
  return { bus, sidebar, nodes: fakeDoc._nodes };
}

function level1() {
  return LEVEL_A;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sidebar constructor', () => {
  test('does not throw', () => {
    expect(() => freshSetup()).not.toThrow();
  });
});

describe('Sidebar.build()', () => {
  test('sets level-title.textContent to level.title', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(level1());
    expect(nodes['level-title'].textContent).toBe(level1().title);
  });

  test('creates correct number of cards (one per available type)', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(level1());
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    expect(cards).toHaveLength(2);
  });

  test('each card has dataset.type set to the type', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(level1());
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    const types = cards.map(c => c.dataset.type);
    expect(types).toContain('WebServer');
    expect(types).toContain('Database');
  });

  test('each card has a child with class "card-name" and correct label text', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(level1());
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    for (const card of cards) {
      const nameEl = card.querySelectorAll('.card-name')[0];
      expect(nameEl).toBeDefined();
      const def = ELEM_DEFS[card.dataset.type];
      expect(nameEl.textContent).toBe(def.label);
    }
  });

  test('each card has output spans with class "out" for each output key', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(level1());
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    for (const card of cards) {
      const def     = ELEM_DEFS[card.dataset.type];
      const outKeys = Object.keys(def.outputs);
      const outSpans = card.querySelectorAll('.out');
      expect(outSpans).toHaveLength(outKeys.length);
    }
  });

  test('each card has input spans with class "in" for each input key', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(level1());
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    for (const card of cards) {
      const def    = ELEM_DEFS[card.dataset.type];
      const inKeys = Object.keys(def.inputs);
      const inSpans = card.querySelectorAll('.in');
      expect(inSpans).toHaveLength(inKeys.length);
    }
  });
});

describe('Sidebar.clearPending()', () => {
  test('emits PENDING_CHANGED with { type: null, ghostElem: null }', () => {
    const { sidebar, bus } = freshSetup();
    const fn = jest.fn();
    bus.on(Events.PENDING_CHANGED, fn);
    sidebar.clearPending();
    expect(fn).toHaveBeenCalledWith({ type: null, ghostElem: null });
  });

  test('removes card--active from any active cards', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(level1());

    // Manually add card--active to the first card
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    cards[0].classList.add('card--active');

    sidebar.clearPending();

    for (const card of cards) {
      expect(card.classList.contains('card--active')).toBe(false);
    }
  });
});

function makeCardEvent(card) {
  // Simulate a mousedown event whose target is a leaf inside the card.
  // We need .closest('.card[data-type]') to return the card itself.
  const target = makeNode('div');
  target._parent = card;
  target.closest = (sel) => {
    let cur = target;
    while (cur) {
      if (matchesSel(cur, sel)) return cur;
      cur = cur._parent ?? null;
    }
    return null;
  };
  return { target, preventDefault: jest.fn() };
}

describe('Sidebar card click interactions', () => {
  test('clicking card emits PENDING_CHANGED with { type, ghostElem } where ghostElem is not null', () => {
    const { sidebar, bus, nodes } = freshSetup();
    sidebar.build(level1());
    const fn = jest.fn();
    bus.on(Events.PENDING_CHANGED, fn);

    const cards   = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    const card    = cards[0]; // WebServer
    const event   = makeCardEvent(card);

    nodes['sidebar-cards']._fire('mousedown', event);

    // clearPending emits first, then the card click emits with a ghostElem
    const lastCall = fn.mock.calls[fn.mock.calls.length - 1][0];
    expect(lastCall.type).toBe('WebServer');
    expect(lastCall.ghostElem).not.toBeNull();
  });

  test('clicking card emits SIDEBAR_DRAG_START', () => {
    const { sidebar, bus, nodes } = freshSetup();
    sidebar.build(level1());
    const fn = jest.fn();
    bus.on(Events.SIDEBAR_DRAG_START, fn);

    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    const event = makeCardEvent(cards[0]);
    nodes['sidebar-cards']._fire('mousedown', event);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('clicking same card again (toggle) emits PENDING_CHANGED with null type', () => {
    const { sidebar, bus, nodes } = freshSetup();
    sidebar.build(level1());

    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    const event = makeCardEvent(cards[0]);

    // First click — select
    nodes['sidebar-cards']._fire('mousedown', event);

    const fn = jest.fn();
    bus.on(Events.PENDING_CHANGED, fn);

    // Second click — toggle off
    nodes['sidebar-cards']._fire('mousedown', event);

    const found = fn.mock.calls.some(([d]) => d.type === null && d.ghostElem === null);
    expect(found).toBe(true);
  });

  test('clicking sidebar background (not a card) calls clearPending (emits PENDING_CHANGED null)', () => {
    const { sidebar, bus, nodes } = freshSetup();
    sidebar.build(level1());
    const fn = jest.fn();
    bus.on(Events.PENDING_CHANGED, fn);

    // Fire mousedown on the sidebar node with a target that is NOT a card
    const bgTarget = makeNode('div');
    bgTarget._parent = nodes['sidebar'];
    bgTarget.closest = () => null;

    nodes['sidebar']._fire('mousedown', { target: bgTarget });

    const found = fn.mock.calls.some(([d]) => d.type === null);
    expect(found).toBe(true);
  });
});

describe('Sidebar elements limit (LIMIT_CHANGED)', () => {
  function level() {
    return { title: 'Test', demands: [], available: ['WebServer', 'Database'] };
  }

  test('LIMIT_CHANGED with count < limit does not disable cards', () => {
    const { bus, sidebar, nodes } = freshSetup();
    sidebar.build(level());
    bus.emit(Events.LIMIT_CHANGED, { count: 2, limit: 5 });
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    for (const card of cards) {
      expect(card.classList.contains('card--disabled')).toBe(false);
    }
  });

  test('LIMIT_CHANGED with count === limit disables all cards', () => {
    const { bus, sidebar, nodes } = freshSetup();
    sidebar.build(level());
    bus.emit(Events.LIMIT_CHANGED, { count: 5, limit: 5 });
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.classList.contains('card--disabled')).toBe(true);
    }
  });

  test('LIMIT_CHANGED with limit 0 (unlimited) never disables cards', () => {
    const { bus, sidebar, nodes } = freshSetup();
    sidebar.build(level());
    bus.emit(Events.LIMIT_CHANGED, { count: 999, limit: 0 });
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    for (const card of cards) {
      expect(card.classList.contains('card--disabled')).toBe(false);
    }
  });

  test('cards re-enable when count drops below limit', () => {
    const { bus, sidebar, nodes } = freshSetup();
    sidebar.build(level());
    bus.emit(Events.LIMIT_CHANGED, { count: 3, limit: 3 });
    bus.emit(Events.LIMIT_CHANGED, { count: 2, limit: 3 });
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    for (const card of cards) {
      expect(card.classList.contains('card--disabled')).toBe(false);
    }
  });

  test('clicking a disabled card emits SET_STATUS with limit message', () => {
    const { bus, sidebar, nodes } = freshSetup();
    sidebar.build(level());
    bus.emit(Events.LIMIT_CHANGED, { count: 3, limit: 3 });

    const fn = jest.fn();
    bus.on(Events.SET_STATUS, fn);

    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    const event = makeCardEvent(cards[0]);
    nodes['sidebar-cards']._fire('mousedown', event);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].msg).toMatch(/limit/i);
    expect(fn.mock.calls[0][0].type).toBe('warn');
    expect(fn.mock.calls[0][0].duration).toBeGreaterThan(0);
  });

  test('clicking a disabled card does NOT emit PENDING_CHANGED or SIDEBAR_DRAG_START', () => {
    const { bus, sidebar, nodes } = freshSetup();
    sidebar.build(level());
    bus.emit(Events.LIMIT_CHANGED, { count: 3, limit: 3 });

    const pendingFn = jest.fn();
    const dragFn    = jest.fn();
    bus.on(Events.PENDING_CHANGED, pendingFn);
    bus.on(Events.SIDEBAR_DRAG_START, dragFn);

    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    const event = makeCardEvent(cards[0]);
    nodes['sidebar-cards']._fire('mousedown', event);

    expect(pendingFn).not.toHaveBeenCalled();
    expect(dragFn).not.toHaveBeenCalled();
  });

  test('build() resets disabled state', () => {
    const { bus, sidebar, nodes } = freshSetup();
    sidebar.build(level());
    bus.emit(Events.LIMIT_CHANGED, { count: 3, limit: 3 });
    sidebar.build(level());
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    for (const card of cards) {
      expect(card.classList.contains('card--disabled')).toBe(false);
    }
  });
});

describe('Sidebar button events', () => {
  test('btn-reset click emits GAME_RESET', () => {
    const { bus, nodes } = freshSetup();
    const fn = jest.fn();
    bus.on(Events.GAME_RESET, fn);
    nodes['btn-reset']._fire('click');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('btn-next-level click emits LEVEL_NEXT', () => {
    const { bus, nodes } = freshSetup();
    const fn = jest.fn();
    bus.on(Events.LEVEL_NEXT, fn);
    nodes['btn-next-level']._fire('click');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('btn-prev-level click emits LEVEL_PREV', () => {
    const { bus, nodes } = freshSetup();
    const fn = jest.fn();
    bus.on(Events.LEVEL_PREV, fn);
    nodes['btn-prev-level']._fire('click');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar nav button state', () => {
  test('prev button is disabled on first level', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_A); // first level
    expect(nodes['btn-prev-level'].disabled).toBe(true);
  });

  test('prev button is enabled on non-first level', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_B); // middle level
    expect(nodes['btn-prev-level'].disabled).toBe(false);
  });

  test('next button is enabled before winning on non-last level', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_A);
    expect(nodes['btn-next-level'].disabled).toBe(false);
  });

  test('next button is enabled after setWon(true) on non-last level', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_A);
    sidebar.setWon(true);
    expect(nodes['btn-next-level'].disabled).toBe(false);
    expect(nodes['btn-next-level'].classList.contains('btn-next--ready')).toBe(true);
  });

  test('next button stays disabled after setWon(true) on last level', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_C); // last level
    sidebar.setWon(true);
    expect(nodes['btn-next-level'].disabled).toBe(true);
  });

  test('next button loses ready style after setWon(false)', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_A);
    sidebar.setWon(true);
    sidebar.setWon(false);
    expect(nodes['btn-next-level'].disabled).toBe(false);
    expect(nodes['btn-next-level'].classList.contains('btn-next--ready')).toBe(false);
  });

  test('build() resets won style — next button no longer ready', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_A);
    sidebar.setWon(true);
    sidebar.build(LEVEL_B); // rebuild resets won
    expect(nodes['btn-next-level'].disabled).toBe(false);
    expect(nodes['btn-next-level'].classList.contains('btn-next--ready')).toBe(false);
  });

  test('description popup is hidden after build()', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_A);
    expect(nodes['level-description-popup'].hidden).toBe(true);
  });

  test('description popup text is set to level description', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_A);
    expect(nodes['level-description-popup'].textContent).toBe('Desc A');
  });
});

describe('Sidebar level-local elements (level.elements)', () => {
  const LOCAL_DEF = {
    label: 'Custom Widget',
    inputs:  { WebSite: { demand: 50 } },
    outputs: { WebSite: { supply: 50 } },
    color: '#ff0000',
    icon: '',
  };

  const LEVEL_WITH_LOCAL = {
    slug: 'level-x',
    title: 'Level X',
    description: 'Has a local element',
    demands: [],
    available: ['CustomWidget'],
    elements: { CustomWidget: LOCAL_DEF },
  };

  const LEVEL_OVERRIDE = {
    slug: 'level-y',
    title: 'Level Y',
    description: 'Overrides a global element',
    demands: [],
    available: ['WebServer'],
    elements: {
      WebServer: {
        label: 'Custom Web Server',
        inputs:  {},
        outputs: { WebSite: { supply: 200 } },
        color: '#00ff00',
        icon: '',
      },
    },
  };

  beforeEach(() => {
    LEVELS.length = 0;
    LEVELS.push(LEVEL_WITH_LOCAL, LEVEL_OVERRIDE);
  });

  afterEach(() => {
    LEVELS.length = 0;
    LEVELS.push(LEVEL_A, LEVEL_B, LEVEL_C);
  });

  test('build() creates a card for a level-local type not in ELEM_DEFS', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_WITH_LOCAL);
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.type).toBe('CustomWidget');
  });

  test('card for level-local type uses the local definition label', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_WITH_LOCAL);
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    const nameEl = cards[0].querySelectorAll('.card-name')[0];
    expect(nameEl.textContent).toBe('Custom Widget');
  });

  test('level-local definition overrides global ELEM_DEFS for the same type', () => {
    const { sidebar, nodes } = freshSetup();
    sidebar.build(LEVEL_OVERRIDE);
    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    expect(cards).toHaveLength(1);
    const nameEl = cards[0].querySelectorAll('.card-name')[0];
    expect(nameEl.textContent).toBe('Custom Web Server');
  });

  test('clicking a level-local card creates a ghost element with the local def', () => {
    const { sidebar, bus, nodes } = freshSetup();
    sidebar.build(LEVEL_WITH_LOCAL);
    const fn = jest.fn();
    bus.on(Events.PENDING_CHANGED, fn);

    const cards = nodes['sidebar-cards'].querySelectorAll('.card[data-type]');
    const event = makeCardEvent(cards[0]);
    nodes['sidebar-cards']._fire('mousedown', event);

    const lastCall = fn.mock.calls[fn.mock.calls.length - 1][0];
    expect(lastCall.type).toBe('CustomWidget');
    expect(lastCall.ghostElem).not.toBeNull();
  });
});
