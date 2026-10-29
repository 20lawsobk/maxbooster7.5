#!/usr/bin/env python3
"""Read-only verification of copied candidate evidence and referenced executions.

Run from any prepared checkout. This checks retained bytes and explicit counts;
it does not run product tests, modify receipts or promote acceptance statuses.
"""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def admitted(repo, name):
    relative = Path(name)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Evidence path is not repository-relative')
    path = repo / relative
    if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(repo):
        raise ValueError('Evidence is absent, redirected or outside the checkout: ' + name)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    repo = args.repo.resolve()
    base = Path(__file__).resolve().parent
    records = json.loads((base / 'copied-files.json').read_text())
    receipt = json.loads((base / 'receipt.json').read_text())
    wanted_prefixes = {row['destination'] + '/' for row in receipt['cohorts']}
    identities = set()
    size = 0
    for row in records['records']:
        name = row['destination']
        if name in identities or not any(name.startswith(prefix) for prefix in wanted_prefixes):
            raise ValueError('Duplicate or unadmitted copied path: ' + name)
        identities.add(name)
        path = admitted(repo, name)
        if path.stat().st_size != row['bytes'] or digest(path) != row['sha256']:
            raise ValueError('Copied evidence bytes changed: ' + name)
        if row['bytes'] >= 100 * 1024 * 1024:
            raise ValueError('Oversized retained artifact: ' + name)
        size += row['bytes']
    if len(identities) != receipt['copiedFiles'] or size != receipt['copiedBytes']:
        raise ValueError('Copy inventory total mismatch')
    for row in receipt['referencedReceiptHashes']:
        path = admitted(repo, row['path'])
        if path.stat().st_size != row['bytes'] or digest(path) != row['sha256']:
            raise ValueError('Referenced execution receipt changed: ' + row['path'])
    http = admitted(repo, 'reports/platform-evidence/2026-10-29-main-access-policy/http/integration.junit.xml')
    beat = admitted(repo, 'reports/platform-evidence/2026-10-29-integration-rechecks/commerce/legacy-beat.xml')
    for path, wanted in ((http, 110), (beat, 14)):
        leaves = list(ET.parse(path).getroot().iter('testcase'))
        if len(leaves) != wanted or any(any(case.find(tag) is not None for tag in ('failure', 'error', 'skipped')) for case in leaves):
            raise ValueError('Retained execution leaf counts differ: ' + str(path.relative_to(repo)))
    print(json.dumps({'status': 'PASS', 'copiedFiles': len(identities), 'copiedBytes': size,
                      'referencedExecutions': 2, 'productionReady': False,
                      'scope': 'Retained-byte verification only; no product tests or acceptance promotion'}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
