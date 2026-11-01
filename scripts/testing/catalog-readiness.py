#!/usr/bin/env python3
"""Publish every recorded readiness gap without asserting unearned closure."""
import argparse
import datetime
import hashlib
import html
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def build_catalog(source, destination):
    raw = source.read_bytes()
    original = json.loads(raw)
    items = original["items"]
    if not items:
        raise ValueError("Refusing to label an empty gap inventory as production-ready")
    if len({item["id"] for item in items}) != len(items):
        raise ValueError("Gap identifiers must be unique")
    for item in items:
        if not item.get("actions") or not item.get("requiredEvidence"):
            raise ValueError(f"Missing remediation or closure contract: {item['id']}")
    counts = dict(Counter(item["kind"] for item in items))
    document = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "productionReady": False,
        "scope": "Every item in the supplied historical remediation report; not an exhaustive discovery of every possible defect.",
        "sourceReport": str(source),
        "sourceReportSha256": hashlib.sha256(raw).hexdigest(),
        "countsByKind": counts,
        "limitations": [
            "Original automated diagnoses are hypotheses unless independently confirmed.",
            "Historical failures may have later passing rechecks; this catalog does not overwrite either receipt.",
            "Execution coverage is not proof of correct feature behavior.",
            "No entry is closed automatically by generating this catalog.",
        ],
        "items": items,
    }
    esc = lambda text: html.escape(str(text))
    rows = []
    for item in sorted(items, key=lambda row: (row["priority"], row["kind"], row["file"], row["id"])):
        steps = "".join(f"<li>{esc(step)}</li>" for step in item["actions"])
        proof = "".join(f"<li>{esc(step)}</li>" for step in item["requiredEvidence"])
        rows.append(
            f'<details><summary><b>P{item["priority"]} · {esc(item["kind"])}</b> '
            f'{esc(item["file"])} — {esc(item["case"])}</summary>'
            f'<p><code>{esc(item["id"])}</code> · Historical status: {esc(item["status"])}</p>'
            f'<p><strong>Reported observation:</strong> {esc(item["observed"])}</p>'
            f'<p><strong>Automated diagnosis—not independently established here:</strong> '
            f'{esc(item.get("diagnosis", {}).get("description", ""))}</p>'
            f'<h3>Required work</h3><ol>{steps}</ol><h3>Required closure evidence</h3><ul>{proof}</ul>'
            f'<p><strong>Reproduction:</strong> <code>{esc(item["reproduce"]["command"])}</code></p>'
            f'<p><strong>Evidence:</strong> <code>{esc(item["evidence"])}</code></p></details>'
        )
    page = """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Max Booster readiness gap catalog</title>
<style>body{max-width:1150px;margin:35px auto;padding:0 22px;font:15px/1.55 system-ui;color:#172337;background:#f6f8fb}
details{padding:14px;background:white;border:1px solid #d6dfeb;margin:10px 0;overflow-wrap:anywhere}
summary{cursor:pointer}input{padding:12px;width:95%;font:inherit}code{overflow-wrap:anywhere}
.notice{padding:18px;border-left:5px solid #b66b16;background:#fff4df}h3{margin-bottom:4px}</style>
<h1>Readiness gap catalog</h1><p class="notice"><strong>Production readiness is not established.</strong>
This catalog includes every item from the historical remediation report, with the work and evidence it requires.
It preserves hypotheses as hypotheses. Some items have later rechecks; this historical catalog does not erase failures or assert fresh verification.</p>
"""
    page += f"<p>{len(items):,} entries · {esc(counts)}</p>"
    page += '<label for="search">Filter by feature, source file, error, or prerequisite</label><p><input id="search" type="search"></p><p id="matches" aria-live="polite"></p>'
    page += '<main>' + "".join(rows) + '</main>'
    page += """<script>const rows=[...document.querySelectorAll('details')];
const indexed=rows.map(row=>row.textContent.toLowerCase());
document.getElementById('search').addEventListener('input',event=>{
const q=event.target.value.toLowerCase();let count=0;
rows.forEach((row,i)=>{row.hidden=!indexed[i].includes(q);if(!row.hidden)count++;});
document.getElementById('matches').textContent=count+' matching entries';});</script></html>"""
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "readiness-catalog.json").write_text(json.dumps(document, indent=2) + "\n")
    (destination / "readiness-catalog.html").write_text(page)
    return len(items)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    print(f"Cataloged {build_catalog(args.input, args.output)} gaps; production readiness remains unverified.")
