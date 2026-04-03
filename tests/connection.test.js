import { jest } from '@jest/globals';
import { ConnectionManager } from '../src/js/connection.js';
import { GameElement } from '../src/js/element.js';
import { EventBus, Events } from '../src/js/event-bus.js';
import { ELEM_DEFS } from '../src/js/config.js';

// Stub browser Image API
global.Image = class {
  constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSetup() {
  const bus     = new EventBus();
  const elemMap = new Map();
  const mgr     = new ConnectionManager(elemMap, bus);

  function mkElem(type) {
    const el = new GameElement(type, 0, 0, ELEM_DEFS[type]);
    elemMap.set(el.id, el);
    return el;
  }

  return { bus, elemMap, mgr, mkElem };
}

beforeEach(() => {
  GameElement.resetCounter();
  ConnectionManager.resetCounter();
});

// ── tryConnect ────────────────────────────────────────────────────────────────

describe('ConnectionManager.tryConnect', () => {
  test('adds a connection when types match', () => {
    const { mgr, mkElem } = makeSetup();
    const storage  = mkElem('Storage');   // output: Storage:0
    const database = mkElem('Database');  // input:  Storage:0
    mgr.tryConnect(storage, 0, database, 0);
    expect(mgr.connections).toHaveLength(1);
    expect(mgr.connections[0]).toMatchObject({
      fromId: storage.id, fromPort: 0,
      toId:   database.id, toPort: 0,
    });
  });

  test('does not add a connection when types mismatch', () => {
    const { mgr, mkElem, bus } = makeSetup();
    const statusFn = jest.fn();
    bus.on(Events.SET_STATUS, statusFn);

    const storage   = mkElem('Storage');    // output: Storage
    const webServer = mkElem('WebServer');  // input[0]: SQL
    mgr.tryConnect(storage, 0, webServer, 0); // Storage → SQL: mismatch
    expect(mgr.connections).toHaveLength(0);
    expect(statusFn).toHaveBeenCalledTimes(1);
    expect(statusFn.mock.calls[0][0].msg).toMatch(/mismatch/i);
  });

  test('does not connect an element to itself', () => {
    const { mgr, mkElem } = makeSetup();
    const ws = mkElem('WebServer');
    mgr.tryConnect(ws, 0, ws, 0);
    expect(mgr.connections).toHaveLength(0);
  });

  test('prevents exact duplicate connections', () => {
    const { mgr, mkElem } = makeSetup();
    const storage  = mkElem('Storage');
    const database = mkElem('Database');
    mgr.tryConnect(storage, 0, database, 0);
    mgr.tryConnect(storage, 0, database, 0);
    expect(mgr.connections).toHaveLength(1);
  });

  test('displaces existing outgoing connection when multipath=false on output', () => {
    // DirectAttachStorage.outputs.Storage.multipath = false
    const { mgr, mkElem } = makeSetup();
    const das  = mkElem('DirectAttachStorage'); // output Storage multipath=false
    const db1  = mkElem('Database');
    const db2  = mkElem('Database');

    mgr.tryConnect(das, 0, db1, 0);
    expect(mgr.connections).toHaveLength(1);

    mgr.tryConnect(das, 0, db2, 0);
    expect(mgr.connections).toHaveLength(1);
    expect(mgr.connections[0].toId).toBe(db2.id);
  });

  test('allows multiple outgoing connections when multipath is not false', () => {
    // Storage.outputs.Storage has no multipath restriction
    const { mgr, mkElem } = makeSetup();
    const stor = mkElem('Storage');
    const db1  = mkElem('Database');
    const db2  = mkElem('Database');

    mgr.tryConnect(stor, 0, db1, 0);
    mgr.tryConnect(stor, 0, db2, 0);
    expect(mgr.connections).toHaveLength(2);
  });

  test('displaces existing incoming connection when input multipath is not true', () => {
    // WebServer input SQL has no multipath:true → single incoming allowed
    const { mgr, mkElem } = makeSetup();
    const db1 = mkElem('Database');  // output SQL
    const db2 = mkElem('Database');
    const ws  = mkElem('WebServer'); // input[0] = SQL (no multipath)

    mgr.tryConnect(db1, 0, ws, 0);
    expect(mgr.connections).toHaveLength(1);

    mgr.tryConnect(db2, 0, ws, 0);
    expect(mgr.connections).toHaveLength(1);
    expect(mgr.connections[0].fromId).toBe(db2.id);
  });

  test('allows multiple incoming connections when input multipath=true', () => {
    // Database input Storage has multipath:true
    const { mgr, mkElem } = makeSetup();
    const s1 = mkElem('Storage');
    const s2 = mkElem('Storage');
    const db = mkElem('Database');  // input Storage multipath:true

    mgr.tryConnect(s1, 0, db, 0);
    mgr.tryConnect(s2, 0, db, 0);
    expect(mgr.connections).toHaveLength(2);
  });

  test('emits CHECK_WIN after a successful connection', () => {
    const { mgr, mkElem, bus } = makeSetup();
    const checkFn = jest.fn();
    bus.on(Events.CHECK_WIN, checkFn);

    const stor = mkElem('Storage');
    const db   = mkElem('Database');
    mgr.tryConnect(stor, 0, db, 0);
    expect(checkFn).toHaveBeenCalledTimes(1);
  });

  test('clears selectedConn when displacing it via output multipath=false', () => {
    const { mgr, mkElem } = makeSetup();
    const das = mkElem('DirectAttachStorage');
    const db1 = mkElem('Database');
    const db2 = mkElem('Database');

    mgr.tryConnect(das, 0, db1, 0);
    mgr.selectedConn = mgr.connections[0];

    mgr.tryConnect(das, 0, db2, 0);
    expect(mgr.selectedConn).toBeNull();
  });
});

// ── delete / deleteConnectedTo ────────────────────────────────────────────────

describe('ConnectionManager.delete', () => {
  test('removes the specified connection', () => {
    const { mgr, mkElem } = makeSetup();
    const stor = mkElem('Storage');
    const db   = mkElem('Database');
    mgr.tryConnect(stor, 0, db, 0);
    const conn = mgr.connections[0];
    mgr.delete(conn);
    expect(mgr.connections).toHaveLength(0);
  });

  test('clears selectedConn if it was the deleted connection', () => {
    const { mgr, mkElem } = makeSetup();
    const stor = mkElem('Storage');
    const db   = mkElem('Database');
    mgr.tryConnect(stor, 0, db, 0);
    const conn = mgr.connections[0];
    mgr.selectedConn = conn;
    mgr.delete(conn);
    expect(mgr.selectedConn).toBeNull();
  });

  test('emits CHECK_WIN after deletion', () => {
    const { mgr, mkElem, bus } = makeSetup();
    const checkFn = jest.fn();
    const stor = mkElem('Storage');
    const db   = mkElem('Database');
    mgr.tryConnect(stor, 0, db, 0);
    bus.on(Events.CHECK_WIN, checkFn);
    mgr.delete(mgr.connections[0]);
    expect(checkFn).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectionManager.deleteConnectedTo', () => {
  test('removes all connections involving the element', () => {
    const { mgr, mkElem } = makeSetup();
    const s1 = mkElem('Storage');
    const s2 = mkElem('Storage');
    const db = mkElem('Database');  // multipath:true input
    mgr.tryConnect(s1, 0, db, 0);
    mgr.tryConnect(s2, 0, db, 0);
    expect(mgr.connections).toHaveLength(2);
    mgr.deleteConnectedTo(db);
    expect(mgr.connections).toHaveLength(0);
  });

  test('clears selectedConn if it involved the element', () => {
    const { mgr, mkElem } = makeSetup();
    const stor = mkElem('Storage');
    const db   = mkElem('Database');
    mgr.tryConnect(stor, 0, db, 0);
    mgr.selectedConn = mgr.connections[0];
    mgr.deleteConnectedTo(stor);
    expect(mgr.selectedConn).toBeNull();
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('ConnectionManager.reset', () => {
  test('clears connections and selectedConn', () => {
    const { mgr, mkElem } = makeSetup();
    const stor = mkElem('Storage');
    const db   = mkElem('Database');
    mgr.tryConnect(stor, 0, db, 0);
    mgr.selectedConn = mgr.connections[0];
    mgr.reset();
    expect(mgr.connections).toHaveLength(0);
    expect(mgr.selectedConn).toBeNull();
  });
});

// ── computeActivePct ──────────────────────────────────────────────────────────

describe('ConnectionManager.computeActivePct', () => {
  test('source element with no inputs is always 100% active', () => {
    const { mgr, mkElem, elemMap } = makeSetup();
    const stor = mkElem('Storage');
    const { activePct } = mgr.computeActivePct([stor]);
    expect(activePct.get(stor)).toBe(100);
  });

  test('element with unmet input demand is 0% active', () => {
    const { mgr, mkElem } = makeSetup();
    const db = mkElem('Database'); // needs Storage demand=85, not connected
    const { activePct } = mgr.computeActivePct([db]);
    expect(activePct.get(db)).toBe(0);
  });

  test('fully supplied element is 100% active', () => {
    // Storage (supply=50) → Database (demand=85): 50/85 ≈ 58.8% active
    // Two Storage nodes → Database: 100/85 → capped at 100%
    const { mgr, mkElem } = makeSetup();
    const s1 = mkElem('Storage');
    const s2 = mkElem('Storage');
    const db = mkElem('Database');

    mgr.tryConnect(s1, 0, db, 0);
    mgr.tryConnect(s2, 0, db, 0);

    const { activePct } = mgr.computeActivePct([s1, s2, db]);
    expect(activePct.get(db)).toBe(100);
  });

  test('partial supply results in proportional active percent', () => {
    // One Storage (supply=50) → Database (demand=85): 50/85 * 100 ≈ 58.82%
    const { mgr, mkElem } = makeSetup();
    const stor = mkElem('Storage');
    const db   = mkElem('Database');
    mgr.tryConnect(stor, 0, db, 0);

    const { activePct } = mgr.computeActivePct([stor, db]);
    const pct = activePct.get(db);
    expect(pct).toBeCloseTo(50 / 85 * 100, 1);
  });

  test('flow map records allocated output flow', () => {
    const { mgr, mkElem } = makeSetup();
    const stor = mkElem('Storage');
    const db   = mkElem('Database');
    mgr.tryConnect(stor, 0, db, 0);

    const { flow } = mgr.computeActivePct([stor, db]);
    // Storage is 100% active, supply=50, demand of db is 85 → gives min(50, 85)=50
    expect(flow.get(`${stor.id}:0`)).toBe(50);
  });

  test('received map records supply delivered to input port', () => {
    const { mgr, mkElem } = makeSetup();
    const stor = mkElem('Storage');
    const db   = mkElem('Database');
    mgr.tryConnect(stor, 0, db, 0);

    const { received } = mgr.computeActivePct([stor, db]);
    expect(received.get(`${db.id}:0`)).toBe(50);
  });

  test('output supply scales with source active percentage', () => {
    // One Storage→Database: db is ~58.8% active, supply=50*0.588=29.4
    // db output SQL supply=50 at full → 50 * 58.8% ≈ 29.4 allocated to ws if ws connected
    const { mgr, mkElem } = makeSetup();
    const stor = mkElem('Storage');
    const db   = mkElem('Database');   // supply SQL=50
    const ws   = mkElem('WebServer'); // demands SQL=30

    mgr.tryConnect(stor, 0, db, 0);
    mgr.tryConnect(db, 0, ws, 0);

    const { activePct, flow } = mgr.computeActivePct([stor, db, ws]);
    const dbPct = activePct.get(db);
    expect(dbPct).toBeCloseTo(50 / 85 * 100, 1);
    // flow from db's SQL port = supply*pct/100 allocated to ws
    const sqlFlow = flow.get(`${db.id}:0`);
    expect(sqlFlow).toBeCloseTo(50 * dbPct / 100, 1);
  });

  test('multi-input element limited by the least-satisfied port', () => {
    // WebServer: SQL demand=30, Storage demand=5 (multipath)
    // Supply SQL=50 from Database (fully supplied), but no Storage → WebServer is 0%
    const { mgr, mkElem } = makeSetup();
    const s1 = mkElem('Storage');
    const s2 = mkElem('Storage');
    const db = mkElem('Database');
    const ws = mkElem('WebServer');

    // Fully supply the database
    mgr.tryConnect(s1, 0, db, 0);
    mgr.tryConnect(s2, 0, db, 0);
    // Supply SQL to WebServer but not Storage
    mgr.tryConnect(db, 0, ws, 0);

    const { activePct } = mgr.computeActivePct([s1, s2, db, ws]);
    // ws.inputs.Storage has demand=5, received=0 → 0%
    expect(activePct.get(ws)).toBe(0);
  });

  test('full chain: Storage→Database→WebServer fully satisfied', () => {
    // Need: ws SQL=30 (needs db at 60%), ws Storage=5
    // Supply: 2×Storage each supply=50 → db gets 100 ≥ 85 demand → db=100%
    // db outputs SQL=50 → ws gets 30 needed; also ws Storage connected
    const { mgr, mkElem } = makeSetup();
    const s1 = mkElem('Storage'); // → db
    const s2 = mkElem('Storage'); // → db
    const s3 = mkElem('Storage'); // → ws directly for Storage port
    const db = mkElem('Database');
    const ws = mkElem('WebServer');

    mgr.tryConnect(s1, 0, db, 0);
    mgr.tryConnect(s2, 0, db, 0);
    mgr.tryConnect(db, 0, ws, 0);  // SQL port
    mgr.tryConnect(s3, 0, ws, 1);  // Storage port (multipath)

    const { activePct } = mgr.computeActivePct([s1, s2, s3, db, ws]);
    expect(activePct.get(db)).toBe(100);
    expect(activePct.get(ws)).toBe(100);
  });

  test('isolated element (no connections) with inputs stays at 0%', () => {
    const { mgr, mkElem } = makeSetup();
    const ws = mkElem('WebServer');
    const { activePct } = mgr.computeActivePct([ws]);
    expect(activePct.get(ws)).toBe(0);
  });

  test('handles empty elements array', () => {
    const { mgr } = makeSetup();
    expect(() => mgr.computeActivePct([])).not.toThrow();
    const { activePct } = mgr.computeActivePct([]);
    expect(activePct.size).toBe(0);
  });
});

// ── level demand multipath ────────────────────────────────────────────────────

describe('ConnectionManager.tryConnect with level demand defs', () => {
  function makeDemandDef(portType, demand, multipath) {
    const portSpec = multipath !== undefined ? { demand, multipath } : { demand };
    return { inputs: { [portType]: portSpec }, outputs: {}, preset: true };
  }

  test('demand input with multipath:true allows multiple incoming connections', () => {
    const { mgr, mkElem, elemMap } = makeSetup();
    // Two WebServers both connecting to a WebUser demand (multipath:true input)
    const ws1 = mkElem('WebServer');
    const ws2 = mkElem('WebServer');
    const demandDef = makeDemandDef('WebSite', 100, true);
    const demand = new GameElement('WebUser', 0, 0, demandDef);
    elemMap.set(demand.id, demand);

    mgr.tryConnect(ws1, 0, demand, 0);
    mgr.tryConnect(ws2, 0, demand, 0);
    expect(mgr.connections).toHaveLength(2);
  });

  test('demand input without multipath:true displaces existing incoming connection', () => {
    const { mgr, mkElem, elemMap } = makeSetup();
    const ws1 = mkElem('WebServer');
    const ws2 = mkElem('WebServer');
    const demandDef = makeDemandDef('WebSite', 100);  // no multipath
    const demand = new GameElement('WebUser', 0, 0, demandDef);
    elemMap.set(demand.id, demand);

    mgr.tryConnect(ws1, 0, demand, 0);
    expect(mgr.connections).toHaveLength(1);
    mgr.tryConnect(ws2, 0, demand, 0);
    expect(mgr.connections).toHaveLength(1);
    expect(mgr.connections[0].fromId).toBe(ws2.id);
  });

  test('demand with multipath:true reaches 100% active when combined supply meets demand', () => {
    const { mgr, mkElem, elemMap } = makeSetup();
    // Two WebServers (supply WebSite=100 each) → WebUser demand=100, multipath:true
    // Each WS needs to be supplied too: give them SQL and Storage
    const s1 = mkElem('Storage');
    const s2 = mkElem('Storage');
    const db = mkElem('Database');
    const ws1 = mkElem('WebServer');

    // Supply ws1 fully
    mgr.tryConnect(s1, 0, db, 0);
    mgr.tryConnect(s2, 0, db, 0);
    mgr.tryConnect(db, 0, ws1, 0);    // SQL
    const s3 = mkElem('Storage');
    elemMap.set(s3.id, s3);
    mgr.tryConnect(s3, 0, ws1, 1);   // Storage

    const demandDef = makeDemandDef('WebSite', 100, true);
    const demand = new GameElement('WebUser', 0, 0, demandDef);
    elemMap.set(demand.id, demand);

    mgr.tryConnect(ws1, 0, demand, 0);

    const { activePct } = mgr.computeActivePct([s1, s2, s3, db, ws1, demand]);
    expect(activePct.get(demand)).toBe(100);
  });
});

// ── mid / hit ─────────────────────────────────────────────────────────────────

describe('ConnectionManager.mid', () => {
  test('returns midpoint between output and input port positions', () => {
    const { mgr, mkElem } = makeSetup();
    // Place elements apart so midpoint math is clear
    const stor = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    const db   = new GameElement('Database', 400, 0, ELEM_DEFS.Database);
    [stor, db].forEach(e => mgr['_ConnectionManager__elemMap'] ?? (() => {})());
    // Access via the elemMap we control
    const { elemMap } = makeSetup();
    elemMap.set(stor.id, stor);
    elemMap.set(db.id, db);
    const mgr2 = new ConnectionManager(elemMap, new EventBus());

    mgr2.tryConnect(stor, 0, db, 0);
    const conn = mgr2.connections[0];
    const mid  = mgr2.mid(conn);

    const fromX = stor.outputPos(0).x;
    const toX   = db.inputPos(0).x;
    expect(mid.x).toBeCloseTo((fromX + toX) / 2);
  });
});

describe('ConnectionManager.hit', () => {
  test('returns true when clicking near the wire midpoint', () => {
    const { elemMap } = makeSetup();
    const stor = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    const db   = new GameElement('Database', 300, 0, ELEM_DEFS.Database);
    elemMap.set(stor.id, stor);
    elemMap.set(db.id, db);
    const mgr = new ConnectionManager(elemMap, new EventBus());
    mgr.tryConnect(stor, 0, db, 0);
    const conn = mgr.connections[0];

    // midpoint of the wire should be a hit
    const { x, y } = mgr.mid(conn);
    expect(mgr.hit(x, y, conn)).toBe(true);
  });

  test('returns false when clicking far from the wire', () => {
    const { elemMap } = makeSetup();
    const stor = new GameElement('Storage', 0, 0, ELEM_DEFS.Storage);
    const db   = new GameElement('Database', 300, 0, ELEM_DEFS.Database);
    elemMap.set(stor.id, stor);
    elemMap.set(db.id, db);
    const mgr = new ConnectionManager(elemMap, new EventBus());
    mgr.tryConnect(stor, 0, db, 0);
    const conn = mgr.connections[0];

    expect(mgr.hit(0, 500, conn)).toBe(false);
  });
});
