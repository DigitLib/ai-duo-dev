/**
 * Modern Sound Manager for AI Duet.
 * Handles piano and string ensemble voices with Web Audio across full 88-key range.
 */

import { Sampler } from './Sampler.js';
import { EventEmitter } from '../EventEmitter.js';

let sharedAudioContext = null;

export function getAudioContext() {
  if (!sharedAudioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
}

export class Sound extends EventEmitter {
  constructor() {
    super();
    this.audioCtx = getAudioContext();

    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
    const audioBase = base.endsWith('/') ? base : base + '/';

    this.piano = new Sampler(`${audioBase}audio/Salamander/`, this.audioCtx, this.range);
    this.synth = new Sampler(`${audioBase}audio/string_ensemble/`, this.audioCtx, this.range);
    this.synth.volume = -8;

    this.loaded = false;
  }

  async resume() {
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  now() {
    return this.audioCtx.currentTime;
  }

  async load(onProgress = null) {
    let pianoProgress = 0;
    let synthProgress = 0;

    const update = () => {
      const total = (pianoProgress + synthProgress) / 2;
      if (onProgress) onProgress(total);
      this.emit('progress', total);
    };

    await Promise.all([
      this.piano.load((p) => {
        pianoProgress = p;
        update();
      }),
      this.synth.load((p) => {
        synthProgress = p;
        update();
      })
    ]);

    this.loaded = true;
    this.emit('load');
    return this;
  }

  playNote(note, time = null, duration = 0.5, isAi = false, velocity = 0.8) {
    if (note < 21 || note > 108) return;
    this.piano.playNote(note, time, duration, velocity);
    if (isAi) {
      this.synth.playNote(note, time, duration, velocity * 0.7);
    }
  }

  keyDown(note, time = null, isAi = false) {
    if (note < 21 || note > 108) return;
    this.piano.keyDown(note, time);
    if (isAi) {
      this.synth.keyDown(note, time);
    }
  }

  keyUp(note, time = null, isAi = false) {
    if (note < 21 || note > 108) return;
    this.piano.keyUp(note, time);
    if (isAi) {
      this.synth.keyUp(note, time);
    }
  }

  stopAll() {
    const now = this.audioCtx.currentTime;
    for (const voices of this.piano.activeVoices.values()) {
      for (const v of voices) {
        try {
          v.gainNode.gain.cancelScheduledValues(now);
          v.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.05);
          v.source.stop(now + 0.06);
        } catch (_) {}
      }
      voices.length = 0;
    }
    for (const voices of this.synth.activeVoices.values()) {
      for (const v of voices) {
        try {
          v.gainNode.gain.cancelScheduledValues(now);
          v.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.05);
          v.source.stop(now + 0.06);
        } catch (_) {}
      }
      voices.length = 0;
    }
  }
}

export default Sound;