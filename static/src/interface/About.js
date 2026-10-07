/**
 * Modern About & Help Modal for AI Duet.
 * Includes complete architectural explanations, Model comparison (Attention RNN vs Basic RNN),
 * Duet Modes, Keyboard/MIDI controls, and references to the original Google Magenta project.
 */

import { EventEmitter } from '../EventEmitter.js';

const aboutContent = `
  <div id="aboutCard">
    <div class="card-header">
      <div class="title-wrap">
        <h2>A.I. Duet</h2>
        <p class="subtitle">An interactive piano that responds to your melodies using deep learning.</p>
      </div>
      <button id="modalCloseBtn" class="modal-close-btn" title="Close" aria-label="Close">✕</button>
    </div>
    
    <div class="info-section">
      <h3>How to Play</h3>
      <ul>
        <li><strong>Computer Keyboard:</strong> Use keys <span class="badge-key">A</span> through <span class="badge-key">K</span> (home row) for white keys, and <span class="badge-key">W</span>, <span class="badge-key">E</span>, <span class="badge-key">T</span>, <span class="badge-key">Y</span>, <span class="badge-key">U</span> for black keys. Use <span class="badge-key">Z</span> / <span class="badge-key">X</span> to shift octaves down/up.</li>
        <li><strong>Mouse / Touch:</strong> Click or glide across the virtual piano keys.</li>
        <li><strong>USB MIDI Keyboard:</strong> Plug in any physical MIDI keyboard controller — automatically detected with zero drivers.</li>
      </ul>
    </div>

    <div class="info-section">
      <h3>Duet Modes</h3>
      <ul>
        <li><strong>Turn-Based (Call & Response):</strong> Play a phrase, then pause. The AI listens, captures your key and tempo, and responds with an answering phrase.</li>
        <li><strong>Play Together (Live Duet):</strong> The AI jams along with you in real time, playing complementary rhythmic counter-melodies and harmonies while you play.</li>
      </ul>
    </div>

    <div class="info-section">
      <h3>AI Models: Attention RNN vs Basic RNN</h3>
      <div class="model-cards-grid">
        <div class="model-mini-card active-card">
          <h4>Attention RNN <span class="badge-rec">Default</span></h4>
          <p><strong>Architecture:</strong> 2-layer LSTM + 40-step Attention Mechanism + 74 musical features (key profile, beat tracker, melodic contour).</p>
          <p><strong>Musical Style:</strong> Remembers and echoes your musical motifs, themes, and rhythms across 1–2 bars for true conversational call-and-response.</p>
        </div>
        <div class="model-mini-card">
          <h4>Basic RNN</h4>
          <p><strong>Architecture:</strong> 2-layer LSTM with 38-class one-hot encoding.</p>
          <p><strong>Musical Style:</strong> Generates smooth, continuous, scalar counterpoints without repeating exact rhythmic patterns. Great for gentle, flowing background accompaniment.</p>
        </div>
      </div>
    </div>

    <div class="info-section">
      <h3>Creativity & Temperature</h3>
      <p>Adjust the <strong>Creativity</strong> slider in the top bar to control sampling temperature:</p>
      <ul>
        <li><strong>0.20 – 0.35 (Structured):</strong> Tight, in-key, predictable call-and-response motifs.</li>
        <li><strong>0.40 – 0.65 (Melodic):</strong> Balanced, expressive, human-like musical improvisation.</li>
        <li><strong>0.70 – 0.85 (Creative):</strong> Adventurous, varied jazz-like counterpoints.</li>
        <li><strong>0.90 – 1.00 (Wild):</strong> Playful, unexpected melodic jumps.</li>
      </ul>
    </div>

    <div class="info-section">
      <h3>Visual Guide</h3>
      <p><span class="dot-user"></span> <strong>Cyan:</strong> Notes you play &nbsp;|&nbsp; <span class="dot-ai"></span> <strong>Gold:</strong> Notes the AI plays &nbsp;|&nbsp; <strong>3D Roll:</strong> Real-time piano roll visualization.</p>
    </div>

    <div class="info-section credits-section">
      <h3>Project Heritage & Credits</h3>
      <p>Based on the open-source <strong>A.I. Duet</strong> experiment created by <strong>Yotam Mann</strong> with <strong>Google Creative Lab</strong> and the <strong>Google Magenta</strong> team.</p>
      <p class="credits-links">
        <a href="https://experiments.withgoogle.com/ai/ai-duet" target="_blank" rel="noopener noreferrer">Google AI Experiments</a> &bull;
        <a href="https://github.com/googlecreativelab/aiexperiments-ai-duet" target="_blank" rel="noopener noreferrer">Original 2016 Repository</a> &bull;
        <a href="https://magenta.tensorflow.org" target="_blank" rel="noopener noreferrer">Magenta Project</a>
      </p>
      <p class="credits-modern">Modernized with <strong>FastAPI</strong>, <strong>ONNX Runtime</strong>, <strong>Vite / ES Modules</strong>, and real-time Web MIDI.</p>
    </div>
  </div>
`;

export class About extends EventEmitter {
  constructor(container) {
    super();

    this._container = document.createElement('div');
    this._container.id = 'about';
    container.appendChild(this._container);

    this._toggleButton = document.createElement('div');
    this._toggleButton.id = 'aboutButton';
    this._toggleButton.classList.add('open');
    container.appendChild(this._toggleButton);

    this._toggleButton.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.isOpen()) {
        this.close();
      } else {
        this.open();
      }
    });

    const content = document.createElement('div');
    content.id = 'content';
    content.innerHTML = aboutContent;
    this._container.appendChild(content);

    // Inner close button
    const closeBtn = content.querySelector('#modalCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    // Clicking dark backdrop closes modal
    this._container.addEventListener('click', (e) => {
      if (e.target === this._container || e.target === content) {
        this.close();
      }
    });

    // Escape key closes modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  close() {
    this._toggleButton.classList.remove('close');
    this._toggleButton.classList.add('open');
    this._container.classList.remove('visible');
    this.emit('close');
  }

  open() {
    this._toggleButton.classList.add('close');
    this._toggleButton.classList.remove('open');
    this._container.classList.add('visible');
    this.emit('open');
  }

  isOpen() {
    return this._container.classList.contains('visible');
  }

  showButton() {
    this._toggleButton.classList.add('show');
  }
}

export default About;