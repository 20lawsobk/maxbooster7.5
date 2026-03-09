import queue
import threading
import subprocess

class GPUScheduler:
    def __init__(self):
        self.jobs = queue.Queue()
        self.active = None
        threading.Thread(target=self.worker, daemon=True).start()

    def worker(self):
        while True:
            job = self.jobs.get()
            self.active = job
            subprocess.run(job["cmd"], shell=True)
            self.active = None

    def submit(self, script):
        self.jobs.put({"cmd": f"python {script}"})
        return True

    def status(self):
        if self.active:
            return {"status": "running", "job": self.active}
        return {"status": "idle"}
