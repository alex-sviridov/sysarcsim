import { jest } from '@jest/globals';
import { EventBus, Events } from '../src/js/event-bus.js';

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('on / emit', () => {
    test('calls registered listener with emitted data', () => {
      const fn = jest.fn();
      bus.on(Events.CHECK_WIN, fn);
      bus.emit(Events.CHECK_WIN, { foo: 1 });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith({ foo: 1 });
    });

    test('calls multiple listeners for the same event', () => {
      const a = jest.fn();
      const b = jest.fn();
      bus.on(Events.CHECK_WIN, a);
      bus.on(Events.CHECK_WIN, b);
      bus.emit(Events.CHECK_WIN, {});
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    test('does not call listener for a different event', () => {
      const fn = jest.fn();
      bus.on(Events.CHECK_WIN, fn);
      bus.emit(Events.GAME_RESET, {});
      expect(fn).not.toHaveBeenCalled();
    });

    test('emitting unknown event does not throw', () => {
      expect(() => bus.emit('no:such:event', {})).not.toThrow();
    });
  });

  describe('off', () => {
    test('stops calling listener after off()', () => {
      const fn = jest.fn();
      bus.on(Events.GAME_RESET, fn);
      bus.off(Events.GAME_RESET, fn);
      bus.emit(Events.GAME_RESET, {});
      expect(fn).not.toHaveBeenCalled();
    });

    test('off() on non-subscribed function is a no-op', () => {
      const fn = jest.fn();
      expect(() => bus.off(Events.GAME_RESET, fn)).not.toThrow();
    });

    test('only removes the specified listener, not others', () => {
      const a = jest.fn();
      const b = jest.fn();
      bus.on(Events.GAME_RESET, a);
      bus.on(Events.GAME_RESET, b);
      bus.off(Events.GAME_RESET, a);
      bus.emit(Events.GAME_RESET, {});
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
    });
  });

  describe('on() unsubscribe return value', () => {
    test('returned function unsubscribes the listener', () => {
      const fn = jest.fn();
      const unsub = bus.on(Events.SET_STATUS, fn);
      unsub();
      bus.emit(Events.SET_STATUS, { msg: 'hi' });
      expect(fn).not.toHaveBeenCalled();
    });

    test('listener fires before unsubscribing', () => {
      const fn = jest.fn();
      const unsub = bus.on(Events.SET_STATUS, fn);
      bus.emit(Events.SET_STATUS, { msg: 'first' });
      unsub();
      bus.emit(Events.SET_STATUS, { msg: 'second' });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith({ msg: 'first' });
    });
  });

  describe('Events constants', () => {
    test('all required event keys are defined strings', () => {
      const required = [
        'ELEMENT_PLACE', 'ELEMENT_DELETE', 'WIRE_COMPLETE',
        'CONN_DELETE', 'CONN_SELECT', 'ELEM_SELECT',
        'PENDING_CHANGED', 'SIDEBAR_DRAG_START',
        'LEVEL_NEXT', 'GAME_RESET', 'CHECK_WIN', 'SET_STATUS',
      ];
      for (const key of required) {
        expect(typeof Events[key]).toBe('string');
        expect(Events[key].length).toBeGreaterThan(0);
      }
    });

    test('event string values are unique', () => {
      const values = Object.values(Events);
      expect(new Set(values).size).toBe(values.length);
    });
  });
});
