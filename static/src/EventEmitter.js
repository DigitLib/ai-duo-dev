/**
 * Lightweight browser-native EventEmitter
 */
export class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(fn);
    return this;
  }

  off(event, fn) {
    if (!this._listeners.has(event)) return this;
    if (!fn) {
      this._listeners.delete(event);
    } else {
      const list = this._listeners.get(event).filter(cb => cb !== fn);
      this._listeners.set(event, list);
    }
    return this;
  }

  emit(event, ...args) {
    if (!this._listeners.has(event)) return false;
    const callbacks = this._listeners.get(event).slice();
    for (const cb of callbacks) {
      try {
        cb(...args);
      } catch (err) {
        console.error(`Error in event listener for "${event}":`, err);
      }
    }
    return true;
  }
}

export default EventEmitter;
