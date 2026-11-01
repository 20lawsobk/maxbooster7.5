"""Owned isolated HTTP fixture for the actual canonical analytics router only.

No general MaxCore generation, readiness, model, scheduler, database, public-feed
fetcher or learning process is started. All other MaxCore capabilities are absent.
"""
import hmac
import os
import socket
import sys
import time

sys.path.insert(0, sys.argv[1])

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
import uvicorn
from ai_model.analytics import create_router

_token = os.environ["OWNED_ANALYTICS_FIXTURE_TOKEN"]
_outage_until = 0.0
_connect = socket.socket.connect


def _loopback_only(self, address):
    if isinstance(address, tuple) and address[0] not in ("127.0.0.1", "localhost", "::1"):
        raise OSError("Owned analytics fixture denies external egress")
    return _connect(self, address)


socket.socket.connect = _loopback_only


def authorize(authorization: str = Header(None)):
    if not authorization or not hmac.compare_digest(authorization, "Bearer " + _token):
        raise HTTPException(401, "Explicit fixture authorization required")


app = FastAPI()
app.include_router(create_router(authorize, lambda: None))


@app.middleware("http")
async def controlled_outage(request, call_next):
    if request.url.path.startswith("/api/analytics/") and time.monotonic() < _outage_until:
        return JSONResponse(status_code=503, content={"detail": "Owned bounded upstream-outage injection"})
    return await call_next(request)


class Fault(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    unavailable: bool


@app.post("/__fixture/outage", dependencies=[Depends(authorize)])
def set_outage(fault: Fault):
    global _outage_until
    # Self-expiry bounds the fault even if an assertion interrupts its reset.
    _outage_until = time.monotonic() + 5.0 if fault.unavailable else 0.0
    return {"injected": fault.unavailable, "maximumSeconds": 5}


uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[2]), access_log=False, log_level="warning")
