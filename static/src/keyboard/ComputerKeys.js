/**
 * Computer keyboard mapping to MIDI notes (QWERTY piano).
 */

import { EventEmitter } from '../EventEmitter.js';

const KEY_MAP = {
  // Lower octave / home row
  'a': 60, // C4
  'w': 61, // C#4
  's': 62, // D4
  'e': 63, // D#4
  'd': 64, // E4
  'f': 65, // F4
  't': 66, // F#4
  'g': 67, // G4
  'y': 68, // G#4
  'h': 69, // A4
  'u': 70, // A#4
  'j': 71, // B4
  'k': 72, // C5
  'o': 73, // C#5
  'l': 74, // D5
  'p': 75, // D#5
  ';': 76, // E5
  "'": 77  // F5
};

export class ComputerKeys extends EventEmitter {
  constructor() {
    super();
    this.octaveShift = 0;
    this.activeKeys = new Map(); // key -> midiNote
    this.enabled = true;

    window.addEventListener('keydown', this._onKeyDown.bind(this));
    window.addEventListener('keyup', this._onKeyUp.bind(this));
  }

  _onKeyDown(e) {
    if (!this.enabled || e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    const key = e.key.toLowerCase();

    // Octave controls
    if (key === 'z') {
      this.octaveShift = Math.max(this.octaveShift - 12, -24);
      return;
    }
    if (key === 'x') {
      this.octaveShift = Math.min(this.octaveShift + 12, 24);
      return;
    }

    if (key in KEY_MAP) {
      const note = KEY_MAP[key] + this.octaveShift;
      this.activeKeys.set(key, note);
      this.emit('keyDown', note);
    }
  }

  _onKeyUp(e) {
    if (!this.enabled) return;
    const key = e.key.toLowerCase();

    if (this.activeKeys.has(key)) {
      const note = this.activeKeys.get(key);
      this.activeKeys.delete(key);
      this.emit('keyUp', note);
    }
  }
}

export default ComputerKeys;
