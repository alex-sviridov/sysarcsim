import {
  ELEM_W, HEADER_H, ROW_H, PORT_R, PORT_HIT, PORT_SNAP,
  GRID_SIZE, REMOVE_ICON_R, REMOVE_HIT_R, SNAP_INDICATOR_R, BEZIER_SAMPLES,
  PORT_COLOR, ELEM_DEFS,
  inputKeys, outputKeys,
} from '../src/js/config.js';

// ── Numeric constants ──────────────────────────────────────────────────────

describe('visual constants', () => {
  test('ELEM_W is 200', () => expect(ELEM_W).toBe(200));
  test('HEADER_H is 28', () => expect(HEADER_H).toBe(28));
  test('ROW_H is 30', () => expect(ROW_H).toBe(30));
  test('PORT_R is 7', () => expect(PORT_R).toBe(7));
  test('PORT_HIT is 12', () => expect(PORT_HIT).toBe(12));
  test('PORT_SNAP is 28', () => expect(PORT_SNAP).toBe(28));
  test('GRID_SIZE is 28', () => expect(GRID_SIZE).toBe(28));
  test('REMOVE_ICON_R is 9', () => expect(REMOVE_ICON_R).toBe(9));
  test('REMOVE_HIT_R is 12', () => expect(REMOVE_HIT_R).toBe(12));
  test('SNAP_INDICATOR_R is 11', () => expect(SNAP_INDICATOR_R).toBe(11));
  test('BEZIER_SAMPLES is 24', () => expect(BEZIER_SAMPLES).toBe(24));

  test('PORT_HIT > PORT_R (hit area is larger than visual)', () => {
    expect(PORT_HIT).toBeGreaterThan(PORT_R);
  });

  test('PORT_SNAP > PORT_HIT (snap area is largest)', () => {
    expect(PORT_SNAP).toBeGreaterThan(PORT_HIT);
  });

  test('REMOVE_HIT_R > REMOVE_ICON_R (hit area is larger than visual)', () => {
    expect(REMOVE_HIT_R).toBeGreaterThan(REMOVE_ICON_R);
  });
});

// ── PORT_COLOR ─────────────────────────────────────────────────────────────

describe('PORT_COLOR', () => {
  test('defines WebSite color', () => expect(PORT_COLOR.WebSite).toBe('#79c0ff'));
  test('defines SQL color', () => expect(PORT_COLOR.SQL).toBe('#56d364'));
  test('defines Storage color', () => expect(PORT_COLOR.Storage).toBe('#ffa657'));
  test('defines MobileAPI color', () => expect(PORT_COLOR.MobileAPI).toBe('#d2a8ff'));
  test('all colors are valid hex strings', () => {
    for (const color of Object.values(PORT_COLOR)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  test('has at least one entry per port type used in ELEM_DEFS', () => {
    for (const def of Object.values(ELEM_DEFS)) {
      for (const portType of [...Object.keys(def.inputs), ...Object.keys(def.outputs)]) {
        expect(PORT_COLOR).toHaveProperty(portType);
      }
    }
  });
});

// ── ELEM_DEFS structure ────────────────────────────────────────────────────

describe('ELEM_DEFS — required fields', () => {
  test('defines at least one element type', () => {
    expect(Object.keys(ELEM_DEFS).length).toBeGreaterThan(0);
  });

  for (const type of Object.keys(ELEM_DEFS)) {
    describe(type, () => {
      let def;
      beforeEach(() => { def = ELEM_DEFS[type]; });

      test('has a non-empty label', () => {
        expect(typeof def.label).toBe('string');
        expect(def.label.length).toBeGreaterThan(0);
      });

      test('has an inputs object', () => {
        expect(def.inputs).toBeDefined();
        expect(typeof def.inputs).toBe('object');
      });

      test('has an outputs object', () => {
        expect(def.outputs).toBeDefined();
        expect(typeof def.outputs).toBe('object');
      });

      test('has a color that is a hex string', () => {
        expect(def.color).toMatch(/^#[0-9a-f]{6}$/i);
      });

      test('has an icon string containing SVG', () => {
        expect(typeof def.icon).toBe('string');
        expect(def.icon).toContain('<svg');
      });

      test('all input demand values are positive numbers', () => {
        for (const spec of Object.values(def.inputs)) {
          expect(typeof spec.demand).toBe('number');
          expect(spec.demand).toBeGreaterThan(0);
        }
      });

      test('all output supply values are positive numbers', () => {
        for (const spec of Object.values(def.outputs)) {
          expect(typeof spec.supply).toBe('number');
          expect(spec.supply).toBeGreaterThan(0);
        }
      });

      test('output port types exist in PORT_COLOR', () => {
        for (const portType of Object.keys(def.outputs)) {
          expect(PORT_COLOR).toHaveProperty(portType);
        }
      });

      test('input port types exist in PORT_COLOR (if any)', () => {
        for (const portType of Object.keys(def.inputs)) {
          expect(PORT_COLOR).toHaveProperty(portType);
        }
      });
    });
  }
});

describe('ELEM_DEFS — specific element configurations', () => {
  test('WebServer has 2 inputs and 1 output', () => {
    const def = ELEM_DEFS.WebServer;
    expect(Object.keys(def.inputs)).toHaveLength(2);
    expect(Object.keys(def.outputs)).toHaveLength(1);
  });

  test('WebServer outputs WebSite', () => {
    expect(ELEM_DEFS.WebServer.outputs).toHaveProperty('WebSite');
  });

  test('WebServer Storage input has multipath: true', () => {
    expect(ELEM_DEFS.WebServer.inputs.Storage.multipath).toBe(true);
  });

  test('APIGateway has 1 input and 1 output', () => {
    const def = ELEM_DEFS.APIGateway;
    expect(Object.keys(def.inputs)).toHaveLength(1);
    expect(Object.keys(def.outputs)).toHaveLength(1);
  });

  test('APIGateway outputs MobileAPI', () => {
    expect(ELEM_DEFS.APIGateway.outputs).toHaveProperty('MobileAPI');
  });

  test('Database has 1 input and 1 output', () => {
    const def = ELEM_DEFS.Database;
    expect(Object.keys(def.inputs)).toHaveLength(1);
    expect(Object.keys(def.outputs)).toHaveLength(1);
  });

  test('Database Storage input has multipath: true', () => {
    expect(ELEM_DEFS.Database.inputs.Storage.multipath).toBe(true);
  });

  test('Storage has 0 inputs and 1 output', () => {
    const def = ELEM_DEFS.Storage;
    expect(Object.keys(def.inputs)).toHaveLength(0);
    expect(Object.keys(def.outputs)).toHaveLength(1);
  });

  test('DirectAttachStorage has 0 inputs and 1 output', () => {
    const def = ELEM_DEFS.DirectAttachStorage;
    expect(Object.keys(def.inputs)).toHaveLength(0);
    expect(Object.keys(def.outputs)).toHaveLength(1);
  });

  test('DirectAttachStorage Storage output has multipath: false', () => {
    expect(ELEM_DEFS.DirectAttachStorage.outputs.Storage.multipath).toBe(false);
  });
});

// ── inputKeys / outputKeys helpers ────────────────────────────────────────

describe('inputKeys', () => {
  test('returns array of input port names', () => {
    expect(inputKeys(ELEM_DEFS.WebServer)).toEqual(['SQL', 'Storage']);
  });

  test('returns empty array when no inputs', () => {
    expect(inputKeys(ELEM_DEFS.Storage)).toEqual([]);
  });

  test('returns single-element array for Database', () => {
    expect(inputKeys(ELEM_DEFS.Database)).toEqual(['Storage']);
  });

  test('returns keys in insertion order', () => {
    const keys = inputKeys(ELEM_DEFS.WebServer);
    expect(keys[0]).toBe('SQL');
    expect(keys[1]).toBe('Storage');
  });
});

describe('outputKeys', () => {
  test('returns array of output port names', () => {
    expect(outputKeys(ELEM_DEFS.WebServer)).toEqual(['WebSite']);
  });

  test('returns Storage output for Storage element', () => {
    expect(outputKeys(ELEM_DEFS.Storage)).toEqual(['Storage']);
  });

  test('returns MobileAPI output for APIGateway', () => {
    expect(outputKeys(ELEM_DEFS.APIGateway)).toEqual(['MobileAPI']);
  });

  test('works with synthetic def object', () => {
    const def = { inputs: {}, outputs: { Foo: { supply: 10 }, Bar: { supply: 20 } } };
    expect(outputKeys(def)).toEqual(['Foo', 'Bar']);
  });
});
