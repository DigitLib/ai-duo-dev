/**
 * In-Browser ONNX Melody Generator for A.I. Duet.
 * Runs basic_rnn.onnx directly in the browser via onnxruntime-web (WebAssembly).
 * 100% client-side: Zero backend or Python server required!
 *
 * Pipeline:
 * 1. Collect user notes -> Estimate dynamic tempo (QPM).
 * 2. Quantize into 16th-note monophonic melody grid (holds=-2, rests=-1, pitches=48..83).
 * 3. Transpose phrase by full octaves into model range [48, 84).
 * 4. Encode to one-hot vectors and run recurrent ONNX inference.
 * 5. Nucleus (top-p = 0.90) temperature sampling over next classes.
 * 6. Symmetrically transpose generated response back to player's register.
 * 7. Convert quantized steps back to Web Audio playback notes with natural phrasing.
 */

const MIN_NOTE = 48;
const MAX_NOTE = 84;
const MODEL_CENTER = 66; // (48 + 84) / 2
const PIANO_LOW = 21;    // A0
const PIANO_HIGH = 108;  // C8
const NUM_CLASSES = 38;  // 2 special + (84 - 48)
const HIDDEN_SIZE = 512;
const STEPS_PER_QUARTER = 4; // 16th notes

// Special Magenta events
const MELODY_NO_EVENT = -2; // Sustained hold
const MELODY_NOTE_OFF = -1; // Silence / rest

/**
 * Encode melody event into class index [0..37].
 * 0: NO_EVENT (hold)
 * 1: NOTE_OFF (rest)
 * 2..37: Note pitch relative to MIN_NOTE (48)
 */
function encodeEvent(event) {
  if (event === MELODY_NO_EVENT) return 0;
  if (event === MELODY_NOTE_OFF) return 1;
  if (event >= MIN_NOTE && event < MAX_NOTE) {
    return event - MIN_NOTE + 2;
  }
  // Out of range pitch fallback
  return 1;
}

/**
 * Decode class index [0..37] to melody event.
 */
function decodeEvent(index) {
  if (index === 0) return MELODY_NO_EVENT;
  if (index === 1) return MELODY_NOTE_OFF;
  return index - 2 + MIN_NOTE;
}

/**
 * Nucleus (top-p) sampling over logits with temperature scaling.
 * Mathematically identical to Magenta / generator.py sampling.
 */
function sampleNucleus(logits, temperature = 0.5, allowed = null, pCutoff = 0.90) {
  const temp = Math.max(0.1, Math.min(temperature, 1.5));
  const n = logits.length;
  const scaled = new Float32Array(n);
  const allowedSet = allowed ? new Set(allowed) : null;

  for (let i = 0; i < n; i++) {
    if (allowedSet && !allowedSet.has(i)) {
      scaled[i] = -Infinity;
    } else {
      scaled[i] = logits[i] / temp;
    }
  }

  // Sort valid indices descending by scaled logit
  const validIndices = [];
  for (let i = 0; i < n; i++) {
    if (isFinite(scaled[i])) {
      validIndices.push(i);
    }
  }

  if (validIndices.length === 0) {
    return allowed && allowed.length > 0 ? allowed[0] : 1;
  }

  validIndices.sort((a, b) => scaled[b] - scaled[a]);

  // Compute softmax probabilities
  const maxLogit = scaled[validIndices[0]];
  const probs = new Float32Array(validIndices.length);
  let sumExp = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const p = Math.exp(scaled[validIndices[i]] - maxLogit);
    probs[i] = p;
    sumExp += p;
  }
  for (let i = 0; i < validIndices.length; i++) {
    probs[i] /= sumExp;
  }

  // Top-p cumulative sum
  let cum = 0;
  let cutoffIdx = validIndices.length - 1;
  for (let i = 0; i < validIndices.length; i++) {
    cum += probs[i];
    if (cum >= pCutoff) {
      cutoffIdx = i;
      break;
    }
  }

  // Re-normalize top-p slice
  let topSum = 0;
  for (let i = 0; i <= cutoffIdx; i++) {
    topSum += probs[i];
  }

  const r = Math.random() * topSum;
  let acc = 0;
  for (let i = 0; i <= cutoffIdx; i++) {
    acc += probs[i];
    if (r <= acc) {
      return validIndices[i];
    }
  }

  return validIndices[0];
}

/**
 * Estimate dynamic musical tempo (QPM) from note onsets.
 */
function estimateQpm(notes) {
  if (notes.length < 3) return 120.0;
  const onsets = Array.from(new Set(notes.map(n => Math.round(n.startTime * 1000) / 1000))).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 0; i < onsets.length - 1; i++) {
    const g = onsets[i + 1] - onsets[i];
    if (g > 0.08) gaps.push(g);
  }
  if (gaps.length < 2) return 120.0;
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  const qpm = med < 0.38 ? (30.0 / med) : (60.0 / med);
  return Math.min(160.0, Math.max(60.0, Math.round(qpm * 10) / 10));
}

/**
 * Quantize user note sequence into a 16th-note monophonic melody grid.
 */
function notesToMelody(notes, qpm) {
  const secondsPerStep = 60.0 / qpm / STEPS_PER_QUARTER;
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  const t0 = sorted[0].startTime;

  const maxEnd = Math.max(...sorted.map(n => n.endTime || (n.startTime + 0.2)));
  const totalSteps = Math.max(1, Math.ceil((maxEnd - t0) / secondsPerStep) + 1);

  // Initialize with -1 (MELODY_NOTE_OFF)
  const grid = new Array(totalSteps).fill(MELODY_NOTE_OFF);

  for (const n of sorted) {
    const sStart = Math.max(0, Math.round((n.startTime - t0) / secondsPerStep));
    const rawEnd = n.endTime || (n.startTime + 0.2);
    const sEnd = Math.max(sStart + 1, Math.round((rawEnd - t0) / secondsPerStep));

    // Monophonic resolution: keep higher pitch if simultaneous
    if (grid[sStart] < 0 || n.midi > grid[sStart]) {
      grid[sStart] = n.midi;
    }
    for (let s = sStart + 1; s < sEnd && s < totalSteps; s++) {
      if (grid[s] < 0) {
        grid[s] = MELODY_NO_EVENT; // Sustained hold
      }
    }
  }

  // Trim trailing silence
  while (grid.length > 0 && grid[grid.length - 1] === MELODY_NOTE_OFF) {
    grid.pop();
  }

  // Keep at most 64 primer steps
  return grid.slice(-64);
}

/**
 * Transpose whole primer by full octaves into model range [48, 84).
 */
function transposePrimer(primer) {
  const sounding = primer.filter(p => p >= 0);
  if (sounding.length === 0) return { primerShifted: primer, shift: 0 };

  const sorted = [...sounding].sort((a, b) => a - b);
  const medianPitch = sorted[Math.floor(sorted.length / 2)];
  let shift = 12 * Math.round((MODEL_CENTER - medianPitch) / 12);
  let primerShifted = primer.map(p => p >= 0 ? p + shift : p);

  const minP = Math.min(...primerShifted.filter(p => p >= 0));
  const maxP = Math.max(...primerShifted.filter(p => p >= 0));
  if (minP < MIN_NOTE) {
    primerShifted = primerShifted.map(p => p >= 0 ? p + 12 : p);
    shift += 12;
  } else if (maxP >= MAX_NOTE) {
    primerShifted = primerShifted.map(p => p >= 0 ? p - 12 : p);
    shift -= 12;
  }

  return { primerShifted, shift };
}

/**
 * Convert output melody events back to note objects { midi, time, duration }.
 */
function melodyToNotes(events, qpm, shift) {
  const secondsPerStep = 60.0 / qpm / STEPS_PER_QUARTER;

  // Shift back symmetrically to player's register
  let answer = events.map(e => e >= 0 ? e - shift : e);
  let sounding = answer.filter(p => p >= 0);

  if (sounding.length > 0) {
    while (Math.min(...sounding) < PIANO_LOW) {
      answer = answer.map(p => p >= 0 ? p + 12 : p);
      sounding = sounding.map(p => p + 12);
    }
    while (Math.max(...sounding) > PIANO_HIGH) {
      answer = answer.map(p => p >= 0 ? p - 12 : p);
      sounding = sounding.map(p => p - 12);
    }
  }

  const notes = [];
  let cur = null;
  for (let s = 0; s < answer.length; s++) {
    const ev = answer[s];
    if (ev >= 0) {
      if (cur) {
        cur.duration = Math.max(0.08, s * secondsPerStep - cur.time);
        notes.push(cur);
      }
      cur = {
        midi: ev,
        time: s * secondsPerStep,
        duration: secondsPerStep
      };
    } else if (ev === MELODY_NOTE_OFF) {
      if (cur) {
        cur.duration = Math.max(0.08, s * secondsPerStep - cur.time);
        notes.push(cur);
        cur = null;
      }
    } // MELODY_NO_EVENT (-2): continues cur
  }
  if (cur) {
    cur.duration = Math.max(0.08, answer.length * secondsPerStep - cur.time);
    notes.push(cur);
  }

  if (notes.length > 0) {
    const firstStart = notes[0].time;
    const offset = Math.max(0, firstStart - 0.15); // keep up to 0.15s musical breath
    for (const n of notes) {
      n.time = Math.max(0, n.time - offset);
    }
  }

  return notes;
}

export class LocalGenerator {
  constructor() {
    this.session = null;
    this.isInitializing = false;
    this.isLoaded = false;
    this._loadPromise = null;
  }

  /**
   * Resolve runtime model URL relative to Vite base.
   */
  _getModelUrl() {
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
    const cleanBase = base.endsWith('/') ? base : base + '/';
    return `${cleanBase}models/basic_rnn.onnx`;
  }

  /**
   * Check if ONNX Runtime is available in window or load it dynamically.
   */
  async _ensureOrt() {
    if (typeof window === 'undefined') {
      throw new Error('LocalGenerator requires browser window');
    }
    if (window.ort) {
      if (window.ort.env && window.ort.env.wasm) {
        window.ort.env.wasm.numThreads = 1; // Single-threaded WASM for universal GitHub Pages support
      }
      return window.ort;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';
      script.async = true;
      script.onload = () => {
        if (window.ort) {
          if (window.ort.env && window.ort.env.wasm) {
            window.ort.env.wasm.numThreads = 1;
          }
          resolve(window.ort);
        } else {
          reject(new Error('ONNX Runtime Web loaded but window.ort not found'));
        }
      };
      script.onerror = (e) => reject(new Error('Failed to load onnxruntime-web script from CDN'));
      document.head.appendChild(script);
    });
  }

  /**
   * Asynchronously preload and warm up the ONNX inference session.
   */
  async load() {
    if (this.isLoaded) return true;
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = (async () => {
      this.isInitializing = true;
      try {
        const ort = await this._ensureOrt();
        const modelUrl = this._getModelUrl();

        console.log('[LocalGenerator] Loading ONNX model from:', modelUrl);
        const sessionOptions = {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all'
        };

        this.session = await ort.InferenceSession.create(modelUrl, sessionOptions);
        this.isLoaded = true;
        this.isInitializing = false;
        console.log('[LocalGenerator] In-browser basic_rnn.onnx ready!');

        // Warm up session with a 1-step dummy pass
        try {
          const dummyX = new ort.Tensor('float32', new Float32Array(NUM_CLASSES), [1, 1, NUM_CLASSES]);
          const dummyFeeds = {
            input: dummyX,
            h0_in: new ort.Tensor('float32', new Float32Array(HIDDEN_SIZE), [1, 1, HIDDEN_SIZE]),
            c0_in: new ort.Tensor('float32', new Float32Array(HIDDEN_SIZE), [1, 1, HIDDEN_SIZE]),
            h1_in: new ort.Tensor('float32', new Float32Array(HIDDEN_SIZE), [1, 1, HIDDEN_SIZE]),
            c1_in: new ort.Tensor('float32', new Float32Array(HIDDEN_SIZE), [1, 1, HIDDEN_SIZE])
          };
          await this.session.run(dummyFeeds);
          console.log('[LocalGenerator] Model warmup complete');
        } catch (wErr) {
          console.warn('[LocalGenerator] Warmup pass warning (non-fatal):', wErr);
        }

        return true;
      } catch (err) {
        this.isInitializing = false;
        this.isLoaded = false;
        this._loadPromise = null;
        console.error('[LocalGenerator] Failed to load ONNX model:', err);
        throw err;
      }
    })();

    return this._loadPromise;
  }

  /**
   * Generate duet response notes from user notes.
   * @param {Array<{midi: number, startTime: number, endTime: number}>} notes
   * @param {number} temperature
   * @returns {Promise<Array<{midi: number, time: number, duration: number}>>}
   */
  async generate(notes, temperature = 0.5) {
    if (!notes || notes.length === 0) return [];

    await this.load();
    const ort = window.ort;
    const session = this.session;

    const tStart = performance.now();
    const qpm = estimateQpm(notes);
    const primer = notesToMelody(notes, qpm);

    if (!primer.some(p => p >= 0)) {
      console.warn('[LocalGenerator] No valid pitches in primer');
      return [];
    }

    const { primerShifted, shift } = transposePrimer(primer);
    const seqLen = primerShifted.length;

    // 1. Prepare primer one-hot tensor [seqLen, 1, 38]
    const primerData = new Float32Array(seqLen * NUM_CLASSES);
    for (let t = 0; t < seqLen; t++) {
      const cls = encodeEvent(primerShifted[t]);
      primerData[t * NUM_CLASSES + cls] = 1.0;
    }

    let h0 = new Float32Array(HIDDEN_SIZE);
    let c0 = new Float32Array(HIDDEN_SIZE);
    let h1 = new Float32Array(HIDDEN_SIZE);
    let c1 = new Float32Array(HIDDEN_SIZE);

    const primerFeeds = {
      input: new ort.Tensor('float32', primerData, [seqLen, 1, NUM_CLASSES]),
      h0_in: new ort.Tensor('float32', h0, [1, 1, HIDDEN_SIZE]),
      c0_in: new ort.Tensor('float32', c0, [1, 1, HIDDEN_SIZE]),
      h1_in: new ort.Tensor('float32', h1, [1, 1, HIDDEN_SIZE]),
      c1_in: new ort.Tensor('float32', c1, [1, 1, HIDDEN_SIZE])
    };

    let results = await session.run(primerFeeds);
    h0 = results.h0_out.data;
    c0 = results.c0_out.data;
    h1 = results.h1_out.data;
    c1 = results.c1_out.data;

    let lastLogits = results.logits.data.subarray((seqLen - 1) * NUM_CLASSES, seqLen * NUM_CLASSES);

    // 2. Generate continuation steps (16 steps for short phrases, 32 for longer phrases)
    const answerSteps = primer.length <= 24 ? 16 : 32;
    const generatedEvents = [];
    const allClasses = Array.from({ length: NUM_CLASSES }, (_, i) => i);
    const nonHoldClasses = allClasses.filter(c => c !== 0); // No hold at step 0

    for (let stepIdx = 0; stepIdx < answerSteps; stepIdx++) {
      const allowed = stepIdx === 0 ? nonHoldClasses : allClasses;
      const sampledClass = sampleNucleus(lastLogits, temperature, allowed, 0.90);
      const ev = decodeEvent(sampledClass);
      generatedEvents.push(ev);

      // Single forward step with sampled class
      const stepData = new Float32Array(NUM_CLASSES);
      stepData[sampledClass] = 1.0;

      const stepFeeds = {
        input: new ort.Tensor('float32', stepData, [1, 1, NUM_CLASSES]),
        h0_in: new ort.Tensor('float32', h0, [1, 1, HIDDEN_SIZE]),
        c0_in: new ort.Tensor('float32', c0, [1, 1, HIDDEN_SIZE]),
        h1_in: new ort.Tensor('float32', h1, [1, 1, HIDDEN_SIZE]),
        c1_in: new ort.Tensor('float32', c1, [1, 1, HIDDEN_SIZE])
      };

      results = await session.run(stepFeeds);
      h0 = results.h0_out.data;
      c0 = results.c0_out.data;
      h1 = results.h1_out.data;
      c1 = results.c1_out.data;
      lastLogits = results.logits.data;
    }

    // 3. Shift back and reconstruct notes
    const outputNotes = melodyToNotes(generatedEvents, qpm, shift);
    const elapsed = Math.round(performance.now() - tStart);

    console.log(
      `[LocalGenerator] Generated ${outputNotes.length} notes (${answerSteps} steps) in ${elapsed}ms | QPM: ${qpm} | Shift: ${shift > 0 ? '+' : ''}${shift}`
    );

    return outputNotes;
  }
}

export const localGenerator = new LocalGenerator();
export default localGenerator;
