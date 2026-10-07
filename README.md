# 🎹 A.I. Duet 2.0

> An interactive piano that responds to your melodies using deep learning. Play a melody on your keyboard or MIDI controller, and the AI improvises musical counter-melodies in real time.

[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![ONNX Runtime](https://img.shields.io/badge/ONNX%20Runtime-1.20+-005CED?logo=onnx&logoColor=white)](https://onnxruntime.ai)
[![Vite](https://img.shields.io/badge/Vite-8.0+-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Web MIDI](https://img.shields.io/badge/Web%20MIDI-Hardware%20Ready-FF7700)](https://www.w3.org/TR/webmidi/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Based on the open-source **A.I. Duet** experiment by **Yotam Mann & Google Creative Lab / Magenta**. Modernized with **FastAPI**, **ONNX Runtime**, **Vite / ES Modules**, and real-time **Web MIDI**.

---

## ✨ What's New & Modernized in 2.0

| Feature | Original 2016 AI Duet | **A.I. Duet 2.0 (Modernized)** |
| :--- | :--- | :--- |
| **Backend Runtime** | Python 2.7, TensorFlow 1.x, Flask | **Python 3.10+, ONNX Runtime, FastAPI** |
| **Inference Engine** | Heavy TensorFlow graph execution | **Sub-50ms CPU inference via ONNX Runtime** |
| **Real-Time Protocol**| HTTP polling (high latency) | **Bidirectional WebSockets (`/ws`) + REST fallback** |
| **Frontend Stack** | Webpack 1, Gulp, Legacy ES5 | **Vite 8, Modern ES Modules, SCSS** |
| **Zero-Install Run** | Required full Node build pipeline | **Pre-compiled bundle (`dist/`) or 100% In-Browser WASM (`gh_pages/`)** |
| **In-Browser Inference**| Not possible | **ONNX Runtime Web (WASM) — Zero backend needed for GitHub Pages!** |
| **Duet Modes** | Turn-based only | **Turn-Based (Call & Response)** + **Play Together (Live Jam)** |
| **Tempo Estimation** | Coarse static bins | **Dynamic Inter-Onset Interval (IOI) tempo tracking (60–160 BPM)** |
| **Sampling Algorithm**| Unconstrained temperature | **Nucleus ($p=0.90$) sampling** (prevents rapid machine-gun notes) |
| **Model Selection** | Attention RNN only | **Attention RNN**, **Basic RNN**, and **In-Browser WebAssembly** |
| **MIDI Hardware** | Experimental Web MIDI | **Automatic zero-driver USB Web MIDI controller detection** |
| **Session Export** | None | **Live duet recorder with 2-track standard MIDI (.mid) file export** |

> 💡 **Looking for the 100% In-Browser static version (zero backend needed)?**
> Check out the standalone **[A.I. Duet Web (ai-duo-play)](https://github.com/DigitLib/ai-duo-play)** repository (Live Demo: [digitlib.github.io/ai-duo-play](https://digitlib.github.io/ai-duo-play/))!

---

## 🚀 Quick Start (Zero Node.js Required!)

You can run and play the entire application using **only Python**. The pre-compiled web application is already included in `static/dist/`:

```bash
# 1. Clone the repository
git clone https://github.com/DigitLib/ai-duo-dev.git
cd ai-duo-dev

# 2. Create and activate a Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 3. Install Python dependencies
pip install -r server/requirements.txt

# 4. Start the app with the one-click runner
python3 run.py
```

The runner automatically launches the FastAPI server and opens your browser at **`http://127.0.0.1:8080`**.

---

## 🛠️ Development & Customization (Frontend with Vite)

If you want to experiment with the frontend code, customize the UI, or modify shaders and 3D particles:

### 1. Start the Backend
```bash
python3 server/server.py
# Runs FastAPI + WebSocket server on http://127.0.0.1:8080
```

### 2. Start the Vite Dev Server
```bash
cd static
npm install
npm run dev
# Starts Vite at http://127.0.0.1:5173 with instant Hot Module Replacement (HMR)
```

Open **`http://127.0.0.1:5173`**. In dev mode, the client automatically communicates with the backend on port `8080`.

### 3. Rebuild the Production Bundle
```bash
cd static
npm run build
```
This compiles the minified SPA into `static/dist/`.

---

## 🧠 Neural Model Architectures

You can toggle between two models directly from the top control bar:

### 1. Attention RNN (`attention_rnn.onnx` — Default)
* **Architecture:** 2-layer LSTM (512 units) with a **40-step Attention Mechanism** and 74-dimensional musical feature encoding.
* **Inputs:** Tonal key profiles (Krumhansl-Schmuckler), metric position counters within the 4/4 bar, and melodic contour flags.
* **Musical Style:** Remembers and echoes your musical motifs, themes, and rhythms across 1–2 bars for true conversational call-and-response.

### 2. Basic RNN (`basic_rnn.onnx`)
* **Architecture:** 2-layer LSTM (512 units) with a 38-class one-hot note encoding.
* **Musical Style:** Generates smooth, continuous, stepwise counterpoint without repeating exact rhythmic patterns. Excellent for gentle, flowing background accompaniment.

*(For full architectural diagrams and mathematical formulations, see [docs/MODELS.md](docs/MODELS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).)*

---

## 🎮 How to Play

### Controls
* **Computer Keyboard:**
  * White keys: <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>G</kbd> <kbd>H</kbd> <kbd>J</kbd> <kbd>K</kbd> (home row)
  * Black keys (accidentals): <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd>
  * Shift octave: <kbd>Z</kbd> (down) / <kbd>X</kbd> (up)
* **Mouse / Touch:** Click or swipe across the on-screen piano keys.
* **USB MIDI Keyboard:** Plug in any hardware keyboard controller. Supported automatically by Chrome, Edge, and modern browsers with Web MIDI.

### Playing Modes
* **Turn-Based (Call & Response):** Play a phrase, then pause. The AI listens, captures your key and tempo, and responds with an answering phrase.
* **Play Together (Live Duet):** The AI accompanies you live in real time, playing complementary rhythmic counter-melodies as you play.

### Creativity / Temperature Slider
* **0.20 – 0.35 (Structured):** Tight, in-key, predictable call-and-response motifs.
* **0.40 – 0.65 (Melodic — Default):** Balanced, expressive, human-like musical improvisation.
* **0.70 – 0.85 (Creative):** Adventurous, varied jazz-like counterpoints.
* **0.90 – 1.00 (Wild):** Playful, unexpected melodic jumps.

---

## 📁 Repository Structure

```
├── run.py                 # One-click launcher (starts server & opens browser)
├── server/
│   ├── server.py          # FastAPI application (HTTP & WebSocket endpoints)
│   ├── generator.py       # ONNX generator, IOI tempo estimator, nucleus sampling
│   ├── requirements.txt   # Python dependencies
│   ├── attention_rnn.onnx # Attention Melody RNN weights
│   └── basic_rnn.onnx     # Basic Melody RNN weights
├── static/
│   ├── dist/              # Pre-compiled static web bundle (served directly)
│   ├── public/            # Public static assets (audio soundfonts, images, models)
│   ├── src/               # ES Module source code (AI, Sound, Keyboard, LocalGenerator)
│   ├── style/             # SCSS stylesheets
│   ├── package.json       # Frontend scripts and dependencies
│   └── vite.config.js     # Vite configuration
└── docs/
    ├── ARCHITECTURE.md    # System design & real-time audio pipeline
    ├── MODELS.md          # Neural architectures & mathematical deep dive
    └── DEVELOPMENT.md     # Full development & contribution guide
```

---

## 📜 Heritage & Credits

* Originally created as an **A.I. Experiment** by **Yotam Mann** with friends at **Google Creative Lab** and the **Magenta** team.
* Original 2016 experiment: [experiments.withgoogle.com/ai/ai-duet](https://experiments.withgoogle.com/ai/ai-duet)
* Original 2016 source code: [github.com/googlecreativelab/aiexperiments-ai-duet](https://github.com/googlecreativelab/aiexperiments-ai-duet)
* Models and neural encodings: [Magenta Project](https://magenta.tensorflow.org)

Licensed under the **Apache License, Version 2.0**.
