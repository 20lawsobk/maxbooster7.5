#!/usr/bin/env python3
"""Verify retained producer foundation bytes without executing fixtures."""
import hashlib,json
from pathlib import Path
base=Path(__file__).resolve().parent
manifest=json.loads((base/'manifest.json').read_text())
for item in manifest['members']:
 p=base/item['path']
 assert not p.is_symlink() and p.is_file(),item['path']
 data=p.read_bytes()
 assert len(data)==item['bytes'] and hashlib.sha256(data).hexdigest()==item['sha256'],item['path']
print(json.dumps({'status':'passed','verifiedMembers':len(manifest['members']),'scope':'Byte preservation only, no application execution or coverage credit'}))
