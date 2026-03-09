from fastapi import FastAPI, HTTPException, Request
import uvicorn
import subprocess
import os
import json
import threading
import time

DATASET_DIR = r"D:\ai_server\datasets"
LOG_FILE = r"D:\ai_server\logs\control.log"
API_KEY = "YOUR_SECRET_KEY"

app = FastAPI()

def log(msg):
    with open(LOG_FILE, "a") as f:
        f.write(f"[{time.ctime()}] {msg}\n")

def auth(request: Request):
    key = request.headers.get("Authorization", "").replace("Bearer ", "")
    if key != API_KEY:
        raise HTTPException(401, "Unauthorized")

@app.get("/status")
def status():
    return {"status": "online"}

@app.post("/start_download")
async def start_download(payload: dict, request: Request):
    auth(request)
    dataset = payload["dataset"]
    repo = payload["repo"]

    target_dir = os.path.join(DATASET_DIR, dataset)
    os.makedirs(target_dir, exist_ok=True)

    log(f"Starting download: {dataset}")

    def run():
        cmd = f"git lfs clone {repo} \"{target_dir}\""
        subprocess.run(cmd, shell=True)
        log(f"Completed download: {dataset}")

    threading.Thread(target=run).start()
    return {"status": "started", "dataset": dataset}

@app.post("/start_training")
async def start_training(payload: dict, request: Request):
    auth(request)
    script = payload["script"]

    log(f"Starting training: {script}")

    def run():
        subprocess.run(f"python \"{script}\"", shell=True)
        log(f"Training finished: {script}")

    threading.Thread(target=run).start()
    return {"status": "training_started"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5055)
