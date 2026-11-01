"""Disposable real ASGI/rendering boundary for the Node beat-loop SQL test.

Only public observations and private durable delivery use controlled fixtures.
Actual production request models, owner middleware, immutable plans, renderer
dispatch, codecs and media validation execute without a language checkpoint.
"""
import ast
from contextlib import ExitStack
from functools import partial
from hashlib import sha256
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import quote
import base64

ROOT = Path(__file__).resolve().parents[2]
MAXCORE = ROOT / "external/maxcore/artifacts/ai-training-server"
sys.path[:0] = [str(MAXCORE), str(MAXCORE / "tests")]

from ai_model.generation.live_serving import LiveServingModel
from ai_model.media_contract import commit_artifact
from test_dedicated_media_http import actual_media_app, PRIVATE_CHANNEL
from test_live_awareness_planner_http import fresh_snapshot
import uvicorn


def main():
    root, port = Path(sys.argv[1]).resolve(), int(sys.argv[2])
    root.mkdir(parents=True, exist_ok=True)
    uploads, store, journal = (root / name for name in ("uploads", "durable", "journals"))
    for directory in (uploads, store, journal):
        directory.mkdir()
    snapshot = fresh_snapshot()
    engine = SimpleNamespace(current_snapshot=lambda: snapshot)

    def persist(job, record):
        destination = journal / f"{job}.json"
        temporary = destination.with_suffix(".tmp")
        temporary.write_text(json.dumps(record))
        temporary.replace(destination)

    def read(job):
        destination = journal / f"{job}.json"
        return json.loads(destination.read_text()) if destination.exists() else None

    def transport(payload):
        key = f"users/{payload['owner_id']}/generated-{payload['kind']}/{payload['job_id']}{Path(payload['filename']).suffix}"
        target = store / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(base64.b64decode(payload["data_base64"], validate=True))
        with target.open("rb") as stored:
            os.fsync(stored.fileno())
        verified = target.read_bytes()
        return {"durable": True, "retrievable": True, "owner_id": payload["owner_id"],
                "job_id": payload["job_id"], "sha256": sha256(verified).hexdigest(),
                "size_bytes": len(verified), "url": "/api/storage/file/" + quote(key, safe="")}

    with ExitStack() as scope:
        scope.enter_context(patch("ai_model.awareness.engine.get_engine", return_value=engine))
        scope.enter_context(patch("ai_model.awareness.get_engine", return_value=engine))
        scope.enter_context(patch.dict(os.environ, {"PDIM_LOCAL_CHANNEL_TOKEN": PRIVATE_CHANNEL}))
        scope.enter_context(patch("ai_model.image.image_engine._UPLOADS_DIR", uploads / "images"))
        scope.enter_context(patch("ai_model.media_contract.commit_artifact",
                                  new=partial(commit_artifact, transport=transport, attempts=1)))
        app, namespace = actual_media_app(uploads, LiveServingModel(), persist, read)
        # Compile the actual awareness routes in the same ASGI fixture scope.
        names = {"unified_awareness_status", "unified_awareness_context"}
        nodes = [node for node in ast.parse((MAXCORE / "server.py").read_text()).body
                 if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(MAXCORE / "server.py"), "exec"), namespace)

        @app.get("/_fixture/health")
        @app.get("/api/health")
        async def fixture_health():
            return {"fixture": True, "status": "healthy", "model_loaded": False, "snapshot_id": snapshot.id}

        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
