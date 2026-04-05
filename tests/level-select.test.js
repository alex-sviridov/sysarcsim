/**
 * Tests for js/level-select.js
 *
 * level-select.js is a side-effect module: on DOMContentLoaded it reads LEVELS
 * and populates #level-list with <li> cards.  We stub the DOM and fire the
 * event manually.
 */

import { LEVELS } from '../src/js/levels.js';

// ── DOM stubs ─────────────────────────────────────────────────────────────

function makeNode(tag = 'div') {
  const listeners = {};
  const node = {
    tagName:     tag.toUpperCase(),
    textContent: '',
    innerHTML:   '',
    className:   '',
    children:    [],
    addEventListener(ev, fn) {
      (listeners[ev] ??= []).push(fn);
    },
    _fire(ev, data) {
      for (const fn of listeners[ev] ?? []) fn(data ?? {});
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelectorAll() { return []; },
  };
  return node;
}

const listNode = makeNode('ol');
listNode.id = 'level-list';

const windowListeners = {};

global.document = {
  getElementById(id) {
    if (id === 'level-list') return listNode;
    return makeNode();
  },
  createElement(tag) { return makeNode(tag); },
  querySelectorAll() { return []; },
  addEventListener() {},
};

global.window = {
  addEventListener(ev, fn) {
    (windowListeners[ev] ??= []).push(fn);
  },
};

// ── Import the module (registers DOMContentLoaded handler) ────────────────

await import('../src/js/level-select.js');

async function fireDOMContentLoaded() {
  listNode.children = []; // reset list before each fire
  for (const fn of windowListeners['DOMContentLoaded'] ?? []) await fn();
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('level-select page render', () => {
  test('DOMContentLoaded handler is registered', () => {
    expect(windowListeners['DOMContentLoaded']?.length).toBeGreaterThan(0);
  });

  test('renders one <li> per level', async () => {
    await fireDOMContentLoaded();
    expect(listNode.children).toHaveLength(LEVELS.length);
  });

  test('each item has class "level-card"', async () => {
    await fireDOMContentLoaded();
    for (const li of listNode.children) {
      expect(li.className).toBe('level-card');
    }
  });

  test('each card innerHTML contains the level title', async () => {
    await fireDOMContentLoaded();
    LEVELS.forEach((level, i) => {
      expect(listNode.children[i].innerHTML).toContain(level.title);
    });
  });

  test('each card link href contains the level slug', async () => {
    await fireDOMContentLoaded();
    LEVELS.forEach((level, i) => {
      expect(listNode.children[i].innerHTML).toContain(
        `level=${encodeURIComponent(level.slug)}`
      );
    });
  });

  test('each card contains the level description', async () => {
    await fireDOMContentLoaded();
    LEVELS.forEach((level, i) => {
      expect(listNode.children[i].innerHTML).toContain(level.description);
    });
  });

  test('each card shows the demand count', async () => {
    await fireDOMContentLoaded();
    LEVELS.forEach((level, i) => {
      const demandCount = level.demands?.length ?? 0;
      expect(listNode.children[i].innerHTML).toContain(
        `${demandCount} demand`
      );
    });
  });

  test('each card shows the available component count', async () => {
    await fireDOMContentLoaded();
    LEVELS.forEach((level, i) => {
      const availCount = level.available?.length ?? 0;
      expect(listNode.children[i].innerHTML).toContain(
        `${availCount} component`
      );
    });
  });

  test('card for a level with elementsLimit > 0 shows the limit', async () => {
    const limitedLevel = LEVELS.find(l => (l.elementsLimit ?? 0) > 0);
    if (!limitedLevel) return; // no limited levels in fixture — skip
    await fireDOMContentLoaded();
    const idx = LEVELS.indexOf(limitedLevel);
    expect(listNode.children[idx].innerHTML).toContain(
      `limit: ${limitedLevel.elementsLimit}`
    );
  });

  test('card for a level with no elementsLimit does NOT show "limit:"', async () => {
    const unlimitedLevel = LEVELS.find(l => !(l.elementsLimit > 0));
    if (!unlimitedLevel) return;
    await fireDOMContentLoaded();
    const idx = LEVELS.indexOf(unlimitedLevel);
    expect(listNode.children[idx].innerHTML).not.toContain('limit:');
  });

  test('link href points to game.html', async () => {
    await fireDOMContentLoaded();
    for (const li of listNode.children) {
      expect(li.innerHTML).toContain('game.html');
    }
  });

  test('level numbers are zero-padded to 2 digits', async () => {
    await fireDOMContentLoaded();
    LEVELS.forEach((_, i) => {
      const expected = String(i + 1).padStart(2, '0');
      expect(listNode.children[i].innerHTML).toContain(expected);
    });
  });

  test('renders exactly LEVELS.length items on each call', async () => {
    await fireDOMContentLoaded();
    expect(listNode.children).toHaveLength(LEVELS.length);
  });
});
