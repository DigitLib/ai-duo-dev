/**
 * Web MIDI API integration for physical MIDI keyboards.
 * MIDI access is requested only after a user gesture (when Play is clicked).
 *
 * Emits: 'keyDown' (note, velocity 0-1), 'keyUp' (note)
 */

import { EventEmitter } from '../EventEmitter.js';

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const ALL_SOUND_OFF = 120;
const ALL_NOTES_OFF = 123;

export class Midi extends EventEmitter {
  constructor() {
    super();
    this._request = null;
    this._held = new Map(); // input id -> Set of held notes
    this._onMessage = this._onMessage.bind(this);
  }

  /** True once at least one MIDI input is connected. */
  get connected() {
    return this._held.size > 0;
  }

  enable() {
    if (this._request || !navigator.requestMIDIAccess) return;

    this._request = navigator.requestMIDIAccess()
      .then((access) => {
        access.inputs.forEach((input) => this._bind(input));
        access.addEventListener('statechange', ({ port }) => {
          if (port.type !== 'input') return;
          if (port.state === 'connected') this._bind(port);
          else if (port.state === 'disconnected') this._unbind(port);
        });
      })
      .catch((err) => {
        this._request = null; // allow retrying on the next activation
        console.info('[Midi] MIDI access not available:', err?.message || err);
      });
  }

  _bind(input) {
    if (this._held.has(input.id)) return;
    this._held.set(input.id, new Set());
    input.addEventListener('midimessage', this._onMessage);
    console.info(`[Midi] Connected: ${input.name || input.id}`);
  }

  _unbind(input) {
    if (!this._held.has(input.id)) return;
    this._releaseAll(input.id); // don't leave notes stuck when a device is unplugged
    this._held.delete(input.id);
    input.removeEventListener('midimessage', this._onMessage);
    console.info(`[Midi] Disconnected: ${input.name || input.id}`);
  }

  _onMessage({ target, data }) {
    const held = this._held.get(target.id);
    if (!held || data.length < 3) return;

    const [status, note, value] = data;
    const command = status & 0xf0;

    if (command === NOTE_ON && value > 0) {
      held.add(note);
      this.emit('keyDown', note, value / 127);
    } else if (command === NOTE_OFF || command === NOTE_ON) {
      held.delete(note);
      this.emit('keyUp', note);
    } else if (command === CONTROL_CHANGE && (note === ALL_SOUND_OFF || note === ALL_NOTES_OFF)) {
      this._releaseAll(target.id);
    }
  }

  _releaseAll(inputId) {
    const held = this._held.get(inputId);
    if (!held) return;
    for (const note of held) this.emit('keyUp', note);
    held.clear();
  }
}

export default Midi;