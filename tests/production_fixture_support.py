"""Safety checks shared by the disposable production rehearsal."""
import os
import errno
from pathlib import Path
import socket
import time


def udp_port_bound(port, table_paths=("/proc/net/udp", "/proc/net/udp6")):
    """Detect an unconnected UDP listener from Linux's socket tables."""
    expected = f"{port:04X}"
    inspected = False
    for table_path in table_paths:
        try:
            lines = Path(table_path).read_text().splitlines()[1:]
        except OSError:
            continue
        inspected = True
        for line in lines:
            columns = line.split()
            if len(columns) < 4:
                continue
            local_port = columns[1].rsplit(":", 1)[-1].upper()
            if local_port == expected and columns[3] == "07":
                return True
    if not inspected:
        raise RuntimeError("Cannot inspect Linux UDP socket tables; refusing to report released ports")
    return False


def native_binary(source):
    """Use the same precedence as start.sh; a complete fixture cannot omit it."""
    for relative in ("bin/boosterstate", "boosterstate/target/release/boosterstate"):
        candidate = Path(source) / relative
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return Path(relative)
    raise RuntimeError("Production fixture requires executable boosterstate; build it first")


def wait_ports_released(ports, timeout=15, udp_ports=()):
    """Check TCP and selected UDP listeners; never kill an unrelated process."""
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
        occupied.extend(port for port in udp_ports if udp_port_bound(port))
        if not occupied:
            return
        if time.monotonic() >= deadline:
            raise RuntimeError(f"Production shutdown leaked listening ports: {sorted(set(occupied))}")
        time.sleep(0.1)
