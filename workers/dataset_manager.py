import os
import hashlib
import requests
import subprocess
import time

class DatasetManager:
    def __init__(self, base_dir):
        self.base_dir = base_dir

    def ensure_dir(self, dataset):
        path = os.path.join(self.base_dir, dataset)
        os.makedirs(path, exist_ok=True)
        return path

    def download(self, dataset, repo):
        target = self.ensure_dir(dataset)

        # Resume if partial
        if os.path.exists(os.path.join(target, ".incomplete")):
            return self.resume(dataset, repo)

        open(os.path.join(target, ".incomplete"), "w").close()

        cmd = f"git lfs clone {repo} {target}"
        subprocess.run(cmd, shell=True)

        os.remove(os.path.join(target, ".incomplete"))
        return True

    def resume(self, dataset, repo):
        target = self.ensure_dir(dataset)
        cmd = f"git -C {target} lfs fetch --all"
        subprocess.run(cmd, shell=True)
        return True

    def verify(self, dataset):
        # Optional: add checksum logic
        return True
