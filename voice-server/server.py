"""
Local RVC voice-clone server for the Voice Modulator module.

Vite proxies /api/voice/* here (see vite.config.ts), so the browser calls:
  GET  /api/voice/health   -> { ok, device, voices }
  GET  /api/voice/voices   -> { voices: [{ id, name, hasIndex }] }
  POST /api/voice/convert  multipart: audio (WAV, or anything ffmpeg/PyAV reads),
                           voice (id), pitch (semitones, -24..24) -> audio/wav

Voices are .pth files in ./models (or VOICE_MODELS_DIR). Either drop a file in
directly (models/Boss.pth, with an optional models/Boss.index) or give it a
folder (models/Boss/whatever.pth + whatever.index). The folder is rescanned on
every request, so new voices show up without a restart.

Run:  python -m uvicorn server:app --port 8765   (from this folder)
"""

import os
import tempfile
import threading
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from rvc_python.infer import RVCInference
from scipy.io import wavfile
from starlette.background import BackgroundTask

HERE = Path(__file__).resolve().parent
MODELS_DIR = Path(os.environ.get("VOICE_MODELS_DIR", HERE / "models")).resolve()
DEVICE = os.environ.get("RVC_DEVICE") or ("cuda:0" if torch.cuda.is_available() else "cpu")
F0_METHOD = os.environ.get("RVC_F0_METHOD", "rmvpe")
MAX_UPLOAD = 25 * 1024 * 1024

app = FastAPI(title="SuitCases voice server")

_rvc: RVCInference | None = None
_loaded: str | None = None
# One model lives in memory at a time, so conversions run one after another.
_lock = threading.Lock()


def scan_voices() -> dict[str, dict]:
    voices: dict[str, dict] = {}
    if not MODELS_DIR.is_dir():
        return voices
    for entry in sorted(MODELS_DIR.iterdir(), key=lambda p: p.name.lower()):
        if entry.is_file() and entry.suffix.lower() == ".pth":
            index = entry.with_suffix(".index")
            voices[entry.stem] = {"pth": entry, "index": index if index.is_file() else None}
        elif entry.is_dir():
            pth = next(iter(sorted(entry.glob("*.pth"))), None)
            if pth:
                index = next(iter(sorted(entry.glob("*.index"))), None)
                voices[entry.name] = {"pth": pth, "index": index}
    return voices


def display_name(voice_id: str) -> str:
    # "JasonStathum" -> "Jason Stathum", "deep_boss" -> "Deep Boss"
    spaced = "".join(" " + c if c.isupper() and i and voice_id[i - 1].islower() else c for i, c in enumerate(voice_id))
    return " ".join(w[:1].upper() + w[1:] for w in spaced.replace("_", " ").replace("-", " ").split())


def get_rvc() -> RVCInference:
    global _rvc
    if _rvc is None:
        # First run downloads hubert/rmvpe base weights (~400 MB) into the rvc_python package.
        _rvc = RVCInference(models_dir=str(MODELS_DIR), device=DEVICE)
    return _rvc


def load_voice(voice_id: str, voice: dict) -> RVCInference:
    global _loaded
    rvc = get_rvc()
    if _loaded != voice_id:
        rvc.load_model(str(voice["pth"]), index_path=str(voice["index"]) if voice["index"] else "")
        _loaded = voice_id
    return rvc


def convert_file(voice_id: str, voice: dict, pitch: int, src: str, dst: str):
    rvc = load_voice(voice_id, voice)
    out = rvc.vc.vc_single(
        sid=0,
        input_audio_path=src,
        f0_up_key=pitch,
        f0_file="",
        f0_method=F0_METHOD,
        file_index=str(voice["index"]) if voice["index"] else "",
        file_index2="",
        index_rate=0.5 if voice["index"] else 0,
        filter_radius=3,
        resample_sr=0,
        rms_mix_rate=1,
        protect=0.33,
    )
    # vc_single reports failures by returning (traceback, (None, None)) instead of raising.
    if isinstance(out, tuple):
        raise RuntimeError(str(out[0]).strip().splitlines()[-1] if out[0] else "Conversion failed")
    wavfile.write(dst, rvc.vc.tgt_sr, out)


@app.get("/health")
def health():
    return {"ok": True, "device": DEVICE, "voices": len(scan_voices())}


@app.get("/voices")
def voices():
    return {
        "voices": [
            {"id": vid, "name": display_name(vid), "hasIndex": v["index"] is not None}
            for vid, v in scan_voices().items()
        ]
    }


@app.post("/convert")
def convert(audio: UploadFile = File(...), voice: str = Form(...), pitch: int = Form(0)):
    found = scan_voices().get(voice)
    if not found:
        raise HTTPException(404, f"No voice named '{voice}' in {MODELS_DIR.name}/")
    pitch = max(-24, min(24, pitch))

    data = audio.file.read(MAX_UPLOAD + 1)
    if not data:
        raise HTTPException(400, "The recording was empty.")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "That recording is too long. Keep clips under a minute or two.")

    fd, src = tempfile.mkstemp(suffix=Path(audio.filename or "clip.wav").suffix or ".wav")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    fd, dst = tempfile.mkstemp(suffix=".wav")
    os.close(fd)

    def cleanup():
        for p in (src, dst):
            try:
                os.remove(p)
            except OSError:
                pass

    try:
        with _lock:
            convert_file(voice, found, pitch, src, dst)
    except Exception as e:
        cleanup()
        raise HTTPException(500, f"Voice conversion failed: {e}")
    return FileResponse(dst, media_type="audio/wav", filename="cloned-voice.wav", background=BackgroundTask(cleanup))
