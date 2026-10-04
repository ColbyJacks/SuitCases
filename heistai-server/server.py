"""
Local server for the HeistAI module: talk to Alfred out loud.

Wraps the speech pipeline (stt.py -> llm.py -> tts.py, chained in pipeline.py).
Vite proxies /api/alfred/* here (see vite.config.ts), so the browser calls:
  GET  /api/alfred/health  -> { ok, ready, character }
  POST /api/alfred/talk    multipart: audio (WAV or anything PyAV reads) OR text,
                           session (any id; one conversation per id)
                           -> NDJSON stream, one event per line:
                              { type: "user", text }                what Alfred heard
                              { type: "sentence", text, audio }     audio = base64 WAV
                              { type: "error", message }
                              { type: "done" }
  POST /api/alfred/reset   form: session -> forgets that conversation

Sentences stream as soon as each is synthesized, so the browser starts playing
the first one while Claude is still writing the rest.

Run:  python -m uvicorn server:app --port 8766   (from this folder), or `npm run heistai`
"""

import base64
import io
import json
import os
import threading
from collections import OrderedDict
from pathlib import Path

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
os.chdir(HERE)  # tts.py finds voices/ relative to the working directory
# Keys and tuning: heistai-server/.env first, then the app's .env.local for ANTHROPIC_API_KEY.
load_dotenv(HERE / ".env")
load_dotenv(HERE.parent / ".env.local")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402

import pipeline  # noqa: E402
import stt  # noqa: E402
import tts  # noqa: E402

CHARACTER = os.getenv("HEISTAI_CHARACTER", "alfred")
MAX_UPLOAD = 25 * 1024 * 1024
MAX_SESSIONS = 50

app = FastAPI(title="SuitCases HeistAI server")

_sessions: "OrderedDict[str, pipeline.Session]" = OrderedDict()
# The models are shared and CPU-bound, so turns run one after another.
_lock = threading.Lock()
_ready = threading.Event()
_load_error: str | None = None


def _preload():
    global _load_error
    try:
        pipeline.preload()
        # Build (or load the cached) voice prompt now so the first reply isn't slow.
        tts._voice_kwargs(pipeline.CHARACTERS[CHARACTER]["voice"])
        _ready.set()
        print("[server] Alfred is on the line")
    except Exception as e:  # report it on /health instead of crashing the server
        _load_error = str(e)
        print(f"[server] failed to load models: {e}")


@app.on_event("startup")
def startup():
    threading.Thread(target=_preload, daemon=True).start()


def _session(session_id: str) -> pipeline.Session:
    if session_id in _sessions:
        _sessions.move_to_end(session_id)
    else:
        _sessions[session_id] = pipeline.new_session(CHARACTER)
        while len(_sessions) > MAX_SESSIONS:
            _sessions.popitem(last=False)
    return _sessions[session_id]


def _line(event: dict) -> bytes:
    return (json.dumps(event) + "\n").encode()


@app.get("/health")
def health():
    return {"ok": _load_error is None, "ready": _ready.is_set(), "character": CHARACTER, "error": _load_error}


@app.post("/talk")
def talk(
    audio: UploadFile | None = File(None),
    text: str | None = Form(None),
    session: str = Form("default"),
):
    if audio is None and not (text and text.strip()):
        raise HTTPException(400, "Send a recording or some text.")
    data = audio.file.read(MAX_UPLOAD + 1) if audio is not None else b""
    if audio is not None and not data:
        raise HTTPException(400, "The recording was empty.")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "That recording is too long. Keep it under a minute.")

    def events():
        _ready.wait(timeout=600)  # first turn after startup waits for the models instead of loading them twice
        with _lock:
            try:
                user_text = text.strip() if text and text.strip() else stt.transcribe(io.BytesIO(data))
                yield _line({"type": "user", "text": user_text})
                for sentence, chunk in pipeline.stream_turn(_session(session[:64]), text=user_text):
                    audio_b64 = base64.b64encode(tts.to_wav_bytes(chunk)).decode()
                    yield _line({"type": "sentence", "text": sentence, "audio": audio_b64})
                yield _line({"type": "done"})
            except Exception as e:
                print(f"[server] turn failed: {e}")
                yield _line({"type": "error", "message": str(e)})

    return StreamingResponse(events(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache"})


@app.post("/reset")
def reset(session: str = Form("default")):
    _sessions.pop(session[:64], None)
    return {"ok": True}
