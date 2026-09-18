#!/usr/bin/env node
/**
 * Endpoint audit.
 *
 * Statically enumerates every Express route registration under server/,
 * resolves relative router paths to their real mounted prefix, extracts
 * every /api/* path the client actually calls, and then checks BOTH
 * against the live running dev server (ground truth beats static guessing).
 *
 * Findings, each with file:line, a class, a severity, a description and a
 * concrete recommendation:
 *   - missing-route              frontend calls a path that the live server
 *                                 does not recognize as a route at all
 *   - method-not-supported       frontend calls a path with a method the
 *                                 live server does not list as allowed
 *   - unreachable-route          statically registered in source, but the
 *                                 live server does not recognize it (ordering
 *                                 bug, shadowing, or an audit prefix-resolution
 *                                 limit -- flagged as such when confidence is low)
 *   - duplicate-registration     same (method, full path) registered 2+ times;
 *                                 Express dispatches to the first match only
 *   - stub-handler                handler source contains stub/TODO/mock markers
 *   - unresolved-dynamic-registration  route path is a variable/expression the
 *                                 audit could not statically resolve
 *   - live-error                 live probe returned a non-503 5xx, or timed out
 *   - service-unavailable        live probe returned HTTP 503 specifically --
 *                                 reported separately from live-error because a
 *                                 well-built readiness/health handler returning
 *                                 503 for a down/still-warming dependency is
 *                                 working as designed, not necessarily a bug
 *
 * Non-destructive by design:
 *   - Every route is probed with OPTIONS only by default. Express answers
 *     OPTIONS for any path that matches a registered route WITHOUT invoking
 *     the route's own handler, so this proves routing-layer reachability
 *     with zero side effects, for every HTTP method.
 *   - A real GET is additionally sent ONLY when the route is GET, has no
 *     statically-detected auth middleware, and its path does not contain any
 *     word from a defensive blocklist (see SENSITIVE_KEYWORDS) -- this is the
 *     subset where a real request is both safe (read-only, unauthenticated
 *     surface) and informative (catches real 500s / stub JSON bodies).
 *
 * Run:    node scripts/audit-endpoints.mjs
 * Static: node scripts/audit-endpoints.mjs --static
 * Output: reports/endpoint-audit.json  (full structured data)
 *         reports/endpoint-audit.md    (human-readable report)
 *
 * `--static` is the comprehensive inventory mode: it never contacts the
 * running app, inventories apiRequest/useQuery/fetch/axios/upload templates,
 * records cache/comment/SPA/external references separately, and reports exact
 * static matches, confirmed unmatched calls, and unresolved dynamic URLs.
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, extname, dirname, resolve as pathResolve } from "node:path";
import { randomBytes } from "node:crypto";
import { stripRouteTypeArguments } from "./lib/route-call-source.mjs";

const ROOT = process.cwd();
const SERVER_DIR = join(ROOT, "server");
const CLIENT_DIR = join(ROOT, "client", "src");
const BASE_URL = process.env.AUDIT_BASE_URL || "http://127.0.0.1:5000";
const CONCURRENCY = 12;
const REQUEST_TIMEOUT_MS = 6000;
const REPORT_DIR = join(ROOT, "reports");
const STATIC_ONLY =
  process.argv.includes("--static") || process.env.AUDIT_STATIC_ONLY === "1";

const SENSITIVE_KEYWORDS =
  /logout|delete|remove|cancel|refund|charge|purchase|checkout|subscri|webhook|reset|revoke|purge|wipe|deactivate|ban|impersonate|send|notify|trigger|generate|upload|export|sync|connect|register|unsubscribe|invite|share|publish|submit|apply|redeem|transfer|withdraw|payout|activate|approve|reject|verify-email|2fa/i;

// ---------------------------------------------------------------------------
// small utils
// ---------------------------------------------------------------------------

function walk(dir, exts, skipDirs = new Set(["node_modules", "dist", "build", ".git"])) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts, skipDirs));
    else if (exts.includes(extname(entry.name))) out.push(full);
  }
  return out;
}

const isTestFile = (p) => /\.(test|spec)\.[tj]sx?$/.test(p) || /__tests__/.test(p);

function lineAt(src, offset) {
  return src.slice(0, offset).split("\n").length;
}

function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ---------------------------------------------------------------------------
// Phase 0: resolve module specifiers to real files on disk (ESM .js -> .ts)
// ---------------------------------------------------------------------------

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = pathResolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    base + ".ts",
    base + ".tsx",
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

// ---------------------------------------------------------------------------
// Phase 1: build a global map of resolvedRouterFile -> mount prefix, by
// tracing imports + `.use(` calls across every server file.
// ---------------------------------------------------------------------------

function buildMountPrefixMap(serverFiles) {
  const prefixMap = new Map(); // resolvedFile -> { prefix, mountedFrom: [file:line,...] }

  for (const file of serverFiles) {
    const src = readFileSync(file, "utf8");
    const localImports = new Map(); // identifier -> resolvedFile

    // static: import X from "spec"; import { default as X } from "spec"; import { X } from "spec"
    const staticImportRe =
      /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+["'`]([^"'`]+)["'`]/g;
    for (const m of src.matchAll(staticImportRe)) {
      const resolved = resolveSpecifier(file, m[3]);
      if (!resolved) continue;
      if (m[2]) localImports.set(m[2], resolved);
      if (m[1]) {
        for (const part of m[1].split(",")) {
          const piece = part.trim();
          const asMatch = piece.match(/^(?:default\s+as\s+(\w+)|(\w+))$/);
          if (asMatch) localImports.set(asMatch[1] || asMatch[2], resolved);
        }
      }
    }

    // dynamic: const { default: X } = await import("spec"); const X = (await import("spec")).default;
    const dynDestructureRe =
      /const\s*\{([^}]+)\}\s*=\s*await\s+import\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    for (const m of src.matchAll(dynDestructureRe)) {
      const resolved = resolveSpecifier(file, m[2]);
      if (!resolved) continue;
      for (const part of m[1].split(",")) {
        const piece = part.trim();
        const asMatch = piece.match(/^(?:default\s*:\s*(\w+)|(\w+)\s*:\s*(\w+)|(\w+))$/);
        if (asMatch) localImports.set(asMatch[1] || asMatch[3] || asMatch[4], resolved);
      }
    }
    const dynDefaultRe =
      /const\s+(\w+)\s*=\s*\(\s*await\s+import\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\)\s*\.default/g;
    for (const m of src.matchAll(dynDefaultRe)) {
      const resolved = resolveSpecifier(file, m[2]);
      if (resolved) localImports.set(m[1], resolved);
    }

    // dynamic, batched: const [ {default: A}, {default: B} ] = await Promise.all([
    //   import("./a.js"), import("./b.js") ]); -- a distinct shape from the
    // single-import destructure above (array destructure of a Promise.all,
    // not an object destructure of one import()). Positions on each side
    // correspond in order, so this pairs them up by index rather than name.
    const dynBatchedRe =
      /const\s*\[([\s\S]*?)\]\s*=\s*await\s+Promise\.all\(\s*\[([\s\S]*?)\]\s*\)/g;
    for (const m of src.matchAll(dynBatchedRe)) {
      const memberRe = /\{\s*default\s*:\s*(\w+)\s*\}|\{\s*(\w+)\s*\}|(\w+)/g;
      const names = [...m[1].matchAll(memberRe)].map((s) => s[1] || s[2] || s[3]);
      const specifierRe = /import\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
      const specifiers = [...m[2].matchAll(specifierRe)].map((s) => s[1]);
      if (names.length !== specifiers.length) continue; // shape didn't match cleanly; skip rather than guess
      for (let i = 0; i < names.length; i++) {
        const resolved = resolveSpecifier(file, specifiers[i]);
        if (resolved) localImports.set(names[i], resolved);
      }
    }

    // mount calls: <obj>.use(<optional prefix string>, <identifier>)
    const useRe = /\b(\w+)\.use\(\s*(?:(['"`])([^'"`]*)\2\s*,\s*)?(\w+)\s*[,)]/g;
    for (const m of src.matchAll(useRe)) {
      const ident = m[4];
      const prefix = m[3] || "";
      const resolved = localImports.get(ident);
      if (!resolved) continue;
      const loc = `${relative(ROOT, file)}:${lineAt(src, m.index)}`;
      if (!prefixMap.has(resolved)) {
        prefixMap.set(resolved, { prefix, mountedFrom: [loc] });
      } else {
        prefixMap.get(resolved).mountedFrom.push(loc);
      }
    }

    // lazy-loader registry: { path: "<prefix>", ..., loader: () => import("<spec>") }
    // This codebase mounts a large share of its routers through an array of
    // these objects (resolved dynamically at boot and then app.use(path, mod)'d
    // in array order), which is a structurally different pattern from a plain
    // top-level `import` + `.use(`. Confirmed by reading the consuming loop in
    // server/routes.ts before relying on it here -- `path` is used completely
    // literally with no transformation.
    for (const lazy of extractLazyLoaderRegistrations(src)) {
      const resolved = resolveSpecifier(file, lazy.specifier);
      if (!resolved) continue;
      const loc = `${relative(ROOT, file)}:${lineAt(src, lazy.index)}`;
      if (!prefixMap.has(resolved)) {
        prefixMap.set(resolved, { prefix: lazy.prefix, mountedFrom: [loc] });
      } else {
        prefixMap.get(resolved).mountedFrom.push(loc);
      }
    }
  }
  return prefixMap;
}

function extractLazyLoaderRegistrations(src) {
  const results = [];
  const pathRe = /\bpath\s*:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = pathRe.exec(src))) {
    const prefix = m[2];
    const searchStart = m.index + m[0].length;
    const window = src.slice(searchStart, Math.min(src.length, searchStart + 400));
    const nextPathIdx = window.search(/\bpath\s*:/);
    const loaderMatch = window.match(/\bloader\s*:\s*\(\s*\)\s*=>\s*import\(\s*(['"`])([^'"`]+)\1\s*\)/);
    if (loaderMatch && (nextPathIdx === -1 || loaderMatch.index < nextPathIdx)) {
      results.push({ prefix, specifier: loaderMatch[2], index: m.index });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Phase 2: extract route registrations from a single file
// ---------------------------------------------------------------------------

const STRING_LIT_RE = /^(['"`])((?:\\.|(?!\1)[^\\])*)\1/;
const ARRAY_LIT_RE = /(?:const|let)\s+(\w+)\s*(?::\s*[^=\n]+)?=\s*\[([\s\S]*?)\]\s*;/g;
const ARRAY_STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const FOR_OF_RE = /for\s*\(\s*(?:const|let)\s+(\w+)\s+of\s+(\w+)\s*\)\s*\{/g;
const FOR_OF_OBJECT_RE =
  /for\s*\(\s*(?:const|let)\s+\{\s*(\w+)[^}]*\}\s+of\s+(\w+)\s*\)\s*\{/g;
const AUTH_MARKERS = ["requireAuth", "requireAuthOnly", "requireAdmin", "require2FA"];
// "strong" markers are rarely used to describe deliberate, finished code --
// finding one is good evidence of genuinely incomplete work.
// "weak" markers (particularly "stub" and "placeholder") are also used all
// over this codebase to NAME deliberate, documented infrastructure (e.g. an
// early-boot stub that hands off via next() once the real router is ready),
// so a weak-only match is a "worth a look" signal, not confirmed incomplete work.
const STRONG_STUB_MARKERS = ["TODO", "FIXME", "not implemented", "notimplemented", "coming soon"];
const WEAK_STUB_MARKERS = ["placeholder", "stub", "mock data", "hardcoded"];
const STUB_MARKERS = [...STRONG_STUB_MARKERS, ...WEAK_STUB_MARKERS];

function extractRoutesFromFile(file) {
  const rel = relative(ROOT, file);
  const src = stripRouteTypeArguments(readFileSync(file, "utf8"), file);
  const routes = [];
  const unresolved = [];

  // Most route modules use `router`, but the main app and a handful of
  // modules use names such as `adminRouter`.  Restricting this to the two
  // historical names silently dropped those registrations from the inventory.
  // Only identifiers initialized from Router() (plus the top-level Express
  // app) are accepted; this avoids treating arbitrary service methods as routes.
  const routerIdentifiers = new Set(["app", "router"]);
  const routerDeclarationRe =
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:express\.)?(?:Router|router)\s*\(/g;
  for (const declaration of src.matchAll(routerDeclarationRe)) {
    routerIdentifiers.add(declaration[1]);
  }
  const methodRe = new RegExp(
    `\\b(${[...routerIdentifiers].map((name) => name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})(?:\\?\\.|\\.)(get|post|put|patch|delete|all)\\s*\\(\\s*`,
    "g",
  );

  const arrays = new Map();
  for (const m of src.matchAll(ARRAY_LIT_RE)) {
    const strings = [...m[2].matchAll(ARRAY_STRING_RE)].map((s) => s[2]);
    const objectPaths = [
      ...m[2].matchAll(/\bpath\s*:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g),
    ].map((s) => s[2]);
    if (objectPaths.length) arrays.set(m[1], objectPaths);
    else if (strings.length) arrays.set(m[1], strings);
  }

  const loopRanges = [];
  for (const m of src.matchAll(FOR_OF_RE)) {
    const [loopVar, arrayName] = [m[1], m[2]];
    if (!arrays.has(arrayName)) continue;
    const braceStart = m.index + m[0].length - 1;
    let depth = 1,
      i = braceStart + 1;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    loopRanges.push({ loopVar, arrayName, start: braceStart, end: i });
  }
  for (const m of src.matchAll(FOR_OF_OBJECT_RE)) {
    const [loopVar, arrayName] = [m[1], m[2]];
    if (!arrays.has(arrayName)) continue;
    const braceStart = m.index + m[0].length - 1;
    let depth = 1,
      i = braceStart + 1;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    loopRanges.push({ loopVar, arrayName, start: braceStart, end: i });
  }
  const findLoopRange = (offset) =>
    loopRanges.find((r) => offset >= r.start && offset < r.end) || null;

  for (const m of src.matchAll(methodRe)) {
    const registeredOn = m[1]; // "app" or "router" -- load-bearing for Phase 3's absolute-vs-relative-path decision
    const method = m[2].toUpperCase();
    const callOffset = m.index;
    const line = lineAt(src, callOffset);
    const after = src.slice(callOffset + m[0].length);
    const argsWindow = src.slice(callOffset, callOffset + 400); // for auth-marker + stub scanning of this call site

    // A short, conditional `next()` call early in the handler is this
    // codebase's marker for deliberate layered/handoff middleware (e.g. an
    // early-boot stub that steps aside once the real handler is ready) rather
    // than a dead end -- checked over a slightly wider window than the plain
    // auth-marker scan since it needs to reach into the handler body itself.
    const nextWindow = src.slice(callOffset, callOffset + 600);
    const callsNext = /\bnext\s*\(\s*\)/.test(nextWindow);

    // Middleware and formatting are commonly placed on preceding lines, so
    // allow whitespace/comments before the route path. The first argument is
    // still required to be a literal; computed expressions remain explicit
    // unresolved registrations below.
    const strMatch = after.match(
      /^\s*(?:(?:\/\/[^\n]*\n)|(?:\/\*[\s\S]*?\*\/\s*))*(['"`])((?:\\.|(?!\1)[^\\])*)\1/,
    );
    if (strMatch) {
      routes.push({
        method,
        rawPath: strMatch[2],
        file: rel,
        line,
        resolvedVia: "literal",
        registeredOn,
        hasAuthMarker: AUTH_MARKERS.some((a) => argsWindow.includes(a)),
        callsNext,
      });
      continue;
    }

    const identMatch = after.match(/^(\w+)\s*(\+\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3)?/);
    if (identMatch) {
      const range = findLoopRange(callOffset);
      if (range && range.loopVar === identMatch[1]) {
        const suffix = identMatch[4] || "";
        for (const base of arrays.get(range.arrayName) || []) {
          routes.push({
            method,
            rawPath: base + suffix,
            file: rel,
            line,
            resolvedVia: `loop:${range.arrayName}`,
            registeredOn,
            hasAuthMarker: AUTH_MARKERS.some((a) => argsWindow.includes(a)),
            callsNext,
          });
        }
        continue;
      }
    }

    unresolved.push({
      method,
      file: rel,
      line,
      rawExpr: after.slice(0, 60).split("\n")[0].trim(),
    });
  }

  // stub-marker scan: look at ~35 lines following each route registration line
  const srcLines = src.split("\n");
  for (const r of routes) {
    const windowLines = srcLines.slice(r.line - 1, r.line - 1 + 35).join("\n");
    const lower = windowLines.toLowerCase();
    const strongMarkers = STRONG_STUB_MARKERS.filter((k) => lower.includes(k.toLowerCase()));
    const weakMarkers = WEAK_STUB_MARKERS.filter((k) => lower.includes(k.toLowerCase()));
    r.stubMarkers = [...strongMarkers, ...weakMarkers];
    r.stubStrength = strongMarkers.length ? "strong" : weakMarkers.length ? "weak" : "none";
  }

  return { routes, unresolved };
}

function isRouterFile(src) {
  return /=\s*(?:express\.)?Router\s*\(/.test(src) || /express\.Router\(\)/.test(src);
}

// ---------------------------------------------------------------------------
// Phase 3: full-path resolution using the prefix map
// ---------------------------------------------------------------------------

function buildBackendInventory() {
  const files = walk(SERVER_DIR, [".ts", ".tsx"]).filter((f) => !isTestFile(f));
  const prefixMap = buildMountPrefixMap(files);

  const inventory = [];
  const unresolvedDynamic = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const { routes, unresolved } = extractRoutesFromFile(file);
    unresolvedDynamic.push(...unresolved);
    if (!routes.length) continue;

    const router = isRouterFile(src);
    const mountInfo = prefixMap.get(file);

    for (const r of routes) {
      let fullPath;
      let confidence;
      // "/health", "/ready", "/status" are only unambiguously absolute when
      // registered directly on `app` (the classic top-level infra-check
      // convention). The exact same short names are equally conventional as
      // a RELATIVE sub-route inside a mounted router (e.g. router.get("/health")
      // meant to become /api/maxcore/health) -- treating those as already-
      // absolute skipped their real mount prefix entirely and fabricated
      // massive cross-file "duplicate registration" collisions between
      // unrelated routers that never actually share a runtime path. "/api/"
      // has no such ambiguity either way, so it keeps the shortcut.
      const shortInfraPath =
        r.rawPath.startsWith("/health") || r.rawPath.startsWith("/ready") || r.rawPath.startsWith("/status");
      if (r.rawPath.startsWith("/api/") || (shortInfraPath && r.registeredOn === "app")) {
        fullPath = r.rawPath;
        confidence = "high";
      } else if (router && mountInfo) {
        fullPath = (mountInfo.prefix + r.rawPath).replace(/\/{2,}/g, "/");
        confidence = mountInfo.mountedFrom.length === 1 ? "high" : "medium";
      } else if (router && !mountInfo) {
        fullPath = r.rawPath;
        confidence = "unmounted-or-unresolved";
      } else {
        fullPath = r.rawPath;
        confidence = "high";
      }
      inventory.push({ ...r, fullPath, confidence, mountedFrom: mountInfo?.mountedFrom });
    }
  }
  return { inventory, unresolvedDynamic, prefixMap };
}

// ---------------------------------------------------------------------------
// Phase 4: frontend call extraction
// ---------------------------------------------------------------------------

const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const HTTP_METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";
// This codebase's TanStack Query default queryFn (getQueryFn in queryClient.ts)
// does a plain unauthenticated-method fetch(url) -- i.e. GET -- for any
// useQuery whose queryFn is the global default. A path literal sitting inside
// a `queryKey: [...]` array is therefore confidently a GET, not a guess.
function isInsideComment(src, offset) {
  const lineStart = src.lastIndexOf("\n", offset - 1) + 1;
  const linePrefix = src.slice(lineStart, offset);
  if (/^\s*\/\//.test(linePrefix) || /^\s*\*/.test(linePrefix)) return true;
  const before = src.slice(0, offset);
  return before.lastIndexOf("/*") > before.lastIndexOf("*/");
}

function networkSourceForReference(src, offset) {
  const before = src.slice(Math.max(0, offset - 700), offset);
  const candidates = [
    ["apiRequest", before.lastIndexOf("apiRequest(")],
    ["uploadWithProgress", before.lastIndexOf("uploadWithProgress(")],
    ["fetch", before.lastIndexOf("fetch(")],
    ["axios", Math.max(
      before.lastIndexOf("axios.get("), before.lastIndexOf("axios.post("),
      before.lastIndexOf("axios.put("), before.lastIndexOf("axios.patch("),
      before.lastIndexOf("axios.delete("), before.lastIndexOf("axios.request("),
    )],
  ].filter(([, index]) => index >= 0);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][0];
}

function methodForReference(src, offset, source) {
  const before = src.slice(Math.max(0, offset - 500), offset);
  const after = src.slice(offset, offset + 700);
  if (source === "apiRequest") {
    const requestStart = before.lastIndexOf("apiRequest(");
    const requestContext = requestStart >= 0 ? before.slice(requestStart) : before;
    const nearestMatch = requestContext.match(
      new RegExp(`apiRequest\\s*\\(\\s*["'\`](${HTTP_METHODS})["'\`]`, "i"),
    );
    if (nearestMatch) return { method: nearestMatch[1].toUpperCase(), methodConfidence: "detected" };
  }
  if (source === "uploadWithProgress") return { method: "POST", methodConfidence: "detected" };
  if (source === "axios") {
    const match = before.match(/axios\.(get|post|put|patch|delete)\s*\(/i);
    return { method: match ? match[1].toUpperCase() : "GET", methodConfidence: match ? "detected" : "assumed" };
  }
  if (source === "fetch") {
    // Restrict option scanning to the current fetch call. Looking hundreds of
    // characters ahead can accidentally borrow a method from the next fetch
    // in the same component and fabricate a mismatch.
    const match = after.slice(0, 220).match(/method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]/i);
    return { method: match ? match[1].toUpperCase() : "GET", methodConfidence: match ? "detected" : "assumed" };
  }
  return { method: "GET", methodConfidence: "detected" };
}

function queryKeyHasCustomFn(src, offset) {
  const before = src.slice(Math.max(0, offset - 1200), offset);
  const after = src.slice(offset, offset + 2200);
  const queryStart = before.lastIndexOf("useQuery");
  return queryStart >= 0 && /\bqueryFn\s*:/.test(before.slice(queryStart) + after);
}

function queryKeyPath(src, offset, rawPath) {
  const after = src.slice(offset + rawPath.length + 2, offset + rawPath.length + 160);
  return /^\s*,\s*[A-Za-z_$][\w$]*\s*(?:,|\])/.test(after)
    ? `${rawPath}/:param`
    : rawPath;
}

function extractFrontendCalls() {
  const files = walk(CLIENT_DIR, [".ts", ".tsx"]).filter((f) => !isTestFile(f));
  const calls = [];
  const references = [];
  const dynamicUnresolved = [];
  const externalReferences = [];
  const spaReferences = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(STRING_RE)) {
      const raw = m[2];
      const path = raw.replace(/\$\{[^}]*\}/g, ":param");
      const line = lineAt(src, m.index);
      const before = src.slice(Math.max(0, m.index - 700), m.index);
      let source = networkSourceForReference(src, m.index);
      const assignedVariable = src
        .slice(Math.max(0, m.index - 80), m.index)
        .match(/(?:const|let|var)\s+(\w+)\s*=\s*$/)?.[1];
      const openedAsNavigation =
        assignedVariable &&
        new RegExp(`window\\.open\\(\\s*${assignedVariable}\\b`).test(
          src.slice(m.index, m.index + 500),
        );
      const nearestNavigation = Math.max(
        before.lastIndexOf("window.open("),
        before.lastIndexOf("location.href"),
        before.lastIndexOf("window.location"),
      );
      const nearestNetwork = Math.max(
        before.lastIndexOf("apiRequest("),
        before.lastIndexOf("uploadWithProgress("),
        before.lastIndexOf("fetch("),
        before.lastIndexOf("axios."),
      );
      if (nearestNavigation > nearestNetwork || openedAsNavigation) source = null;
      const comment = isInsideComment(src, m.index);
      const cacheIndex = Math.max(
        before.lastIndexOf("invalidateQueries"),
        before.lastIndexOf("setQueryData"),
        before.lastIndexOf("getQueryData"),
        before.lastIndexOf("removeQueries"),
        before.lastIndexOf("resetQueries"),
        before.lastIndexOf("cancelQueries"),
      );
      const networkIndex = Math.max(
        before.lastIndexOf("apiRequest("),
        before.lastIndexOf("uploadWithProgress("),
        before.lastIndexOf("fetch("),
        before.lastIndexOf("axios."),
      );
      const cacheOnly = cacheIndex >= 0 && cacheIndex > networkIndex;
      const queryKey = /queryKey\s*:\s*\[[^\]]*$/.test(before.slice(-500));
      const queryKeyVariable = before.match(
        /(?:const|let|var)\s+(\w+)\s*=\s*\[\s*$/,
      )?.[1];
      const variableUseQuery =
        queryKeyVariable &&
        new RegExp(`queryKey\\s*:\\s*${queryKeyVariable}\\b`).test(
          src.slice(m.index, m.index + 900),
        );
      const inUseQuery =
        (queryKey || variableUseQuery) &&
        /\buseQuery(?:<[^>]*>)?\s*\(/.test(before.slice(-1200) + src.slice(m.index, m.index + 900));

      if (/^https?:\/\//i.test(raw)) {
        externalReferences.push({
          url: raw,
          file: rel,
          line,
          source: source || "external-reference",
        });
        continue;
      }
      if (
        /^\/(?!api\/)/.test(raw) &&
        /(?:href|to|navigate|location|redirect|url)\s*[:=(]/.test(before.slice(-180))
      ) {
        spaReferences.push({ path: raw, file: rel, line });
      }
      if (!raw.startsWith("/api/")) continue;

      let kind = "not-api-reference";
      let actualSource = source;
      if (comment) kind = "comment";
      else if (nearestNavigation > nearestNetwork || openedAsNavigation) kind = "browser-navigation";
      else if (cacheOnly) kind = "cache-key";
      else if (inUseQuery) {
        actualSource = "useQuery";
        kind = queryKeyHasCustomFn(src, m.index) ? "query-key-custom-fn" : "useQuery";
      } else if (source) {
        kind = source;
      } else if (
        /^\s*(?:endpoint|url)\s*=/.test(
          src.slice(m.index + m[0].length, m.index + m[0].length + 80),
        )
      ) {
        kind = "api-endpoint-prop";
        actualSource = "endpoint-prop";
      }

      const entry = {
        path: queryKey && kind === "useQuery" ? queryKeyPath(src, m.index, path) : path,
        rawPath: raw,
        file: rel,
        line,
        source: actualSource,
        kind,
        method: null,
        methodConfidence: null,
      };
      if (
        ["useQuery", "apiRequest", "uploadWithProgress", "fetch", "axios", "api-endpoint-prop"].includes(kind)
      ) {
        Object.assign(
          entry,
          methodForReference(src, m.index, actualSource === "endpoint-prop" ? "fetch" : actualSource),
        );
        calls.push(entry);
      } else {
        references.push(entry);
      }
    }

    // A computed URL cannot be matched safely unless its assignment is a
    // literal we already saw above. Keep it explicit instead of guessing from
    // a variable name.
    const computedCallRe =
      /\b(apiRequest|uploadWithProgress)\s*\(\s*(?:(["'`])?(GET|POST|PUT|PATCH|DELETE)\2?\s*,\s*)?([A-Za-z_$][\w$]*)\b/g;
    for (const m of src.matchAll(computedCallRe)) {
      const variable = m[4];
      const assignment = new RegExp(
        `(?:const|let|var)\\s+${variable}\\s*(?::[^=\\n]+)?=\\s*([^;\\n]+)`,
      ).exec(src);
      if (!assignment || !/\/api\//.test(assignment[1])) {
        dynamicUnresolved.push({
          path: null,
          file: rel,
          line: lineAt(src, m.index),
          source: m[1],
          method: m[3] ? m[3].toUpperCase() : null,
          expression: variable,
        });
      }
    }
  }
  return { calls, references, dynamicUnresolved, externalReferences, spaReferences };
}

// ---------------------------------------------------------------------------
// Phase 5: live probing
// ---------------------------------------------------------------------------

function toConcretePath(path) {
  return path
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) return "1";
      if (seg.startsWith("*")) return "probe-wildcard-segment";
      if (seg === ":param") return "1";
      return seg;
    })
    .join("/");
}

async function timedFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, redirect: "manual" });
    const bodyText = await res.text().catch(() => "");
    return { status: res.status, allow: res.headers.get("allow"), body: bodyText.slice(0, 500), ms: Date.now() - start };
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return { status: null, error: aborted ? "timeout" : String(err?.message || err), ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

// NOTE on methodology: this server answers EVERY OPTIONS request (real route
// or not) identically via a global CORS middleware (204, empty body), so
// OPTIONS cannot be used to test reachability here -- confirmed empirically
// before writing this. Its 404 catch-all, however, returns a distinctive,
// path-echoing JSON body for genuinely unmatched routes, which IS a reliable
// signature. And its CSRF middleware runs globally on non-GET requests
// (before routing) but uses an unsigned double-submit cookie, so a
// self-consistent random token satisfies it without needing a real session --
// also confirmed empirically. Both facts are load-bearing for the probing
// strategy below.
const CSRF_TOKEN = randomBytes(32).toString("hex");

function isGenericNotFound(resp, requestedPath) {
  if (!resp || resp.status !== 404 || !resp.body) return false;
  try {
    const parsed = JSON.parse(resp.body);
    return (
      parsed &&
      parsed.status === 404 &&
      parsed.error === "Not found" &&
      parsed.message === `API endpoint ${requestedPath} does not exist`
    );
  } catch {
    return false;
  }
}

function mutatingHeaders() {
  return {
    "Content-Type": "application/json",
    Cookie: `csrf-token=${CSRF_TOKEN}`,
    "X-CSRF-Token": CSRF_TOKEN,
  };
}

function normalizeSegments(path) {
  return path
    .split("?")[0]
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .map((seg) => (seg.startsWith(":") || seg.startsWith("*") || seg === "1" ? "*" : seg));
}

function pathsMatch(a, b) {
  const variants = (path) => [
    path,
    // Express 5's `{/:param}` syntax denotes an optional path segment.
    path.replace(/\{\/[^}]+\}/g, ""),
    path.replace(/\{\/[^}]+\}/g, "/:param"),
  ];
  return variants(a).some((left) => variants(b).some((right) => {
    const segA = normalizeSegments(left);
    const segB = normalizeSegments(right);
    if (segA.length !== segB.length) return false;
    return segA.every((s, i) => s === "*" || segB[i] === "*" || s === segB[i]);
  }));
}

function findBackendMatches(method, concretePath, backendInventory) {
  return backendInventory.filter((r) => r.method === method && pathsMatch(r.fullPath, concretePath));
}

async function runLiveProbes(backendInventory, frontendCalls) {
  // --- backend inventory: one real, safe request per unique (method, fullPath) ---
  // GET routes: invoked directly UNLESS their path matches the sensitive-keyword
  // blocklist (defensive net for a GET that isn't actually read-only).
  // Non-GET routes: invoked directly ONLY when this audit statically detected
  // a requireAuth/requireAuthOnly/requireAdmin/require2FA marker on that exact
  // registration -- the auth middleware then rejects with a clean 401/403
  // BEFORE the handler's own logic runs (confirmed by reading server/middleware/auth.ts),
  // so the handler's side effects never execute. Non-GET routes with no
  // detected auth marker (e.g. login, register, webhooks) are never invoked
  // live at all; their existence is reported from static analysis only.
  const uniqueBackend = new Map();
  for (const r of backendInventory) {
    const key = `${r.method}::${r.fullPath}`;
    if (!uniqueBackend.has(key)) uniqueBackend.set(key, r);
  }
  const backendList = [...uniqueBackend.values()];

  const backendResults = await pool(
    backendList,
    async (r) => {
      const concretePath = toConcretePath(r.fullPath);
      const url = `${BASE_URL}${concretePath}`;

      if (r.method === "GET") {
        if (SENSITIVE_KEYWORDS.test(r.fullPath)) {
          return { ...r, liveProbeSkipped: true, skipReason: "path matches sensitive-keyword blocklist" };
        }
        const probe = await timedFetch(url, { method: "GET" });
        return { ...r, probe, unreachable: isGenericNotFound(probe, concretePath) };
      }

      if (!r.hasAuthMarker) {
        return { ...r, liveProbeSkipped: true, skipReason: "public mutating endpoint -- not safe to invoke live" };
      }
      const probe = await timedFetch(url, { method: r.method, headers: mutatingHeaders(), body: "{}" });
      return { ...r, probe, unreachable: isGenericNotFound(probe, concretePath) };
    },
    CONCURRENCY,
  );

  // --- frontend calls: a GET-based path-existence probe is always safe; a
  // method-specific probe is added only when it is safe per the same
  // auth-marker rule above (looked up against the backend inventory). ---
  const uniqueFrontend = new Map();
  for (const c of frontendCalls) {
    const key = `${c.method}::${c.path}`;
    if (!uniqueFrontend.has(key)) uniqueFrontend.set(key, { ...c, occurrences: [] });
    uniqueFrontend.get(key).occurrences.push(`${c.file}:${c.line}`);
  }
  const frontendList = [...uniqueFrontend.values()];

  const frontendResults = await pool(
    frontendList,
    async (c) => {
      const concretePath = toConcretePath(c.path);
      const url = `${BASE_URL}${concretePath}`;
      const getProbe = await timedFetch(url, { method: "GET" });
      const pathExistsForGet = !isGenericNotFound(getProbe, concretePath);

      if (c.method === "GET") {
        if (pathExistsForGet) {
          return { ...c, missing: false, methodUnconfirmed: false, evidence: "live-get", getProbe };
        }
        if (c.methodConfidence === "assumed") {
          // GET was never actually confirmed for this call site -- before
          // asserting the whole route is missing, check whether ANY method is
          // statically registered at this exact path. If one is, the frontend
          // most likely calls it with a different (undetected) method, so the
          // honest conclusion is "unconfirmed", not "missing".
          const anyMethodMatch = backendInventory.find((r) => pathsMatch(r.fullPath, concretePath));
          if (anyMethodMatch) {
            return {
              ...c,
              missing: false,
              methodUnconfirmed: true,
              evidence: "assumed-get-but-other-method-registered",
              getProbe,
            };
          }
        }
        return { ...c, missing: true, methodUnconfirmed: false, evidence: "live-get", getProbe };
      }

      const matches = findBackendMatches(c.method, concretePath, backendInventory);
      const authGatedMatch = matches.find((m) => m.hasAuthMarker);
      if (authGatedMatch) {
        const probe = await timedFetch(url, { method: c.method, headers: mutatingHeaders(), body: "{}" });
        return {
          ...c,
          missing: isGenericNotFound(probe, concretePath),
          methodUnconfirmed: false,
          evidence: "live-method-specific",
          probe,
        };
      }
      if (matches.length > 0) {
        // Matched a statically-registered public (no-auth-marker) route -- not
        // safe to invoke live, but the static match itself is strong evidence.
        return { ...c, missing: false, methodUnconfirmed: false, evidence: "static-public-match" };
      }
      if (!pathExistsForGet) {
        // Nothing registered for this method, and not even for GET at the same
        // path -- combined static + live evidence of a genuinely missing route.
        return { ...c, missing: true, methodUnconfirmed: false, evidence: "live-get+no-static-match" };
      }
      // Something is registered at this path (for GET or another method), but
      // this audit could not safely confirm the specific method requested.
      return { ...c, missing: false, methodUnconfirmed: true, evidence: "ambiguous", getProbe };
    },
    CONCURRENCY,
  );

  return { backendResults, frontendResults };
}

function buildStaticFrontendResults(backendInventory, frontendCalls) {
  const unique = new Map();
  for (const call of frontendCalls) {
    const key = `${call.method}::${call.path}`;
    if (!unique.has(key)) unique.set(key, { ...call, occurrences: [] });
    unique.get(key).occurrences.push(`${call.file}:${call.line}`);
  }
  return [...unique.values()].map((call) => {
    const matches = findBackendMatches(call.method, call.path, backendInventory);
    const status =
      matches.length > 0
        ? "matched"
        : call.methodConfidence === "detected"
          ? "unmatched-confirmed"
          : "unmatched-unconfirmed";
    return {
      ...call,
      status,
      backendMatches: matches.map((match) => ({
        method: match.method,
        path: match.fullPath,
        file: match.file,
        line: match.line,
        confidence: match.confidence,
      })),
    };
  });
}

function buildStaticFindings(frontendResults, dynamicUnresolved) {
  const findings = [];
  let id = 1;
  for (const call of frontendResults) {
    if (call.status !== "unmatched-confirmed") continue;
    findings.push({
      id: `unmatched-confirmed-${id++}`,
      class: "unmatched-confirmed",
      severity: "high",
      method: call.method,
      path: call.path,
      locations: call.occurrences,
      description: `The frontend makes a detected ${call.method} ${call.path} request via ${call.source}, but no statically mounted backend registration matches this method and path.`,
      recommendation: "Confirm the intended API contract, then fix the frontend path or mount the existing router at the intended prefix. Do not add a placeholder route.",
    });
  }
  for (const unresolved of dynamicUnresolved) {
    findings.push({
      id: `dynamic-unresolved-${id++}`,
      class: "dynamic-unresolved",
      severity: "low",
      method: unresolved.method,
      path: null,
      locations: [`${unresolved.file}:${unresolved.line}`],
      description: `The frontend calls ${unresolved.source} with computed URL variable ${unresolved.expression}; this audit could not resolve it to a concrete API path.`,
      recommendation: "Trace the variable assignment and verify its resolved path against the mounted backend inventory.",
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Phase 6: assemble findings
// ---------------------------------------------------------------------------

function buildFindings({ backendInventory, unresolvedDynamic, frontendCalls, backendResults, frontendResults }) {
  const findings = [];
  let idCounter = 1;
  const nextId = (cls) => `${cls}-${idCounter++}`;

  // missing-route / method-unconfirmed (frontend perspective, live-confirmed where possible)
  for (const f of frontendResults) {
    if (f.missing) {
      const allPaths = [...new Set(backendInventory.map((r) => r.fullPath))];
      const nearest = allPaths
        .map((p) => ({ p, d: levenshtein(f.path, p) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .filter((x) => x.d <= Math.max(4, f.path.length * 0.3))
        .map((x) => x.p);
      const evidenceText =
        f.evidence === "live-method-specific"
          ? `a live ${f.method} request (routed past CSRF using a self-consistent token, exactly as this app's own auth middleware expects) reached this server's generic "route does not exist" handler instead of an auth check`
          : `a live GET probe to the same path also hit this server's generic "route does not exist" handler, and no static registration for ${f.method} at this path was found either`;
      findings.push({
        id: nextId("missing-route"),
        class: "missing-route",
        severity: "high",
        method: f.method,
        path: f.path,
        locations: f.occurrences,
        description: `The frontend calls ${f.method} ${f.path} (methodConfidence: ${f.methodConfidence}) from ${f.occurrences.join(", ")}. Live evidence: ${evidenceText}. This endpoint will 404 for every real user.`,
        recommendation:
          nearest.length > 0
            ? `Register a matching route in the appropriate server/routes/*.ts file, or fix the frontend call -- closest existing registered path(s): ${nearest.join(", ")}.`
            : `Register a matching route in the appropriate server/routes/*.ts file (no similarly-named existing route was found, so this is likely an entirely unbuilt endpoint, not a typo).`,
      });
    } else if (f.methodUnconfirmed) {
      const evidenceText =
        f.evidence === "assumed-get-but-other-method-registered"
          ? `this audit could not detect which HTTP method the frontend actually uses at this call site (methodConfidence: assumed, so it defaulted to checking GET); that GET 404s, but a different method IS statically registered at this exact path -- the frontend is likely calling it correctly with a method this audit's static detection simply missed`
          : `this audit found no statically-registered ${f.method} route matching this path, but a live GET to the same concrete path IS routed somewhere (not the generic "does not exist" response) -- so either a different handler happens to share this path, or this audit's static path/prefix resolution missed the real registration`;
      findings.push({
        id: nextId("method-unconfirmed"),
        class: "method-unconfirmed",
        severity: "low",
        method: f.method,
        path: f.path,
        locations: f.occurrences,
        description: `The frontend calls ${f.method} ${f.path} from ${f.occurrences.join(", ")}. ${evidenceText}. Not safe to live-probe the exact method without a confirmed auth gate, so this is reported as unconfirmed rather than broken.`,
        recommendation: `Manually confirm the real HTTP method used at this call site and that a matching handler exists for this exact path (grep server/ for the path's literal segments), or exercise it with an authenticated request.`,
      });
    }
  }

  // unreachable-route + duplicate-registration + stub-handler (backend perspective)
  const byMethodPath = new Map();
  for (const r of backendResults) {
    const key = `${r.method}::${r.fullPath}`;
    if (!byMethodPath.has(key)) byMethodPath.set(key, []);
    byMethodPath.get(key).push(r);
  }
  // duplicate registration needs ALL registrations, not just the deduped "first seen" used for probing
  const allByMethodPath = new Map();
  for (const r of backendInventory) {
    const key = `${r.method}::${r.fullPath}`;
    if (!allByMethodPath.has(key)) allByMethodPath.set(key, []);
    allByMethodPath.get(key).push(r);
  }

  for (const r of backendResults) {
    if (r.liveProbeSkipped) {
      // No live evidence either way -- intentionally not asserting reachable
      // or unreachable. Static duplicate/stub checks below still apply.
    } else if (r.unreachable) {
      const lowConfidence = r.confidence !== "high";
      const evidenceText =
        r.method === "GET"
          ? `a live unauthenticated GET`
          : `a live ${r.method} request (routed past CSRF using a self-consistent double-submit token) that should have hit this route's own auth middleware`;
      findings.push({
        id: nextId("unreachable-route"),
        class: "unreachable-route",
        severity: lowConfidence ? "medium" : "high",
        method: r.method,
        path: r.fullPath,
        locations: [`${r.file}:${r.line}`],
        description: lowConfidence
          ? `${r.file}:${r.line} registers ${r.method} ${r.rawPath} on a router whose mount prefix this audit resolved with ${r.confidence} confidence (computed full path: ${r.fullPath}, mounted from: ${(r.mountedFrom || []).join(", ") || "unknown"}). ${evidenceText} to the computed path hit this server's generic "route does not exist" handler. This may be a real routing bug, OR the computed prefix may be wrong -- verify the actual mount point manually before treating this as confirmed broken.`
          : `${r.file}:${r.line} registers ${r.method} ${r.fullPath} but ${evidenceText} against the running server hit this server's generic "route does not exist" handler, even though this audit is confident in the full path. Something earlier in the middleware/router chain is intercepting or shadowing this request before it reaches this handler.`,
        recommendation: lowConfidence
          ? `Confirm how this router is actually mounted (search for its import + .use( call), recompute the true full path, and re-test with: curl -i ${BASE_URL}<real-full-path>.`
          : `Check for (a) a duplicate/conflicting registration for this exact method+path (see duplicate-registration findings below), (b) another router mounted at a broader prefix earlier in server/routes.ts that matches this path first, (c) a middleware mounted before registerRoutes() that short-circuits the request.`,
      });
    } else if (r.probe) {
      if (r.probe.error) {
        findings.push({
          id: nextId("live-error"),
          class: "live-error",
          severity: "high",
          method: r.method,
          path: r.fullPath,
          locations: [`${r.file}:${r.line}`],
          description: `A live ${r.method} probe to ${r.fullPath} did not complete: ${r.probe.error}.`,
          recommendation: `Reproduce with curl -i -X ${r.method} ${BASE_URL}${toConcretePath(r.fullPath)} and check server logs for a hang or unhandled rejection in the handler at ${r.file}:${r.line}.`,
        });
      } else if (r.probe.status === 503) {
        // 503 is the conventional status for "a dependency isn't ready/reachable
        // yet", which well-built readiness/health endpoints return on purpose --
        // it is evidence of a degraded or still-warming dependency, not
        // necessarily a code defect in the handler itself. Report it distinctly
        // from a genuine 5xx crash so severity/counts aren't inflated by
        // intentional behavior.
        findings.push({
          id: nextId("service-unavailable"),
          class: "service-unavailable",
          severity: "low",
          method: r.method,
          path: r.fullPath,
          locations: [`${r.file}:${r.line}`],
          description: `A live ${r.method} probe to ${r.fullPath} returned HTTP 503. Response snippet: ${JSON.stringify(r.probe.body).slice(0, 200)}. 503 is the conventional "not ready / dependency unavailable" status, so this may be this handler correctly reporting a degraded or still-starting dependency rather than a code bug -- but it also means that dependency is genuinely down or slow right now.`,
          recommendation: `Confirm which dependency this handler checks and whether it is expected to be unavailable in this environment right now. If the dependency should be up, fix that dependency; if this is working as designed, no code change is needed here.`,
        });
      } else if (r.probe.status >= 500) {
        findings.push({
          id: nextId("live-error"),
          class: "live-error",
          severity: "high",
          method: r.method,
          path: r.fullPath,
          locations: [`${r.file}:${r.line}`],
          description: `A live ${r.method} probe to ${r.fullPath} returned HTTP ${r.probe.status} (expected a clean 401/403 if auth-gated, or a 2xx/4xx business response if public). Response snippet: ${JSON.stringify(r.probe.body).slice(0, 200)}`,
          recommendation: `Fix the unhandled error in the handler or its middleware at ${r.file}:${r.line}; reproduce with curl -i -X ${r.method} ${BASE_URL}${toConcretePath(r.fullPath)}.`,
        });
      }
    }
    if (r.stubMarkers && r.stubMarkers.length) {
      const strong = r.stubStrength === "strong";
      findings.push({
        id: nextId("stub-handler"),
        class: "stub-handler",
        severity: strong ? "medium" : "low",
        method: r.method,
        path: r.fullPath,
        locations: [`${r.file}:${r.line}`],
        description: strong
          ? `The handler registered at ${r.file}:${r.line} for ${r.method} ${r.fullPath} contains a strong incomplete-work marker in its source: ${r.stubMarkers.join(", ")}.`
          : `The handler registered at ${r.file}:${r.line} for ${r.method} ${r.fullPath} contains the word(s) "${r.stubMarkers.join(", ")}" nearby. This codebase also uses these words to NAME deliberate, documented infrastructure (e.g. an early-boot handoff stub) as well as genuine placeholders, so this keyword match alone does not distinguish the two -- read the surrounding code before treating it as unfinished work.`,
        recommendation: strong
          ? `Replace with a real implementation, or if intentionally unbuilt, gate the calling UI feature so it never reaches a silently-fake endpoint.`
          : `Read ${r.file} around line ${r.line} to confirm whether this is a deliberate, documented shim (leave it) or genuinely incomplete work (replace it or gate the calling UI feature).`,
      });
    }
  }

  for (const [key, group] of allByMethodPath.entries()) {
    if (group.length < 2) continue;
    const highConfidenceGroup = group.filter((g) => g.confidence === "high");
    if (highConfidenceGroup.length < 2) continue;
    const [method, path] = key.split("::");
    const hasHandoff = highConfidenceGroup.some((g) => g.callsNext);
    if (hasHandoff) {
      findings.push({
        id: nextId("duplicate-registration"),
        class: "duplicate-registration",
        severity: "low",
        method,
        path,
        locations: highConfidenceGroup.map((g) => `${g.file}:${g.line}`),
        description: `${method} ${path} is registered ${highConfidenceGroup.length} times: ${highConfidenceGroup.map((g) => `${g.file}:${g.line}`).join(", ")}. At least one registration calls next() conditionally, which is this codebase's pattern for a deliberate early/fallback handler that hands off to a later one rather than a true conflicting duplicate -- likely intentional, but verify the handoff condition is actually correct.`,
        recommendation: `Confirm the earlier handler's next()-handoff condition genuinely defers to the later handler in every case it should (e.g. it doesn't stay "active" forever due to a flag that's never flipped); if it does, no change is needed.`,
      });
      continue;
    }
    findings.push({
      id: nextId("duplicate-registration"),
      class: "duplicate-registration",
      severity: "medium",
      method,
      path,
      locations: highConfidenceGroup.map((g) => `${g.file}:${g.line}`),
      description: `${method} ${path} is registered ${highConfidenceGroup.length} times: ${highConfidenceGroup.map((g) => `${g.file}:${g.line}`).join(", ")}. Express dispatches to the first matching registration only.`,
      recommendation: `Keep the intended handler and delete, rename, or remount the others -- the later registration(s) are unreachable dead code today.`,
    });
  }

  for (const u of unresolvedDynamic) {
    findings.push({
      id: nextId("unresolved-dynamic-registration"),
      class: "unresolved-dynamic-registration",
      severity: "low",
      method: u.method,
      path: null,
      locations: [`${u.file}:${u.line}`],
      description: `${u.file}:${u.line} registers a ${u.method} route whose path is computed from an expression this audit could not statically resolve: \`${u.rawExpr}\`.`,
      recommendation: `Trace the expression to its source and confirm it resolves to the intended path(s); re-run this audit's static extractor logic manually against it if it represents many routes.`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Phase 7: report rendering
// ---------------------------------------------------------------------------

function renderStaticMarkdown({
  backendInventory,
  frontendResults,
  frontendCallCount,
  references,
  dynamicUnresolved,
  externalReferences,
  spaReferences,
  prefixMap,
  findings,
}) {
  const matched = frontendResults.filter((call) => call.status === "matched");
  const unmatched = frontendResults.filter((call) => call.status === "unmatched-confirmed");
  const uncertain = frontendResults.filter((call) => call.status === "unmatched-unconfirmed");
  const lines = [
    "# Static Frontend/Backend API Inventory",
    "",
    `Generated ${new Date().toISOString()} without live requests.`,
    "",
    `- Backend route registrations: **${backendInventory.length}** (${new Set(backendInventory.map((route) => `${route.method} ${route.fullPath}`)).size} unique method/path pairs).`,
    `- Mounted router files: **${prefixMap.size}**.`,
    `- Frontend API call sites: **${frontendCallCount}** (${frontendResults.length} unique method/path pairs).`,
    `- Matched: **${matched.length}**; unmatched confirmed: **${unmatched.length}**; method-unconfirmed: **${uncertain.length}**.`,
    `- Cache/comment/non-API references: **${references.length}**; external URL references: **${externalReferences.length}**; SPA URL references: **${spaReferences.length}**.`,
    `- Dynamic frontend URLs unresolved: **${dynamicUnresolved.length}**.`,
    "",
    "## Confirmed matches",
    "",
    "Every entry below has a statically detected frontend transport and at least one mounted backend route with the same method and normalized path. The full occurrence and backend location inventory is in `endpoint-audit.json`.",
    "",
  ];
  for (const call of matched) {
    lines.push(`- \`${call.method} ${call.path}\` via ${call.source} — ${call.file}:${call.line} → ${call.backendMatches.map((match) => `${match.file}:${match.line}`).join(", ")}`);
  }
  lines.push("", "## Unmatched confirmed frontend calls", "");
  if (!unmatched.length) lines.push("None.");
  for (const call of unmatched) {
    lines.push(`- **${call.method} ${call.path}** via ${call.source} — ${call.occurrences.join(", ")}`);
  }
  lines.push("", "## Method-unconfirmed frontend calls", "");
  if (!uncertain.length) lines.push("None.");
  for (const call of uncertain) {
    lines.push(`- \`${call.method} ${call.path}\` (${call.source}) — ${call.occurrences.join(", ")}`);
  }
  lines.push("", "## Dynamic unresolved URLs and registrations", "");
  if (!dynamicUnresolved.length) lines.push("None.");
  for (const item of dynamicUnresolved) {
    const label = item.source
      ? `${item.source}(${item.expression})`
      : `${item.method || "route"} ${item.rawExpr || "(expression unavailable)"}`;
    lines.push(`- \`${label}\` — ${item.file}:${item.line}`);
  }
  lines.push("", "## Non-network and non-API references", "");
  if (!references.length) lines.push("None.");
  for (const item of references) {
    lines.push(`- \`${item.kind}: ${item.rawPath}\` — ${item.file}:${item.line}`);
  }
  lines.push("", "## External URLs and SPA paths", "");
  lines.push(`External URL references: ${externalReferences.length}; SPA path references: ${spaReferences.length}. These are intentionally not compared with Express API routes.`);
  lines.push("", "## Mounted router prefixes", "");
  for (const [file, info] of prefixMap.entries()) {
    lines.push(`- \`${relative(ROOT, file)}\` → \`${info.prefix || "/"}\` (${(info.mountedFrom || []).join(", ") || "mount unresolved"})`);
  }
  lines.push("", "## Findings", "");
  if (!findings.length) lines.push("No confirmed frontend/backend path mismatches.");
  for (const finding of findings) {
    lines.push(`- **${finding.id}**: ${finding.description}`);
  }
  lines.push("", "## Scope and honesty notes", "");
  lines.push("- This is a static inventory only. It does not invoke routes, perform admin authentication, or make mutating requests.");
  lines.push("- `queryClient.invalidateQueries`/`setQueryData` entries are cache keys, not network calls. Query keys with a custom `queryFn` are listed as references; the custom fetch is inventoried separately.");
  lines.push("- Template placeholders are normalized to `:param`; computed URLs without a literal assignment remain dynamic unresolved rather than guessed.");
  lines.push("- External URLs and SPA navigation paths are not API contracts. A component is not reported as needing an endpoint merely because it contains a cache key, link, or documentation example.");
  return lines.join("\n");
}

function serializePrefixMap(prefixMap) {
  return [...prefixMap.entries()].map(([file, info]) => ({
    file: relative(ROOT, file),
    prefix: info.prefix,
    mountedFrom: info.mountedFrom || [],
  }));
}

function renderMarkdown(findings, meta) {
  const bySeverity = { high: [], medium: [], low: [] };
  for (const f of findings) bySeverity[f.severity]?.push(f);

  const lines = [];
  lines.push(`# Endpoint Audit Report`);
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()} against \`${BASE_URL}\`.`);
  lines.push("");
  lines.push(
    `Backend routes statically found: ${meta.backendCount} (unique method+path: ${meta.uniqueBackendCount}). Frontend \`/api/*\` call sites found: ${meta.frontendCallCount} (unique method+path: ${meta.uniqueFrontendCount}). Unresolved dynamic registrations: ${meta.unresolvedDynamicCount}.`,
  );
  lines.push("");
  lines.push(
    `**Findings: ${findings.length} total — ${bySeverity.high.length} high, ${bySeverity.medium.length} medium, ${bySeverity.low.length} low.**`,
  );
  lines.push("");

  for (const sev of ["high", "medium", "low"]) {
    if (!bySeverity[sev].length) continue;
    lines.push(`## ${sev.toUpperCase()} severity (${bySeverity[sev].length})`);
    lines.push("");
    for (const f of bySeverity[sev]) {
      lines.push(`### ${f.id}: ${f.class} — ${f.method} ${f.path ?? "(path unresolved)"}`);
      lines.push(`- **Location:** ${f.locations.join(", ")}`);
      lines.push(`- **Description:** ${f.description}`);
      lines.push(`- **Recommendation:** ${f.recommendation}`);
      lines.push("");
    }
  }

  if (!findings.length) {
    lines.push(
      "No broken or missing endpoints found by any of this audit's checks (missing routes, method mismatches, unreachable registrations, duplicate registrations, stub markers, live 5xx/timeouts). See the Limits section below for what this audit does not cover.",
    );
    lines.push("");
  }

  lines.push(`## Methodology and honesty notes`);
  lines.push("");
  lines.push(
    "- This server answers every `OPTIONS` request identically (204, empty body) via a global CORS middleware, confirmed empirically before this audit was built, so `OPTIONS` cannot distinguish a real route from a fake one here. Reachability is instead checked with real requests: GET routes are hit directly; non-GET routes are hit with their real method plus a self-consistent CSRF double-submit token (satisfying `server/middleware/csrf.ts`, which does not verify the token was server-issued), but ONLY when this audit statically detected `requireAuth`/`requireAuthOnly`/`requireAdmin`/`require2FA` on that exact registration -- the auth middleware then rejects with a clean 401/403 before the handler's own logic runs (confirmed by reading `server/middleware/auth.ts`), so no side effects occur. \"Route exists\" vs \"route does not exist\" is judged against this server's actual 404 body template (`API endpoint <path> does not exist`), not a fixed baseline, because that template echoes the requested path.",
  );
  lines.push(
    "- Non-GET routes with NO detected auth marker (e.g. login, register, webhooks, public contact/verify endpoints) are never invoked live, by design -- there is no safe way to test them without risking a real side effect. Their presence in this report comes from static source analysis only; treat any finding that touches one of these paths as needing manual confirmation, and note that the absence of a finding does NOT mean this audit confirmed them working.",
  );
  lines.push(
    "- Frontend calls with a detected non-GET method that this audit could not safely live-probe are reported as `method-unconfirmed` (low severity) rather than asserted as broken or working, when a live GET to the same path suggests something is registered there.",
  );
  lines.push(
    "- Only `/api/*`-style paths reachable through a statically-extractable string literal or a simple array+for-loop pattern are covered. Routes built from more dynamic expressions are listed under `unresolved-dynamic-registration`, not silently skipped.",
  );
  lines.push(
    "- Router mount prefixes are resolved by tracing imports and `.use(` calls; entries marked with medium/low confidence could not be resolved with full certainty and are flagged as such in their own description rather than asserted as confirmed bugs.",
  );
  lines.push(
    "- A route can pass every check in this audit and still contain a functional bug that only appears with real authenticated data (e.g. a wrong SQL join, an incorrect calculation) -- this audit verifies routing-layer reachability and obvious stub/crash signals, not business-logic correctness.",
  );
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[audit] scanning server/ ...`);
  const { inventory: backendInventory, unresolvedDynamic, prefixMap } = buildBackendInventory();
  console.log(`[audit] backend routes found: ${backendInventory.length}`);

  console.log(`[audit] scanning client/src/ ...`);
  const frontendInventory = extractFrontendCalls();
  const frontendCalls = frontendInventory.calls;
  console.log(`[audit] frontend /api/* call sites found: ${frontendCalls.length}`);

  if (STATIC_ONLY) {
    const frontendResults = buildStaticFrontendResults(backendInventory, frontendCalls);
    const allDynamic = [...unresolvedDynamic, ...frontendInventory.dynamicUnresolved];
    const findings = buildStaticFindings(frontendResults, frontendInventory.dynamicUnresolved);
    const matchedCount = frontendResults.filter((call) => call.status === "matched").length;
    const unmatchedConfirmedCount = frontendResults.filter((call) => call.status === "unmatched-confirmed").length;
    const meta = {
      mode: "static",
      backendCount: backendInventory.length,
      uniqueBackendCount: new Set(backendInventory.map((route) => `${route.method}::${route.fullPath}`)).size,
      frontendCallCount: frontendCalls.length,
      uniqueFrontendCount: frontendResults.length,
      matchedCount,
      unmatchedConfirmedCount,
      methodUnconfirmedCount: frontendResults.filter((call) => call.status === "unmatched-unconfirmed").length,
      frontendReferenceCount: frontendInventory.references.length,
      externalReferenceCount: frontendInventory.externalReferences.length,
      spaReferenceCount: frontendInventory.spaReferences.length,
      unresolvedDynamicCount: allDynamic.length,
      mountedRouterCount: prefixMap.size,
    };
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(
      join(REPORT_DIR, "endpoint-audit.json"),
      JSON.stringify({
        meta,
        findings,
        generatedAt: new Date().toISOString(),
        baseUrl: null,
        backendRoutes: backendInventory,
        mountedRouters: serializePrefixMap(prefixMap),
        frontendCalls: frontendResults,
        frontendReferences: frontendInventory.references,
        externalReferences: frontendInventory.externalReferences,
        spaReferences: frontendInventory.spaReferences,
        unresolvedDynamic: allDynamic,
      }, null, 2),
    );
    writeFileSync(
      join(REPORT_DIR, "endpoint-audit.md"),
      renderStaticMarkdown({
        backendInventory,
        frontendResults,
        frontendCallCount: frontendCalls.length,
        references: frontendInventory.references,
        dynamicUnresolved: allDynamic,
        externalReferences: frontendInventory.externalReferences,
        spaReferences: frontendInventory.spaReferences,
        prefixMap,
        findings,
      }),
    );
    console.log(`[audit] static report written; ${matchedCount} matched, ${unmatchedConfirmedCount} unmatched confirmed, ${allDynamic.length} dynamic unresolved`);
    return;
  }

  console.log(`[audit] probing live server at ${BASE_URL} (this is read-only / OPTIONS-safe) ...`);
  const { backendResults, frontendResults } = await runLiveProbes(backendInventory, frontendCalls);
  console.log(`[audit] probed ${backendResults.length} unique backend routes, ${frontendResults.length} unique frontend calls`);

  const findings = buildFindings({
    backendInventory,
    unresolvedDynamic,
    frontendCalls,
    backendResults,
    frontendResults,
  });

  const meta = {
    backendCount: backendInventory.length,
    uniqueBackendCount: backendResults.length,
    frontendCallCount: frontendCalls.length,
    uniqueFrontendCount: frontendResults.length,
    unresolvedDynamicCount: unresolvedDynamic.length,
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    join(REPORT_DIR, "endpoint-audit.json"),
    JSON.stringify({ meta, findings, generatedAt: new Date().toISOString(), baseUrl: BASE_URL }, null, 2),
  );
  writeFileSync(join(REPORT_DIR, "endpoint-audit.md"), renderMarkdown(findings, meta));

  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const f of findings) bySeverity[f.severity]++;
  console.log(
    `[audit] done. ${findings.length} findings (${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low).`,
  );
  console.log(`[audit] reports/endpoint-audit.json, reports/endpoint-audit.md`);
}

main().catch((err) => {
  console.error("[audit] fatal error:", err);
  process.exit(1);
});
