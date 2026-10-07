"""
AI Duet server: FastAPI + ONNX Runtime.

Run from the repo root:  python3 server/server.py
"""

import asyncio
import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generator import get_generator  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     [%(name)s] %(message)s")
log = logging.getLogger("ai_duet.server")

STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
DIST_DIR = os.path.join(STATIC_DIR, "dist")
MAX_MIDI_BYTES = 64 * 1024
DEV_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"]  # Vite dev server


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_generator()  # load models once, in the serving process only
    yield


app = FastAPI(title="AI Duet API", version="2.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=DEV_ORIGINS, allow_methods=["*"], allow_headers=["*"])


def parse_midi_payload(payload) -> bytes:
    """Accept a JSON list of byte values, {"midi": [...]}, or raw MIDI bytes."""
    if isinstance(payload, dict):
        payload = payload.get("midi")
    if not isinstance(payload, (bytes, list)):
        raise ValueError("MIDI must be a list of byte values (0-255)")
    try:
        midi = bytes(payload)
    except (TypeError, ValueError):
        raise ValueError("MIDI must be a list of byte values (0-255)")
    if not midi:
        raise ValueError("Empty MIDI payload")
    if len(midi) > MAX_MIDI_BYTES:
        raise ValueError(f"MIDI payload larger than {MAX_MIDI_BYTES} bytes")
    return midi


async def generate_answer(midi: bytes, temperature: float, model: Optional[str]) -> bytes:
    """Run the (CPU-bound) generator in a worker thread so the event loop stays responsive."""
    return await asyncio.to_thread(get_generator().generate, midi, temperature=temperature, model_name=model)


@app.get("/api/health")
async def health():
    gen = get_generator()
    return {"status": "ok", "models": list(gen.sessions), "default_model": gen.default_model}


@app.post("/predict")
async def predict(
    request: Request,
    temperature: float = Query(0.5, description="Sampling temperature (0.1-1.5)"),
    model: Optional[str] = Query(None, description="attention_rnn or basic_rnn"),
    duration: Optional[float] = Query(None, description="Ignored; kept for client compatibility"),
):
    """Receives the user's phrase as MIDI (JSON byte array or raw binary) and returns the AI answer as audio/midi."""
    body = await request.body()
    try:
        try:
            payload = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = body  # raw binary MIDI
        answer = await generate_answer(parse_midi_payload(payload), temperature, model)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return Response(answer, media_type="audio/midi",
                    headers={"Content-Disposition": 'attachment; filename="return.mid"'})


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Real-time duet: {"type": "predict", "midi": [...], "temperature": 0.5, "model": "..."} -> {"type": "prediction", "midi": [...]}"""
    await websocket.accept()
    log.info("Client connected")
    try:
        while True:
            message = await websocket.receive_text()
            try:
                if len(message) > 8 * MAX_MIDI_BYTES:
                    raise ValueError("Message too large")
                data = json.loads(message)
                msg_type = data.get("type", "predict")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "predict":
                    answer = await generate_answer(
                        parse_midi_payload(data.get("midi")),
                        float(data.get("temperature", 0.5)),
                        data.get("model"),
                    )
                    await websocket.send_json({"type": "prediction", "midi": list(answer)})
            except (ValueError, TypeError, AttributeError) as e:  # bad message: report it, keep the connection
                await websocket.send_json({"type": "error", "message": str(e)})
    except WebSocketDisconnect:
        log.info("Client disconnected")


# ---------------------------------------------------------------- frontend
for route, directory in (("/assets", os.path.join(DIST_DIR, "assets")),
                         ("/audio", os.path.join(STATIC_DIR, "audio")),
                         ("/images", os.path.join(STATIC_DIR, "images")),
                         ("/models", os.path.join(DIST_DIR, "models"))):
    if os.path.isdir(directory):
        app.mount(route, StaticFiles(directory=directory), name=route.strip("/"))


@app.get("/")
async def root():
    for index in (os.path.join(DIST_DIR, "index.html"), os.path.join(STATIC_DIR, "index.html")):
        if os.path.exists(index):
            return FileResponse(index)
    return JSONResponse({"message": "AI Duet server running. Start the Vite dev server for the frontend."})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8080,
                reload=os.environ.get("AI_DUET_RELOAD", "1") == "1",
                app_dir=os.path.dirname(os.path.abspath(__file__)))
