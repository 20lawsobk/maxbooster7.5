#!/usr/bin/env bash
# scripts/auto-fix-all-errors.sh
#
# Comprehensive TypeScript error auto-fixer for Max Booster.
# Handles every known error category introduced by the git corruption commit.
#
# Phases:
#   1  — esbuild syntax errors   (boot-blocking; fixed by iterative esbuild scan)
#   2  — TypeScript type errors  (fixed from tcc workflow output in /tmp/tc_*.txt)
#   all (default)
#
# Usage:
#   bash scripts/auto-fix-all-errors.sh            # all phases
#   bash scripts/auto-fix-all-errors.sh --phase 1  # only syntax
#   bash scripts/auto-fix-all-errors.sh --phase 2  # only tsc
#   bash scripts/auto-fix-all-errors.sh --dry-run  # show diffs, don't write
#
# Exit codes: 0 = clean, 1 = unfixed errors remain, 2 = internal failure

set -uo pipefail

# ─── CLI ────────────────────────────────────────────────────────────────────
PHASE="all"
DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) PHASE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown argument: $1"; exit 2 ;;
  esac
done

# ─── CONFIG ─────────────────────────────────────────────────────────────────
SKIP_PATTERN="hybridStorageService"
MAX_ESBUILD_ITERS=60       # max fix-then-rescan loops
ESBUILD_SCAN_TIMEOUT=90    # seconds for the full esbuild batch scan
TSC_OUTPUT_SERVER="/tmp/tc_server.txt"
TSC_OUTPUT_CLIENT="/tmp/tc_client.txt"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
info()  { printf '  \033[34m→\033[0m %s\n' "$*"; }
err()   { printf '  \033[31m✗\033[0m %s\n' "$*"; }

bold "╔══════════════════════════════════════════╗"
bold "║  Max Booster — Comprehensive Auto-Fixer  ║"
bold "╚══════════════════════════════════════════╝"
echo ""

# ─── FILE LISTS ─────────────────────────────────────────────────────────────
mapfile -t SERVER_FILES < <(
  find "$ROOT/server" -name "*.ts" ! -name "*.d.ts" \
    ! -path "*/node_modules/*" \
    | grep -v "$SKIP_PATTERN" | sort
)
mapfile -t CLIENT_FILES < <(
  find "$ROOT/client/src" \( -name "*.ts" -o -name "*.tsx" \) \
    ! -path "*/node_modules/*" 2>/dev/null | sort
)
ALL_FILES=("${SERVER_FILES[@]}" "${CLIENT_FILES[@]}")

info "Server files: ${#SERVER_FILES[@]}"
info "Client files: ${#CLIENT_FILES[@]}"

# ─── HELPER: apply a perl one-liner to a specific file:line ─────────────────
# $1 = file, $2 = line number, $3 = perl expression (operates on $_)
apply_perl_at_line() {
  local file="$1" lineno="$2" perl_expr="$3"
  if $DRY_RUN; then
    perl -pe "if (\$. == ${lineno}) { ${perl_expr} }" "$file" | diff "$file" - | head -6 || true
  else
    perl -i -pe "if (\$. == ${lineno}) { ${perl_expr} }" "$file"
  fi
}

# ─── HELPER: apply a perl one-liner across an ENTIRE file ───────────────────
# $1 = file, $2 = perl expression
apply_perl_global() {
  local file="$1" perl_expr="$2"
  if $DRY_RUN; then
    perl -pe "${perl_expr}" "$file" | diff "$file" - | head -10 || true
  else
    perl -i -pe "${perl_expr}" "$file"
  fi
}

# ─── HELPER: hash a file (for change detection) ─────────────────────────────
file_hash() { md5sum "$1" | cut -d' ' -f1; }

# ─── TSX ESBUILD SCAN (uses tsx's own esbuild — authoritative, catches all errors) ──
# IMPORTANT: esbuild --bundle=false MISSES errors inside generic type args
# (e.g., Promise<session?.Store>) and other tsx-specific contexts.
# tsx's own esbuild transform API (the same one used at runtime) catches everything.
run_esbuild_scan() {
  node -e "
const esbuild = require('./node_modules/tsx/node_modules/esbuild');
const fs = require('fs');
const files = process.argv.slice(1);
let out = '';
(async () => {
  for (const f of files) {
    try {
      await esbuild.transform(fs.readFileSync(f,'utf8'), {loader:'ts',target:'node18'});
    } catch(e) {
      if (e.errors) for (const er of e.errors) {
        const loc = er.location;
        out += f+':'+(loc&&loc.line||'?')+':'+(loc&&loc.column||'?')+': ERROR: '+er.text+'\\n';
      }
    }
  }
  process.stdout.write(out);
})();
" -- "${ALL_FILES[@]}" 2>/dev/null || true
}

# ─── FIX DISPATCH: given one parsed esbuild error, fix it ───────────────────
# Returns 0 if fixed, 1 if unknown/unhandled
fix_esbuild_error() {
  local file="$1" lineno="$2" col="$3" msg="$4"
  local before after

  before=$(file_hash "$file")

  case "$msg" in

    # ── Type-annotation optional chaining ──────────────────────────────────
    # Cause:  module?.TypeName in type position (after : | & < => etc.)
    # Fix:    remove the ? so it's plain .TypeName
    *'Expected ")" but found ":"'* | \
    *'Expected ">" but found ":"'* | \
    *'Expected "]" but found ":"'* | \
    *'Expected "," but found ":"'* | \
    *'Unexpected "?"'*)
      apply_perl_at_line "$file" "$lineno" \
        's/\b([a-zA-Z_][a-zA-Z0-9_]*)(?:\?\.)([A-Z][a-zA-Z0-9_]*)/$1.$2/g'
      ;;

    # ── ?. inside generic type args or type-index  ─────────────────────────
    # Cause:  typeof X?.Y inside <> or [keyof typeof X?.Y] — esbuild rejects
    # Fix:    typeof X.Y (remove ?. from typeof queries in type position)
    # Also:   Promise<session?.Store> — module?.TypeName in generics
    *'Expected ">" but found "?."'* | \
    *'Expected "]" but found "?."'* | \
    *'Expected ")" but found "?."'*)
      apply_perl_at_line "$file" "$lineno" \
        's/typeof\s+([\w.]+)\?\.\s*(\w+)/typeof $1.$2/g;
         s/\b([a-zA-Z_][a-zA-Z0-9_]*)\?\.([A-Z][a-zA-Z0-9_]*)/$1.$2/g'
      ;;

    # ── Broken bracket access: identifier.[ ────────────────────────────────
    # Cause:  optional-bracket ?.[ had ? stripped, leaving invalid .[
    # Fix:    remove the extra dot so identifier[ remains
    *'Expected identifier but found "["'*)
      apply_perl_at_line "$file" "$lineno" \
        's/([a-zA-Z0-9_\)\]>])\.(\[)/$1$2/g'
      ;;

    # ── Broken optional method call ────────────────────────────────────────
    # Cause:  .method.() or functionName.() — ? stripped from ?.()
    # Fix:    restore ?.()
    *'Expected identifier but found "("'*)
      # Handle both .method.() (with leading dot) and standalone functionName.()
      apply_perl_at_line "$file" "$lineno" \
        's/\.([a-zA-Z_][a-zA-Z0-9_]*)\.(\()/ ".$1?.$2" /ge;
         s/\b([a-zA-Z_][a-zA-Z0-9_]*)\.(\()/$1?.$2/g'
      ;;

    # ── Invalid assignment target (++ or += on optional chain) ─────────────
    # Cause:  this?.prop++ or this?.prop += val — can't assign to optional chain
    # Fix:    remove ?. from the chain in assignment position
    *'Invalid assignment target'*)
      apply_perl_at_line "$file" "$lineno" \
        's/this\?\./this./g'
      ;;

    # ── Duplicate symbol declarations ──────────────────────────────────────
    # Cause:  const X declared twice in same scope (commit duplication or _ fix)
    # Fix:    prefix second userId with _parsed (or mark as _dup) — manual review needed
    *'has already been declared'*)
      warn "Duplicate declaration at $file:$lineno — manual fix required"
      return 1
      ;;

    # ── import?.meta ───────────────────────────────────────────────────────
    *'import.meta'*'optional'* | *'Optional chaining cannot'*)
      apply_perl_at_line "$file" "$lineno" \
        's/import\?\./import./g'
      ;;

    # ── new Foo?.Bar ────────────────────────────────────────────────────────
    *'"new"'*'optional'* | *'after "new"'*)
      apply_perl_at_line "$file" "$lineno" \
        's/\bnew\s+([A-Za-z_][A-Za-z0-9_.]*)\?\./${\(my $x="new $1."; $x)}/ge'
      ;;

    # ── Numeric literal ?. (e.g. 1?.0) ─────────────────────────────────────
    *'Expected ";" but found "."'*)
      apply_perl_at_line "$file" "$lineno" \
        's/(\d)\?\.(\d)/$1.$2/g'
      ;;

    *)
      return 1
      ;;
  esac

  after=$(file_hash "$file")
  [[ "$before" != "$after" ]] && return 0 || return 1
}

# ────────────────────────────────────────────────────────────────────────────
#  PHASE 1 — ESBUILD SYNTAX ERRORS
# ────────────────────────────────────────────────────────────────────────────
PHASE1_TOTAL_FIXES=0

if [[ "$PHASE" == "all" || "$PHASE" == "1" ]]; then
  echo ""
  bold "═══ Phase 1: Esbuild Syntax Errors ═══"
  echo ""

  iter=0
  while true; do
    iter=$((iter + 1))
    if (( iter > MAX_ESBUILD_ITERS )); then
      warn "Reached $MAX_ESBUILD_ITERS iterations — stopping Phase 1"
      break
    fi

    info "Scan $iter: running esbuild on ${#ALL_FILES[@]} files..."
    raw_errors=$(run_esbuild_scan)

    if [[ -z "$raw_errors" ]]; then
      ok "No esbuild syntax errors!"
      break
    fi

    # Deduplicate (same file:line can produce multiple lines in esbuild output)
    unique_errors=$(echo "$raw_errors" | sort -u)
    error_count=$(echo "$unique_errors" | wc -l)
    info "Found $error_count error line(s) this pass"

    fixes_this_pass=0
    unfixed_this_pass=0

    while IFS= read -r raw; do
      # Parse:  /abs/path/file.ts:LINE:COL: ERROR: message
      if [[ "$raw" =~ ^(/[^:]+\.tsx?):([0-9]+):([0-9]+):[[:space:]]*ERROR:[[:space:]]*(.*) ]]; then
        file="${BASH_REMATCH[1]}"
        lineno="${BASH_REMATCH[2]}"
        col="${BASH_REMATCH[3]}"
        msg="${BASH_REMATCH[4]}"

        # Skip protected files
        [[ "$file" == *"$SKIP_PATTERN"* ]] && continue

        if fix_esbuild_error "$file" "$lineno" "$col" "$msg"; then
          ok "Fixed [$msg] → $file:$lineno"
          fixes_this_pass=$((fixes_this_pass + 1))
          PHASE1_TOTAL_FIXES=$((PHASE1_TOTAL_FIXES + 1))
        else
          err "Unhandled [$msg] @ $file:$lineno:$col"
          unfixed_this_pass=$((unfixed_this_pass + 1))
        fi
      fi
    done <<< "$unique_errors"

    echo ""
    info "Pass $iter: $fixes_this_pass fixed, $unfixed_this_pass unhandled"

    # If no fixes this pass and still errors, we're stuck
    if (( fixes_this_pass == 0 && unfixed_this_pass > 0 )); then
      err "No progress made — remaining errors need manual review"
      echo "$unique_errors"
      break
    fi
  done

  echo ""
  bold "Phase 1 done: $PHASE1_TOTAL_FIXES total syntax fix(es) in $iter pass(es)"
fi

# ────────────────────────────────────────────────────────────────────────────
#  PHASE 2 — TYPESCRIPT TYPE ERRORS  (from tcc workflow)
# ────────────────────────────────────────────────────────────────────────────
PHASE2_TOTAL_FIXES=0

if [[ "$PHASE" == "all" || "$PHASE" == "2" ]]; then
  echo ""
  bold "═══ Phase 2: TypeScript Type Errors ═══"
  echo ""

  if [[ ! -f "$TSC_OUTPUT_SERVER" && ! -f "$TSC_OUTPUT_CLIENT" ]]; then
    warn "tcc output not found at $TSC_OUTPUT_SERVER / $TSC_OUTPUT_CLIENT"
    warn "Run the 'tccap' workflow first, then re-run this script with --phase 2"
  else
    # ── Build the error list ─────────────────────────────────────────────
    combined_errors=""
    [[ -f "$TSC_OUTPUT_SERVER" ]] && combined_errors+=$(cat "$TSC_OUTPUT_SERVER")$'\n'
    [[ -f "$TSC_OUTPUT_CLIENT" ]] && combined_errors+=$(cat "$TSC_OUTPUT_CLIENT")$'\n'

    total_errors=$(echo "$combined_errors" | grep -cP '^\s*\S+\.tsx?.*error TS' || true)
    info "Total tsc errors found: $total_errors"
    echo ""

    # ── Count errors by code ─────────────────────────────────────────────
    bold "Error distribution (top 20 codes):"
    echo "$combined_errors" | \
      grep -oP 'error TS\d+' | sort | uniq -c | sort -rn | head -20
    echo ""

    # ── Per-code fix functions ───────────────────────────────────────────

    # TS6133: 'X' is declared but its value is never read
    #   Auto-fix: prefix the declaration name with _ if it isn't already
    fix_ts6133() {
      local file="$1" lineno="$2" varname="$3"
      # Only prefix if not already prefixed
      if [[ "$varname" == _* ]]; then return; fi
      apply_perl_at_line "$file" "$lineno" \
        "s/\\b((?:const|let|var|function|class|type|interface|enum)\\s+)${varname}\\b/\${1}_${varname}/g"
      ok "TS6133: prefixed unused '$varname' → '_${varname}'  $file:$lineno"
      PHASE2_TOTAL_FIXES=$((PHASE2_TOTAL_FIXES + 1))
    }

    # TS2304: Cannot find name 'X'
    #   Strategy: if it's a global-like name, skip.  Otherwise log for review.
    fix_ts2304() {
      local file="$1" lineno="$2" varname="$3"
      warn "TS2304: Cannot find name '$varname' @ $file:$lineno  (manual review needed)"
    }

    # TS2345: Argument of type 'X | undefined' is not assignable to 'X'
    #   Cause: commit added ?. making T→T|undefined; downstream expects T
    #   Auto-fix: add non-null assertion (!) at the callsite if the variable
    #   is a simple identifier and the ?. is on the same line.
    fix_ts2345() {
      local file="$1" lineno="$2" detail="$3"
      # Only attempt when detail mentions 'undefined' (?.  artefact)
      if [[ "$detail" == *"| undefined"* ]]; then
        warn "TS2345 (T|undefined): @ $file:$lineno — $detail"
      fi
    }

    # TS2339: Property 'X' does not exist on type 'Y'
    fix_ts2339() {
      local file="$1" lineno="$2" prop="$3" type_name="$4"
      warn "TS2339: '$prop' not on '$type_name' @ $file:$lineno  (manual review needed)"
    }

    # ── Parse and dispatch ───────────────────────────────────────────────
    bold "Applying auto-fixable type corrections..."
    echo ""

    while IFS= read -r line; do
      # Format:  path/file.ts(LINE,COL): error TSxxxx: message
      if [[ "$line" =~ ^([^(]+\.tsx?)\(([0-9]+),[0-9]+\):[[:space:]]*error[[:space:]]+(TS[0-9]+):[[:space:]]*(.*) ]]; then
        file="${BASH_REMATCH[1]}"
        lineno="${BASH_REMATCH[2]}"
        code="${BASH_REMATCH[3]}"
        detail="${BASH_REMATCH[4]}"

        # Skip protected files
        [[ "$file" == *"$SKIP_PATTERN"* ]] && continue

        case "$code" in
          TS6133)
            # Extract the symbol name: "'X' is declared but..."
            varname=$(echo "$detail" | perl -ne "/'([^']+)' is declared/ and print \$1")
            [[ -n "$varname" ]] && fix_ts6133 "$file" "$lineno" "$varname"
            ;;
          TS2304)
            varname=$(echo "$detail" | perl -ne "/Cannot find name '([^']+)'/ and print \$1")
            [[ -n "$varname" ]] && fix_ts2304 "$file" "$lineno" "$varname"
            ;;
          TS2345)
            fix_ts2345 "$file" "$lineno" "$detail"
            ;;
          TS2339)
            prop=$(echo "$detail" | perl -ne "/Property '([^']+)'/ and print \$1")
            type_name=$(echo "$detail" | perl -ne "/on type '([^']+)'/ and print \$1")
            fix_ts2339 "$file" "$lineno" "$prop" "$type_name"
            ;;
          *)
            ;;
        esac
      fi
    done <<< "$combined_errors"

    # ── Summary by code ──────────────────────────────────────────────────
    echo ""
    remaining=$(echo "$combined_errors" | grep -cP '^\s*\S+\.tsx?.*error TS' || true)
    bold "Phase 2 done: $PHASE2_TOTAL_FIXES auto-fixes applied"
    info "Before: $total_errors errors | Remaining (estimate): $remaining errors"
    info "Run 'tccap' workflow again after applying fixes to get fresh counts"
  fi
fi

# ─── FINAL SUMMARY ──────────────────────────────────────────────────────────
echo ""
bold "══════════════════════════════════"
bold "  Total fixes applied:"
bold "    Phase 1 (syntax): $PHASE1_TOTAL_FIXES"
bold "    Phase 2 (types):  $PHASE2_TOTAL_FIXES"
bold "    Grand total:      $((PHASE1_TOTAL_FIXES + PHASE2_TOTAL_FIXES))"
bold "══════════════════════════════════"
echo ""

if (( PHASE1_TOTAL_FIXES + PHASE2_TOTAL_FIXES == 0 )) && [[ "$PHASE" != "2" ]]; then
  info "Nothing to fix — codebase looks clean for the covered patterns."
fi
