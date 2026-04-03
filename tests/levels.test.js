/**
 * Tests for the LEVELS data structure in src/js/levels.js
 */

import { LEVELS } from '../src/js/levels.js';
import { ELEM_DEFS } from '../src/js/config.js';

describe('LEVELS array', () => {
  test('has at least 2 levels', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(2);
  });

  test('every level has a title string', () => {
    for (const level of LEVELS) {
      expect(typeof level.title).toBe('string');
      expect(level.title.length).toBeGreaterThan(0);
    }
  });

  test('every level has a non-empty demands array', () => {
    for (const level of LEVELS) {
      expect(Array.isArray(level.demands)).toBe(true);
      expect(level.demands.length).toBeGreaterThan(0);
    }
  });

  test('every level has a non-empty available array', () => {
    for (const level of LEVELS) {
      expect(Array.isArray(level.available)).toBe(true);
      expect(level.available.length).toBeGreaterThan(0);
    }
  });
});

describe('LEVELS demand structure', () => {
  test('every demand has a type string', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        expect(typeof demand.type).toBe('string');
        expect(demand.type.length).toBeGreaterThan(0);
      }
    }
  });

  test('every demand has a label string', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        expect(typeof demand.label).toBe('string');
        expect(demand.label.length).toBeGreaterThan(0);
      }
    }
  });

  test('every demand has an inputs object', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        expect(demand.inputs).toBeDefined();
        expect(typeof demand.inputs).toBe('object');
        expect(demand.inputs).not.toBeNull();
      }
    }
  });

  test('every demand has an outputs object', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        expect(demand.outputs).toBeDefined();
        expect(typeof demand.outputs).toBe('object');
        expect(demand.outputs).not.toBeNull();
      }
    }
  });

  test('every demand has preset truthy', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        expect(demand.preset).toBeTruthy();
      }
    }
  });

  test('every demand has a color string starting with #', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        expect(typeof demand.color).toBe('string');
        expect(demand.color.startsWith('#')).toBe(true);
      }
    }
  });
});

describe('Level 1 specifics', () => {
  test('Level 1 title contains "Level 1"', () => {
    expect(LEVELS[0].title).toMatch(/Level 1/);
  });

  test('Level 1 has exactly one demand', () => {
    expect(LEVELS[0].demands).toHaveLength(1);
  });

  test('Level 1 demand type is WebUser', () => {
    expect(LEVELS[0].demands[0].type).toBe('WebUser');
  });

  test('Level 1 demand has WebSite input with demand 100', () => {
    const demand = LEVELS[0].demands[0];
    expect(demand.inputs).toHaveProperty('WebSite');
    expect(demand.inputs.WebSite.demand).toBe(100);
  });

  test('Level 1 demand label is a non-empty string', () => {
    expect(LEVELS[0].demands[0].label.length).toBeGreaterThan(0);
  });

  test('Level 1 available contains WebServer', () => {
    expect(LEVELS[0].available).toContain('WebServer');
  });

  test('Level 1 available contains Database', () => {
    expect(LEVELS[0].available).toContain('Database');
  });

  test('Level 1 available contains Storage', () => {
    expect(LEVELS[0].available).toContain('Storage');
  });
});

describe('Level 2 specifics', () => {
  test('Level 2 title contains "Level 2"', () => {
    expect(LEVELS[1].title).toMatch(/Level 2/);
  });

  test('Level 2 has exactly 2 demands', () => {
    expect(LEVELS[1].demands).toHaveLength(2);
  });

  test('Level 2 has a WebUser demand', () => {
    const webUser = LEVELS[1].demands.find(d => d.type === 'WebUser');
    expect(webUser).toBeDefined();
  });

  test('Level 2 has a MobileUser demand', () => {
    const mobileUser = LEVELS[1].demands.find(d => d.type === 'MobileUser');
    expect(mobileUser).toBeDefined();
  });

  test('Level 2 MobileUser demand has MobileAPI input with demand 80', () => {
    const mobileUser = LEVELS[1].demands.find(d => d.type === 'MobileUser');
    expect(mobileUser).toBeDefined();
    expect(mobileUser.inputs).toHaveProperty('MobileAPI');
    expect(mobileUser.inputs.MobileAPI.demand).toBe(80);
  });

  test('Level 2 has APIGateway in available', () => {
    expect(LEVELS[1].available).toContain('APIGateway');
  });

  test('Level 2 both demands have preset truthy', () => {
    for (const demand of LEVELS[1].demands) {
      expect(demand.preset).toBeTruthy();
    }
  });

  test('Level 2 both demands have color starting with #', () => {
    for (const demand of LEVELS[1].demands) {
      expect(demand.color.startsWith('#')).toBe(true);
    }
  });
});

describe('Available types cross-reference ELEM_DEFS', () => {
  test('every available type in every level exists in ELEM_DEFS', () => {
    for (const level of LEVELS) {
      for (const type of level.available) {
        expect(ELEM_DEFS).toHaveProperty(type);
      }
    }
  });
});

describe('Demand port spec structure', () => {
  test('every port spec in demand inputs is an object, not a primitive', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        for (const [portName, spec] of Object.entries(demand.inputs)) {
          expect(typeof spec).toBe('object');
          expect(spec).not.toBeNull();
        }
      }
    }
  });

  test('"multipath" is never a top-level key of demand.inputs (must be nested in port spec)', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        expect(Object.keys(demand.inputs)).not.toContain('multipath');
      }
    }
  });

  test('every port spec in demand inputs has a numeric demand property', () => {
    for (const level of LEVELS) {
      for (const demand of level.demands) {
        for (const spec of Object.values(demand.inputs)) {
          expect(typeof spec.demand).toBe('number');
        }
      }
    }
  });
});

describe('Level 2 WebUser multipath', () => {
  test('WebUser WebSite input has multipath:true nested inside the port spec', () => {
    const webUser = LEVELS[1].demands.find(d => d.type === 'WebUser');
    expect(webUser.inputs.WebSite.multipath).toBe(true);
  });

  test('WebUser inputs has exactly one port key (WebSite)', () => {
    const webUser = LEVELS[1].demands.find(d => d.type === 'WebUser');
    expect(Object.keys(webUser.inputs)).toEqual(['WebSite']);
  });
});
