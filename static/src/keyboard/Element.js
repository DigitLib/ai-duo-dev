/**
 * Modern Keyboard DOM Element for AI Duet.
 * Renders the responsive piano keyboard and handles pointer/touch events.
 */

import { EventEmitter } from '../EventEmitter.js';
import { Roll } from '../roll/Roll.js';
import { Note } from './Note.js';

const OFFSETS = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];

export class KeyboardElement extends EventEmitter {
  constructor(container, lowest = 36, octaves = 4) {
    super();
    this._container = document.createElement('div');
    this._container.id = 'keyboard';
    container.setAttribute('touch-action', 'none');
    container.appendChild(this._container);

    this._keys = {};
    this._pointersDown = {};

    container.addEventListener('pointerup', (e) => delete this._pointersDown[e.pointerId]);
    container.addEventListener('pointercancel', (e) => delete this._pointersDown[e.pointerId]);
    container.addEventListener('contextmenu', this._absorbEvent.bind(this));

    this.resize(lowest, octaves);

    Roll.appendTo(container);

    this._aiNotes = {};
    this._notes = {};
  }

  resize(lowest, octaves) {
    this._keys = {};
    this._container.innerHTML = '';

    const keyWidth = (1 / 7) / octaves;
    for (let i = lowest; i < lowest + octaves * 12; i++) {
      const key = document.createElement('div');
      key.classList.add('key');
      const isSharp = ([1, 3, 6, 8, 10].indexOf(i % 12) !== -1);
      key.classList.add(isSharp ? 'black' : 'white');
      this._container.appendChild(key);

      const noteOctave = Math.floor(i / 12) - Math.floor(lowest / 12);
      const offset = OFFSETS[i % 12] + noteOctave * 7;
      key.style.width = `${keyWidth * 100}%`;
      key.style.left = `${offset * keyWidth * 100}%`;
      key.id = i.toString();
      key.setAttribute('touch-action', 'none');

      const fill = document.createElement('div');
      fill.id = 'fill';
      key.appendChild(fill);

      this._bindKeyEvents(key);
      this._keys[i] = key;
    }
  }

  _absorbEvent(event) {
    if (event) {
      if (event.preventDefault) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
      event.cancelBubble = true;
      event.returnValue = false;
    }
    return false;
  }

  _bindKeyEvents(key) {
    key.addEventListener('pointerover', (e) => {
      if (this._pointersDown[e.pointerId]) {
        const noteNum = parseInt(e.target.id);
        if (!isNaN(noteNum)) this.emit('keyDown', noteNum);
      } else {
        key.classList.add('hover');
      }
    });

    key.addEventListener('pointerout', (e) => {
      if (this._pointersDown[e.pointerId]) {
        const noteNum = parseInt(e.target.id);
        if (!isNaN(noteNum)) this.emit('keyUp', noteNum);
      } else {
        key.classList.remove('hover');
      }
    });

    key.addEventListener('pointerdown', (e) => {
      const noteNum = parseInt(e.target.id);
      if (!isNaN(noteNum)) {
        this.emit('keyDown', noteNum);
        this._pointersDown[e.pointerId] = true;
      }
    });

    key.addEventListener('pointerup', (e) => {
      const noteNum = parseInt(e.target.id);
      if (!isNaN(noteNum)) {
        this.emit('keyUp', noteNum);
        delete this._pointersDown[e.pointerId];
      }
    });

    key.addEventListener('touchstart', this._absorbEvent.bind(this), { passive: false });
    key.addEventListener('touchend', this._absorbEvent.bind(this), { passive: false });
    key.addEventListener('touchmove', this._absorbEvent.bind(this), { passive: false });
    key.addEventListener('touchcancel', this._absorbEvent.bind(this), { passive: false });
  }

  keyDown(noteNum, ai = false) {
    if (this._keys[noteNum]) {
      const key = this._keys[noteNum];
      key.classList.remove('hover');

      const fill = key.querySelector('#fill');
      if (!fill) return;

      const note = new Note(fill, ai);
      const noteArray = ai ? this._aiNotes : this._notes;
      if (!noteArray[noteNum]) {
        noteArray[noteNum] = [];
      }
      noteArray[noteNum].push(note);
    }
  }

  keyUp(noteNum, ai = false) {
    if (this._keys[noteNum]) {
      const noteArray = ai ? this._aiNotes : this._notes;
      if (noteArray[noteNum] && noteArray[noteNum].length > 0) {
        noteArray[noteNum].shift().noteOff();
      }
    }
  }
}

export default KeyboardElement;