# HeistAI voice server

Lets you talk to Alfred, the crew's AI handler, out loud from the HeistAI module.
Your recording goes through faster-whisper (speech to text), Claude (the reply), and
OmniVoice (Alfred's cloned voice). Speech recognition and synthesis run locally on the CPU;
only the LLM call goes to the Claude API.

The pipeline files (`stt.py`, `llm.py`, `tts.py`, `pipeline.py`) come from the standalone
HeistAi project. `server.py` wraps them in FastAPI and streams each sentence back as soon as
it's synthesized, so the browser starts playing Alfred's first sentence while the rest is
still being written.

When this server isn't running, the HeistAI panel falls back to the text chat (`/api/heistai`).

## Setup

Python 3.10 to 3.13. From this folder:

```bash
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt --only-binary=av
```

Keys: the server reads `ANTHROPIC_API_KEY` from the app's `.env.local`. To override it or
tune the pipeline, create `heistai-server/.env` (gitignored):

```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_WORKSPACE_ID=           # only if your key needs it
LLM_MODEL=claude-haiku-4-5-20251001
LLM_MAX_TOKENS=200
STT_MODEL=base.en
TTS_STEPS=16                      # 8 is faster, 32 is best quality
```

## Run

In a second terminal next to `npm run dev`:

```bash
npm run heistai
```

It uses `heistai-server/.venv` if it exists. To use another Python that already has the
packages, point `HEISTAI_PYTHON` at it:

```bash
HEISTAI_PYTHON=path/to/python.exe npm run heistai
```

The first start downloads Whisper and OmniVoice weights. Open HeistAI once the log says
`Alfred is on the line`; the panel shows "warming up" until then.

## API

Vite proxies `/api/alfred/*` to `http://127.0.0.1:8766` (override with `HEISTAI_SERVER_URL`).

| Route | Body | Returns |
| --- | --- | --- |
| `GET /health` | | `{ ok, ready, character }` |
| `POST /talk` | multipart: `audio` (WAV) or `text`, plus `session` | NDJSON: `user`, then one `sentence` per line with base64 WAV `audio`, then `done` |
| `POST /reset` | form: `session` | forgets that conversation |

## Voices

`voices/Alfred.wav` is the reference clip for Alfred's voice. The encoded prompt is cached to
`voices/alfred.pt` on first use (gitignored). If you re-record the clip, delete the `.pt` file.
Only clone voices from teammates who've agreed to it.
