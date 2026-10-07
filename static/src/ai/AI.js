/**
 * Modern AI Duet Orchestrator.
 * Records user phrases, communicates with FastAPI ONNX backend, and triggers duet responses.
 * Supports:
 * - Turn-Based Mode (Call & Response: You play a phrase, then AI answers)
 * - Play Together Mode (Live Jam / Duet: AI plays along with you in real time)
 * - Dual Engine: High-speed WebSocket / FastAPI Server OR 100% In-Browser WebAssembly (WASM)
 */

import pkg from '@tonejs/midi';
const Midi = pkg.Midi || pkg;
import { EventEmitter } from '../EventEmitter.js';
import { getAudioContext } from '../sound/Sound.js';
import { localGenerator } from './LocalGenerator.js';

export class AI extends EventEmitter {
  constructor() {
    super();
    this.audioCtx = getAudioContext();

    this._recordedNotes = []; // { midi, startTime, endTime }
    this._recentNotes = [];   // rolling history for live jamming
    this._heldNotes = new Set();
    this._sendTimeout = null;
    this._togetherTimer = null;
    this._aiPlayingUntil = 0;
    this._lastPhraseTime = -1;
    this._isGenerating = false;

    // Configurable duet parameters
    this.temperature = 0.5;
    this.enabled = true;
    this.mode = 'turn'; // 'turn' (Call & Response) or 'together' (Play Together / Live Jam)

    // Detect if running on static host (GitHub Pages, file://, static server, or explicit static mode)
    const isStaticEnv = typeof window !== 'undefined' && (
      window.__STATIC_MODE__ === true ||
      window.location.protocol === 'file:' ||
      window.location.hostname.endsWith('github.io') ||
      window.location.hostname.endsWith('pages.dev') ||
      window.location.hostname.endsWith('vercel.app') ||
      window.location.hostname.endsWith('netlify.app')
    );

    this.isStaticHost = isStaticEnv;
    this.serverConnected = false;
    this._hasConnectedEver = false;
    this._reconnectAttempts = 0;

    // Default model: WASM for static hosting, Attention RNN when backend server is expected
    this.model = isStaticEnv ? 'wasm_basic' : 'attention_rnn';

    // WebSocket connection if available
    this._ws = null;
    if (!isStaticEnv) {
      this._initWebSocket();
    } else {
      console.log('[AI] Running in static mode. Using In-Browser WebAssembly model.');
      // Pre-warm local model in background
      localGenerator.load().catch((err) => console.warn('[AI] In-browser model preload:', err));
    }
  }

  stop() {
    if (this._sendTimeout) {
      clearTimeout(this._sendTimeout);
      this._sendTimeout = null;
    }
    if (this._togetherTimer) {
      clearTimeout(this._togetherTimer);
      this._togetherTimer = null;
    }
    this._recordedNotes = [];
    this._recentNotes = [];
    this._heldNotes.clear();
    this._aiPlayingUntil = 0;
    this._lastPhraseTime = -1;
    this._isGenerating = false;
  }

  _initWebSocket() {
    if (this.isStaticHost || (typeof window !== 'undefined' && window.__STATIC_MODE__)) {
      this.model = 'wasm_basic';
      localGenerator.load().catch((err) => console.warn('[AI] In-browser model preload:', err));
      return;
    }

    try {
      const isDev = window.location.port === '5173';
      const host = isDev ? '127.0.0.1:8080' : window.location.host;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${host}/ws`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this._ws = ws;
        this.serverConnected = true;
        this._hasConnectedEver = true;
        this._reconnectAttempts = 0;
        this.emit('serverStatus', true);
        console.log('[AI] WebSocket connected to', wsUrl);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'prediction' && Array.isArray(data.midi)) {
            this._handleMidiResponse(new Uint8Array(data.midi).buffer);
          }
        } catch (e) {
          console.warn('[AI] Error parsing WS message:', e);
        } finally {
          this._isGenerating = false;
        }
      };

      ws.onerror = () => {
        this._ws = null;
        this.serverConnected = false;
        this._isGenerating = false;
        this.emit('serverStatus', false);
      };

      ws.onclose = () => {
        this._ws = null;
        this.serverConnected = false;
        this._isGenerating = false;
        this.emit('serverStatus', false);

        // If a backend server was NEVER connected (e.g. running on python -m http.server),
        // do NOT spam reconnect loops. Switch permanently to In-Browser WebAssembly.
        if (!this._hasConnectedEver) {
          console.log('[AI] No WebSocket server detected. Switching permanently to In-Browser WebAssembly mode.');
          this.isStaticHost = true;
          this.model = 'wasm_basic';
          localGenerator.load().catch((err) => console.warn('[AI] In-browser model preload:', err));
          return;
        }

        // Only retry if a server was previously connected and dropped (max 3 retries)
        if (this._reconnectAttempts < 3) {
          this._reconnectAttempts++;
          setTimeout(() => {
            if (!this._ws) this._initWebSocket();
          }, 4000);
        }
      };
    } catch (_) {
      this._ws = null;
      this.serverConnected = false;
      this._isGenerating = false;
      this.isStaticHost = true;
      this.model = 'wasm_basic';
      localGenerator.load().catch((err) => console.warn('[AI] In-browser model preload:', err));
    }
  }

  now() {
    const ctx = this.audioCtx || getAudioContext();
    return ctx ? ctx.currentTime : performance.now() / 1000;
  }

  keyDown(note, time = null) {
    const noteTime = time !== null ? time : this.now();
    if (this._recordedNotes.length === 0 && this._lastPhraseTime === -1) {
      this._lastPhraseTime = Date.now();
    }

    if (this._sendTimeout) {
      clearTimeout(this._sendTimeout);
      this._sendTimeout = null;
    }

    this._heldNotes.add(note);
    const noteObj = {
      midi: note,
      startTime: noteTime,
      endTime: null
    };
    this._recordedNotes.push(noteObj);
    this._recentNotes.push(noteObj);
    if (this._recentNotes.length > 32) {
      this._recentNotes.shift();
    }

    // In Play Together mode: trigger accompaniment only when previous AI accompaniment has finished
    if (this.mode === 'together' && !this._isGenerating && this.now() >= this._aiPlayingUntil - 0.1) {
      if (this._recordedNotes.length >= 3 && !this._togetherTimer) {
        this._togetherTimer = setTimeout(() => {
          this._togetherTimer = null;
          if (this.mode === 'together' && this.enabled && !this._isGenerating && this.now() >= this._aiPlayingUntil - 0.1) {
            this.send(true);
          }
        }, 350);
      }
    }
  }

  keyUp(note, time = null) {
    const noteTime = time !== null ? time : this.now();
    this._heldNotes.delete(note);

    for (let i = this._recordedNotes.length - 1; i >= 0; i--) {
      const n = this._recordedNotes[i];
      if (n.midi === note && n.endTime === null) {
        n.endTime = Math.max(noteTime, n.startTime + 0.05);
        break;
      }
    }

    if (this._heldNotes.size === 0) {
      if (this.mode === 'together') {
        if (!this._isGenerating && this.now() >= this._aiPlayingUntil - 0.1 && this._recordedNotes.length >= 2) {
          this._sendTimeout = setTimeout(() => this.send(true), 250);
        }
      } else {
        // In Turn-Based mode: pause for 450ms of silence before answering
        if (this._lastPhraseTime !== -1 && Date.now() - this._lastPhraseTime > 3000) {
          this.send(true);
        } else {
          this._sendTimeout = setTimeout(() => this.send(true), 450);
        }
      }
    }
  }

  async _generateLocally(notesToSend) {
    try {
      const notes = await localGenerator.generate(notesToSend, this.temperature);
      this._scheduleNotes(notes);
    } catch (err) {
      console.error('[AI] Local in-browser generator error:', err);
    } finally {
      this._isGenerating = false;
    }
  }

  async send(clearPhrase = true) {
    if (!this.enabled || this._recordedNotes.length === 0 || this._isGenerating) return;

    const now = this.now();
    let sourceNotes = this._recordedNotes;
    if (this.mode === 'together') {
      // In live jamming, focus on recent notes (last 3.5s) to stay in sync with live playing
      const cutoff = now - 3.5;
      sourceNotes = this._recentNotes.filter(n => (n.endTime || n.startTime) >= cutoff);
      if (sourceNotes.length < 2) {
        sourceNotes = this._recentNotes.slice(-6);
      }
    }

    const notesToSend = sourceNotes.map(n => ({
      midi: n.midi,
      startTime: n.startTime,
      endTime: n.endTime !== null ? n.endTime : now
    })).filter(n => n.endTime > n.startTime);

    if (notesToSend.length === 0) return;

    if (clearPhrase) {
      this._recordedNotes = [];
      this._lastPhraseTime = -1;
    }

    this._isGenerating = true;
    this.emit('sent');

    // If configured for in-browser WASM or hosted statically on GitHub Pages:
    if (this.model === 'wasm_basic' || this.isStaticHost) {
      await this._generateLocally(notesToSend);
      return;
    }

    const firstStart = Math.min(...notesToSend.map(n => n.startTime));
    const lastEnd = Math.max(...notesToSend.map(n => n.endTime));
    const phraseDuration = Math.max(0.2, lastEnd - firstStart);

    const midi = new Midi();
    const track = midi.addTrack();
    notesToSend.forEach(n => {
      const relStart = Math.max(0, n.startTime - firstStart);
      const dur = Math.max(0.08, n.endTime - n.startTime);
      track.addNote({
        midi: n.midi,
        time: relStart,
        duration: dur,
        velocity: 0.85
      });
    });

    const byteArray = Array.from(midi.toArray());
    const additional = Math.max(1, Math.min(phraseDuration, 4));
    const totalDuration = Math.min(phraseDuration + additional, 8.0);

    // Try WebSocket first
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({
        type: 'predict',
        midi: byteArray,
        duration: totalDuration,
        temperature: this.temperature,
        model: this.model
      }));
      return;
    }

    // HTTP POST fallback
    try {
      const isDev = window.location.port === '5173';
      const baseUrl = isDev ? 'http://127.0.0.1:8080' : '.';
      const res = await fetch(`${baseUrl}/predict?duration=${totalDuration.toFixed(2)}&temperature=${this.temperature}&model=${this.model}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(byteArray)
      });

      if (!res.ok) {
        console.warn(`[AI] Server HTTP ${res.status}, falling back to in-browser WASM`);
        await this._generateLocally(notesToSend);
        return;
      }

      const arrayBuffer = await res.arrayBuffer();
      this._handleMidiResponse(arrayBuffer);
    } catch (err) {
      console.warn('[AI] Server connection failed, falling back to in-browser WASM:', err);
      await this._generateLocally(notesToSend);
    } finally {
      this._isGenerating = false;
    }
  }

  _scheduleNotes(notes) {
    if (!notes || notes.length === 0) return;

    notes.sort((a, b) => a.time - b.time);

    const now = this.now() + 0.05;
    const lastNote = notes[notes.length - 1];
    const lastDur = Math.min(Math.max((lastNote.duration || 0.4) * 0.9, 0.15), 4);
    this._aiPlayingUntil = now + Math.max(0, lastNote.time) + lastDur;

    notes.forEach((note) => {
      const noteOnTime = now + Math.max(0, note.time);
      const noteDuration = Math.min(Math.max(note.duration * 0.9, 0.15), 4);
      const noteOffTime = noteOnTime + noteDuration;

      this.emit('playNote', note.midi, noteOnTime, noteDuration);
      this.emit('keyDown', note.midi, noteOnTime);
      this.emit('keyUp', note.midi, noteOffTime);
    });
  }

  _handleMidiResponse(arrayBuffer) {
    try {
      const responseMidi = new Midi(arrayBuffer);
      let notes = [];
      for (const track of responseMidi.tracks) {
        if (track.notes && track.notes.length > 0) {
          notes = notes.concat(track.notes);
        }
      }
      this._scheduleNotes(notes);
    } catch (err) {
      console.warn('[AI] Error parsing response MIDI:', err);
    }
  }
}

export default AI;