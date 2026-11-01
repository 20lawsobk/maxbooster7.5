"""Tiny fake native functions exercise real process isolation, never rendering."""
import ast
import os
from pathlib import Path
import signal
import sys
import tempfile
import time
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_model.isolated_audio import render_isolated, run_process
from ai_model.media_contract import RenderCancelled


# Test-only fixtures exported over the same private channel as canonical code.
def _render_audio_clip():
    return None


def _arc_spectral_clean_file():
    return None


def _summarize_audio_analysis(result):
    return {"test_only": True}


def _render_audio_from_dataset(job_id, bpm, key, duration, opts):
    if opts.get("mode") == "hang":
        while True:
            time.sleep(1)
    if opts.get("mode") == "error":
        raise OSError(11, "fixture busy")
    if opts.get("mode") == "bad":
        return {"url": "/uploads/../escape.wav"}
    if opts.get("mode") == "missing":
        return {"url": f"/uploads/audio_{job_id}.wav"}
    path = _UPLOADS_PATH / f"audio_{job_id}.wav"
    path.write_bytes(b"test-only-artifact-not-production-audio")
    return {"url": f"/uploads/{path.name}", "stems": {}}


EXPORTS = {f.__name__: f for f in (_render_audio_clip, _arc_spectral_clean_file,
                                  _summarize_audio_analysis, _render_audio_from_dataset)}


class IsolationTests(unittest.TestCase):
    def test_terminal_job_states_cannot_be_overwritten(self):
        tree = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                        and n.name == "_job_update")
        with tempfile.TemporaryDirectory() as directory:
            state = {"status": "rendering"}
            namespace = {"os": os, "_JOBS_DIR": directory, "_api_jobs_lock": threading.Lock(),
                         "_job_read": lambda _: dict(state),
                         "_job_write": lambda _, data: state.update(data)}
            exec(compile(ast.Module(body=[function], type_ignores=[]), "job-update", "exec"), namespace)
            update = namespace["_job_update"]
            update("job", {"status": "cancelled"})
            update("job", {"status": "rendering"})
            update("job", {"status": "done", "url": "must-not-publish"})
            self.assertEqual(state, {"status": "cancelled"})
            update("job", {"error": "worker reaped"})
            self.assertEqual(state["error"], "worker reaped")

    def request(self, mode="ok"):
        return {"job_id": "isolated-test", "bpm": 120, "key": "C",
                "duration": 1, "opts": {"mode": mode}}

    def test_success_promotes_only_completed_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            result = render_isolated(EXPORTS, self.request(), directory,
                                     deadline=time.monotonic() + 3)
            self.assertEqual(result["audio_analysis"], {"test_only": True})
            self.assertEqual([p.name for p in Path(directory).iterdir()],
                             ["audio_isolated-test.wav"])

    def test_error_invalid_result_and_missing_artifact_cleanup(self):
        for mode, error in (("error", OSError), ("bad", ValueError), ("missing", ValueError)):
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(error):
                    render_isolated(EXPORTS, self.request(mode), directory,
                                    deadline=time.monotonic() + 3)
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_native_hang_is_killed_and_slot_reusable(self):
        with tempfile.TemporaryDirectory() as directory:
            started = time.monotonic()
            with self.assertRaises(TimeoutError):
                render_isolated(EXPORTS, self.request("hang"), directory,
                                deadline=started + .3)
            self.assertLess(time.monotonic() - started, 2)
            self.assertEqual(list(Path(directory).iterdir()), [])
            render_isolated(EXPORTS, self.request(), directory, deadline=time.monotonic() + 3)

    def test_cancellation_terminates_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            started = time.monotonic()
            with self.assertRaises(RenderCancelled):
                render_isolated(EXPORTS, self.request("hang"), directory,
                                deadline=started + 3,
                                cancelled=lambda: time.monotonic() > started + .15)
            self.assertLess(time.monotonic() - started, 2)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_sigkill_reclaims_uncooperative_descendant(self):
        with tempfile.TemporaryDirectory() as directory:
            pid_file = Path(directory) / "descendant"
            child = ("import signal,time; "
                     "signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(30)")
            leader = (
                "import subprocess,sys,signal,time,pathlib; "
                "signal.signal(signal.SIGTERM,signal.SIG_IGN); "
                f"p=subprocess.Popen([sys.executable,'-c',{child!r}]); "
                f"pathlib.Path({str(pid_file)!r}).write_text(str(p.pid)); time.sleep(30)"
            )
            with self.assertRaises(TimeoutError):
                run_process([sys.executable, "-c", leader], deadline=time.monotonic() + .3,
                            cancelled=lambda: False, env=os.environ.copy())
            pid = int(pid_file.read_text())
            for _ in range(20):
                status = Path(f"/proc/{pid}/status")
                if not status.exists() or "\nState:\tZ" in status.read_text():
                    break
                time.sleep(.025)
            else:
                self.fail("Native descendant remained alive after deadline")


if __name__ == "__main__":
    unittest.main()