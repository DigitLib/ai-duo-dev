/**
 * Modern Controls & Session MIDI Recorder for AI Duet.
 * Handles manual temperature tuning, duet mode (Turn-Based vs Play Together),
 * model selection, AI pause/resume, panic mute, demo trigger, and multi-track MIDI export.
 */

import pkg from '@tonejs/midi';
const Midi = pkg.Midi || pkg;
import { EventEmitter } from '../EventEmitter.js';

export class Controls extends EventEmitter {
  constructor(container, ai, sound, tutorial = null) {
    super();
    this.ai = ai;
    this.sound = sound;
    this.tutorial = tutorial;

    // Recording state
    this.isRecording = false;
    this.recordStartTime = 0;
    this.userNotes = []; // { midi, start, duration, velocity }
    this.aiNotes = [];   // { midi, start, duration, velocity }
    this._activeUserNotes = new Map(); // note -> startTime

    this._timerInterval = null;
    this._lastRecordedMidi = null;

    this._createDOM(container);
    this._bindEvents();
  }

  show() {
    this._root.classList.add('visible');
  }

  hide() {
    this._root.classList.remove('visible');
  }

  _createDOM(container) {
    const root = this._root = document.createElement('div');
    root.id = 'controlsBar';

    root.innerHTML = `
      <div class="control-group temp-control">
        <div class="label-row">
          <span class="control-label">Creativity</span>
          <span id="tempBadge" class="temp-badge">0.50 · Melodic</span>
        </div>
        <input type="range" id="tempSlider" min="0.1" max="1.0" step="0.05" value="0.5" title="Sampling Temperature" />
      </div>

      <div class="control-divider"></div>

      <div class="control-group mode-group">
        <div class="pill-group" title="Duet Mode">
          <button id="modeCallBtn" class="pill-btn active" title="Call & Response: You play a phrase, then AI answers">Turn-Based</button>
          <button id="modeTogetherBtn" class="pill-btn" title="Play Together: AI plays along with you in real time as a live duet">Play Together</button>
        </div>
        <button id="modelToggleBtn" class="ctrl-btn" title="Toggle AI Model (Attention RNN, Basic RNN, or In-Browser WASM)">
          <span class="btn-text">Model: ${this.ai.isStaticHost ? 'In-Browser (WASM)' : 'Attention'}</span>
        </button>
      </div>

      <div class="control-divider"></div>

      <div class="control-group buttons-group">
        <button id="aiToggleBtn" class="ctrl-btn active" title="Toggle AI Duet Responses">
          <span class="status-dot"></span>
          <span class="btn-text">AI: ON</span>
        </button>

        <button id="recordBtn" class="ctrl-btn record-btn" title="Record Duet Session to MIDI">
          <span class="rec-dot"></span>
          <span id="recordText" class="btn-text">Record</span>
        </button>

        <button id="exportBtn" class="ctrl-btn export-btn disabled" title="Export Recorded MIDI File" disabled>
          <svg class="midi-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          <span class="btn-text">Export MIDI</span>
        </button>

        <button id="demoBtn" class="ctrl-btn" title="Listen to a Demo Melody">
          <span class="btn-text">Demo</span>
        </button>

        <button id="stopSoundBtn" class="ctrl-btn panic-btn" title="Silence All Notes">
          <span class="btn-text">Stop</span>
        </button>
      </div>
    `;

    container.appendChild(root);

    this.tempSlider = root.querySelector('#tempSlider');
    this.tempBadge = root.querySelector('#tempBadge');
    this.modeCallBtn = root.querySelector('#modeCallBtn');
    this.modeTogetherBtn = root.querySelector('#modeTogetherBtn');
    this.modelToggleBtn = root.querySelector('#modelToggleBtn');
    this.aiToggleBtn = root.querySelector('#aiToggleBtn');
    this.recordBtn = root.querySelector('#recordBtn');
    this.recordText = root.querySelector('#recordText');
    this.exportBtn = root.querySelector('#exportBtn');
    this.demoBtn = root.querySelector('#demoBtn');
    this.stopSoundBtn = root.querySelector('#stopSoundBtn');
  }

  _bindEvents() {
    // 1. Temperature Slider
    this.tempSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.ai.temperature = val;

      let descriptor = 'Melodic';
      if (val < 0.3) descriptor = 'Structured';
      else if (val <= 0.65) descriptor = 'Melodic';
      else if (val <= 0.85) descriptor = 'Creative';
      else descriptor = 'Wild';

      this.tempBadge.textContent = `${val.toFixed(2)} · ${descriptor}`;
    });

    // 2. Duet Mode Toggles
    this.modeCallBtn.addEventListener('click', () => {
      this.ai.mode = 'turn';
      this.modeCallBtn.classList.add('active');
      this.modeTogetherBtn.classList.remove('active');
    });

    this.modeTogetherBtn.addEventListener('click', () => {
      this.ai.mode = 'together';
      this.modeTogetherBtn.classList.add('active');
      this.modeCallBtn.classList.remove('active');
    });

    // 3. Model Toggle
    this.modelToggleBtn.addEventListener('click', () => {
      if (this.ai.isStaticHost) {
        // On static hosting (GitHub Pages), client-side WASM is active
        this.modelToggleBtn.querySelector('.btn-text').textContent = 'Model: In-Browser (WASM)';
        return;
      }

      if (this.ai.model === 'attention_rnn') {
        this.ai.model = 'basic_rnn';
        this.modelToggleBtn.querySelector('.btn-text').textContent = 'Model: Basic (Server)';
      } else if (this.ai.model === 'basic_rnn') {
        this.ai.model = 'wasm_basic';
        this.modelToggleBtn.querySelector('.btn-text').textContent = 'Model: In-Browser (WASM)';
      } else {
        this.ai.model = 'attention_rnn';
        this.modelToggleBtn.querySelector('.btn-text').textContent = 'Model: Attention (Server)';
      }
    });

    // Listen to AI server status
    this.ai.on('serverStatus', (online) => {
      if (!online && this.ai.model !== 'wasm_basic') {
        this.modelToggleBtn.querySelector('.btn-text').textContent = 'Model: In-Browser (WASM)';
      }
    });

    // 4. AI Toggle (Pause/Resume Duet)
    this.aiToggleBtn.addEventListener('click', () => {
      this.ai.enabled = !this.ai.enabled;
      if (this.ai.enabled) {
        this.aiToggleBtn.classList.add('active');
        this.aiToggleBtn.querySelector('.btn-text').textContent = 'AI: ON';
      } else {
        this.aiToggleBtn.classList.remove('active');
        this.aiToggleBtn.querySelector('.btn-text').textContent = 'AI: PAUSED';
        this.ai.stop();
      }
    });

    // 5. Demo Trigger Button
    if (this.demoBtn) {
      this.demoBtn.addEventListener('click', () => {
        if (this.tutorial && typeof this.tutorial.playDemo === 'function') {
          this.tutorial.playDemo();
        }
      });
    }

    // 6. Stop / Silence Button
    this.stopSoundBtn.addEventListener('click', () => {
      this.sound.stopAll();
      this.ai.stop();
    });

    // 7. Record Button
    this.recordBtn.addEventListener('click', () => {
      if (!this.isRecording) {
        this.startRecording();
      } else {
        this.stopRecording();
      }
    });

    // 8. Export MIDI Button
    this.exportBtn.addEventListener('click', () => {
      if (this._lastRecordedMidi) {
        this._downloadMidi(this._lastRecordedMidi);
      }
    });
  }

  now() {
    return this.sound.audioCtx.currentTime;
  }

  startRecording() {
    this.isRecording = true;
    this.recordStartTime = this.now();
    this.userNotes = [];
    this.aiNotes = [];
    this._activeUserNotes.clear();

    this.recordBtn.classList.add('recording');
    this.exportBtn.classList.add('disabled');
    this.exportBtn.disabled = true;

    let seconds = 0;
    this.recordText.textContent = 'REC 00:00';
    this._timerInterval = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      this.recordText.textContent = `REC ${mins}:${secs}`;
    }, 1000);
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;
    clearInterval(this._timerInterval);

    this.recordBtn.classList.remove('recording');
    this.recordText.textContent = 'Record';

    // Close any unclosed user notes
    const endTime = this.now() - this.recordStartTime;
    for (const [note, start] of this._activeUserNotes.entries()) {
      this.userNotes.push({
        midi: note,
        start,
        duration: Math.max(0.1, endTime - start),
        velocity: 0.8
      });
    }
    this._activeUserNotes.clear();

    const totalNotes = this.userNotes.length + this.aiNotes.length;
    if (totalNotes > 0) {
      const midiData = this._buildMidi();
      this._lastRecordedMidi = midiData;
      this.exportBtn.classList.remove('disabled');
      this.exportBtn.disabled = false;
      this._downloadMidi(midiData);
    }
  }

  // Hook for user note events
  onUserKeyDown(note) {
    if (!this.isRecording) return;
    const relTime = Math.max(0, this.now() - this.recordStartTime);
    this._activeUserNotes.set(note, relTime);
  }

  onUserKeyUp(note) {
    if (!this.isRecording) return;
    const startTime = this._activeUserNotes.get(note);
    if (startTime !== undefined) {
      const relTime = Math.max(0, this.now() - this.recordStartTime);
      this.userNotes.push({
        midi: note,
        start: startTime,
        duration: Math.max(0.08, relTime - startTime),
        velocity: 0.85
      });
      this._activeUserNotes.delete(note);
    }
  }

  // Hook for AI note events
  onAiPlayNote(note, startTime, duration) {
    if (!this.isRecording) return;
    const relTime = Math.max(0, startTime - this.recordStartTime);
    this.aiNotes.push({
      midi: note,
      start: relTime,
      duration: Math.max(0.08, duration),
      velocity: 0.8
    });
  }

  _buildMidi() {
    const midi = new Midi();
    midi.name = "AI Duet Session";

    // Track 1: User Piano
    if (this.userNotes.length > 0) {
      const userTrack = midi.addTrack();
      userTrack.name = "User (Piano)";
      userTrack.channel = 0;
      this.userNotes.forEach((n) => {
        userTrack.addNote({
          midi: n.midi,
          time: n.start,
          duration: n.duration,
          velocity: n.velocity
        });
      });
    }

    // Track 2: AI Duet Response
    if (this.aiNotes.length > 0) {
      const aiTrack = midi.addTrack();
      aiTrack.name = "AI Duet (Response)";
      aiTrack.channel = 1;
      this.aiNotes.forEach((n) => {
        aiTrack.addNote({
          midi: n.midi,
          time: n.start,
          duration: n.duration,
          velocity: n.velocity
        });
      });
    }

    return midi.toArray();
  }

  _downloadMidi(byteArray) {
    const blob = new Blob([byteArray], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `ai-duet-session-${timestamp}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export default Controls;
