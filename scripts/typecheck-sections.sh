#!/usr/bin/env bash
# Sectioned server typecheck — runs tsc over one section of server/ per
# invocation so each run stays inside the ~5-minute shell window.
#
# Why not one big run: a full `tsc -p tsconfig.server.json` takes longer than
# the shell time limit and gets killed (or the container recycles), so the
# result is never captured. Each section run IS a full-fidelity check for the
# files in that section (the compiler still loads their dependency graph), so
# per-section error counts are authoritative for those files.
#
# Usage:
#   scripts/typecheck-sections.sh            # run next unfinished section
#   scripts/typecheck-sections.sh all        # loop sections until time-safe budget spent
#   scripts/typecheck-sections.sh reset      # clear state, start over
#   scripts/typecheck-sections.sh report     # aggregate counts from completed sections
#
# State/output: .cache/tc-sections/<section>.txt  (+ .done markers)
set -uo pipefail
cd "$(dirname "$0")/.."

OUT=.cache/tc-sections
mkdir -p "$OUT"

# Section → glob(s). Keep each section small enough for a ~3–4 min run.
SECTIONS=(
  "lib:server/lib"
  "middleware:server/middleware"
  "routes-a:server/routes/[a-f]*.ts"
  "routes-b:server/routes/[g-r]*.ts"
  "routes-c:server/routes/[s-z]*.ts server/routes/api"
  "services-a:server/services/[a-c]*.ts"
  "services-b:server/services/[d-l]*.ts"
  "services-c:server/services/[m-r]*.ts"
  "services-d:server/services/[s-z]*.ts"
  "workers-realtime:server/workers server/realtime server/infrastructure"
  "top:server/*.ts"
  "modules:server/modules"
  "pdim-storage:server/pocket-dimension server/subatomic server/storage"
  "misc-a:server/compliance server/config server/diffusion-gateway server/migrations server/monitoring server/api"
  "misc-b:server/reliability server/safety server/schemas server/scripts server/seed server/types server/utils"
  "tests-sims:server/tests server/simulations"
  "shared-root:shared *.ts"
)

section_files() {
  # shellcheck disable=SC2086
  for g in $1; do
    if [ -d "$g" ]; then find "$g" -name '*.ts' -not -name '*.test.ts'; else ls $g 2>/dev/null; fi
  done | sort -u
}

run_section() {
  local name="$1" globs="$2"
  local files; files=$(section_files "$globs")
  [ -z "$files" ] && { echo "[$name] no files"; touch "$OUT/$name.done"; return 0; }
  echo "[$name] checking $(echo "$files" | wc -l) files..."
  # 'paths' cannot be passed on the CLI (TS6064), so generate a per-section
  # tsconfig that extends the real server config and overrides only 'files'.
  # 'incremental' must be off: file lists differ per section, and stale
  # tsbuildinfo produced the earlier invalid zero-error reading.
  FILES_LIST="$files" SECTION="$name" node -e '
    const fs = require("fs");
    const files = process.env.FILES_LIST.trim().split("\n").map(f => "../../" + f);
    fs.writeFileSync(`.cache/tc-sections/${process.env.SECTION}.tsconfig.json`, JSON.stringify({
      extends: "../../tsconfig.server.json",
      compilerOptions: { noEmit: true, incremental: false, tsBuildInfoFile: null },
      files,
      include: []
    }, null, 2));
  '
  node --max-old-space-size=3400 ./node_modules/typescript/bin/tsc \
    -p "$OUT/$name.tsconfig.json" --pretty false > "$OUT/$name.txt" 2>&1
  rc=$?
  # tsc exits 0 (clean) or 1/2 (diagnostics emitted). >2 or 130+ means the
  # compiler was killed or crashed — the section did NOT complete and must not
  # be marked done, or the report would silently undercount.
  if [ $rc -gt 2 ]; then
    echo "[$name] tsc exited $rc (killed/crashed) — section NOT marked done"
    return 1
  fi
  # Only count errors belonging to THIS section's files (dep-graph errors from
  # other sections are counted when their own section runs).
  local count
  count=$(grep -c 'error TS' "$OUT/$name.txt" || true)
  local own
  own=$(echo "$files" | sed 's/[].[*+?^${}()|\\/]/\\&/g' | paste -sd'|' - | \
        xargs -I{} grep -cE '^({})' "$OUT/$name.txt" 2>/dev/null || echo "$count")
  echo "[$name] total-lines-with-errors=$count own-file-errors=$own"
  touch "$OUT/$name.done"
}

case "${1:-next}" in
  reset)  rm -rf "$OUT"; mkdir -p "$OUT"; echo "state cleared";;
  report)
    incomplete=0
    for s in "${SECTIONS[@]}"; do
      name="${s%%:*}"
      if [ -f "$OUT/$name.done" ]; then
        c=$(grep -c 'error TS' "$OUT/$name.txt" 2>/dev/null || echo 0)
        echo "$name: $c error lines (incl. dep-graph errors from other sections)"
      else
        echo "$name: (not run)"; incomplete=1
      fi
    done
    # Authoritative total: dedupe identical error lines across ALL sections so
    # dependency-graph errors are counted exactly once.
    dedup=$(cat "$OUT"/*.txt 2>/dev/null | grep 'error TS' | sed 's|^\.\./\.\./||' | sort -u | wc -l)
    if [ $incomplete -eq 1 ]; then
      echo "AUTHORITATIVE TOTAL: unavailable — sections missing (deduped partial: $dedup)"
    else
      echo "AUTHORITATIVE TOTAL (deduped across sections): $dedup"
    fi;;
  all)
    start=$(date +%s)
    for s in "${SECTIONS[@]}"; do
      name="${s%%:*}"; globs="${s#*:}"
      [ -f "$OUT/$name.done" ] && continue
      run_section "$name" "$globs"
      # stay under the shell window: stop after ~3.5 min of budget
      now=$(date +%s); [ $((now-start)) -gt 210 ] && { echo "budget spent — rerun to continue"; exit 0; }
    done
    echo "all sections complete";;
  next|*)
    for s in "${SECTIONS[@]}"; do
      name="${s%%:*}"; globs="${s#*:}"
      [ -f "$OUT/$name.done" ] && continue
      run_section "$name" "$globs"
      exit 0
    done
    echo "all sections complete — run 'report'";;
esac
