#!/usr/bin/env node
// One-off scanner: find optional-chaining (`?.`) corruption that the codemod
// injected INSIDE string/template-literal TEXT (not inside ${} interpolations,
// not in regex, not in comments). Such `?.` is never valid in SQL/URLs/paths/
// emails and throws or silently breaks at runtime.
const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const roots = ["server", "shared", "client/src", "dns-os", "dns-node", "scripts"].filter((d) => fs.existsSync(d));

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mts|cts)$/.test(e.name) && !full.includes("_scan_oc")) yield full;
  }
}

const PATTERN = /[A-Za-z0-9_\]\)]\?\.[A-Za-z0-9_]/g;
let totalFiles = 0;
let totalHits = 0;
const perFile = [];

for (const root of roots) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const literalZones = []; // [start,end) full ranges of string/template literals
    const interpZones = []; // [start,end) of ${expr} expressions to exclude
    function visit(node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        literalZones.push([node.getStart(sf), node.getEnd()]);
      } else if (ts.isTemplateExpression(node)) {
        literalZones.push([node.getStart(sf), node.getEnd()]);
        for (const span of node.templateSpans) {
          interpZones.push([span.expression.getStart(sf), span.expression.getEnd()]);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    const inLiteral = (i) => literalZones.some(([s, e]) => i >= s && i < e);
    const inInterp = (i) => interpZones.some(([s, e]) => i >= s && i < e);

    const hits = [];
    let m;
    PATTERN.lastIndex = 0;
    while ((m = PATTERN.exec(text)) !== null) {
      const qIdx = m.index + 1; // position of '?'
      if (inLiteral(qIdx) && !inInterp(qIdx)) {
        const line = text.slice(0, qIdx).split("\n").length;
        hits.push({ qIdx, line, snip: text.slice(Math.max(0, m.index - 20), m.index + 18).replace(/\n/g, "\\n") });
      }
    }
    if (hits.length) {
      perFile.push({ file, hits });
      totalFiles++;
      totalHits += hits.length;
      if (APPLY) {
        // Delete each '?' that precedes the '.' — operate back-to-front.
        let out = text;
        for (const h of [...hits].sort((a, b) => b.qIdx - a.qIdx)) {
          out = out.slice(0, h.qIdx) + out.slice(h.qIdx + 1);
        }
        fs.writeFileSync(file, out);
      }
    }
  }
}

for (const { file, hits } of perFile) {
  console.log(`\n${file}  (${hits.length})`);
  for (const h of hits) console.log(`  L${h.line}: …${h.snip}…`);
}
console.log(`\n${APPLY ? "FIXED" : "FOUND"}: ${totalHits} hits across ${totalFiles} files`);
