---
name: Background daemon-thread work stalls under live server load
description: A function that finishes fast standalone can take 90s+ when run as a background daemon thread from the live MaxCore FastAPI process.
---

`workers/seed_audio_dataset.py`'s `seed(..., force_source="librosa")` completes in ~13s when called directly from a standalone Python script against the same storage backend. The identical call, triggered via `POST /storage/datasets/audio/seed` on the live server (which spawns it on a plain `threading.Thread(daemon=True)`), reliably failed to flip `seeding_now` back to `false` within 90s across repeated clean restarts.

**Why:** The live process has other concurrent work (e.g. the Node-side proxy's circuit-breaker retry storm hammering MaxCore endpoints during/after a restart) that appears to starve the background daemon thread's scheduling/GIL time, even though the function itself is not slow in isolation.

**How to apply:** Don't assume a function is "just slow" because it's slow through an HTTP-triggered background thread — reproduce it standalone first to isolate function logic from server-load contention. Diagnostic tools were limited in this environment: `py-spy` is not installed, and MaxCore's Python `print()`/`logger` output does not reach the Node workflow log (only uvicorn's own INFO lines do), so tracing exactly where a live background thread is stuck requires either installing py-spy, using `faulthandler.register(signal.SIGALRM, ...)` inside a reproducible standalone script, or adding temporary instrumentation that writes to a file/response instead of relying on logs.
