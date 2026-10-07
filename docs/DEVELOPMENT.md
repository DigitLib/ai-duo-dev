# A.I. Duet — Development & Contribution Guide

This guide explains how to set up the developer environment, build the frontend, inspect ONNX neural models, and contribute to **A.I. Duet 2.0**.

---

## 1. Prerequisites

* **Python:** 3.10, 3.11, or 3.12
* **Node.js:** 18+ (only needed if developing/rebuilding the static frontend)
* **Modern Web Browser:** Chrome, Edge, Brave, or Firefox (with Web MIDI and Web Audio support)

---

## 2. Fast Setup (Playing & Testing)

If you only want to run and test the application, no Node.js or npm installation is required:

```bash
# 1. Clone repository
git clone https://github.com/DigitLib/ai-duo-dev.git
cd ai-duo-dev

# 2. Set up Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 3. Install Python dependencies
pip install -r server/requirements.txt

# 4. Start the application with one command
python3 run.py
```
Open **`http://127.0.0.1:8080`** in your browser.

---

## 3. Frontend Development (Vite + ES Modules)

The frontend source code is in `static/src/` and styles are written in SCSS in `static/style/`.

### 3.1 Running the Vite Dev Server
When developing frontend features with instant Hot Module Replacement (HMR):

1. **Terminal 1 (Backend):**
   ```bash
   python3 server/server.py
   # Serves API & WebSocket on http://127.0.0.1:8080
   ```

2. **Terminal 2 (Frontend Dev Server):**
   ```bash
   cd static
   npm install
   npm run dev
   # Vite serves frontend at http://127.0.0.1:5173 with HMR
   ```

3. Open **`http://127.0.0.1:5173`**. In dev mode, the client automatically routes WebSocket and API requests to `127.0.0.1:8080`.

### 3.2 Building the Production Bundle
To compile optimized JavaScript, CSS, and assets into `static/dist/`:

```bash
cd static
npm run build
```
This generates the minified SPA in `static/dist/`. FastAPI serves this bundle directly at `http://127.0.0.1:8080/` without requiring Node.js.

---

## 4. Codebase Organization

```
├── run.py                 # One-click runner (starts server & opens browser)
├── server/
│   ├── server.py          # FastAPI application (HTTP + WebSocket endpoints)
│   ├── generator.py       # ONNX inference engine, tempo estimator, nucleus sampling
│   ├── requirements.txt   # Python dependencies
│   ├── attention_rnn.onnx # Attention Melody RNN ONNX model
│   └── basic_rnn.onnx     # Basic Melody RNN ONNX model
├── static/
│   ├── dist/              # Pre-compiled production bundle (served by FastAPI)
│   ├── src/
│   │   ├── Main.js        # Application orchestrator & audio wiring
│   │   ├── ai/            # Duet controllers (AI.js, Tutorial.js)
│   │   ├── sound/         # Web Audio sampler engine (Sound.js, Sampler.js)
│   │   ├── keyboard/      # MIDI & keyboard controllers (Midi.js, Keyboard.js)
│   │   ├── roll/          # Three.js 3D piano roll visualization (Roll.js)
│   │   └── interface/     # UI controls, modals, and badges (Controls.js, About.js)
│   ├── style/             # SCSS stylesheets
│   ├── audio/             # Acoustic piano and synth sample soundfonts
│   ├── package.json       # Frontend scripts and dependencies
│   └── vite.config.js     # Vite build configuration
└── docs/
    ├── ARCHITECTURE.md    # System design & real-time audio pipeline
    ├── MODELS.md          # Neural architectures & mathematical deep dive
    └── DEVELOPMENT.md     # This developer guide
```

---

## 5. Testing & Verification

### Testing Model Generation Quality
You can verify the ONNX generator directly via Python:

```python
import io
import pretty_midi
from server.generator import get_generator

gen = get_generator()

# Create a test MIDI phrase (C4, E4, G4, C5)
pm = pretty_midi.PrettyMIDI()
inst = pretty_midi.Instrument(program=0)
for i, pitch in enumerate([60, 64, 67, 72]):
    inst.notes.append(pretty_midi.Note(velocity=80, pitch=pitch, start=i*0.5, end=(i+1)*0.5))
pm.instruments.append(inst)

bio = io.BytesIO()
pm.write(bio)

# Generate response
result = gen.generate(bio.getvalue(), temperature=0.5, model_name="attention_rnn")
print(f"Generated {len(result)} bytes of MIDI answer")
```

### Testing USB MIDI Hardware
Plug in any USB MIDI keyboard (e.g. Akai, Novation, Yamaha). Open Chrome/Edge at `http://127.0.0.1:8080`, click **Play**, and strike notes. The browser will automatically bind to the physical controller without driver installation.
