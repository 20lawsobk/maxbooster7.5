"""Safety checks shared by the disposable production rehearsal."""
import os
import errno
from pathlib import Path
import socket
import time


def native_binary(source):
    """Use the same precedence as start.sh; a complete fixture cannot omit it."""
    for relative in ("bin/boosterstate", "boosterstate/target/release/boosterstate"):
        candidate = Path(source) / relative
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return Path(relative)
    raise RuntimeError("Production fixture requires executable boosterstate; build it first")


def wait_ports_released(ports, timeout=15):
    """Check both IPv4 and IPv6 listeners; never kill an unrelated process."""
    deadline = time.monotonic() + timeout
    while True:
        occupied = []
        for port in ports:
            for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
                try:
                    sock = socket.socket(family)
                except OSError as error:
                    if family == socket.AF_INET6 and error.errno == errno.EAFNOSUPPORT:
                        continue
                    raise
                with sock:
                    sock.settimeout(0.15)
                    if sock.connect_ex((host, port)) == 0:
                        occupied.append(port)
        if not occupied:
            return
        if time.monotonic() >= deadline:
            raise RuntimeError(f"Production shutdown leaked listening ports: {sorted(set(occupied))}")
        time.sleep(0.1)
