# A.I. Duet — Architecture Documentation

This document provides a detailed overview of the system architecture, real-time audio pipeline, inference engine, and communication protocols of **A.I. Duet 2.0**.

---

## 1. High-Level Architecture

```
+-----------------------------------------------------------------------------------+
|                                 BROWSER CLIENT                                    |
|                                                                                   |
|   +-------------------+    +----------------------+    +----------------------+   |
|   |   Input Sources   |    |      Web Audio       |    |     3D Piano Roll    |   |
|   | - USB Web MIDI    |--->| - Salamander Grand   |    | - Three.js Particles |   |
|   | - Computer Keys   |    | - String Ensemble    |    | - Note Trails        |   |
|   | - On-screen Touch |    | - Web Audio Clock    |    | - Responsive Camera  |   |
|   +---------+---------+    +----------^-----------+    +----------^-----------+   |
|             |                         |                           |               |
|             v                         |                           |               |
|   +-----------------------------------+---------------------------+-----------+   |
|   |                               AI Orchestrator                             |   |
|   |  - Phrase Segmentation & Live Note Windowing                              |   |
|   |  - Tone.js MIDI Serialization (Delta Onsets, Durations, Velocities)       |   |
|   |  - Turn-Based vs Play Together Mode Coordination                          |   |
|   |  - Accompaniment Throttling (Anti-Collision Guard)                        |   |
|   +-----------------------------------+---------------------------------------+   |
+---------------------------------------|-------------------------------------------+
                                        |
                 WebSocket (`/ws`)      |      HTTP Fallback (`/predict`)
                 Bidirectional JSON     |      Binary MIDI / POST
                                        v
+-----------------------------------------------------------------------------------+
|                                FASTAPI BACKEND                                    |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   |                         Serving & Transport Layer                         |   |
|   |  - Static Asset Serving (pre-built SPA from `dist/`)                      |   |
|   |  - Asynchronous Non-Blocking Workers (`asyncio.to_thread`)                |   |
|   |  - CORS & Binary MIDI Stream Deserialization                              |   |
|   +-----------------------------------+---------------------------------------+   |
|                                       |                                           |
|                                       v                                           |
|   +---------------------------------------------------------------------------+   |
|   |                             Generator Core                                |   |
|   |  - Dynamic Inter-Onset Interval (IOI) Tempo Estimator                     |   |
|   |  - 16th-Note Grid Quantization (`note_seq.quantize_note_sequence`)        |   |
|   |  - Symmetrical Octave Transposition ($12 \times k$)                       |   |
|   |  - Step-0 Clean Attack Guard (Anti-Phantom Hold)                          |   |
|   |  - Nucleus Top-p Sampling ($p=0.90$) with Temperature Scaling             |   |
|   +-----------------------------------+---------------------------------------+   |
|                                       |                                           |
|                                       v                                           |
|   +---------------------------------------------------------------------------+   |
|   |                          ONNX Runtime Engine                              |   |
|   |  - `attention_rnn.onnx` (40-step attention, 74 feature inputs)            |   |
|   |  - `basic_rnn.onnx`     (2-layer LSTM, 38 one-hot inputs)                 |   |
|   +---------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Real-Time Input & Audio Engine

### 2.1 Multi-Modal Input Handling
User input originates from three concurrent sources, normalized into standard MIDI events:
1. **Web MIDI API (`Midi.js`):** Connects to any hardware USB MIDI keyboard controller. Captures note numbers (21–108), note-on/off velocity, and millisecond timestamps.
2. **Computer Keyboard (`ComputerKeys.js`):** Maps home row keys (`A`–`K`) to white keys and upper row (`W`, `E`, `T`, `Y`, `U`) to sharps/flats, with `Z`/`X` octave shifting.
3. **Interactive Piano Interface (`Element.js`):** Responsive SVG/DOM piano keys supporting mouse clicks, drags, and multitouch gestures across mobile and desktop displays.

### 2.2 Audio Clock & Dual-Voice Synthesis
All audio scheduling uses the hardware-synchronized `AudioContext.currentTime` clock to guarantee sub-millisecond jitter-free playback:
* **Grand Piano (`Salamander`):** Multi-velocity sampled Yamaha C5 grand piano soundfont covering all 88 acoustic piano keys (A0 to C8).
* **String Ensemble:** Warm ambient synth backing layer mixed at $-8\text{ dB}$, triggered exclusively on AI accompaniment notes to create a rich, enveloping duet timbre.

---

## 3. Duet Coordination & Phrasing

The application supports two distinct playing paradigms:

### 3.1 Turn-Based Mode (Call & Response)
1. The user plays an expressive musical phrase of arbitrary length.
2. When all held keys are released and $450\text{ ms}$ of silence elapses, the client segments the phrase.
3. The phrase is serialized and transmitted to the backend.
4. The AI returns a musical response (16 to 32 steps: 1 to 2 bars) answering in the same key and tempo.
5. While the AI plays, animated piano keys and the 3D particle roll illuminate in gold.

### 3.2 Play Together Mode (Live Jamming)
1. The user jams continuously without pausing.
2. The client maintains a rolling 3.5-second musical window of recent note events.
3. An **Accompaniment Guard** (`_aiPlayingUntil`) tracks the duration of the current accompaniment phrase.
4. While an accompaniment is sounding, incoming live notes are buffered without triggering new inference calls, preventing overlapping note cascades.
5. As the accompaniment finishes, if the user continues playing, the next accompaniment bar (16 steps) is generated and locked to the live tempo.

---

## 4. Intelligent Musical Pipeline (Backend)

### 4.1 Dynamic Inter-Onset Interval (IOI) Tempo Estimator
Unlike fixed-tempo estimators that quantize to rigid bins, the backend dynamically calculates the user's tempo from live inter-onset intervals:
$$\text{QPM} = \begin{cases} \dfrac{30.0}{\text{median}(\Delta t)}, & \text{if eighth-note groove } (\Delta t < 0.38\text{s}) \\[10pt] \dfrac{60.0}{\text{median}(\Delta t)}, & \text{if quarter-note phrasing } (\Delta t \ge 0.38\text{s}) \end{cases}$$
The detected tempo is clamped to $[60, 160]\text{ QPM}$ and applied symmetrically to both primer quantization and output rendering.

### 4.2 Symmetrical Whole-Phrase Transposition
To allow the model to operate within its native training range ($[48, 84)$, C3 to C6) without distorting user intervals:
$$\text{shift} = 12 \times \text{round}\left(\frac{66 - \text{median\_pitch}}{12}\right)$$
The entire primer phrase is transposed by $\text{shift}$. Upon generation, the AI's answer is transposed back by $-\text{shift}$, ensuring complete harmonic and register fidelity.

### 4.3 Step-0 Clean Attack & Nucleus (Top-$p$) Sampling
* **Step-0 Attack Guard:** Disallows `MELODY_NO_EVENT` (hold) on the first step of the answer, guaranteeing that the AI begins with an audible note-on or a rhythmic rest.
* **Nucleus Sampling ($p=0.90$):** Eliminates low-probability noise classes while preserving natural hold and rest classes, preventing rapid 16th-note machine-gun bursts.

---

## 5. Network Protocol Specification

### 5.1 WebSocket Protocol (`ws://<host>:<port>/ws`)
The client opens a persistent bidirectional WebSocket connection on startup:
* **Request (`predict`):**
  ```json
  {
    "type": "predict",
    "midi": [77, 84, 104, 100, ...],
    "duration": 4.0,
    "temperature": 0.5,
    "model": "attention_rnn"
  }
  ```
* **Response (`prediction`):**
  ```json
  {
    "type": "prediction",
    "midi": [77, 84, 104, 100, ...]
  }
  ```
* **Heartbeat:** `{"type": "ping"}` $\rightarrow$ `{"type": "pong"}`

### 5.2 HTTP REST Fallback (`POST /predict`)
If WebSockets are blocked by proxies or firewalls, the client seamlessly falls back to HTTP POST:
* **URL:** `POST /predict?duration=4.0&temperature=0.5&model=attention_rnn`
* **Body:** JSON byte array or raw `audio/midi` binary stream.
* **Response:** Standard binary MIDI (`audio/midi`) attachment.

---

## 6. In-Browser WebAssembly Engine (`LocalGenerator.js`)

In addition to the Python backend, A.I. Duet features a **100% client-side inference engine** enabling zero-server deployments (such as **GitHub Pages**, Vercel, Netlify, or offline local files):

```
+-----------------------------------------------------------------------------------+
|                        CLIENT-SIDE WebAssembly INFERENCE                          |
|                                                                                   |
|   +-----------------------+     +------------------------+                        |
|   |   Live Note Buffer    |---->|   Pure JS IOI Tempo    |                        |
|   |  - Onset Timestamps   |     |   Estimator (60-160)   |                        |
|   +-----------------------+     +-----------+------------+                        |
|                                             |                                     |
|                                             v                                     |
|                                 +------------------------+                        |
|                                 |  16th-Note Grid &      |                        |
|                                 |  Octave Transposition  |                        |
|                                 +-----------+------------+                        |
|                                             |                                     |
|                                             v                                     |
|                                 +------------------------+                        |
|                                 | ONNX Runtime Web WASM  |                        |
|                                 |   (basic_rnn.onnx)     |                        |
|                                 +-----------+------------+                        |
|                                             |                                     |
|                                             v                                     |
|   +-----------------------+     +------------------------+                        |
|   | Web Audio Synthesizer |<----| Nucleus Top-p Sampling |                        |
|   | - Grand Piano & Synth |     | & Note Deserialization |                        |
|   +-----------------------+     +------------------------+                        |
+-----------------------------------------------------------------------------------+
```

### Key Technical Characteristics:
* **Runtime:** `onnxruntime-web` compiled to single-threaded WebAssembly (`ort.env.wasm.numThreads = 1`), avoiding browser restrictions on `SharedArrayBuffer` / COOP headers on static CDNs.
* **Latency:** Generates complete 16-to-32 step counterpoint melodies in **<15 ms** directly inside the client's browser thread.
* **Failover & Auto-Detection:** Automatically activates when hosted on `*.github.io`, `*.pages.dev`, `file://`, or when the backend server is unreachable.
