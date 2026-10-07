/**
 * Main Keyboard Controller for AI Duet.
 * Merges the computer keyboard, on-screen keyboard and Web MIDI into one stream of
 * user 'keyDown' / 'keyUp' events, and schedules key highlights on the audio clock.
 */

import { EventEmitter } from '../EventEmitter.js';
import { KeyboardElement } from './Element.js';
import { ComputerKeys } from './ComputerKeys.js';
import { Midi } from './Midi.js';
import { getAudioContext } from '../sound/Sound.js';

const KEY_WIDTH = 24;

export class Keyboard extends EventEmitter {
  constructor(container) {
    super();
    this._container = container;
    this._active = false;
    this._held = new Set();   // notes the user is currently holding (any input)
    this._eventQueue = [];    // scheduled highlight callbacks, sorted by time

    this._keyboardInterface = new KeyboardElement(container, 48, 2);
    this._midi = new Midi();
    for (const source of [new ComputerKeys(), this._keyboardInterface, this._midi]) {
      source.on('keyDown', (note) => this._userKeyDown(note));
      source.on('keyUp', (note) => this._userKeyUp(note));
    }

    // Bottom shadow bar
    const bottom = document.createElement('div');
    bottom.id = 'bottom';
    container.appendChild(bottom);

    window.addEventListener('resize', () => this._resize());
    this._resize();

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  now() {
    const ctx = getAudioContext();
    return ctx ? ctx.currentTime : performance.now() / 1000;
  }

  // ------------------------------------------------------------ user input

  _userKeyDown(note) {
    if (!this._active || this._held.has(note)) return;
    this._held.add(note);
    this.keyDown(note);
    this.emit('keyDown', note);
  }

  _userKeyUp(note) {
    if (!this._held.delete(note)) return; // ignore releases for notes we never started
    this.keyUp(note);
    this.emit('keyUp', note);
  }

  // ------------------------------------------------- scheduled highlights

  keyDown(note, time = null, ai = false) {
    this._schedule(time, () => this._keyboardInterface.keyDown(note, ai));
  }

  keyUp(note, time = null, ai = false) {
    this._schedule(time, () => this._keyboardInterface.keyUp(note, ai));
  }

  _schedule(time, callback) {
    if (!this._active) return;
    const at = Math.max(time ?? 0, this.now());
    const idx = this._eventQueue.findIndex((e) => e.time > at);
    this._eventQueue.splice(idx === -1 ? this._eventQueue.length : idx, 0, { time: at, callback });
  }

  _loop() {
    const now = this.now();
    while (this._eventQueue.length && this._eventQueue[0].time <= now) {
      try {
        this._eventQueue.shift().callback();
      } catch (e) {
        console.error(e);
      }
    }
    requestAnimationFrame(this._loop);
  }

  // -------------------------------------------------------------- layout

  _resize() {
    const octaves = Math.min(7, Math.max(2, Math.round(window.innerWidth / KEY_WIDTH / 12)));
    const baseNote = octaves > 5 ? 48 - (octaves - 5) * 12 : 48;
    this._keyboardInterface.resize(baseNote, octaves);
  }

  // --------------------------------------------------------------- state

  activate() {
    this._container.classList.add('focus');
    this._active = true;
    this._midi.enable();
  }

  deactivate() {
    // Release held notes first, otherwise they keep sounding after the window loses focus
    for (const note of [...this._held]) this._userKeyUp(note);
    this._container.classList.remove('focus');
    this._active = false;
  }
}

export default Keyboard;