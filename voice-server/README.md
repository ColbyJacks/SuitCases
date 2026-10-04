# Voice server (RVC voice clone)

A small FastAPI app that runs [RVC](https://github.com/daswer123/rvc-python) voice conversion for the Voice Modulator's **Voice clone** mode. The browser records a line, sends it as WAV, and plays back the converted WAV. Vite proxies `/api/voice/*` to this server on port 8765, so there's nothing to configure in the browser.

If this server isn't running, the panel opens on **Quick disguise** (the in-browser pitch shifter) instead.

## Setup (once)

You need **Python 3.10**. rvc-python pins old packages (numpy ≤ 1.23.5, fairseq 0.12.2) that won't install on 3.11+. On Windows, fairseq may also need the [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

From the repo root:

```bash
cd voice-server
py -3.10 -m venv .venv            # macOS/Linux: python3.10 -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate

# Pick ONE torch build:
pip install torch==2.1.1 torchaudio==2.1.1 --index-url https://download.pytorch.org/whl/cpu     # any machine
pip install torch==2.1.1 torchaudio==2.1.1 --index-url https://download.pytorch.org/whl/cu121   # NVIDIA GPU

pip install -r requirements.txt
```

The first conversion downloads RVC's base weights (HuBERT and RMVPE, about 400 MB) into the rvc_python package. After that it works offline.

Already have a working RVC venv somewhere else? Point at it instead of making a new one:

```bash
VOICE_PYTHON="path/to/.venv/Scripts/python.exe" npm run voice          # Git Bash / macOS / Linux
$env:VOICE_PYTHON="path\to\.venv\Scripts\python.exe"; npm run voice    # PowerShell
```

## Voices

Put `.pth` voice models in `voice-server/models/`. Two layouts work, and you can mix them:

```
models/
  JasonStathum.pth            # file name becomes the voice name ("Jason Stathum")
  JasonStathum.index          # optional, same name as the .pth
  Boss/                       # or a folder per voice
    boss_v2.pth
    added_IVF256_boss.index   # optional
```

The folder is rescanned on every request, so new voices appear after hitting the rescan button in the panel. No restart needed. Model files are gitignored (they're 50+ MB each), so share them with the team some other way.

An `.index` file makes the clone sound closer to the target. Models without one still work.

## Run

Two terminals from the repo root:

```bash
npm run voice   # this server, http://127.0.0.1:8765
npm run dev     # the app
```

`npm run voice` uses `voice-server/.venv` if it exists, otherwise `VOICE_PYTHON`, otherwise `python` on your PATH.

## CPU or GPU

It uses the GPU automatically when torch can see CUDA, otherwise the CPU. On CPU a short line takes roughly 5 to 10 seconds; switching voices adds a few seconds the first time.

| Variable | Default | What it does |
| --- | --- | --- |
| `RVC_DEVICE` | `cuda:0` if available, else `cpu` | Force a device |
| `RVC_F0_METHOD` | `rmvpe` | Pitch tracker (`rmvpe`, `harvest`, `crepe`, `pm`) |
| `VOICE_MODELS_DIR` | `voice-server/models` | Where to look for voices |
| `VOICE_PORT` | `8765` | Port for `npm run voice` |
| `VOICE_SERVER_URL` | `http://127.0.0.1:8765` | Where Vite proxies `/api/voice` (set when running `npm run dev`) |

## API

| Method | Path (through Vite) | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/voice/health` | | `{ ok, device, voices }` |
| GET | `/api/voice/voices` | | `{ voices: [{ id, name, hasIndex }] }` |
| POST | `/api/voice/convert` | multipart: `audio` (WAV, or any format ffmpeg reads), `voice` (id), `pitch` (semitones, -24 to 24) | `audio/wav` |

Quick test without the browser:

```bash
curl -F audio=@input.wav -F voice=JasonStathum -F pitch=0 http://localhost:5173/api/voice/convert -o out.wav
```
