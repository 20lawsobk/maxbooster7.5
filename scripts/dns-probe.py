#!/usr/bin/env python3
"""Quick DNS probe — send A query for max-booster.com and print result."""
import socket, struct, sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5353
name = sys.argv[2] if len(sys.argv) > 2 else 'max-booster.com'

def encode_name(n):
    out = b''
    for label in n.rstrip('.').split('.'):
        lb = label.encode()
        out += bytes([len(lb)]) + lb
    return out + b'\x00'

query = (
    b'\xab\xcd'           # ID
    b'\x01\x00'           # flags: RD
    b'\x00\x01'           # QDCOUNT=1
    b'\x00\x00\x00\x00\x00\x00'  # AN/NS/AR=0
    + encode_name(name)
    + b'\x00\x01'         # QTYPE=A
    + b'\x00\x01'         # QCLASS=IN
)

try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(3)
    s.sendto(query, ('127.0.0.1', port))
    data, _ = s.recvfrom(512)
    flags = struct.unpack('>H', data[2:4])[0]
    rcode = flags & 0xF
    aa    = (flags >> 10) & 1
    anc   = struct.unpack('>H', data[6:8])[0]
    print(f'port={port} RCODE={rcode} AA={aa} answers={anc}  ✅' if rcode == 0 else f'port={port} RCODE={rcode}  ❌')
except Exception as e:
    print(f'port={port} ERROR: {e}  ❌')
    sys.exit(1)
