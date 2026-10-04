import os
import sys
import site
import cv2
import base64
import numpy as np
import time
from fastapi import FastAPI, WebSocket
import uvicorn
from insightface.app import FaceAnalysis
from insightface.model_zoo import get_model
from insightface.app.common import Face

# Inject NVIDIA Pip Package DLLs into PATH
for sp in site.getsitepackages():
    nvidia_dir = os.path.join(sp, "nvidia")
    if os.path.exists(nvidia_dir):
        for pkg in ["cudnn", "cublas", "cuda_nvrtc", "cuda_runtime"]:
            bin_dir = os.path.join(nvidia_dir, pkg, "bin")
            if os.path.exists(bin_dir):
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ["PATH"]
                if hasattr(os, 'add_dll_directory'):
                    os.add_dll_directory(bin_dir)

app = FastAPI()

print("Loading AI Models...", flush=True)
face_analyzer = FaceAnalysis(name='buffalo_l', providers=['CUDAExecutionProvider'])
face_analyzer.prepare(ctx_id=0, det_size=(320, 320))  # Ultra-fast detection size
swapper = get_model('inswapper_128.onnx', download=False, providers=['CUDAExecutionProvider'])

# Warm up the swapper so the first frame doesn't hang!
print("Warming up CUDA Engine (this takes ~15 seconds)...", flush=True)
dummy_img = cv2.imread('target.jpg')
if dummy_img is not None:
    faces = face_analyzer.get(dummy_img)
    if len(faces) > 0:
        swapper.get(dummy_img, faces[0], faces[0], paste_back=True)

print("Models Loaded!", flush=True)
source_face = None

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    global source_face
    
    try:
        while True:
            data = await websocket.receive_text()
            
            # Allow the browser to update the target face!
            if data.startswith("SET_SOURCE:"):
                encoded_data = data.split(',', 1)[1]
                nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
                new_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                # FULL get() to extract embeddings for the source disguise!
                faces = face_analyzer.get(new_img)
                if len(faces) > 0:
                    source_face = faces[0]
                    print("✅ Target face updated from browser!", flush=True)
                else:
                    print("❌ No face found in uploaded image!", flush=True)
                continue

            if not data.startswith("data:image/jpeg;base64,"):
                continue
                
            t0 = time.time()
            
            # Decode base64 to OpenCV image
            encoded_data = data.split(',', 1)[1]
            nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if source_face is not None:
                # FAST PATH: Only run detection, bypass embeddings/gender/age!
                bboxes, kpss = face_analyzer.models['detection'].detect(frame, max_num=0, metric='default')
                res = frame
                if bboxes.shape[0] > 0:
                    res = frame.copy()
                    for i in range(bboxes.shape[0]):
                        face = Face(bbox=bboxes[i][:4], kps=kpss[i], det_score=bboxes[i][4])
                        res = swapper.get(res, face, source_face, paste_back=True)

            else:
                res = frame
                
            _, buffer = cv2.imencode('.jpg', res, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            b64_str = base64.b64encode(buffer).decode('utf-8')
            out_data = f"data:image/jpeg;base64,{b64_str}"
            
            await websocket.send_text(out_data)
            
            dt = time.time() - t0
            print(f"Frame processed in {dt*1000:.1f} ms ({1/dt:.1f} FPS)", flush=True)
            
    except Exception as e:
        print(f"Connection closed: {e}", flush=True)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
