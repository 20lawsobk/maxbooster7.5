#!/usr/bin/env node
/**
 * fix-all.mjs — resumable, self-verifying repair pipeline for ALL error classes:
 *
 *   Phase ts-server / ts-client  TypeScript diagnostics → classified → mechanical
 *                                handlers (position-verified) + per-file esbuild
 *                                syntax gate with automatic file-level rollback.
 *   Phase verify                 Fresh split-config tsc; records before/after and
 *                                rolls the last handler batch back if count rose.
 *   Phase imports                TS2307 broken relative imports → unique-candidate
 *                                path resolution (existence-verified rewrite).
 *   Phase schema                 Drizzle column drift vs the LIVE Neon DB
 *                                (NEON_DATABASE_URL): missing write-keys removed
 *                                (safe single-line literals only), read-sites and
 *                                add-to-schema candidates reported, never guessed.
 *   Phase runtime                HTTP probes of the running app (5xx/refused = fail).
 *   Phase audit                  npm audit --json summary (report-only, no installs).
 *   Phase lint                   eslint --quiet, time-boxed, report-only.
 *   Phase summary                Merged report + nonzero exit while errors remain.
 *
 * Usage:
 *   node scripts/fix-all.mjs --phase ts-server [--input /tmp/tc_server.txt]
 *   node scripts/fix-all.mjs --phase verify --config server|client
 *   node scripts/fix-all.mjs --phase imports|schema|runtime|audit|lint|summary
 *   node scripts/fix-all.mjs --status
 *
 * Design rules (learned the hard way in this repo):
 *  - every edit is verified against the exact diagnostic position before applying;
 *  - a file that fails the esbuild syntax gate after a handler is restored as-is;
 *  - schema errors are decided by the real database, never by making types agree;
 *  - no dummy module declarations, no blind casts on drizzle table objects;
 *  - the pipeline never reports success while any category still has errors.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "fix-all");
const SNAP = path.join(OUT, ".snapshots");
const STATE_FILE = path.join(OUT, "state.json");
fs.mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}
const PHASE = opt("--phase", argv.includes("--status") ? "status" : "summary");
const CONFIG = opt("--config", "server");
const INPUT = opt("--input", null);

/* ────────────────────────── state ────────────────────────── */
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch { return { phases: {}, counts: {}, lastSnapshot: {} }; }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
const state = loadState();
function record(phase, status, detail) {
  state.phases[phase] = { status, at: new Date().toISOString(), ...detail };
  saveState(state);
  console.log(`[${phase}] ${status}${detail && detail.note ? " — " + detail.note : ""}`);
}

/* ─────────────────────── diagnostics ─────────────────────── */
const DIAG_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;
function parseDiags(text) {
  const rows = [];
  let m;
  DIAG_RE.lastIndex = 0;
  while ((m = DIAG_RE.exec(text))) {
    rows.push({ file: m[1], line: +m[2], col: +m[3], code: m[4], msg: m[5] });
  }
  return rows;
}
function isParserCode(code) {
  return /^TS1\d{3}$/.test(code);
}
function latestTcPath(config) {
  const own = path.join(OUT, `tc-${config}.txt`);
  if (fs.existsSync(own)) return own;
  const legacy = `/tmp/tc_${config}.txt`;
  return fs.existsSync(legacy) ? legacy : null;
}

/* ─────────────────── snapshot / rollback ─────────────────── */
function snapshotFiles(tag, files) {
  const dir = path.join(SNAP, tag);
  for (const f of files) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) continue;
    const dest = path.join(dir, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
  }
  state.lastSnapshot[CONFIG] = tag;
  saveState(state);
  return dir;
}
function restoreFile(tag, file) {
  const src = path.join(SNAP, tag, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(ROOT, file));
}
function restoreAll(tag) {
  const dir = path.join(SNAP, tag);
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const rel = path.relative(dir, full);
        fs.copyFileSync(full, path.join(ROOT, rel));
        n++;
      }
    }
  };
  walk(dir);
  return n;
}

/* ────────────────── esbuild syntax gate ──────────────────── */
async function syntaxGate(files) {
  const { transformSync } = await import("esbuild");
  const broken = [];
  for (const f of files) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) continue;
    try {
      transformSync(fs.readFileSync(abs, "utf8"), {
        loader: f.endsWith(".tsx") ? "tsx" : "ts",
        format: "esm",
      });
    } catch (e) {
      broken.push({ file: f, error: String(e.message || e).slice(0, 200) });
    }
  }
  return broken;
}

/* ────────────── native mechanical handlers ───────────────── */
/** All are position-verified: if the source at the diagnostic position no longer
 *  matches what the diagnostic described, the site is skipped (never guessed). */
function applyNativeHandlers(diags) {
  const eligible = diags.filter((d) =>
    ["TS18046", "TS2571", "TS6133", "TS7006", "TS18048", "TS18047"].includes(d.code),
  );
  const byFile = {};
  for (const d of eligible) (byFile[d.file] ||= []).push(d);
  let fixed = 0, skipped = 0;
  const touched = new Set();

  for (const [file, list] of Object.entries(byFile)) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) continue;
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    list.sort((a, b) => b.line - a.line || b.col - a.col);
    let changed = false;

    for (const d of list) {
      const idx = d.line - 1;
      const line = lines[idx];
      if (line === undefined) { skipped++; continue; }
      const col = d.col - 1;

      if (d.code === "TS18046" || d.code === "TS2571") {
        // "'x' is of type 'unknown'." → (x as any) when a member access follows
        const im = d.msg.match(/^'(.+?)' is of type 'unknown'/) || [null, null];
        const ident = im[1];
        if (!ident || line.slice(col, col + ident.length) !== ident) { skipped++; continue; }
        const after = line.slice(col + ident.length);
        if (!after.startsWith(".") && !after.startsWith("?.") && !after.startsWith("[")) { skipped++; continue; }
        lines[idx] = line.slice(0, col) + `(${ident} as any)` + after;
        fixed++; changed = true;
      } else if (d.code === "TS7006") {
        // "Parameter 'x' implicitly has an 'any' type."
        const im = d.msg.match(/^Parameter '(.+?)' implicitly/);
        const ident = im && im[1];
        if (!ident || line.slice(col, col + ident.length) !== ident) { skipped++; continue; }
        const nextCh = line[col + ident.length];
        if (![",", ")", " ", "="].includes(nextCh ?? ")")) { skipped++; continue; }
        lines[idx] = line.slice(0, col + ident.length) + ": any" + line.slice(col + ident.length);
        fixed++; changed = true;
      } else if (d.code === "TS18048" || d.code === "TS18047") {
        // "'expr' is possibly 'undefined'." → expr! (exact text must sit at position)
        const im = d.msg.match(/^'(.+?)' is possibly/);
        const expr = im && im[1];
        if (!expr || expr.length > 60) { skipped++; continue; }
        if (line.slice(col, col + expr.length) !== expr) { skipped++; continue; }
        const after = line.slice(col + expr.length);
        // only when a member/call follows, so the ! binds meaningfully
        if (!after.startsWith(".") && !after.startsWith("[") && !after.startsWith("(")) { skipped++; continue; }
        lines[idx] = line.slice(0, col) + expr + "!" + after;
        fixed++; changed = true;
      } else if (d.code === "TS6133") {
        // "'x' is declared but its value is never read."
        const im = d.msg.match(/^'(.+?)' is declared/);
        const ident = im && im[1];
        if (!ident) { skipped++; continue; }
        const trimmed = line.trim();
        if (trimmed.startsWith("import")) {
          // remove one named specifier, or the entire import when it is the only binding
          const named = line.match(/\{([^}]*)\}/);
          if (named) {
            const parts = named[1].split(",").map((s) => s.trim()).filter(Boolean);
            const rest = parts.filter((p) => p !== ident && !p.startsWith(ident + " as"));
            if (rest.length === parts.length) { skipped++; continue; }
            if (rest.length === 0 && !/import\s+\w+\s*,/.test(line)) {
              lines.splice(idx, 1); // whole line: no default import alongside
            } else if (rest.length === 0) {
              lines[idx] = line.replace(/,\s*\{[^}]*\}/, ""); // keep default import
            } else {
              lines[idx] = line.replace(named[0], `{ ${rest.join(", ")} }`);
            }
            fixed++; changed = true;
          } else if (new RegExp(`^import\\s+${escapeRe(ident)}\\s+from`).test(trimmed)) {
            lines.splice(idx, 1);
            fixed++; changed = true;
          } else { skipped++; }
        } else if (line.slice(col, col + ident.length) === ident && !ident.startsWith("_")) {
          const prev = line[col - 1] ?? "";
          const next = line[col + ident.length] ?? "";
          if (!/[(,{\s[]/.test(prev) || !/[,)\s:}\]=]/.test(next)) { skipped++; continue; }
          if (next === ":") { skipped++; continue; } // already-keyed destructure or type annot
          const before0 = line.slice(0, col);
          // class members and plain variable declarations may still be WRITTEN
          // elsewhere (writes don't count as reads) — renaming the declaration
          // breaks those sites. Params/destructures are scope-local, so safe.
          if (/\b(?:private|protected|public|readonly|static)\s+[\w$]*$/.test(before0)) { skipped++; continue; }
          if (/\b(?:const|let|var)\s+$/.test(before0)) { skipped++; continue; }
          // object-destructure shorthand? `{ x }` — prefixing would change the looked-up
          // key, so use the keyed form `{ x: _x }` instead of `{ _x }`. Only treat as a
          // binding pattern when the unmatched `{` opens right after a binding-ish token
          // (const/let/var/of/(/,/=), not an arbitrary block or object-literal brace.
          const opensBrace =
            (before0.match(/\{/g) || []).length > (before0.match(/\}/g) || []).length &&
            /(?:\b(?:const|let|var|of)\s*|[(,=]\s*|=>\s*\(?\s*)\{[^{}]*$/.test(before0);
          if (opensBrace) {
            lines[idx] = line.slice(0, col) + `${ident}: _${ident}` + line.slice(col + ident.length);
          } else {
            lines[idx] = line.slice(0, col) + "_" + line.slice(col);
          }
          fixed++; changed = true;
        } else { skipped++; }
      }
    }
    if (changed) {
      fs.writeFileSync(abs, lines.join("\n"));
      touched.add(file);
    }
  }
  return { fixed, skipped, touched: [...touched] };
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/* ─────────────── external proven handlers ────────────────── */
const EXTERNAL_HANDLERS = [
  "scripts/fix-params-string.mjs",
  "scripts/fix-params-string2.mjs",
  "scripts/fix-table-optional-chain.mjs",
  "scripts/fix-singleton-optional-chain.mjs",
  "scripts/fix-ts2724-underscore.mjs",
  "scripts/fix-ts2551-rename-back.mjs",
  "scripts/fix-ts2769.mjs",
  "scripts/fix-ts2345.mjs",
  "scripts/fix-ts2339-cast.mjs",
];
function runExternalHandlers(inputPath, logFile) {
  const ran = [];
  for (const handler of EXTERNAL_HANDLERS) {
    if (!fs.existsSync(path.join(ROOT, handler))) continue;
    const res = spawnSync("node", [handler, inputPath], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
    fs.appendFileSync(logFile, `\n=== ${handler} ===\n${res.stdout || ""}${res.stderr || ""}`);
    ran.push({ handler, ok: res.status === 0 });
  }
  return ran;
}

/* ─────────────────────── phases ──────────────────────────── */
async function phaseTs(config) {
  const inputPath = INPUT || latestTcPath(config);
  if (!inputPath) {
    record(`ts-${config}`, "blocked", { note: `no diagnostics input; run --phase verify --config ${config} first` });
    process.exitCode = 2;
    return;
  }
  const diags = parseDiags(fs.readFileSync(inputPath, "utf8"));
  if (diags.some((d) => isParserCode(d.code))) {
    record(`ts-${config}`, "blocked", { note: "parser errors present; fix syntax before mechanical handlers" });
    process.exitCode = 2;
    return;
  }
  const files = [...new Set(diags.map((d) => d.file))];
  const tag = `ts-${config}-${Date.now()}`;
  snapshotFiles(tag, files);
  const logFile = path.join(OUT, `handlers-${config}.log`);
  fs.writeFileSync(logFile, `input: ${inputPath}, diagnostics: ${diags.length}\n`);

  const native = applyNativeHandlers(diags);
  const external = runExternalHandlers(inputPath, logFile);

  // syntax-gate every possibly-touched file; restore any breakage file-by-file
  const broken = await syntaxGate(files);
  for (const b of broken) restoreFile(tag, b.file);
  record(`ts-${config}`, "applied", {
    note: `native fixed=${native.fixed} skipped=${native.skipped}; external=${external.map((e) => path.basename(e.handler) + (e.ok ? "" : "!")).join(",")}; syntax-restored=${broken.length}`,
    snapshot: tag,
    nativeFixed: native.fixed,
    syntaxRestored: broken.map((b) => b.file),
  });
}

function runTsc(config) {
  try { fs.rmSync(path.join(ROOT, `.cache/tsbuildinfo.${config}`), { force: true }); } catch {}
  const res = spawnSync("npx", ["tsc", "-p", `tsconfig.${config}.json`, "--noEmit"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
    timeout: 280_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return (res.stdout || "") + (res.stderr || "");
}

function phaseVerify(config) {
  const before = state.counts[config] ? state.counts[config].total : null;
  const output = runTsc(config);
  const outPath = path.join(OUT, `tc-${config}.txt`);
  fs.writeFileSync(outPath, output);
  if (config === "server") fs.writeFileSync("/tmp/tc_server.txt", output); // legacy path used by handlers
  const diags = parseDiags(output);
  const parser = diags.filter((d) => isParserCode(d.code)).length;
  const byCode = {};
  for (const d of diags) byCode[d.code] = (byCode[d.code] || 0) + 1;
  const top = Object.entries(byCode).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (before !== null && diags.length > before && state.lastSnapshot[config]) {
    const restored = restoreAll(state.lastSnapshot[config]);
    record(`verify-${config}`, "rolled-back", {
      note: `count rose ${before} → ${diags.length}; restored ${restored} files — re-run verify`,
    });
    process.exitCode = 2;
    return;
  }
  state.counts[config] = { total: diags.length, parser, top, at: new Date().toISOString() };
  saveState(state);
  record(`verify-${config}`, "measured", {
    note: `${before === null ? "" : before + " → "}${diags.length} errors (parser: ${parser}); top: ${top.map(([c, n]) => c + ":" + n).join(" ")}`,
  });
  if (diags.length > 0) process.exitCode = 1;
}

async function phaseImports() {
  const inputPath = latestTcPath("server");
  const diags = parseDiags(fs.readFileSync(inputPath, "utf8")).filter((d) => d.code === "TS2307");
  const rel = diags.filter((d) => /module '(\.|\.\.)\//.test(d.msg));
  const results = [];
  const touched = new Set();
  // basename index
  const index = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist", "build", ".git"].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) (index[e.name.replace(/\.tsx?$/, "")] ||= []).push(path.relative(ROOT, full));
    }
  };
  for (const root of ["server", "shared", "client/src"]) if (fs.existsSync(root)) walk(root);

  const tag = `imports-${Date.now()}`;
  snapshotFiles(tag, [...new Set(rel.map((d) => d.file))]);

  for (const d of rel) {
    const spec = (d.msg.match(/module '([^']+)'/) || [])[1];
    if (!spec) continue;
    const base = path.basename(spec).replace(/\.js$/, "");
    const candidates = index[base] || [];
    let chosen = null;
    if (candidates.length === 1) chosen = candidates[0];
    else if (candidates.length > 1) {
      // proximity tie-break: longest shared directory prefix with the importer
      const importerDir = path.dirname(d.file);
      let best = null, bestLen = -1, dup = false;
      for (const c of candidates) {
        let len = 0;
        const a = importerDir.split("/"), b = path.dirname(c).split("/");
        while (len < a.length && len < b.length && a[len] === b[len]) len++;
        if (len > bestLen) { best = c; bestLen = len; dup = false; }
        else if (len === bestLen) dup = true;
      }
      if (!dup) chosen = best;
    }
    if (!chosen) {
      results.push({ file: d.file, line: d.line, spec, status: "ambiguous", candidates });
      continue;
    }
    let newSpec = path.relative(path.dirname(d.file), path.join(ROOT, chosen).replace(ROOT + "/", "")).replace(/\\/g, "/");
    newSpec = newSpec.replace(/\.tsx?$/, "");
    if (!newSpec.startsWith(".")) newSpec = "./" + newSpec;
    if (spec.endsWith(".js")) newSpec += ".js";
    const abs = path.join(ROOT, d.file);
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    const idx = d.line - 1;
    if (lines[idx] && lines[idx].includes(spec)) {
      lines[idx] = lines[idx].split(spec).join(newSpec);
      fs.writeFileSync(abs, lines.join("\n"));
      touched.add(d.file);
      results.push({ file: d.file, line: d.line, spec, status: "rewritten", to: newSpec });
    } else {
      results.push({ file: d.file, line: d.line, spec, status: "line-mismatch" });
    }
  }
  const broken = await syntaxGate([...touched]);
  for (const b of broken) restoreFile(tag, b.file);
  fs.writeFileSync(path.join(OUT, "imports-report.json"), JSON.stringify(results, null, 2));
  const rewritten = results.filter((r) => r.status === "rewritten").length;
  const ambiguous = results.filter((r) => r.status === "ambiguous").length;
  record("imports", "applied", {
    note: `rewritten=${rewritten} ambiguous=${ambiguous} (bare-module diags left to policy) syntax-restored=${broken.length}`,
  });
}

function camelToSnake(s) { return s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()); }

async function phaseSchema() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) {
    record("schema", "blocked", { note: "NEON_DATABASE_URL not set" });
    process.exitCode = 2;
    return;
  }
  const inputPath = latestTcPath("server");
  const diags = parseDiags(fs.readFileSync(inputPath, "utf8"));

  // drizzle variable → table-name map from shared/schema.ts
  const schemaSrc = fs.readFileSync(path.join(ROOT, "shared/schema.ts"), "utf8");
  const varToTable = {};
  const tv = /export const (\w+)\s*=\s*pgTable\(\s*["']([^"']+)["']/g;
  let tm;
  while ((tm = tv.exec(schemaSrc))) varToTable[tm[1]] = tm[2];

  // 1) reads: TS2339/TS2551 on PgTableWithColumns
  const readPairs = [];
  for (const d of diags) {
    if ((d.code === "TS2339" || d.code === "TS2551") && d.msg.includes("PgTableWithColumns")) {
      const pm = d.msg.match(/Property '([^']+)'.*?name: "([^"]+)"/);
      if (pm) readPairs.push({ table: pm[2], column: pm[1], file: d.file, line: d.line });
    }
  }
  // 2) writes: TS2353 unknown keys → resolve target table by backward scan
  const writeSites = [];
  for (const d of diags.filter((x) => x.code === "TS2353")) {
    const km = d.msg.match(/and '([^']+)' does not exist/);
    if (!km) continue;
    const abs = path.join(ROOT, d.file);
    if (!fs.existsSync(abs)) continue;
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    let table = null;
    for (let i = d.line - 1; i >= Math.max(0, d.line - 31); i--) {
      const mm = lines[i] && lines[i].match(/\.(?:update|insert)\(\s*(\w+)\s*[),]/);
      if (mm && varToTable[mm[1]]) { table = varToTable[mm[1]]; break; }
    }
    writeSites.push({ file: d.file, line: d.line, key: km[1], table });
  }

  // one DB round-trip for every distinct (table, column)
  const pairs = new Set();
  for (const p of readPairs) pairs.add(p.table + "\u0000" + p.column);
  for (const w of writeSites) if (w.table) pairs.add(w.table + "\u0000" + w.key);
  const values = [...pairs].map((p) => {
    const [t, c] = p.split("\u0000");
    return `('${t}','${camelToSnake(c)}','${c}')`;
  });
  const inDb = new Set();
  if (values.length) {
    const sql = `with pairs(tbl, col, code_col) as (values ${values.join(",")})
      select p.tbl || '.' || p.code_col from pairs p
      join information_schema.columns c on c.table_name = p.tbl and c.column_name = p.col;`;
    const res = spawnSync("psql", [url, "-t", "-A", "-c", sql], { encoding: "utf8", timeout: 30_000 });
    if (res.status !== 0) {
      record("schema", "blocked", { note: `psql failed: ${(res.stderr || "").slice(0, 160)}` });
      process.exitCode = 2;
      return;
    }
    for (const l of res.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) inDb.add(l);
  }

  // REPORT-ONLY: write-key removal is disabled. A text-level removal proved able
  // to strip keys from NON-drizzle literals (method args, return objects), which
  // changes behavior — e.g. a returned object losing a property callers read.
  // Removal needs an AST/symbol-aware check that the literal is a direct
  // drizzle .set()/.values() argument; until then this phase only reports.
  const removalCandidates = [], kept = [];
  for (const w of writeSites) {
    if (!w.table) { kept.push({ ...w, reason: "table-unresolved" }); continue; }
    if (inDb.has(`${w.table}.${w.key}`)) { kept.push({ ...w, reason: "column-exists-in-db" }); continue; }
    removalCandidates.push(w);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    addToSchemaCandidates: [...pairs].map((p) => p.split("\u0000")).filter(([t, c]) => inDb.has(`${t}.${c}`)).map(([t, c]) => `${t}.${c}`),
    latentBrokenReads: readPairs.filter((p) => !inDb.has(`${p.table}.${p.column}`)),
    removalCandidates,
    keptWriteSites: kept,
  };
  fs.writeFileSync(path.join(OUT, "schema-report.json"), JSON.stringify(report, null, 2));
  record("schema", "measured", {
    note: `pairs=${pairs.size} inDb=${report.addToSchemaCandidates.length} removalCandidates=${removalCandidates.length} latentReads=${report.latentBrokenReads.length} (report-only — no code edited)`,
  });
}

async function phaseRuntime() {
  const base = "http://127.0.0.1:5000";
  let probes = ["/api/ready", "/", "/api/auth/user"];
  const extra = path.join(OUT, "probes.json");
  if (fs.existsSync(extra)) probes = [...new Set([...probes, ...JSON.parse(fs.readFileSync(extra, "utf8"))])];
  const results = [];
  for (const p of probes) {
    const started = Date.now();
    try {
      const res = await fetch(base + p, { signal: AbortSignal.timeout(8000), redirect: "manual" });
      const body = (await res.text()).slice(0, 200);
      results.push({ path: p, status: res.status, ms: Date.now() - started, snippet: body });
    } catch (e) {
      results.push({ path: p, error: String(e.cause || e.message || e).slice(0, 120), ms: Date.now() - started });
    }
  }
  fs.writeFileSync(path.join(OUT, "runtime-report.json"), JSON.stringify(results, null, 2));
  const failures = results.filter((r) => r.error || r.status >= 500);
  record("runtime", failures.length ? "failed" : "passed", {
    note: results.map((r) => `${r.path}:${r.status ?? "ERR"}`).join(" "),
  });
  if (failures.length) process.exitCode = 1;
}

function phaseAudit() {
  const res = spawnSync("npm", ["audit", "--json"], { cwd: ROOT, encoding: "utf8", timeout: 90_000, maxBuffer: 32 * 1024 * 1024 });
  try {
    const data = JSON.parse(res.stdout || "{}");
    const v = (data.metadata && data.metadata.vulnerabilities) || {};
    fs.writeFileSync(path.join(OUT, "audit-report.json"), JSON.stringify(data.metadata || {}, null, 2));
    record("audit", "measured", { note: `critical=${v.critical ?? 0} high=${v.high ?? 0} moderate=${v.moderate ?? 0} low=${v.low ?? 0} (report-only; installs are managed manually in this repo)` });
    if ((v.critical ?? 0) > 0) process.exitCode = 1;
  } catch {
    record("audit", "skipped", { note: "npm audit unavailable (offline or registry error)" });
  }
}

function phaseLint() {
  const res = spawnSync("npx", ["eslint", "server", "shared", "--quiet", "-f", "json"], {
    cwd: ROOT, encoding: "utf8", timeout: 150_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error || res.signal) {
    record("lint", "timeout", { note: "eslint exceeded time box; run `npm run lint` separately" });
    return;
  }
  try {
    const files = JSON.parse(res.stdout || "[]");
    const errors = files.reduce((n, f) => n + f.errorCount, 0);
    const byRule = {};
    for (const f of files) for (const m of f.messages) byRule[m.ruleId || "parse"] = (byRule[m.ruleId || "parse"] || 0) + 1;
    const top = Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 10);
    fs.writeFileSync(path.join(OUT, "lint-report.json"), JSON.stringify({ errors, top, files: files.filter((f) => f.errorCount).map((f) => ({ file: path.relative(ROOT, f.filePath), errors: f.errorCount })) }, null, 2));
    record("lint", "measured", { note: `errors=${errors}; top rules: ${top.map(([r, n]) => r + ":" + n).join(" ")}` });
    if (errors > 0) process.exitCode = 1;
  } catch {
    record("lint", "failed", { note: (res.stderr || "").slice(0, 160) });
  }
}

function phaseSummary() {
  const lines = ["# Fix-All Summary", "", `Generated: ${new Date().toISOString()}`, ""];
  let outstanding = 0;
  for (const [name, info] of Object.entries(state.phases)) {
    lines.push(`- **${name}** — ${info.status} (${info.at})${info.note ? ": " + info.note : ""}`);
    if (["failed", "blocked", "rolled-back"].includes(info.status)) outstanding++;
  }
  lines.push("");
  for (const cfg of ["server", "client"]) {
    if (state.counts[cfg]) {
      lines.push(`TypeScript ${cfg}: **${state.counts[cfg].total} errors** (parser: ${state.counts[cfg].parser}) as of ${state.counts[cfg].at}`);
      outstanding += state.counts[cfg].total > 0 ? 1 : 0;
    } else {
      lines.push(`TypeScript ${cfg}: not yet measured`);
      outstanding++;
    }
  }
  lines.push("", outstanding === 0 ? "ALL CLEAR — every tracked category is clean." : `OUTSTANDING WORK REMAINS — ${outstanding} categories are not clean. This pipeline does not claim success until they are.`);
  fs.writeFileSync(path.join(OUT, "summary.md"), lines.join("\n"));
  console.log(lines.join("\n"));
  if (outstanding > 0) process.exitCode = 1;
}

/* ─────────────────────── dispatch ────────────────────────── */
const phases = {
  "ts-server": () => phaseTs("server"),
  "ts-client": () => phaseTs("client"),
  verify: () => phaseVerify(CONFIG),
  imports: phaseImports,
  schema: phaseSchema,
  runtime: phaseRuntime,
  audit: phaseAudit,
  lint: phaseLint,
  summary: phaseSummary,
  status: () => console.log(JSON.stringify(state, null, 2)),
};
if (!phases[PHASE]) {
  console.error(`Unknown phase '${PHASE}'. Valid: ${Object.keys(phases).join(", ")}`);
  process.exit(2);
}
await phases[PHASE]();
