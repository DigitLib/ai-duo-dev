/**
 * Modern Splash Screen for AI Duet.
 */

import { EventEmitter } from '../EventEmitter.js';
import { Loader } from './Loader.js';

export class Splash extends EventEmitter {
  constructor(container) {
    super();

    const splash = this._splash = document.createElement('div');
    splash.id = 'splash';
    container.appendChild(splash);

    const titleContainer = document.createElement('div');
    titleContainer.id = 'titleContainer';
    splash.appendChild(titleContainer);

    const title = document.createElement('div');
    title.id = 'title';
    title.textContent = 'A.I. Duet';
    titleContainer.appendChild(title);

    const subTitle = document.createElement('div');
    subTitle.id = 'subTitle';
    subTitle.textContent = 'A piano that responds to you.';
    titleContainer.appendChild(subTitle);

    this._clicked = false;
    const loader = this._loader = new Loader(titleContainer);
    loader.on('click', () => {
      splash.classList.add('disappear');
      this._clicked = true;
      this.emit('click');
    });

    const howItWorks = document.createElement('div');
    howItWorks.id = 'howItWorks';
    howItWorks.textContent = 'How it works';
    howItWorks.addEventListener('click', () => {
      this.emit('about');
    });
    titleContainer.appendChild(howItWorks);

    const projectOrigin = document.createElement('div');
    projectOrigin.id = 'projectOrigin';
    projectOrigin.innerHTML = 'Based on the <a href="https://experiments.withgoogle.com/ai/ai-duet" target="_blank" rel="noopener noreferrer">A.I. Duet</a> experiment by <a href="https://github.com/googlecreativelab/aiexperiments-ai-duet" target="_blank" rel="noopener noreferrer">Yotam Mann &amp; Google Creative Lab / Magenta</a>';
    titleContainer.appendChild(projectOrigin);

    // Badges at bottom
    const badges = document.createElement('div');
    badges.id = 'badges';
    splash.appendChild(badges);

    const modernBadge = document.createElement('div');
    modernBadge.className = 'badge';
    modernBadge.innerHTML = '<div id="text">Powered by <span>FastAPI & ONNX Runtime</span></div>';
    badges.appendChild(modernBadge);
  }

  get loader() {
    return this._loader;
  }

  get loaded() {
    return this._loader.loaded;
  }

  isOpen() {
    return !this._clicked;
  }

  show() {
    this._splash.classList.remove('disappear');
  }

  hide() {
    this._splash.classList.add('disappear');
  }
}

export default Splash;