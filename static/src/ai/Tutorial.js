/**
 * Interactive Tutorial for AI Duet.
 */

import { EventEmitter } from '../EventEmitter.js';
import { getAudioContext } from '../sound/Sound.js';

const BEAT = 0.4;
const TEST_MELODY = [
  { note: 60, time: BEAT * 0, duration: BEAT },
  { note: 62, time: BEAT * 1, duration: BEAT },
  { note: 64, time: BEAT * 2, duration: BEAT },
  { note: 64, time: BEAT * 3, duration: BEAT * 0.5 },
  { note: 62, time: BEAT * 3.6, duration: BEAT * 0.5 },
  { note: 60, time: BEAT * 4, duration: BEAT * 0.5 },
  { note: 60, time: BEAT * 5, duration: BEAT }
];

export class Tutorial extends EventEmitter {
  constructor(container) {
    super();
    this._tutorial = document.createElement('div');
    this._tutorial.id = 'tutorial';
    container.appendChild(this._tutorial);
  }

  now() {
    const ctx = getAudioContext();
    return ctx ? ctx.currentTime : performance.now() / 1000;
  }

  start() {
    this._currentHint = this._addText('Play a few notes on the piano to begin...', 'user', 6000);
  }

  dismiss() {
    if (this._currentHint) {
      this._removeText(this._currentHint);
      this._currentHint = null;
    }
  }

  playDemo() {
    this.dismiss();
    this._addText('Playing demo melody...', 'user', 4000);
    const currentTime = this.now();
    TEST_MELODY.forEach((event) => {
      this.emit('keyDown', event.note, event.time + currentTime);
      this.emit('keyUp', event.note, event.time + event.duration * 0.9 + currentTime);
    });
    this._delay(3000).then(() => {
      this._sendUserMelody();
      this._addText('the computer responds to what you played', 'ai', 4000);
    });
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _sendUserMelody() {
    const currentTime = this.now();
    TEST_MELODY.forEach((event) => {
      this.emit('aiKeyDown', event.note, event.time + currentTime);
      this.emit('aiKeyUp', event.note, event.time + event.duration * 0.9 + currentTime);
    });
  }

  _addText(text, className, time) {
    const element = document.createElement('div');
    element.classList.add('text', className);
    element.textContent = text;
    this._tutorial.appendChild(element);

    requestAnimationFrame(() => {
      element.classList.add('visible');
    });

    if (time) {
      setTimeout(() => this._removeText(element), time);
    }
    return element;
  }

  _removeText(element) {
    element.classList.remove('visible');
    setTimeout(() => {
      if (element.parentNode) element.remove();
    }, 500);
  }
}

export default Tutorial;