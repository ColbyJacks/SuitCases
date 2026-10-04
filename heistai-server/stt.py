#uses fastwhisper in order to create text from speech
"""
Speech-to-text for the HeistAi chatbot module.

Exposes one function the rest of the app uses:
    transcribe(audio) -> str

`audio` can be a file path (wav, webm, mp3, ...) or a file-like object
(e.g. FastAPI's UploadFile.file). faster-whisper decodes audio itself
via PyAV, so browser recordings (webm/opus) work without installing ffmpeg.
"""

import os
import time
from typing import BinaryIO, Union

from faster_whisper import WhisperModel

# Config (override in .env / environment variables)
MODEL_SIZE = os.getenv("STT_MODEL", "base.en")      # tiny.en, base.en, small.en
COMPUTE_TYPE = os.getenv("STT_COMPUTE", "int8")     # int8 is fastest on CPU
LANGUAGE = "en"

_model = None  # loaded lazily on first use


def load_model() -> WhisperModel:
    """Load the Whisper model once and reuse it. Call early to avoid a slow first request."""
    global _model
    if _model is None:
        start = time.perf_counter()
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE)
        print(f"[stt] loaded {MODEL_SIZE} ({COMPUTE_TYPE}) in {time.perf_counter() - start:.1f}s")
    return _model


def unload_model() -> None:
    """Free the model's memory when the chatbot module closes."""
    global _model
    _model = None


def transcribe(audio: Union[str, BinaryIO]) -> str:
    """Transcribe an audio file or file-like object to text."""
    model = load_model()
    start = time.perf_counter()

    segments, info = model.transcribe(
        audio,
        language=LANGUAGE,   # skip language detection (saves time)
        beam_size=1,         # greedy decoding: faster, slightly less accurate
        vad_filter=True,     # trim silence so Whisper doesn't hallucinate on it
    )

    # `segments` is a generator: transcription actually runs here.
    text = " ".join(segment.text.strip() for segment in segments).strip()

    elapsed = time.perf_counter() - start
    print(f"[stt] {info.duration:.1f}s of audio in {elapsed:.2f}s -> {text!r}")
    return text


if __name__ == "__main__":
    # Standalone test: python stt.py path/to/recording.wav
    import sys

    if len(sys.argv) != 2:
        print("usage: python stt.py <audio file>")
        sys.exit(1)

    print(transcribe(sys.argv[1]))