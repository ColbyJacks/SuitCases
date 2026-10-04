# Face swap server (backend/server.py)

FastAPI WebSocket server running InsightFace (buffalo_l detection + inswapper_128) on the GPU.
The browser sends webcam frames to `/ws` and gets swapped frames back. Vite proxies
`/api/faceswap/ws` to port 8001, so it also works over https / Tailscale.

## Setup (once)

Python 3.10 to 3.12, NVIDIA GPU. From `backend/`:

```bash
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install insightface "onnxruntime-gpu==1.22.0" opencv-python-headless numpy fastapi "uvicorn[standard]" nvidia-cudnn-cu12 nvidia-cublas-cu12 nvidia-cuda-nvrtc-cu12 nvidia-cuda-runtime-cu12 nvidia-cufft-cu12 nvidia-curand-cu12
```

onnxruntime-gpu is pinned to 1.22 because newer builds need CUDA 13 and these pip packages are CUDA 12.

Put `inswapper_128.onnx` in this folder (gitignored, ~550 MB, non-commercial license).
`buffalo_l` downloads itself into `~/.insightface` on first start.

## Run

```bash
npm run faceswap   # from the repo root, wait for "Models Loaded!"
```
