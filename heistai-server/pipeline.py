"""
Chatbot pipeline for HeistAi: speech in -> STT -> LLM -> TTS -> speech out.

Exposes:
    CHARACTERS                          - prompt + voice for each character
    new_session(character) -> Session   - one per user/browser session
    preload()                           - load STT + TTS models up front
    run_turn(session, audio)            - v1: whole reply at once
    stream_turn(session, audio)         - v2: yields (sentence, audio) as each is ready

`audio` can be a file path or file-like object. Pass text=... instead to skip STT.
"""

import time
from dataclasses import dataclass
from typing import BinaryIO, Iterator, Optional, Union

import numpy as np

import llm
import stt
import tts

# Move to characters.json later.
CHARACTERS = {
    "alfred": {
        "voice": "alfred",
        "prompt": (
            "You are Alfred, the crew's AI handler in a stylized heist game, speaking to the "
            "player through their earpiece. You're calm, witty, and loyal, like the tech expert "
            "in a heist movie. You help the player plan and pull off jobs against the game's "
            "fictional targets, such as the Meridian Bank vault, by suggesting crew roles, "
            "cover stories, distractions, timing, and escape routes. Keep everything in the "
            "game world: invented gadgets, fictional security systems, cinematic plans. "
            "The crew's toolkit includes a voice modulator and a disguise generator; suggest "
            "them when they fit the plan. If the player asks how to commit a crime in real "
            "life, stay in character and steer back to the game, for example: "
            "'That's outside the job, boss. Let's stick to Meridian.'"
        ),
    },
}

NO_SPEECH_LINE = "Didn't catch that, boss. Say again?"
GAP_SECONDS = 0.15  # silence between sentences when joining audio

AudioInput = Union[str, BinaryIO]


@dataclass
class Session:
    character: str
    voice: str
    convo: llm.Conversation


def new_session(character: str = "alfred") -> Session:
    config = CHARACTERS[character]
    return Session(character, config["voice"], llm.Conversation(config["prompt"]))


def preload() -> None:
    """Load models before the first request so it isn't slow. Call when the module opens."""
    stt.load_model()
    tts.load_model()


def _get_user_text(audio: Optional[AudioInput], text: Optional[str]) -> str:
    if text is not None:
        return text.strip()
    if audio is None:
        raise ValueError("Pass either audio or text")
    return stt.transcribe(audio)


def run_turn(session: Session, audio: Optional[AudioInput] = None, text: Optional[str] = None):
    """
    v1: transcribe, get the full reply, synthesize it all at once.
    Returns (user_text, reply_text, reply_audio).
    """
    start = time.perf_counter()
    user_text = _get_user_text(audio, text)
    reply = llm.chat(session.convo, user_text) if user_text else NO_SPEECH_LINE
    reply_audio = tts.synthesize(reply, session.voice)
    print(f"[pipeline] turn done in {time.perf_counter() - start:.2f}s")
    return user_text, reply, reply_audio


def stream_turn(
    session: Session, audio: Optional[AudioInput] = None, text: Optional[str] = None
) -> Iterator[tuple[str, np.ndarray]]:
    """
    v2: yield (sentence, audio) for each sentence as soon as it's synthesized,
    so playback can start while later sentences are still being generated.
    """
    start = time.perf_counter()
    user_text = _get_user_text(audio, text)

    if not user_text:
        yield NO_SPEECH_LINE, tts.synthesize(NO_SPEECH_LINE, session.voice)
        return

    # Claude keeps generating server-side while we run TTS on each sentence,
    # so later sentences are usually ready by the time we ask for them.
    first = True
    for sentence in llm.stream_sentences(session.convo, user_text):
        sentence_audio = tts.synthesize(sentence, session.voice)
        if first:
            print(f"[pipeline] first audio ready in {time.perf_counter() - start:.2f}s")
            first = False
        yield sentence, sentence_audio

    print(f"[pipeline] turn done in {time.perf_counter() - start:.2f}s")


def join_audio(chunks: list[np.ndarray]) -> np.ndarray:
    """Concatenate sentence audio with short gaps, for saving to one file."""
    gap = np.zeros(int(tts.SAMPLE_RATE * GAP_SECONDS), dtype=np.float32)
    parts = []
    for chunk in chunks:
        parts.extend([chunk.astype(np.float32), gap])
    return np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)


if __name__ == "__main__":
    # Test with audio:  python pipeline.py --audio question.wav
    # Test with text:   python pipeline.py --text "Alfred, how do we get past the guard?"
    # Add --v1 to use the non-streaming version.
    import argparse

    import soundfile as sf

    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--audio", help="path to a recorded question")
    group.add_argument("--text", help="skip STT and type the question")
    parser.add_argument("--character", default="alfred")
    parser.add_argument("--v1", action="store_true", help="non-streaming pipeline")
    args = parser.parse_args()

    session = new_session(args.character)
    if args.audio:
        stt.load_model()
    tts.load_model()

    if args.v1:
        user_text, reply, audio = run_turn(session, audio=args.audio, text=args.text)
        print(f"\nyou> {user_text}\n{args.character}> {reply}")
        sf.write("reply.wav", audio, tts.SAMPLE_RATE)
    else:
        chunks = []
        for sentence, audio in stream_turn(session, audio=args.audio, text=args.text):
            print(f"{args.character}> {sentence}")
            chunks.append(audio)
        sf.write("reply.wav", join_audio(chunks), tts.SAMPLE_RATE)

    print("[pipeline] wrote reply.wav")