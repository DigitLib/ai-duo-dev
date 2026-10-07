/**
 * Loading bar and Play trigger for AI Duet.
 */

import { EventEmitter } from '../EventEmitter.js';
import { getAudioContext } from '../sound/Sound.js';

export class Loader extends EventEmitter {
  constructor(container) {
    super();

    const loader = document.createElement('div');
    loader.id = 'loader';
    container.appendChild(loader);

    const loaderText = document.createElement('div');
    loaderText.id = 'loaderText';
    loaderText.textContent = 'loading...';
    loader.appendChild(loaderText);

    const fill = document.createElement('div');
    fill.id = 'fill';
    loader.appendChild(fill);

    const fillText = document.createElement('div');
    fillText.id = 'fillText';
    fillText.textContent = 'loading...';
    fill.appendChild(fillText);

    this.isLoaded = false;

    loader.addEventListener('click', async () => {
      if (this.isLoaded) {
        const audioCtx = getAudioContext();
        if (audioCtx && audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        this.emit('click');
      }
    });

    this._fill = fill;
    this._fillText = fillText;
    this._loaderText = loaderText;
    this._loader = loader;
  }

  progress(prog) {
    this.setProgress(prog);
  }

  setProgress(prog) {
    const percent = Math.min(100, Math.max(0, prog * 100)).toFixed(1);
    this._fill.style.width = `${percent}%`;

    if (prog >= 1.0 && !this.isLoaded) {
      this.loaded();
    }
  }

  loaded() {
    this.isLoaded = true;
    this._loader.classList.add('clickable');
    const playContent = '<div id="piano"></div> <div id="play">PLAY</div>';
    this._loaderText.innerHTML = playContent;
    this._fillText.innerHTML = playContent;
    this.emit('loaded');
  }
}

export default Loader;