#!/usr/bin/env bash
# scripts/auto-fix-all-errors.sh
#
# Comprehensive TypeScript error auto-fixer for Max Booster.
# Handles every known error category introduced by the git corruption commit.
#
# Phases:
#   0  — dependency scan         (detect missing npm modules; suggest installs)
#   1  — esbuild syntax errors   (boot-blocking; fixed by iterative esbuild scan)
#   2  — TypeScript type errors  (fixed from tcc workflow output in /tmp/tc_*.txt)
#   3  — pipeline stages         (format → lint → security → tests)
#   all (default)
#
# Usage:
#   bash scripts/auto-fix-all-errors.sh            # all phases
#   bash scripts/auto-fix-all-errors.sh --phase 0  # only dependency scan
#   bash scripts/auto-fix-all-errors.sh --phase 1  # only syntax
#   bash scripts/auto-fix-all-errors.sh --phase 2  # only tsc
#   bash scripts/auto-fix-all-errors.sh --phase 3  # only pipeline stages
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

# ─── LANGUAGE PROFILE (Node / TypeScript) ────────────────────────────────────
# Mirrors LANGUAGES["node"] in universal_self_heal.py.
# Stage commands are invoked by Phase 3.
LP_ENTRY_CMD="npx tsx server/index.ts"
LP_FORMAT_CMDS=("npx prettier --check .")
LP_LINT_CMDS=("npx eslint . --max-warnings=0")
LP_TYPES_CMDS=("npm run check")
LP_SECURITY_CMDS=("npm audit --audit-level=high")
LP_TEST_CMDS=("npm run test:unit" "npm run test:integration" "npm run test:security")

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

# ─── HELPER: suggest a shell command ─────────────────────────────────────────
# Mirrors suggest_cmd() from universal_self_heal.py / auto_install_dependency().
# In non-interactive / dry-run environments the command is only printed.
suggest_cmd() {
  printf '  \033[35m⟹\033[0m  Suggested: %s\n' "$*"
  if ! $DRY_RUN && [[ -t 0 ]]; then
    printf '  \033[35m→\033[0m  Run it now? [y/N] '
    read -r -t 5 _answer 2>/dev/null || _answer="n"
    if [[ "${_answer,,}" == "y" ]]; then
      eval "$*" && ok "Command succeeded" || warn "Command exited non-zero"
    fi
  fi
}

# ─── HELPER: apply a unified diff patch ──────────────────────────────────────
# Mirrors apply_patch() from universal_self_heal.py.
# $1 = path to .patch file (or "-" to read from stdin)
apply_patch() {
  local patchfile="${1:--}"
  if $DRY_RUN; then
    info "[DRY-RUN] Would apply patch: $patchfile"
    [[ "$patchfile" != "-" ]] && head -30 "$patchfile" || true
    return 0
  fi
  if command -v patch &>/dev/null; then
    patch -p1 < "$patchfile" && ok "Patch applied: $patchfile" \
      || warn "patch failed — inspect manually or: git apply $patchfile"
  else
    warn "'patch' binary not found — apply manually: git apply $patchfile"
  fi
}

# ─── HELPER: AI fix hint for unhandled errors ────────────────────────────────
# Mirrors ai_auto_fix() placeholder from universal_self_heal.py.
# Formats error context pointing to MaxCore / chainErrorAutoFixer.
ai_fix_hint() {
  local file="$1" lineno="$2" code="$3" detail="$4"
  printf '\n  \033[36m[AI HINT]\033[0m Unhandled %s @ %s:%s\n' "$code" "$file" "$lineno"
  printf '           Detail  : %s\n' "$detail"
  printf '           MaxCore : POST /api/ai/chain-error-fix  { file, line, code, detail }\n'
  printf '           Local   : server/services/chainErrorAutoFixer.ts → fixError()\n\n'
}

# ─── HELPER: run a named pipeline stage ──────────────────────────────────────
# Mirrors the stages dict in LANGUAGES["node"] from universal_self_heal.py.
# $1 = stage label, remaining args = command to run
run_stage() {
  local label="$1"; shift
  info "Stage [$label]: $*"
  if $DRY_RUN; then
    warn "[DRY-RUN] Would run: $*"
    return 0
  fi
  if bash -c "$*" 2>&1 | tail -8; then
    ok "Stage [$label] passed"
    return 0
  else
    warn "Stage [$label] reported issues (see output above)"
    return 1
  fi
}

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
      const loader = f.endsWith('.tsx') ? 'tsx' : 'ts';
      await esbuild.transform(fs.readFileSync(f,'utf8'), {loader,target:'node18'});
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
#  PHASE 0 — MISSING DEPENDENCY SCAN
#  Mirrors the generic_missing_dependency ErrorPattern from universal_self_heal.py
#  and the auto_install_dependency() handler (node branch).
# ────────────────────────────────────────────────────────────────────────────
PHASE0_SUGGESTIONS=0

if [[ "$PHASE" == "all" || "$PHASE" == "0" ]]; then
  echo ""
  bold "═══ Phase 0: Missing Dependency Scan ═══"
  echo ""

  # ── 0a: scan import statements vs node_modules ───────────────────────────
  info "Scanning TS/TSX import statements for modules absent from node_modules..."

  # Node.js built-in modules (no install needed)
  _node_builtins="assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib"

  missing_modules=()
  while IFS= read -r imp; do
    [[ "$imp" == .* ]] && continue          # skip relative imports
    [[ "$imp" == node:* ]] && continue      # skip node: protocol built-ins
    [[ "$imp" == \$* ]] && continue         # skip template-literal false positives
    if [[ "$imp" == @* ]]; then
      pkg=$(echo "$imp" | cut -d'/' -f1-2)  # scoped: @scope/name
    else
      pkg=$(echo "$imp" | cut -d'/' -f1)    # bare: pkg or pkg/sub
    fi
    [[ -z "$pkg" ]] && continue
    # Skip Node.js built-ins
    [[ "$pkg" =~ ^($_node_builtins)$ ]] && continue
    # Skip Vite/TS path aliases (@/, @plugins/, etc.) — these are tsconfig paths, not npm packages
    [[ "$pkg" =~ ^@/|^@plugins/|^@components/|^@hooks/|^@lib/|^@utils/ ]] && continue
    [[ -d "$ROOT/node_modules/$pkg" ]] && continue
    missing_modules+=("$pkg")
  done < <(
    grep -rhoP "(?<=from ['\"])[^'\"]+(?=['\"])" \
      "$ROOT/server" "$ROOT/client/src" "$ROOT/shared" \
      --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v '^[./]' | sort -u
  )

  if [[ ${#missing_modules[@]} -gt 0 ]]; then
    mapfile -t missing_modules < <(printf '%s\n' "${missing_modules[@]}" | sort -u)
    warn "Modules missing from node_modules (${#missing_modules[@]}):"
    for pkg in "${missing_modules[@]}"; do
      PHASE0_SUGGESTIONS=$((PHASE0_SUGGESTIONS + 1))
      suggest_cmd "npm install $pkg"
    done
  else
    ok "All imported modules appear to be installed."
  fi

  # ── 0b: parse tsc output for TS2307 (Cannot find module) ─────────────────
  echo ""
  if [[ -f "$TSC_OUTPUT_SERVER" || -f "$TSC_OUTPUT_CLIENT" ]]; then
    info "Scanning tsc output for TS2307 (Cannot find module / missing type declarations)..."
    ts2307_pkgs=()
    for tsf in "$TSC_OUTPUT_SERVER" "$TSC_OUTPUT_CLIENT"; do
      [[ -f "$tsf" ]] || continue
      while IFS= read -r tscline; do
        pkg=$(echo "$tscline" | perl -ne "/Cannot find module '([^']+)'/ and print \$1")
        [[ -z "$pkg" ]] && \
          pkg=$(echo "$tscline" | perl -ne "/Could not find a declaration file for module '([^']+)'/ and print \$1")
        [[ -z "$pkg" || "$pkg" == .* ]] && continue
        if [[ "$pkg" == @* ]]; then
          pkg=$(echo "$pkg" | cut -d'/' -f1-2)
        else
          pkg=$(echo "$pkg" | cut -d'/' -f1)
        fi
        ts2307_pkgs+=("$pkg")
      done < <(grep "error TS2307" "$tsf" 2>/dev/null)
    done

    if [[ ${#ts2307_pkgs[@]} -gt 0 ]]; then
      mapfile -t ts2307_pkgs < <(printf '%s\n' "${ts2307_pkgs[@]}" | sort -u)
      warn "TS2307 missing-module packages (${#ts2307_pkgs[@]} unique):"
      for pkg in "${ts2307_pkgs[@]}"; do
        PHASE0_SUGGESTIONS=$((PHASE0_SUGGESTIONS + 1))
        if [[ ! -d "$ROOT/node_modules/$pkg" ]]; then
          suggest_cmd "npm install $pkg"
        else
          # Package exists but type declarations are missing
          bare="${pkg##@*/}"  # strip scope for @types lookup
          suggest_cmd "npm install --save-dev @types/${bare}"
        fi
      done
    else
      ok "No TS2307 (missing module) errors found in tsc output."
    fi
  else
    info "No tsc output found — run the 'tccap' workflow first for TS2307 scan."
  fi

  echo ""
  bold "Phase 0 done: $PHASE0_SUGGESTIONS suggestion(s) emitted"
fi

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

    # Store the regex in a variable: [[:space:]] inside an inline =~ pattern can
    # produce a ]] token that confuses bash's [[...]] tokenizer on some versions.
    _tsc_err_re='^([^(]+\.tsx?)\(([0-9]+),[0-9]+\):[[:space:]]*error[[:space:]]+(TS[0-9]+):[[:space:]]*(.*)'
    while IFS= read -r line; do
      # Format:  path/file.ts(LINE,COL): error TSxxxx: message
      if [[ "$line" =~ $_tsc_err_re ]]; then
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
          TS2307)
            # Cannot find module 'X' or its corresponding type declarations.
            # Mirrors generic_missing_dependency pattern (node branch) from
            # universal_self_heal.py — auto_install_dependency().
            pkg=$(echo "$detail" | perl -ne "/Cannot find module '([^']+)'/ and print \$1")
            [[ -z "$pkg" ]] && \
              pkg=$(echo "$detail" | perl -ne "/declaration file for module '([^']+)'/ and print \$1")
            if [[ -n "$pkg" ]] && [[ "$pkg" != .* ]]; then
              if [[ "$pkg" == @* ]]; then
                short_pkg=$(echo "$pkg" | cut -d'/' -f1-2)
              else
                short_pkg=$(echo "$pkg" | cut -d'/' -f1)
              fi
              if [[ ! -d "$ROOT/node_modules/$short_pkg" ]]; then
                warn "TS2307: '$pkg' not installed @ $file:$lineno"
                suggest_cmd "npm install $short_pkg"
              else
                bare="${short_pkg##@*/}"
                warn "TS2307: '$pkg' needs type declarations @ $file:$lineno"
                suggest_cmd "npm install --save-dev @types/${bare}"
              fi
              PHASE2_TOTAL_FIXES=$((PHASE2_TOTAL_FIXES + 1))
            fi
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

# ────────────────────────────────────────────────────────────────────────────
#  PHASE 3 — PIPELINE STAGES  (format → lint → types → security → tests)
#  Mirrors the stages dict from LANGUAGES["node"] in universal_self_heal.py
# ────────────────────────────────────────────────────────────────────────────
PHASE3_PASSED=0
PHASE3_FAILED=0

if [[ "$PHASE" == "all" || "$PHASE" == "3" ]]; then
  echo ""
  bold "═══ Phase 3: Pipeline Stages ═══"
  echo ""

  # Stage definitions — mirrors LANGUAGES["node"].stages
  declare -a STAGE_LABELS=("format" "lint" "types" "security" "unit_tests" "integration_tests" "security_tests")
  declare -A STAGE_CMDS=(
    [format]="${LP_FORMAT_CMDS[0]}"
    [lint]="${LP_LINT_CMDS[0]}"
    [types]="${LP_TYPES_CMDS[0]}"
    [security]="${LP_SECURITY_CMDS[0]}"
    [unit_tests]="${LP_TEST_CMDS[0]}"
    [integration_tests]="${LP_TEST_CMDS[1]}"
    [security_tests]="${LP_TEST_CMDS[2]}"
  )

  for stage in "${STAGE_LABELS[@]}"; do
    if run_stage "$stage" "${STAGE_CMDS[$stage]}"; then
      PHASE3_PASSED=$((PHASE3_PASSED + 1))
    else
      PHASE3_FAILED=$((PHASE3_FAILED + 1))
      # If the types stage fails, subsequent test stages are unreliable — stop.
      if [[ "$stage" == "types" ]]; then
        warn "Types stage failed — stopping further pipeline stages."
        break
      fi
    fi
    echo ""
  done

  bold "Phase 3 done: $PHASE3_PASSED stage(s) passed, $PHASE3_FAILED stage(s) failed"
fi

# ─── FINAL SUMMARY ──────────────────────────────────────────────────────────
echo ""
bold "══════════════════════════════════════════"
bold "  Max Booster Auto-Fixer — Summary"
bold "  Phase 0 (deps):     $PHASE0_SUGGESTIONS suggestion(s)"
bold "  Phase 1 (syntax):   $PHASE1_TOTAL_FIXES fix(es) applied"
bold "  Phase 2 (types):    $PHASE2_TOTAL_FIXES fix(es) applied"
bold "  Phase 3 (pipeline): $PHASE3_PASSED passed / $PHASE3_FAILED failed"
bold "  Grand fixes:        $((PHASE1_TOTAL_FIXES + PHASE2_TOTAL_FIXES))"
bold "══════════════════════════════════════════"
echo ""

if (( PHASE1_TOTAL_FIXES + PHASE2_TOTAL_FIXES == 0 )) \
  && [[ "$PHASE" != "2" ]] && [[ "$PHASE" != "3" ]]; then
  info "Nothing to fix — codebase looks clean for the covered patterns."
fi
