# A.I. Duet — Neural Models Deep Dive

This document details the neural network architectures, musical feature representations, and sampling mathematics used by **A.I. Duet 2.0**.

---

## 1. Model Comparison Matrix

| Architectural Feature | `basic_rnn` | `attention_rnn` (Default) |
| :--- | :--- | :--- |
| **Recurrent Core** | 2 stacked LSTM layers (512 units each) | 2 stacked LSTM layers (512 units each) |
| **Attention Mechanism** | None | Bahdanau-style attention over last **40 steps (2.5 bars)** |
| **Encoder / Decoder** | `MelodyOneHotEncoding` | `KeyMelodyEncoderDecoder` |
| **Input Dimensionality** | **38 features** | **74 musical features** |
| **Output Classes** | **38 classes** | **40 classes** (includes 2 lookback classes) |
| **Model Size** | $\approx 13.0\text{ MB}$ | $\approx 20.9\text{ MB}$ |
| **Average CPU Inference** | $15\text{ ms} - 35\text{ ms}$ | $45\text{ ms} - 85\text{ ms}$ |
| **Musical Specialty** | Smooth, continuous, scalar counterpoint | Thematic motifs, call-and-response, rhythmic echoing |

---

## 2. Attention RNN: The 74-Dimensional Input Vector

Magenta's `KeyMelodyEncoderDecoder` transforms a symbolic monophonic melody into a rich 74-dimensional feature vector at every sixteenth-note position:

| Index Range | Feature Description |
| :--- | :--- |
| **$[0, 35]$** | **Active Pitch:** One-hot indicator for active MIDI note in range $[48, 84)$ (C3 to B5). |
| **$36$** | **Note Sounding Flag:** Set to $1.0$ if any note is actively sounding. |
| **$37$** | **Silence Flag:** Set to $1.0$ if the current step is a rest (`MELODY_NOTE_OFF`). |
| **$38$** | **Attack (Note-On) Flag:** Set to $1.0$ if this step marks the onset of a new note. |
| **$39$** | **Melodic Contour:** $+1.0$ if pitch is ascending relative to previous note; $-1.0$ if descending. |
| **$40$** | **Lookback 16 Match:** Set to $1.0$ if the current event equals the event from 16 steps ago (1 bar). |
| **$41$** | **Lookback 32 Match:** Set to $1.0$ if the current event equals the event from 32 steps ago (2 bars). |
| **$[42, 48]$** | **Metric Clocks:** 7 binary time counters encoding metric location within the 4/4 measure. |
| **$49$** | **Bar Downbeat:** Set to $1.0$ if the next step starts a new measure. |
| **$[50, 61]$** | **Global Key Profile:** Krumhansl-Schmuckler key profile vector across the entire phrase. |
| **$[62, 73]$** | **Recent Key Profile:** Krumhansl-Schmuckler key profile vector across the last 3 notes. |

### Output Event Mapping (40 Classes)
* **Classes $0 \dots 35$:** Direct MIDI note-on events for pitches $48 \dots 83$.
* **Class $36$:** `MELODY_NO_EVENT` ($-2$) — Sustains the currently sounding note.
* **Class $37$:** `MELODY_NOTE_OFF` ($-1$) — Silence / rest.
* **Class $38$:** Lookback 16 — Repeats the exact event from 16 steps (1 bar) ago.
* **Class $39$:** Lookback 32 — Repeats the exact event from 32 steps (2 bars) ago.

---

## 3. Basic RNN: The 38-Dimensional Input Vector

The `basic_rnn` model uses `MelodyOneHotEncoding`:
* **Class $0$:** `MELODY_NO_EVENT` ($-2$) — Note sustain / hold.
* **Class $1$:** `MELODY_NOTE_OFF` ($-1$) — Rest / silence.
* **Classes $2 \dots 37$:** Direct MIDI pitches from $48$ (C3) to $83$ (B5).

Because `basic_rnn` has no external attention window, it maintains context purely through its internal LSTM cell state $(h_t, c_t)$. Over longer phrases, previous themes gracefully fade, creating smooth, non-repeating stepwise lines.

---

## 4. Sampling Mathematics

### 4.1 Temperature Scaling
Given unnormalized model logits $z \in \mathbb{R}^C$ and sampling temperature $T > 0$, logits are scaled by:
$$\tilde{z}_i = \frac{z_i}{T}$$
* **Low Temperature ($T \in [0.2, 0.35]$):** Sharpens the probability distribution. High-likelihood musical resolutions dominate; answers are predictable and tightly locked to the tonic key.
* **Medium Temperature ($T \in [0.4, 0.65]$):** Default human-like setting. Balances melodic coherence with natural phrasing and expressive variation.
* **High Temperature ($T \in [0.7, 1.0]$):** Flattens the distribution, encouraging unexpected modal interchange, wider intervals, and playful jazz lines.

### 4.2 Nucleus (Top-$p$) Filtering
To eliminate the "crazy pianist" problem (where rigid top-$k$ sampling admitted 8 pitch alternatives per step), the generator applies nucleus sampling with $p = 0.90$:
1. Sort scaled logits in descending order: $\tilde{z}_{(1)} \ge \tilde{z}_{(2)} \ge \dots \ge \tilde{z}_{(C)}$.
2. Compute softmax probabilities:
   $$P_{(i)} = \frac{e^{\tilde{z}_{(i)}}}{\sum_j e^{\tilde{z}_{(j)}}}$$
3. Find the smallest subset $V^{(p)}$ such that:
   $$\sum_{i \in V^{(p)}} P_{(i)} \ge p$$
4. Renormalize probabilities across $V^{(p)}$ and sample:
   $$P'_{(i)} = \frac{P_{(i)}}{\sum_{j \in V^{(p)}} P_{(j)}}$$

This guarantees that holds (`MELODY_NO_EVENT`) and rests are preserved when confident, and that spurious pitches outside the musical key are truncated.
