/**
 * Modern Web Audio Sampler for AI Duet.
 * Decodes and plays Salamander piano and string ensemble MP3 samples with pitch interpolation.
 */

const MIDI_NAMES = {
  21: 'A0', 24: 'C1', 27: 'Ds1', 30: 'Fs1',
  33: 'A1', 36: 'C2', 39: 'Ds2', 42: 'Fs2',
  45: 'A2', 48: 'C3', 51: 'Ds3', 54: 'Fs3',
  57: 'A3', 60: 'C4', 63: 'Ds4', 66: 'Fs4',
  69: 'A4', 72: 'C5', 75: 'Ds5', 78: 'Fs5',
  81: 'A5', 84: 'C6', 87: 'Ds6', 90: 'Fs6',
  93: 'A6', 96: 'C7', 99: 'Ds7', 102: 'Fs7',
  105: 'A7', 108: 'C8'
};

const SAMPLED_NOTES = Object.keys(MIDI_NAMES).map(Number).sort((a, b) => a - b);

export class Sampler {
  constructor(baseUrl, audioCtx, range = [21, 108]) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.audioCtx = audioCtx;
    this.range = range;

    this.buffers = new Map(); // midi note -> AudioBuffer
    this.activeVoices = new Map(); // midi note -> Array of active voices

    this.masterGain = audioCtx.createGain();
    this.masterGain.connect(audioCtx.destination);

    this.loaded = false;
  }

  set volume(db) {
    const linear = Math.pow(10, db / 20);
    this.masterGain.gain.setValueAtTime(linear, this.audioCtx.currentTime);
  }

  async load(onProgress = null) {
    const notesToLoad = SAMPLED_NOTES.filter(n => n >= this.range[0] - 2 && n <= this.range[1] + 2);
    let loadedCount = 0;

    const loadPromises = notesToLoad.map(async (note) => {
      const fileName = MIDI_NAMES[note] + '.mp3';
      const url = this.baseUrl + fileName;

      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        this.buffers.set(note, audioBuffer);
      } catch (err) {
        console.warn(`[Sampler] Failed to load ${url}:`, err);
      } finally {
        loadedCount++;
        if (onProgress) {
          onProgress(loadedCount / notesToLoad.length);
        }
      }
    });

    await Promise.all(loadPromises);
    this.loaded = true;
    return this;
  }

  getPlaybackParams(midi) {
    const mod = midi % 3;
    let sampleNote = midi;
    let shift = 0;

    if (mod === 0) {
      sampleNote = midi;
      shift = 0;
    } else if (mod === 1) {
      sampleNote = midi - 1;
      shift = 1;
    } else if (mod === 2) {
      sampleNote = midi + 1;
      shift = -1;
    }

    if (!this.buffers.has(sampleNote)) {
      let closest = SAMPLED_NOTES[0];
      let minDiff = 999;
      for (const sn of this.buffers.keys()) {
        const diff = Math.abs(sn - midi);
        if (diff < minDiff) {
          minDiff = diff;
          closest = sn;
        }
      }
      sampleNote = closest;
      shift = midi - closest;
    }

    return { sampleNote, shift };
  }

  /**
   * Deterministically plays a note with start time and duration in Web Audio.
   * Completely immune to cancellation from overlapping voices or early keyUps.
   */
  playNote(note, time = null, duration = 0.5, velocity = 0.8) {
    if (!this.loaded) return;
    const now = this.audioCtx.currentTime;
    const playTime = (time !== null && time >= now) ? time : now;

    const { sampleNote, shift } = this.getPlaybackParams(note);
    const buffer = this.buffers.get(sampleNote);
    if (!buffer) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, shift / 12);

    const gainNode = this.audioCtx.createGain();
    const attack = 0.005;
    const release = 0.25;
    const noteDur = Math.max(duration, 0.08);
    const stopTime = playTime + noteDur;

    // Linear envelope: silence -> attack -> sustain -> release -> 0
    gainNode.gain.setValueAtTime(0.0001, playTime);
    gainNode.gain.linearRampToValueAtTime(velocity, playTime + attack);
    gainNode.gain.setValueAtTime(velocity, stopTime);
    gainNode.gain.linearRampToValueAtTime(0.0001, stopTime + release);

    source.connect(gainNode);
    gainNode.connect(this.masterGain);

    source.start(playTime);
    try {
      source.stop(stopTime + release + 0.05);
    } catch (_) {}
  }

  keyDown(note, time = null, velocity = 0.85) {
    if (!this.loaded) return;
    const now = this.audioCtx.currentTime;
    const playTime = (time !== null && time >= now) ? time : now;

    const { sampleNote, shift } = this.getPlaybackParams(note);
    const buffer = this.buffers.get(sampleNote);
    if (!buffer) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, shift / 12);

    const gainNode = this.audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.0001, playTime);
    gainNode.gain.linearRampToValueAtTime(velocity, playTime + 0.005);

    source.connect(gainNode);
    gainNode.connect(this.masterGain);

    source.start(playTime);

    if (!this.activeVoices.has(note)) {
      this.activeVoices.set(note, []);
    }
    const voice = { source, gainNode, startTime: playTime, targetVel: velocity };
    this.activeVoices.get(note).push(voice);

    source.onended = () => {
      const list = this.activeVoices.get(note);
      if (list) {
        const idx = list.indexOf(voice);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  }

  keyUp(note, time = null) {
    if (!this.loaded) return;
    const now = this.audioCtx.currentTime;
    const stopTime = (time !== null && time >= now) ? time : now;

    const list = this.activeVoices.get(note);
    if (list && list.length > 0) {
      const voice = list.pop();
      if (voice) {
        const releaseTime = 0.25;
        try {
          voice.gainNode.gain.cancelScheduledValues(stopTime);
          voice.gainNode.gain.setValueAtTime(voice.targetVel || 0.8, stopTime);
          voice.gainNode.gain.linearRampToValueAtTime(0.0001, stopTime + releaseTime);
          voice.source.stop(stopTime + releaseTime + 0.05);
        } catch (_) {}
      }
    }
  }
}

export default Sampler;