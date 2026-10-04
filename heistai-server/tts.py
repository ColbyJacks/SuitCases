"""
Text-to-speech for the HeistAi chatbot module (OmniVoice, CPU).

Exposes:
    synthesize(text, voice) -> np.ndarray   - 24 kHz mono float audio
    to_wav_bytes(audio) -> bytes            - for sending audio over FastAPI

Voices come in two kinds (see VOICES below):
    "instruct"  - voice design from attributes, no recording needed
    "ref_audio" - voice cloning from a 3-10 second reference clip
"""

import io
import os
import time

import numpy as np
import soundfile as sf
import torch
from omnivoice import OmniVoice, VoiceClonePrompt

SAMPLE_RATE = 24000
NUM_STEPS = int(os.getenv("TTS_STEPS", "16"))  # 32 = default quality, 16 = faster
VOICES_DIR = "voices"

# Move these into characters.json later.
VOICES = {
    "case": {"instruct": "male, low pitch, british accent"},
    "alfred": {
        "ref_audio": "voices/Alfred.wav",
        "ref_text": "You cross the line first so you squeeze them, you hammered them to the point of desperation.",
    },
}

_model = None
_clone_prompts: dict[str, VoiceClonePrompt] = {}


def load_model() -> OmniVoice:
    """Load OmniVoice once on CPU. Call when the chatbot module opens."""
    global _model
    if _model is None:
        start = time.perf_counter()
        _model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map="cpu",
            dtype=torch.float32,  # float16 is slow or unsupported on most CPUs
        )
        print(f"[tts] loaded OmniVoice in {time.perf_counter() - start:.1f}s")
    return _model


def unload_model() -> None:
    global _model
    _model = None
    _clone_prompts.clear()


def _get_clone_prompt(name: str, ref_audio: str, ref_text: str | None = None) -> VoiceClonePrompt:
    """
    Encode a reference clip once and cache it to voices/<name>.pt,
    so later runs skip audio loading and transcription entirely.
    """
    if name in _clone_prompts:
        return _clone_prompts[name]
    if ref_text is None:
        from stt import transcribe
        ref_text = transcribe(ref_audio)
    cache_path = os.path.join(VOICES_DIR, f"{name}.pt")
    if os.path.exists(cache_path):
        prompt = VoiceClonePrompt.load(cache_path)
    else:
        # Reuse our own STT for the reference transcript instead of letting
        # OmniVoice load a second Whisper model.
        from stt import transcribe

        ref_text = transcribe(ref_audio)
        prompt = load_model().create_voice_clone_prompt(ref_audio=ref_audio, ref_text=ref_text)
        os.makedirs(VOICES_DIR, exist_ok=True)
        prompt.save(cache_path)
        print(f"[tts] cached voice '{name}' -> {cache_path}")

    _clone_prompts[name] = prompt
    return prompt


def _voice_kwargs(voice: str) -> dict:
    """Turn a voice name into the right generate() arguments."""
    config = VOICES.get(voice)
    if config is None:
        raise ValueError(f"Unknown voice '{voice}'. Add it to VOICES.")
    if "ref_audio" in config:
        return {"voice_clone_prompt": _get_clone_prompt(voice, config["ref_audio"], config.get("ref_text"))}
    return {"instruct": config["instruct"]}


def synthesize(text: str, voice: str = "case") -> np.ndarray:
    """Generate speech for one sentence (or short reply) in the given voice."""
    model = load_model()
    start = time.perf_counter()

    audio = model.generate(text=text, num_step=NUM_STEPS, **_voice_kwargs(voice))[0]

    elapsed = time.perf_counter() - start
    duration = len(audio) / SAMPLE_RATE
    rtf = elapsed / duration if duration else float("inf")
    print(f"[tts] {duration:.1f}s of audio in {elapsed:.2f}s (RTF {rtf:.2f}) -> {text!r}")
    return audio


def to_wav_bytes(audio: np.ndarray) -> bytes:
    """Encode audio as WAV in memory, ready to return from an API route."""
    buffer = io.BytesIO()
    sf.write(buffer, audio, SAMPLE_RATE, format="WAV")
    return buffer.getvalue()


if __name__ == "__main__":
    # Standalone test: python tts.py "Some text" [voice]
    import sys

    text = sys.argv[1] if len(sys.argv) > 1 else "The vault opens in ninety seconds. Stay sharp."
    voice = sys.argv[2] if len(sys.argv) > 2 else "case"

    load_model()
    synthesize("Warming up.", voice)  # first call is slower; don't count it
    audio = synthesize(text, voice)
    sf.write("out.wav", audio, SAMPLE_RATE)
    print("[tts] wrote out.wav")