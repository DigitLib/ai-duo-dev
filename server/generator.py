"""
AI Duet melody generator using ONNX Runtime.
Runs Magenta's original attention_rnn / basic_rnn weights exported to ONNX.

Pipeline: user MIDI -> monophonic melody (on a 16th-note grid) -> RNN
continuation -> MIDI containing only the AI's answer.
"""

import functools
import io
import logging
import os
import time
from typing import Optional

import numpy as np
import onnxruntime as ort
import pretty_midi
import note_seq
from note_seq.melody_encoder_decoder import KeyMelodyEncoderDecoder, MelodyOneHotEncoding

log = logging.getLogger("ai_duet.generator")

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATHS = {
    "attention_rnn": os.path.join(SERVER_DIR, "attention_rnn.onnx"),
    "basic_rnn": os.path.join(SERVER_DIR, "basic_rnn.onnx"),
}

# Pitch range the models were trained on: [MIN_NOTE, MAX_NOTE)
MIN_NOTE, MAX_NOTE = 48, 84
MODEL_CENTER = (MIN_NOTE + MAX_NOTE) // 2
PIANO_LOW, PIANO_HIGH = 21, 109  # A0 .. C8, [low, high)

STEPS_PER_QUARTER = 4
MIN_QPM, MAX_QPM, DEFAULT_QPM = 70.0, 180.0, 120.0
MIN_ANSWER_STEPS, MAX_ANSWER_STEPS = 16, 48  # 1 to 3 bars
MAX_PRIMER_STEPS = 64                        # attention only looks back 40 steps anyway
HIDDEN = 512
ATTN_LENGTH = 40


def _fold_pitch(pitch: int, low: int = MIN_NOTE, high: int = MAX_NOTE) -> int:
    """Fold a pitch into [low, high) by octaves."""
    while pitch < low:
        pitch += 12
    while pitch >= high:
        pitch -= 12
    return pitch


def _estimate_qpm(ns) -> float:
    """
    Accurately estimate musical tempo (QPM / BPM) from note onsets.
    Tracks live tempo dynamically: ballad (60-80), medium (80-110), groove (110-130), allegro (130-160).
    """
    if len(ns.notes) < 3:
        return DEFAULT_QPM
    onsets = sorted({round(n.start_time, 3) for n in ns.notes})
    gaps = [b - a for a, b in zip(onsets, onsets[1:]) if b - a > 0.08]
    if len(gaps) < 2:
        return DEFAULT_QPM
    med = float(np.median(gaps))
    # In piano playing, notes are mostly 8th notes (gap ~ 30/QPM) or quarter notes (gap ~ 60/QPM)
    if med < 0.38:
        qpm = 30.0 / med
    else:
        qpm = 60.0 / med
    return float(np.clip(round(qpm, 1), 60.0, 160.0))


def _sample(logits: np.ndarray, temperature: float, allowed: Optional[list] = None, p_cutoff: float = 0.90) -> int:
    """
    Nucleus (top-p) sampling over allowed classes with temperature scaling.
    Preserves natural holds (NO_EVENT) and musical rests, avoiding the rapid 16th-note cascade of top-k.
    """
    temp = max(0.1, min(temperature, 1.5))
    scaled = logits / temp
    if allowed is not None:
        masked = np.full_like(scaled, -np.inf)
        masked[allowed] = scaled[allowed]
        scaled = masked

    sorted_idx = np.argsort(scaled)[::-1]
    sorted_logits = scaled[sorted_idx]

    valid_mask = sorted_logits > -1e8
    if not np.any(valid_mask):
        return int(allowed[0] if allowed else 0)
    sorted_idx = sorted_idx[valid_mask]
    sorted_logits = sorted_logits[valid_mask]

    probs = np.exp(sorted_logits - np.max(sorted_logits))
    probs /= np.sum(probs)

    cum_probs = np.cumsum(probs)
    k = int(np.searchsorted(cum_probs, p_cutoff)) + 1
    k = max(1, min(k, len(sorted_idx)))

    top_idx = sorted_idx[:k]
    top_probs = probs[:k] / np.sum(probs[:k])
    return int(np.random.choice(top_idx, p=top_probs))


class MelodyGenerator:
    def __init__(self, default_model: str = "attention_rnn"):
        self.sessions = {
            name: ort.InferenceSession(path, providers=["CPUExecutionProvider"])
            for name, path in MODEL_PATHS.items()
            if os.path.exists(path)
        }
        if not self.sessions:
            raise RuntimeError(f"No ONNX models found in {SERVER_DIR}")
        for name in self.sessions:
            log.info("Loaded %s", name)

        self.attn_enc = KeyMelodyEncoderDecoder(min_note=MIN_NOTE, max_note=MAX_NOTE)
        self.basic_enc = MelodyOneHotEncoding(min_note=MIN_NOTE, max_note=MAX_NOTE)
        self.default_model = default_model if default_model in self.sessions else next(iter(self.sessions))

    # ------------------------------------------------------------------ models

    def _generate_attention(self, primer: list, steps: int, temperature: float) -> list:
        session = self.sessions["attention_rnn"]
        state = {
            "h0": np.zeros((1, HIDDEN), np.float32),
            "c0": np.zeros((1, HIDDEN), np.float32),
            "h1": np.zeros((1, HIDDEN), np.float32),
            "c1": np.zeros((1, HIDDEN), np.float32),
            "attn_states": np.zeros((1, ATTN_LENGTH, HIDDEN), np.float32),
            "prev_attn": np.zeros((1, HIDDEN), np.float32),
        }
        melody = note_seq.Melody(primer)

        def step(pos):
            x = np.asarray(self.attn_enc.events_to_input(melody, pos), np.float32)[np.newaxis, :]
            logits, *new_state = session.run(None, {"x": x, **state})
            state.update(zip(state.keys(), new_state))
            return logits[0]

        # Feed the primer
        for pos in range(len(primer)):
            logits = step(pos)

        all_classes = list(range(self.attn_enc.num_classes))
        for step_idx in range(steps):
            # Step 0: start with a note/rest, not a phantom hold
            if step_idx == 0:
                valid = [
                    c for c in all_classes
                    if self.attn_enc.class_index_to_event(c, melody) != note_seq.MELODY_NO_EVENT
                ]
            else:
                valid = all_classes

            cls = _sample(logits, temperature, allowed=valid)
            ev = self.attn_enc.class_index_to_event(cls, melody)
            melody.append(ev)
            logits = step(len(melody) - 1)

        return list(melody)[len(primer):]

    def _generate_basic(self, primer: list, steps: int, temperature: float) -> list:
        session = self.sessions["basic_rnn"]
        n_classes = self.basic_enc.num_classes
        state = {k: np.zeros((1, 1, HIDDEN), np.float32) for k in ("h0_in", "c0_in", "h1_in", "c1_in")}

        def run(classes):
            x = np.zeros((len(classes), 1, n_classes), np.float32)
            x[np.arange(len(classes)), 0, classes] = 1.0
            logits, *new_state = session.run(None, {"input": x, **state})
            state.update(zip(state.keys(), new_state))
            return logits[-1, 0]

        logits = run([self.basic_enc.encode_event(e) for e in primer])
        generated = []
        all_classes = list(range(n_classes))
        for step_idx in range(steps):
            if step_idx == 0:
                valid = [
                    c for c in all_classes
                    if self.basic_enc.decode_event(c) != note_seq.MELODY_NO_EVENT
                ]
            else:
                valid = all_classes

            cls = _sample(logits, temperature, allowed=valid)
            ev = self.basic_enc.decode_event(cls)
            generated.append(ev)
            logits = run([cls])
        return generated

    # ---------------------------------------------------------------- pipeline

    def generate(self, midi_bytes: bytes, temperature: float = 0.5, model_name: Optional[str] = None) -> bytes:
        """Return a MIDI file containing the AI's answer to `midi_bytes`. Raises ValueError on bad input."""
        started = time.perf_counter()
        model = model_name if model_name in self.sessions else self.default_model
        temperature = min(max(temperature, 0.1), 1.5)

        # 1. Parse
        try:
            ns = note_seq.midi_to_note_sequence(pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes)))
        except Exception as e:
            raise ValueError(f"Invalid MIDI data: {e}") from e
        if not ns.notes:
            raise ValueError("MIDI contains no notes")

        # 2. Dynamic tempo matching: quantize with the user's exact pace
        qpm = _estimate_qpm(ns)
        del ns.tempos[:]
        ns.tempos.add(qpm=qpm)
        quantized = note_seq.quantize_note_sequence(ns, steps_per_quarter=STEPS_PER_QUARTER)
        melody = note_seq.Melody()
        melody.from_quantized_sequence(quantized, gap_bars=2, ignore_polyphonic_notes=True)
        primer = list(melody)
        if not any(e >= 0 for e in primer):
            raise ValueError("Could not extract a melody from the MIDI")

        # 3. Transpose whole phrase by full octaves into model range [48, 84) to preserve all intervals and key
        median_pitch = float(np.median([e for e in primer if e >= 0]))
        shift = 12 * round((MODEL_CENTER - median_pitch) / 12)
        primer_shifted = [e + shift if e >= 0 else e for e in primer[-MAX_PRIMER_STEPS:]]
        # Ensure whole phrase is bounded in model range without breaking intervals
        min_p = min(e for e in primer_shifted if e >= 0)
        max_p = max(e for e in primer_shifted if e >= 0)
        if min_p < MIN_NOTE:
            primer_shifted = [e + 12 if e >= 0 else e for e in primer_shifted]
            shift += 12
        elif max_p >= MAX_NOTE:
            primer_shifted = [e - 12 if e >= 0 else e for e in primer_shifted]
            shift -= 12

        # 4. Generate musical response (16 steps = 1 bar, 32 steps = 2 bars)
        answer_steps = 16 if len(primer) <= 24 else 32
        run = self._generate_attention if model == "attention_rnn" else self._generate_basic
        events = run(primer_shifted, answer_steps, temperature)

        # 5. Shift answer back to user's register symmetrically (-shift)
        answer = [e - shift if e >= 0 else e for e in events]
        sounding = [e for e in answer if e >= 0]
        if sounding:
            while min(sounding) < PIANO_LOW:
                answer = [e + 12 if e >= 0 else e for e in answer]
                sounding = [e + 12 for e in sounding]
            while max(sounding) >= PIANO_HIGH:
                answer = [e - 12 if e >= 0 else e for e in answer]
                sounding = [e - 12 for e in sounding]

        out_ns = note_seq.Melody(answer).to_sequence(qpm=qpm)
        if out_ns.notes:
            first_start = out_ns.notes[0].start_time
            # Keep up to 0.15s musical breath before first note
            offset = max(0.0, first_start - 0.15)
            for n in out_ns.notes:
                n.start_time = max(0.0, n.start_time - offset)
                n.end_time = max(n.start_time + 0.08, n.end_time - offset)

        bio = io.BytesIO()
        note_seq.sequence_proto_to_pretty_midi(out_ns).write(bio)

        log.info(
            "(%s) %d steps, %d notes in %.1fms (QPM=%.1f, shift=%+d, temp=%.2f)",
            model, len(events), len(out_ns.notes), (time.perf_counter() - started) * 1000, qpm, shift, temperature,
        )
        return bio.getvalue()



@functools.lru_cache(maxsize=1)
def get_generator() -> MelodyGenerator:
    """Load the models once, on first use (not at import time)."""
    return MelodyGenerator()
