/**
 * Ambient Glow visualizer for AI Duet.
 */

import { getAudioContext } from '../sound/Sound.js';

export class Glow {
  constructor(container) {
    this._element = document.createElement('div');
    this._element.id = 'glow';
    container.appendChild(this._element);

    this._aiGlow = document.createElement('div');
    this._aiGlow.id = 'ai';
    this._element.appendChild(this._aiGlow);

    this._userGlow = document.createElement('div');
    this._userGlow.id = 'user';
    this._element.appendChild(this._userGlow);

    this._aiTime = -1;
    this._aiVisible = true;

    this._boundLoop = this._loop.bind(this);
    requestAnimationFrame(this._boundLoop);
  }

  now() {
    const ctx = getAudioContext();
    return ctx ? ctx.currentTime : performance.now() / 1000;
  }

  _loop() {
    const current = this.now();
    if (this._aiTime < 0 || current > this._aiTime) {
      if (this._aiVisible) {
        this._aiVisible = false;
        this._aiGlow.classList.remove('visible');
        this._userGlow.classList.add('visible');
      }
    } else {
      if (!this._aiVisible) {
        this._aiVisible = true;
        this._aiGlow.classList.add('visible');
        this._userGlow.classList.remove('visible');
      }
    }
    requestAnimationFrame(this._boundLoop);
  }

  ai(time) {
    this._aiTime = Math.max(this._aiTime, time + 0.3);
  }

  user() {
    this._aiTime = -1;
  }
}

export default Glow;