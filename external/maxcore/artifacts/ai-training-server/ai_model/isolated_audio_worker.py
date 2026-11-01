"""Private subprocess entrypoint, never an HTTP/RPC endpoint.

Only its supervising Python process writes the mode-0600 invocation file.
Function sources are exported from the canonical renderer, not user input.
This avoids importing server.py (which initializes services/models) or forking
its multithreaded native runtime. No checkpoint/model is copied into the child.
"""
import ast
import json
import os
from pathlib import Path
import sys
import threading
import time
from typing import Optional

EXPORTS = ("_render_audio_clip", "_render_audio_from_dataset",
           "_arc_spectral_clean_file", "_summarize_audio_analysis")


def execute(invocation):
    namespace = {
        "__name__": "__isolated_audio__", "__builtins__": __builtins__,
        "os": os, "time": time, "Optional": Optional,
        "_UPLOADS_PATH": Path(invocation["staging"]),
        "_AUDIO_RENDER_CACHE": {}, "_AUDIO_RENDER_CACHE_LOCK": threading.Lock(),
    }
    sources = invocation["exports"]
    if set(sources) != set(EXPORTS):
        raise ValueError("Invalid private renderer export set")
    for name in EXPORTS:
        tree = ast.parse(sources[name])
        if (len(tree.body) != 1 or not isinstance(tree.body[0], ast.FunctionDef)
                or tree.body[0].name != name or tree.body[0].decorator_list):
            raise ValueError("Invalid private renderer export")
        exec(compile(tree, f"<canonical:{name}>", "exec"), namespace)
    request = invocation["request"]
    result = namespace["_render_audio_from_dataset"](
        request["job_id"], request["bpm"], request["key"],
        request["duration"], request["opts"],
    )
    result["audio_analysis"] = namespace["_summarize_audio_analysis"](result)
    return result


def main():
    # Import native packages only after the parent applies child thread budgets.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    destination = Path(sys.argv[2])
    try:
        source = Path(sys.argv[1])
        if source.stat().st_size > 1_048_576:
            raise ValueError("Private renderer invocation is too large")
        result = execute(json.loads(source.read_text()))
        response = {"version": 1, "status": "done", "result": result}
    except Exception as exc:
        response = {"version": 1, "status": "error", "error": str(exc)[:2000],
                    "error_type": type(exc).__name__, "errno": getattr(exc, "errno", None)}
    encoded = json.dumps(response)
    if len(encoded.encode()) > 262_144:
        encoded = json.dumps({"version": 1, "status": "error",
                              "error": "Renderer result exceeds protocol budget"})
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(encoded)
    temporary.replace(destination)


if __name__ == "__main__":
    main()