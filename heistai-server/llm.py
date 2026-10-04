"""
LLM for the HeistAi chatbot module (Claude API).

Exposes:
    Conversation               - holds one session's character + message history
    chat(convo, text) -> str   - full reply at once (pipeline v1)
    stream_sentences(convo, text) -> yields sentences as they arrive (pipeline v2)

Needs ANTHROPIC_API_KEY in your .env file.
"""

import os
import re
import time
from typing import Iterator

import anthropic
from dotenv import load_dotenv

load_dotenv()  # reads .env into environment variables

# Config (override in .env)
MODEL = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")  # Haiku: fastest, cheapest
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "200"))          # short replies = fast TTS
MAX_TURNS = 10  # user+assistant pairs kept in history

# Appended to every character's prompt, because the output gets spoken aloud.
VOICE_RULES = (
    "Your replies are converted to speech. Keep each reply to 1-3 short sentences. "
    "Never use markdown, bullet points, lists, emojis, or stage directions like *laughs*. "
    "Write numbers and symbols the way they should be spoken. Stay in character."
)

WORKSPACE_ID = os.getenv("ANTHROPIC_WORKSPACE_ID")
client = anthropic.Anthropic(
    default_headers={"anthropic-workspace-id": WORKSPACE_ID} if WORKSPACE_ID else None
)  # picks up ANTHROPIC_API_KEY automatically
 
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
MARKDOWN_JUNK = re.compile(r"[*_#`>]|\[|\]")


class Conversation:
    """One chat session: a character's system prompt plus message history."""

    def __init__(self, system_prompt: str):
        self.system = f"{system_prompt}\n\n{VOICE_RULES}"
        self.messages: list[dict] = []

    def add(self, role: str, text: str) -> None:
        self.messages.append({"role": role, "content": text})
        # Trim oldest turns so the prompt doesn't grow forever.
        # Keep an even count so history still starts with a user message.
        excess = len(self.messages) - MAX_TURNS * 2
        if excess > 0:
            self.messages = self.messages[excess + (excess % 2):]

    def drop_last_user(self) -> None:
        """Undo a user turn if the API call failed, so roles stay alternating."""
        if self.messages and self.messages[-1]["role"] == "user":
            self.messages.pop()


def clean_for_speech(text: str) -> str:
    """Strip characters TTS would read aloud or choke on."""
    return MARKDOWN_JUNK.sub("", text).strip()


def chat(convo: Conversation, user_text: str) -> str:
    """Send the user's message and return the full reply."""
    convo.add("user", user_text)
    start = time.perf_counter()
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=convo.system,
            messages=convo.messages,
        )
    except anthropic.APIError as e:
        convo.drop_last_user()
        print(f"[llm] API error: {e}")
        return "Static on the line. Say that again?"

    reply = clean_for_speech(response.content[0].text)
    convo.add("assistant", reply)
    print(f"[llm] reply in {time.perf_counter() - start:.2f}s -> {reply!r}")
    return reply


def stream_sentences(convo: Conversation, user_text: str) -> Iterator[str]:
    """
    Stream the reply and yield one complete sentence at a time,
    so TTS can start on sentence 1 while Claude is still writing sentence 2.
    """
    convo.add("user", user_text)
    start = time.perf_counter()
    buffer, full_reply, first = "", [], True

    try:
        with client.messages.stream(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=convo.system,
            messages=convo.messages,
        ) as stream:
            for chunk in stream.text_stream:
                buffer += chunk
                parts = SENTENCE_END.split(buffer)
                # Every part except the last is a finished sentence.
                for sentence in parts[:-1]:
                    sentence = clean_for_speech(sentence)
                    if sentence:
                        if first:
                            print(f"[llm] first sentence in {time.perf_counter() - start:.2f}s")
                            first = False
                        full_reply.append(sentence)
                        yield sentence
                buffer = parts[-1]
    except anthropic.APIError as e:
        convo.drop_last_user()
        print(f"[llm] API error: {e}")
        yield "Static on the line. Say that again?"
        return

    # Whatever's left after the stream ends is the final sentence.
    last = clean_for_speech(buffer)
    if last:
        full_reply.append(last)
        yield last

    convo.add("assistant", " ".join(full_reply))
    print(f"[llm] full reply in {time.perf_counter() - start:.2f}s")


if __name__ == "__main__":
    # Standalone text test: python llm.py  (type 'quit' to exit)
    convo = Conversation(
        "You are CASE, the crew's AI handler in a stylized heist game, speaking to the "
        "player through their earpiece. You're calm, witty, and loyal, like the tech expert "
        "in a heist movie. You help the player plan and pull off jobs against the game's "
        "fictional targets, such as the Meridian Bank vault, by suggesting crew roles, "
        "cover stories, distractions, timing, and escape routes. Keep everything in the "
        "game world: invented gadgets, fictional security systems, cinematic plans. "
        "If the player asks how to commit a crime in real life, stay in character and "
        "steer back to the game, for example: 'That's outside the job, boss. Let's stick "
        "to Meridian.'"
    )
    while True:
        text = input("\nyou> ").strip()
        if text.lower() in {"quit", "exit"}:
            break
        for sentence in stream_sentences(convo, text):
            print(f"vince> {sentence}")