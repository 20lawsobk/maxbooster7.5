from fastapi import FastAPI
import uvicorn
import subprocess
import os
import json
import threading

DATASET_DIR = r"D:\ai_server\datasets"
LOG_FILE = r"D:\ai_server\logs\control.log"

app = FastAPI()

def log(msg):
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")

@app.post("/start_download")
def start_download(payload: dict):
    dataset = payload["dataset"]
    repo = payload["repo"]

    target_dir = os.path.join(DATASET_DIR, dataset)
    os.makedirs(target_dir, exist_ok=True)

    log(f"Starting download: {dataset}")

    def run():
        cmd = f"git lfs clone {repo} {target_dir}"
        subprocess.run(cmd, shell=True)
        log(f"Completed download: {dataset}")

    threading.Thread(target=run).start()

    return {"status": "started", "dataset": dataset}

@app.get("/status")
def status():
    return {"status": "online"}

@app.post("/start_training")
def start_training(payload: dict):
    script = payload["script"]
    log(f"Starting training: {script}")

    def run():
        subprocess.run(f"python {script}", shell=True)
        log(f"Training finished: {script}")

    threading.Thread(target=run).start()

    return {"status": "training_started"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5055)
