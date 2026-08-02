#!/usr/bin/env node
/**
 * Report-driven server typecheck remediation pipeline.
 *
 * Usage:
 *   node scripts/typecheck-fix-all.mjs --dry-run --input /tmp/tc_server.txt
 *   node scripts/typecheck-fix-all.mjs --apply --input /tmp/tc_server.txt
 *
 * It never silently converts a database/schema, query-builder, or API-contract
 * defect into `any`. Every compiler diagnostic is written to reports/typecheck
 * with source context and an explicit remediation class:
 *   auto      — eligible for a context-verified mechanical transformation
 *   schema    — must be reconciled with the real app database before editing
 *   targeted  — needs a behavior-preserving, source-specific repair
 *
 * `--apply` intentionally runs only handlers whose guard checks pass. It then
 * writes a new report from a clean typecheck. A parser-error increase fails the
 * command; no success is reported while unresolved diagnostics remain.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const inputIndex = process.argv.indexOf("--input");
const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : undefined;
const reportDir = path.join(ROOT, "reports", "typecheck");

const POLICY = new Map([
  ["TS6133", ["auto", "Remove an unused import or declaration only after an AST/context check."]],
  ["TS6192", ["auto", "Remove an all-unused import declaration."]],
  ["TS6196", ["auto", "Remove an unused type-only declaration."]],
  ["TS18046", ["auto", "Narrow an unknown caught or dynamic value at the exact use site."]],
  ["TS2571", ["auto", "Narrow an unknown value at the exact use site."]],
  ["TS18047", ["auto", "Add an explicit null guard or a verified non-null assertion."]],
  ["TS18048", ["auto", "Add an explicit undefined guard or a verified non-null assertion."]],
  ["TS18049", ["auto", "Add an explicit null-or-undefined guard before use."]],
  ["TS2352", ["auto", "Use an intentional unknown bridge only when the conversion is deliberate."]],
  ["TS7006", ["auto", "Infer or explicitly type an untyped parameter."]],
  ["TS7031", ["auto", "Type a destructured binding."]],
  ["TS2307", ["targeted", "Resolve the import path to an existing module; never add a dummy declaration."]],
  ["TS2305", ["targeted", "Align the import to a real exported symbol."]],
  ["TS2724", ["targeted", "Align the import to the module's suggested exported symbol."]],
  ["TS2769", ["targeted", "Inspect overload context; common cases are logger ordering, Date inputs, or SDK option drift."]],
  ["TS2322", ["targeted", "Reconcile the source and target data contracts."]],
  ["TS2345", ["targeted", "Reconcile the argument contract, preserving runtime validation."]],
  ["TS2349", ["targeted", "Correct an invalid callable value rather than casting it."]],
  ["TS2353", ["schema", "Check the real database/schema or owning interface before changing an object literal."]],
  ["TS2339", ["schema", "Check whether the member is a real schema/API field before fixing the access."]],
  ["TS2551", ["schema", "Use the suggested real member only after validating semantic equivalence."]],
  ["TS2740", ["targeted", "Reconcile a collection/object contract."]],
  ["TS2365", ["targeted", "Narrow arithmetic inputs to numeric values."]],
  ["TS2362", ["targeted", "Narrow the left arithmetic operand to a numeric value."]],
  ["TS2363", ["targeted", "Narrow the right arithmetic operand to a numeric value."]],
  ["TS7053", ["targeted", "Validate dynamic keys and provide an intentional indexed type."]],
  ["TS2558", ["targeted", "Remove unsupported generic parameters or make the target generic."]],
  ["TS2488", ["targeted", "Validate iterable input before destructuring or spreading."]],
  ["TS2532", ["targeted", "Guard a possibly undefined value."]],
  ["TS2538", ["targeted", "Narrow the index expression to a valid property key."]],
  ["TS2698", ["targeted", "Validate a spread source is an object."]],
  ["TS2694", ["targeted", "Use a real exported namespace member."]],
  ["TS2721", ["targeted", "Guard a possibly undefined invocation target."]],
  ["TS2561", ["schema", "Validate the suggested property against the owning database/API contract."]],
  ["TS2411", ["targeted", "Align index signatures with their declared values."]],
  ["TS2430", ["targeted", "Reconcile an interface extension with its base type."]],
  ["TS2416", ["targeted", "Reconcile an overridden method with its base signature."]],
  ["TS2351", ["targeted", "Correct an invalid constructor target."]],
  ["TS2554", ["targeted", "Supply the required arguments or correct the call contract."]],
  ["TS2783", ["targeted", "Remove duplicate object-property assignment."]],
  ["TS2677", ["targeted", "Correct an invalid type predicate."]],
  ["TS2678", ["targeted", "Correct an impossible switch/comparison branch."]],
  ["TS2367", ["targeted", "Correct an unintentional incompatible comparison."]],
  ["TS2531", ["targeted", "Guard a possibly null value."]],
  ["TS2741", ["targeted", "Supply missing required object properties."]],
  ["TS2739", ["targeted", "Supply required object properties."]],
  ["TS2722", ["targeted", "Guard a possibly undefined callable value."]],
  ["TS2683", ["targeted", "Type the implicit this context."]],
  ["TS2561", ["schema", "Validate the suggested field against the owning contract."]],
  ["TS2559", ["targeted", "Correct incompatible structural assignment."]],
  ["TS2556", ["targeted", "Provide a tuple/spread compatible with the call signature."]],
  ["TS2454", ["targeted", "Initialize or guard the value before use."]],
  ["TS2440", ["targeted", "Resolve the conflicting import declaration."]],
  ["TS2300", ["targeted", "Remove or rename duplicate declarations."]],
  ["TS2304", ["targeted", "Import or declare the missing symbol from its real owning module."]],
  ["TS2341", ["targeted", "Expose a safe public API or move the access inside the owning class."]],
  ["TS2503", ["targeted", "Import the package's supported type namespace or replace stale namespace usage."]],
  ["TS7016", ["targeted", "Install or write a precise declaration for the untyped module."]],
  ["TS2395", ["targeted", "Use consistent export modifiers across merged declarations."]],
  ["TS7034", ["auto", "Add an explicit type to an implicitly-any variable."]],
  ["TS7005", ["auto", "Add an explicit type to an implicitly-any variable."]],
  ["TS6138", ["auto", "Remove an unused constructor parameter property after use-site review."]],
]);

function freshTypecheck() {
  try {
    execFileSync("rm", ["-f", ".cache/tsbuildinfo.server"], { cwd: ROOT });
    execFileSync("npx", ["tsc", "-p", "tsconfig.server.json", "--noEmit"], {
      cwd: ROOT,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
      stdio: "pipe",
      timeout: 280_000,
    });
    return "";
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}

function parse(output) {
  const rows = [];
  const re = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;
  let match;
  while ((match = re.exec(output))) {
    const [, file, line, column, code, message] = match;
    const sourcePath = path.join(ROOT, file);
    let context = null;
    if (existsSync(sourcePath)) {
      const lines = readFileSync(sourcePath, "utf8").split("\n");
      const at = Number(line) - 1;
      context = {
        before: lines[at - 1] ?? "",
        line: lines[at] ?? "",
        after: lines[at + 1] ?? "",
      };
    }
    const [kind, recommendation] = POLICY.get(code) ?? [
      "targeted",
      "Add a reviewed handler for this previously unseen diagnostic code.",
    ];
    rows.push({
      code,
      kind,
      recommendation,
      file,
      line: Number(line),
      column: Number(column),
      message,
      context,
    });
  }
  return rows;
}

function hasParserErrors(rows) {
  return rows.some((row) => /^TS1(?:0\d\d|1\d\d|4\d\d)$/.test(row.code));
}

function groupRows(rows, key) {
  return rows.reduce((groups, row) => {
    const value = row[key];
    (groups[value] ??= []).push(row);
    return groups;
  }, {});
}

function writeReport(rows, mode) {
  mkdirSync(reportDir, { recursive: true });
  const byCode = groupRows(rows, "code");
  const byKind = groupRows(rows, "kind");
  const unknown = rows.filter((row) => !POLICY.has(row.code));
  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    total: rows.length,
    parserErrors: hasParserErrors(rows),
    coverage: {
      classified: rows.length - unknown.length,
      unclassified: unknown.length,
      auto: byKind.auto?.length ?? 0,
      schema: byKind.schema?.length ?? 0,
      targeted: byKind.targeted?.length ?? 0,
    },
    categories: Object.fromEntries(
      Object.entries(byCode)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, diagnostics]) => [
          code,
          {
            count: diagnostics.length,
            kind: diagnostics[0].kind,
            recommendation: diagnostics[0].recommendation,
            examples: diagnostics.slice(0, 5),
          },
        ]),
    ),
    diagnostics: rows,
  };
  writeFileSync(path.join(reportDir, "server-diagnostics.json"), JSON.stringify(report, null, 2));
  const markdown = [
    "# Server Typecheck Fix-All Report",
    "",
    `Mode: ${mode}`,
    `Total diagnostics: ${report.total}`,
    `Parser errors: ${report.parserErrors ? "yes" : "no"}`,
    `Classified: ${report.coverage.classified}/${report.total}`,
    `Automatic candidates: ${report.coverage.auto}`,
    `Schema checks required: ${report.coverage.schema}`,
    `Targeted fixes required: ${report.coverage.targeted}`,
    "",
    "## Categories",
    "",
    ...Object.entries(report.categories).flatMap(([code, group]) => [
      `### ${code} — ${group.count} (${group.kind})`,
      group.recommendation,
      ...group.examples.map(
        (item) =>
          `- \`${item.file}:${item.line}:${item.column}\` — ${item.message}\n  \`${item.context?.line?.trim() || "source unavailable"}\``,
      ),
      "",
    ]),
  ].join("\n");
  writeFileSync(path.join(reportDir, "server-diagnostics.md"), markdown);
  return report;
}

function runSafeHandlers(input) {
  // Existing broad codemods are deliberately NOT invoked: a previous pass showed
  // that source-position-only casts can corrupt optional chaining. The registry
  // is a safety gate, not a license to modify every category blindly.
  const safeHandlers = [];
  const outcome = safeHandlers.map((handler) => {
    execFileSync("node", [handler, input], { cwd: ROOT, stdio: "inherit" });
    return handler;
  });
  return outcome;
}

const raw = inputPath
  ? readFileSync(path.resolve(ROOT, inputPath), "utf8")
  : freshTypecheck();
const diagnostics = parse(raw);
const before = writeReport(diagnostics, apply ? "apply-preflight" : "dry-run");

if (before.coverage.unclassified > 0) {
  console.error(`Refusing to apply: ${before.coverage.unclassified} diagnostics are unclassified.`);
  process.exitCode = 2;
} else if (before.parserErrors) {
  console.error("Refusing to apply: parser errors must be repaired before source transformations.");
  process.exitCode = 2;
} else if (!apply) {
  console.log(
    `Dry run passed: all ${before.total} diagnostics classified. ` +
      `${before.coverage.auto} automatic candidates; ${before.coverage.schema} schema checks; ` +
      `${before.coverage.targeted} targeted fixes. Report: reports/typecheck/server-diagnostics.md`,
  );
} else {
  const applied = runSafeHandlers(inputPath);
  const afterRows = parse(freshTypecheck());
  const after = writeReport(afterRows, "apply-postflight");
  if (after.parserErrors) {
    console.error("Postflight failed: parser errors detected; inspect report before continuing.");
    process.exitCode = 2;
  } else {
    console.log(
      `Apply completed safely (${applied.length} handlers). ` +
        `Remaining diagnostics: ${after.total}. Report: reports/typecheck/server-diagnostics.md`,
    );
    if (after.total > 0) process.exitCode = 1;
  }
}