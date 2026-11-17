#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "../..");
const OUTPUT_PARTS = [".local", "repository-verification", "understanding"];
const MAX_FILES = 50_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_SYMBOLS_PER_FILE = 200;
const MAX_ROUTES_PER_FILE = 200;
const MAX_REFERENCES_PER_FILE = 500;
const MAX_REFERENCE_CANDIDATES = 20_000;
const MAX_REFERENCE_EDGES = 10_000;
const MAX_COVERAGE_CANDIDATES = 200;
const MAX_UNFINISHED_CANDIDATES = 500;
const MAX_DOSSIER_BYTES = 32 * 1024 * 1024;
const MODULES_PER_SHARD = 100;
const SOURCE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cjs", ".cts", ".go", ".h", ".hpp", ".java",
  ".js", ".jsx", ".mjs", ".mts", ".php", ".py", ".rb", ".rs", ".sh",
  ".sql", ".ts", ".tsx", ".vue", ".atlas",
]);
const PARSEABLE_JS_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const TEST_PATH = /(^|\/)(test|tests|__tests__|spec|specs)(\/|$)|[._-](test|spec)\.[^.]+$/i;
const EXCLUDED_PARTS = new Set([
  ".git", ".local", "node_modules", "dist", "coverage", "generated-artifacts",
  "archive-capsules", "attached_assets", "vendor", "target", "build",
]);
const SENSITIVE_NAME = /(^|\/)\.env(?:\.[^/]*)?(?:\/|$)|(^|\/)(?:secrets?|credentials?)(?:[-_.][^/]*)?(?:\/|$)|\.(?:pem|key|p12|pfx)$/i;
const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "all", "use"]);
const JS_RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const require = createRequire(import.meta.url);

let typescript;
try {
  typescript = require("typescript");
} catch (error) {
  throw new Error(`The repository-understanding parser requires the installed TypeScript package: ${error.message}`);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeStructuralLiteral(value) {
  let safe = String(value)
    .replace(/\b(?:sk|pk|rk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/gi, "[REDACTED]")
    .replace(/\b(?:AIza[0-9A-Za-z_-]{25,}|AKIA[0-9A-Z]{16}|ya29\.[0-9A-Za-z_-]{20,})\b/g, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{16,}\b/gi, "Bearer [REDACTED]")
    .replace(/((?:api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password|authorization)[=:])[^&?#\s]+/gi,
      "$1[REDACTED]");
  if (/^https?:\/\//i.test(safe)) {
    try {
      const url = new URL(safe);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      safe = url.toString();
    } catch {
      return "[REDACTED-URL]";
    }
  }
  return safe;
}

function seal(report) {
  const unsigned = { ...report };
  delete unsigned.integrity;
  return {
    ...unsigned,
    integrity: { algorithm: "sha256", sha256: sha256(canonical(unsigned)) },
  };
}

function verifySealedReport(report, digestKey = "sha256") {
  if (!report || typeof report !== "object" || report.integrity?.algorithm !== "sha256" ||
      typeof report.integrity[digestKey] !== "string") return false;
  const unsigned = { ...report };
  delete unsigned.integrity;
  return report.integrity[digestKey] === sha256(canonical(unsigned));
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "buffer",
    timeout: 15_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: process.env.HOME || "/tmp", LANG: "C" },
  });
  if (result.error) throw new Error(`git ${args.join(" ")} failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} exited ${result.status}: ${result.stderr.toString("utf8").trim()}`);
  }
  return result.stdout;
}

function fileList(root) {
  const raw = git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  const names = [...new Set(raw.toString("utf8").split("\0").filter(Boolean))]
    .filter(name => !name.split("/").some(part => EXCLUDED_PARTS.has(part)))
    .sort();
  const sensitiveExcludedCount = names.filter(name => SENSITIVE_NAME.test(name)).length;
  const paths = names
    .filter(name => !SENSITIVE_NAME.test(name))
    .filter(name => SOURCE_EXTENSIONS.has(path.posix.extname(name).toLowerCase()) ||
      path.posix.basename(name) === "package.json");
  return { paths, sensitiveExcludedCount };
}

function isTestPath(name) {
  return TEST_PATH.test(name);
}

function moduleScriptKind(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".tsx") return typescript.ScriptKind.TSX;
  if (ext === ".jsx") return typescript.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(ext)) return typescript.ScriptKind.JS;
  return typescript.ScriptKind.TS;
}

function isStringLike(node) {
  return typescript.isStringLiteralLike(node) || typescript.isNoSubstitutionTemplateLiteral(node);
}

function exportedNames(statement) {
  if (!statement.modifiers?.some(modifier => modifier.kind === typescript.SyntaxKind.ExportKeyword)) return [];
  if (statement.modifiers.some(modifier => modifier.kind === typescript.SyntaxKind.DefaultKeyword)) {
    return ["default"];
  }
  if (typescript.isFunctionDeclaration(statement) || typescript.isClassDeclaration(statement) ||
      typescript.isInterfaceDeclaration(statement) || typescript.isTypeAliasDeclaration(statement) ||
      typescript.isEnumDeclaration(statement)) {
    return statement.name ? [statement.name.text] : ["default"];
  }
  if (typescript.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .filter(declaration => typescript.isIdentifier(declaration.name))
      .map(declaration => declaration.name.text);
  }
  return [];
}

function declaredSymbols(statement) {
  const line = node => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const exported = Boolean(statement.modifiers?.some(modifier =>
    modifier.kind === typescript.SyntaxKind.ExportKeyword));
  if (typescript.isFunctionDeclaration(statement) || typescript.isClassDeclaration(statement) ||
      typescript.isInterfaceDeclaration(statement) || typescript.isTypeAliasDeclaration(statement) ||
      typescript.isEnumDeclaration(statement)) {
    if (!statement.name) return [];
    const kind = typescript.isFunctionDeclaration(statement) ? "function" :
      typescript.isClassDeclaration(statement) ? "class" :
        typescript.isInterfaceDeclaration(statement) ? "interface" :
          typescript.isTypeAliasDeclaration(statement) ? "type" : "enum";
    return [{ name: statement.name.text, kind, line: line(statement), exported }];
  }
  if (typescript.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .filter(declaration => typescript.isIdentifier(declaration.name))
      .map(declaration => ({
        name: declaration.name.text,
        kind: declaration.initializer &&
          (typescript.isArrowFunction(declaration.initializer) ||
           typescript.isFunctionExpression(declaration.initializer)) ? "function" : "variable",
        line: line(declaration),
        exported,
      }));
  }
  return [];
}

function analyzeJavaScript(name, content) {
  let parseName = name;
  let text = content;
  let lineOffset = 0;
  if (path.extname(name).toLowerCase() === ".vue") {
    const script = content.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i);
    if (!script) return {
      parser: "vue-script-extraction",
      imports: [],
      exports: [],
      symbols: [],
      references: [],
      routes: [],
      parseErrors: [],
    };
    text = script[1];
    lineOffset = content.slice(0, script.index + script[0].indexOf(script[1])).split("\n").length - 1;
    parseName = `${name}.ts`;
  }
  const source = typescript.createSourceFile(
    parseName, text, typescript.ScriptTarget.Latest, true, moduleScriptKind(parseName),
  );
  const imports = [];
  const exports = [];
  const symbols = [];
  const references = [];
  const routes = [];
  const parseErrors = (source.parseDiagnostics ?? []).slice(0, 20).map(item => ({
    line: source.getLineAndCharacterOfPosition(item.start ?? 0).line + 1 + lineOffset,
    message: typescript.flattenDiagnosticMessageText(item.messageText, " "),
  }));
  for (const statement of source.statements) {
    symbols.push(...declaredSymbols(statement).map(item => ({
      ...item,
      line: item.line + lineOffset,
    })));
    exports.push(...exportedNames(statement).map(symbol => ({
      name: symbol,
      line: source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1 + lineOffset,
    })));
    if (typescript.isImportDeclaration(statement) || typescript.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier;
      if (specifier && isStringLike(specifier)) {
        const bindings = [];
        if (typescript.isImportDeclaration(statement) && statement.importClause) {
          const clause = statement.importClause;
          if (clause.name) bindings.push({ localName: clause.name.text, importedName: "default" });
          if (clause.namedBindings && typescript.isNamespaceImport(clause.namedBindings)) {
            bindings.push({ localName: clause.namedBindings.name.text, importedName: "*" });
          } else if (clause.namedBindings && typescript.isNamedImports(clause.namedBindings)) {
            for (const element of clause.namedBindings.elements) {
              bindings.push({
                localName: element.name.text,
                importedName: element.propertyName?.text ?? element.name.text,
              });
            }
          }
        }
        imports.push({
          specifier: safeStructuralLiteral(specifier.text),
          kind: typescript.isImportDeclaration(statement) ? "import" : "re-export",
          line: source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1 + lineOffset,
          bindings,
        });
      }
    }
  }
  const referenceName = expression => {
    if (typescript.isIdentifier(expression)) return { name: expression.text, namespace: null };
    if (typescript.isPropertyAccessExpression(expression) &&
        typescript.isIdentifier(expression.expression)) {
      return { name: expression.name.text, namespace: expression.expression.text };
    }
    return null;
  };
  const addReference = (kind, expression, node) => {
    if (references.length >= MAX_REFERENCES_PER_FILE) return;
    const target = referenceName(expression);
    if (!target) return;
    references.push({
      kind,
      ...target,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 + lineOffset,
    });
  };
  const visit = node => {
    if (typescript.isCallExpression(node)) {
      const expression = node.expression;
      if ((typescript.isIdentifier(expression) && expression.text === "require") ||
          expression.kind === typescript.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && isStringLike(arg)) {
          imports.push({
            specifier: safeStructuralLiteral(arg.text),
            kind: typescript.isIdentifier(expression) ? "require" : "dynamic-import",
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 + lineOffset,
          });
        }
      } else {
        addReference("calls", expression, node);
      }
      if (typescript.isPropertyAccessExpression(expression) &&
          ROUTE_METHODS.has(expression.name.text.toLowerCase())) {
        const first = node.arguments[0];
        if (first && isStringLike(first) && first.text.startsWith("/")) {
          routes.push({
            method: expression.name.text.toUpperCase(),
            path: safeStructuralLiteral(first.text),
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 + lineOffset,
            evidence: "TypeScript AST literal route candidate",
            confidence: "medium",
          });
        }
      }
    } else if (typescript.isNewExpression(node)) {
      addReference("creates", node.expression, node);
    } else if (typescript.isExpressionWithTypeArguments(node) &&
        node.parent?.token === typescript.SyntaxKind.ExtendsKeyword) {
      addReference("extends", node.expression, node);
    }
    typescript.forEachChild(node, visit);
  };
  visit(source);
  return {
    parser: "typescript-ast",
    imports: uniqueBy(imports, item => `${item.kind}:${item.specifier}:${item.line}`),
    exports: uniqueBy(exports, item => item.name).slice(0, MAX_SYMBOLS_PER_FILE),
    symbols: uniqueBy(symbols, item => `${item.name}:${item.kind}`).slice(0, MAX_SYMBOLS_PER_FILE),
    references: uniqueBy(references, item => `${item.kind}:${item.name}:${item.namespace}:${item.line}`)
      .slice(0, MAX_REFERENCES_PER_FILE),
    routes: uniqueBy(routes, item => `${item.method}:${item.path}:${item.line}`).slice(0, MAX_ROUTES_PER_FILE),
    parseErrors,
  };
}

function analyzePython(name, content) {
  const imports = [];
  const routes = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const fromImport = line.match(/^\s*from\s+([.\w]+)\s+import\b/);
    const plainImport = line.match(/^\s*import\s+([\w.]+)/);
    const route = line.match(/^\s*@(?:app|router|bp|blueprint)\.(get|post|put|patch|delete|route)\(\s*(['"])(\/[^'"]*)\2/i);
    if (fromImport) imports.push({ specifier: safeStructuralLiteral(fromImport[1]), kind: "python-from", line: index + 1 });
    else if (plainImport) imports.push({ specifier: safeStructuralLiteral(plainImport[1]), kind: "python-import", line: index + 1 });
    if (route) routes.push({
      method: route[1].toUpperCase(),
      path: safeStructuralLiteral(route[3]),
      line: index + 1,
      evidence: "Python decorator literal route candidate",
      confidence: "medium",
    });
  }
  const symbols = [...content.matchAll(/^\s*(async\s+)?def\s+([A-Za-z_]\w*)\s*\(|^\s*class\s+([A-Za-z_]\w*)\s*[:(]/gm)]
    .map(match => ({
      name: match[2] ?? match[3],
      kind: match[3] ? "class" : "function",
      line: content.slice(0, match.index).split("\n").length,
      exported: !(match[2] ?? match[3]).startsWith("_"),
    }));
  const exports = symbols.filter(symbol => symbol.exported).map(({ name, line }) => ({ name, line }));
  return {
    parser: "python-conservative-patterns",
    imports,
    exports: exports.slice(0, MAX_SYMBOLS_PER_FILE),
    symbols: symbols.slice(0, MAX_SYMBOLS_PER_FILE),
    references: [],
    routes,
    parseErrors: [],
  };
}

function analyzeOther(name, content) {
  const ext = path.extname(name).toLowerCase();
  const imports = [];
  const exports = [];
  const symbols = [];
  const routes = [];
  if (ext === ".go") {
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      const match = line.match(/^\s*import\s+(?:\w+\s+)?["']([^"']+)["']/);
      if (match) imports.push({ specifier: match[1], kind: "go-import", line: index + 1 });
      const declaration = line.match(/^\s*(?:func\s+(?:\([^)]*\)\s*)?|type\s+|var\s+|const\s+)([A-Za-z_]\w*)/);
      if (declaration && /^[A-Z]/.test(declaration[1])) {
        symbols.push({
          name: declaration[1],
          kind: /^\s*func\b/.test(line) ? "function" : /^\s*type\b/.test(line) ? "type" : "variable",
          line: index + 1,
          exported: true,
        });
      }
      const route = line.match(/(?:HandleFunc|Handle|Get|Post|Put|Patch|Delete|Options|Head)\(\s*(['"])(\/[^'"]*)\1/i);
      if (route) routes.push({
        method: "UNSPECIFIED",
        path: safeStructuralLiteral(route[2]),
        line: index + 1,
        evidence: "Go router call literal candidate",
        confidence: "low",
      });
    }
  } else if (ext === ".rs") {
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      const match = line.match(/^\s*(?:pub\s+)?use\s+([A-Za-z_][\w:]*)/);
      if (match) imports.push({ specifier: match[1], kind: "rust-use", line: index + 1 });
      const declaration = line.match(/^\s*pub(?:\([^)]*\))?\s+(?:async\s+)?(fn|struct|enum|trait|type|const|static|mod)\s+([A-Za-z_]\w*)/);
      if (declaration) symbols.push({
        name: declaration[2],
        kind: declaration[1],
        line: index + 1,
        exported: true,
      });
    }
  }
  return {
    parser: ext === ".go" ? "go-conservative-patterns" :
      ext === ".rs" ? "rust-conservative-patterns" : "path-and-reference-only",
    imports,
    exports,
    symbols,
    references: [],
    routes,
    parseErrors: [],
  };
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveLocalImport(importer, specifier, knownFiles) {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  if (base === ".." || base.startsWith("../") || path.posix.isAbsolute(base)) return null;
  const candidates = [base];
  const ext = path.posix.extname(base);
  if (ext) {
    candidates.push(base.replace(/\.(?:mjs|cjs|js)$/i, ".ts"));
    candidates.push(base.replace(/\.(?:mjs|cjs|js)$/i, ".tsx"));
  } else {
    candidates.push(...JS_RESOLVE_EXTENSIONS.map(extension => `${base}${extension}`));
    candidates.push(...JS_RESOLVE_EXTENSIONS.map(extension => `${base}/index${extension}`));
  }
  return candidates.find(candidate => knownFiles.has(candidate)) ?? null;
}

function resolvePythonImport(importer, specifier, knownFiles) {
  const leadingDots = specifier.match(/^\.+/)?.[0].length ?? 0;
  const modulePart = specifier.slice(leadingDots).replaceAll(".", "/");
  const importerParts = path.posix.dirname(importer).split("/").filter(Boolean);
  let baseParts;
  if (leadingDots) {
    const packageParts = importerParts.slice(0, Math.max(0, importerParts.length - leadingDots + 1));
    baseParts = [...packageParts, ...modulePart.split("/").filter(Boolean)];
  } else {
    baseParts = modulePart.split("/").filter(Boolean);
  }
  const base = baseParts.join("/");
  if (!base || base.startsWith("../") || path.posix.isAbsolute(base)) return null;
  const candidates = [`${base}.py`, `${base}/__init__.py`];
  return candidates.find(candidate => knownFiles.has(candidate)) ?? null;
}

function extractTestRouteLiterals(name, text) {
  const extension = path.posix.extname(name).toLowerCase();
  if (PARSEABLE_JS_EXTENSIONS.has(extension) || extension === ".vue") {
    let sourceText = text;
    if (extension === ".vue") {
      sourceText = text.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i)?.[1] ?? "";
    }
    const source = typescript.createSourceFile(name, sourceText, typescript.ScriptTarget.Latest, true, moduleScriptKind(name));
    const literals = new Set();
    const visit = node => {
      if (isStringLike(node) && node.text.startsWith("/") && node.text.length <= 2048) {
        literals.add(safeStructuralLiteral(node.text));
      }
      typescript.forEachChild(node, visit);
    };
    visit(source);
    return literals;
  }
  const literals = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    for (const match of line.matchAll(/(["'])((?:\\.|[^\\])*?)\1/g)) {
      if (match[2].startsWith("/") && match[2].length <= 2048) {
        literals.add(safeStructuralLiteral(match[2]));
      }
    }
  }
  return literals;
}

function findUnfinishedCandidates(sourceRows) {
  const candidates = [];
  let omitted = 0;
  const markerPattern = /^\s*(?:\/\/|#|\/\*+|\*|<!--)\s*(TODO|FIXME|NOT[_ -]?IMPLEMENTED|PLACEHOLDER|STUB|MOCK|TEMPORARY|FUTURE[_ -]?FEATURE)\b/i;
  const implementationPattern = /\b(?:NotImplementedError|NotImplementedException)\b/;
  for (const row of sourceRows) {
    for (const [index, line] of row.text.split(/\r?\n/).entries()) {
      const marker = line.match(markerPattern)?.[1] ??
        (implementationPattern.test(line) ? "NOT_IMPLEMENTED" : null);
      if (!marker) continue;
      if (candidates.length >= MAX_UNFINISHED_CANDIDATES) {
        omitted++;
        continue;
      }
      candidates.push({
        path: row.path,
        lifecycle: row.lifecycle,
        line: index + 1,
        marker: marker.toUpperCase().replace(/[ -]+/g, "_"),
        sourceSha256: row.sha256,
        confidence: "low",
        uncertainty: "A marker is a review lead, not proof that the surrounding feature is incomplete.",
      });
    }
  }
  return { candidates, omitted };
}

function isTestReferenceTarget(file) {
  return !isTestPath(file);
}

function rankCoverage(nodes, focusPaths = [], analysisComplete = true) {
  const candidates = [];
  const focus = new Set(focusPaths);
  for (const node of nodes) {
    if (!isTestReferenceTarget(node.path) || node.lifecycle !== "source") continue;
    const noMappedTest = node.testReferences.length === 0;
    const routeWithoutTest = node.routes.some(route =>
      !node.routeTestReferences.some(reference => reference.route === `${route.method} ${route.path}`));
    if (!noMappedTest && !routeWithoutTest) continue;
    const focusMatch = focus.has(node.path) || node.importedBy.some(importer => focus.has(importer.path));
    const impactScore = Math.min(100,
      8 + node.importedBy.length * 5 + node.routes.length * 18 +
      (node.scriptEntrypoints.length ? 12 : 0) + (focusMatch ? 15 : 0));
    candidates.push({
      path: node.path,
      focusMatch,
      sourceSha256: node.sha256,
      impactScore,
      priority: impactScore >= 60 ? "P1" : impactScore >= 30 ? "P2" : "P3",
      evidence: {
        importerCount: node.importedBy.length,
        directTestReferenceCount: node.testReferences.length,
        routes: node.routes.map(route => ({
          method: route.method,
          path: route.path,
          line: route.line,
          mappedTestReferences: node.routeTestReferences
            .filter(reference => reference.route === `${route.method} ${route.path}`)
            .map(reference => reference.testPath),
        })),
        scriptEntrypoints: node.scriptEntrypoints,
      },
      confidence: analysisComplete && node.routes.length && node.routeTestReferences.length === 0
        ? "medium" : "low",
      uncertainty: [
        "Static references cannot prove behavioral coverage or prove that no indirect test exists.",
        "Dynamic imports, generated routes, framework conventions, and alias mappings may be absent from this dossier.",
        ...(analysisComplete ? [] : ["The dossier is incomplete; candidate ranking may omit affected modules or tests."]),
      ],
      recommendedNextAction: "Trace this source path into its runtime behavior and add or link a direct acceptance test before treating it as covered.",
    });
  }
  return candidates.sort((a, b) =>
    b.impactScore - a.impactScore || a.path.localeCompare(b.path));
}

function makeCheckContext(checks, nodes, testNodes) {
  const searchable = [...nodes, ...testNodes];
  return checks.filter(check => check.status !== "PASS" && check.status !== "NOT APPLICABLE")
    .map(check => {
      const checkText = [check.id, ...(Array.isArray(check.command) ? check.command : [])]
        .filter(value => typeof value === "string").join(" ");
      const directReferences = searchable
        .filter(node => checkText.includes(node.path))
        .map(node => ({ path: node.path, role: node.lifecycle, sha256: node.sha256 }));
      const scriptHint = checkText.match(/(?:npm run|run)\s+([A-Za-z0-9:_-]+)/)?.[1] ?? null;
      return {
        checkId: String(check.id ?? "unknown"),
        status: check.status ?? "UNVERIFIED",
        commandSha256: sha256(canonical(Array.isArray(check.command) ? check.command : [])),
        nextAction: typeof check.nextAction === "string" ? check.nextAction.slice(0, 500) : null,
        directReferences,
        scriptHint,
        confidence: directReferences.length ? "high" : scriptHint ? "medium" : "low",
        uncertainty: directReferences.length
          ? []
          : ["No source path was named directly in this check; association by check ID or npm script is only a candidate."],
      };
    });
}

function verifyRunReport(report) {
  if (!verifySealedReport(report, "reportSha256") || report.schemaVersion !== 1 ||
      !report.sourceIdentity || !Array.isArray(report.checks)) {
    throw new Error("The supplied verification report is not integrity-sealed or has an unsupported shape");
  }
}

export async function buildRepositoryUnderstanding({
  root = DEFAULT_ROOT,
  report = null,
  focusPaths = [],
  maxFiles = MAX_FILES,
  maxFileBytes = MAX_FILE_BYTES,
  maxTotalBytes = MAX_TOTAL_BYTES,
} = {}) {
  root = await fs.realpath(path.resolve(root));
  if (report) verifyRunReport(report);
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > MAX_FILES ||
      !Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > MAX_FILE_BYTES ||
      !Number.isInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > MAX_TOTAL_BYTES) {
    throw new Error("Understanding limits must be positive and cannot exceed the built-in safety bounds");
  }
  const { paths: allPaths, sensitiveExcludedCount } = fileList(root);
  const knownFiles = new Set(allPaths);
  for (const focusPath of focusPaths) {
    if (typeof focusPath !== "string" || !focusPath || path.posix.isAbsolute(focusPath) ||
        focusPath.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error(`Unsafe focus path: ${focusPath}`);
    }
    if (!knownFiles.has(focusPath)) throw new Error(`Focus path is not in the safe repository file inventory: ${focusPath}`);
  }
  const selectedPaths = allPaths.filter(name => {
    const ext = path.posix.extname(name).toLowerCase();
    return SOURCE_EXTENSIONS.has(ext) || path.posix.basename(name) === "package.json";
  });
  const initialTruncatedFiles = Math.max(0, selectedPaths.length - maxFiles);
  const pathsToRead = selectedPaths.slice(0, maxFiles);
  const rawSources = [];
  const skipped = [];
  let bytesRead = 0;
  let totalTruncated = initialTruncatedFiles > 0;
  let omittedFileCount = initialTruncatedFiles;
  for (const [pathIndex, name] of pathsToRead.entries()) {
    const absolute = path.resolve(root, name);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`Resolved source path escaped repository: ${name}`);
    let info;
    let handle;
    try {
      handle = await fs.open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      info = await handle.stat();
    } catch (error) {
      await handle?.close().catch(() => {});
      if (error.code === "ENOENT") {
        skipped.push({ path: name, reason: "missing-during-read" });
        continue;
      }
      if (error.code === "ELOOP") {
        skipped.push({ path: name, reason: "symlink-not-read" });
        continue;
      }
      throw error;
    }
    if (!info.isFile()) {
      await handle.close();
      skipped.push({ path: name, reason: "not-a-regular-file" });
      continue;
    }
    if (info.size > maxFileBytes) {
      await handle.close();
      skipped.push({ path: name, reason: "per-file-byte-limit", bytes: info.size });
      omittedFileCount++;
      totalTruncated = true;
      continue;
    }
    if (bytesRead + info.size > maxTotalBytes) {
      await handle.close();
      omittedFileCount += pathsToRead.length - pathIndex;
      totalTruncated = true;
      skipped.push({ path: name, reason: "total-byte-limit", bytes: info.size });
      break;
    }
    let bytes;
    try {
      bytes = await handle.readFile();
    } finally {
      await handle.close();
    }
    const sourceText = bytes.toString("utf8");
    bytesRead += bytes.length;
    rawSources.push({
      path: name,
      bytes: bytes.length,
      sha256: sha256(bytes),
      text: sourceText,
      lifecycle: isTestPath(name) ? "tests" :
        (path.posix.basename(name) === "package.json" ||
         path.posix.extname(name).toLowerCase() === ".atlas") ? "config" : "source",
    });
  }

  const packageScripts = new Map();
  for (const row of rawSources.filter(item => path.posix.basename(item.path) === "package.json")) {
    try {
      const manifest = JSON.parse(row.text);
      for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
        if (typeof command === "string") packageScripts.set(name, { source: row.path, command });
      }
    } catch {
      skipped.push({ path: row.path, reason: "package-json-unreadable" });
    }
  }
  const nodes = [];
  const testNodes = [];
  let remainingReferenceCandidates = MAX_REFERENCE_CANDIDATES;
  let omittedReferenceCandidates = 0;
  for (const row of rawSources) {
    if (path.posix.basename(row.path) === "package.json" ||
        path.posix.extname(row.path).toLowerCase() === ".atlas") continue;
    const extension = path.posix.extname(row.path).toLowerCase();
    const parsed = PARSEABLE_JS_EXTENSIONS.has(extension) || extension === ".vue"
      ? analyzeJavaScript(row.path, row.text)
      : extension === ".py" ? analyzePython(row.path, row.text)
        : analyzeOther(row.path, row.text);
    const node = {
      path: row.path,
      lifecycle: row.lifecycle,
      sha256: row.sha256,
      bytes: row.bytes,
      parser: parsed.parser,
      parseErrors: parsed.parseErrors,
      symbols: parsed.symbols ?? [],
      references: (parsed.references ?? []).slice(0, remainingReferenceCandidates),
      referenceEdges: [],
      imports: parsed.imports.map(item => ({
        ...item,
        resolvedPath: item.kind.startsWith("python-")
          ? resolvePythonImport(row.path, item.specifier, knownFiles)
          : resolveLocalImport(row.path, item.specifier, knownFiles),
      })),
      exports: parsed.exports,
      routes: parsed.routes,
      importedBy: [],
      testReferences: [],
      routeTestReferences: [],
      scriptEntrypoints: [],
      _text: row.text,
    };
    remainingReferenceCandidates -= node.references.length;
    omittedReferenceCandidates += Math.max(0, (parsed.references ?? []).length - node.references.length);
    (row.lifecycle === "tests" ? testNodes : nodes).push(node);
  }
  const nodesByPath = new Map([...nodes, ...testNodes].map(node => [node.path, node]));
  for (const node of [...nodes, ...testNodes]) {
    for (const item of node.imports) {
      const target = nodesByPath.get(item.resolvedPath);
      item.analysisStatus = target ? "RESOLVED_ANALYZED" :
        item.resolvedPath ? "RESOLVED_TARGET_NOT_ANALYZED" :
          item.kind.startsWith("python-") ? "UNRESOLVED_OR_EXTERNAL" :
            !item.specifier.startsWith(".") ? "NON_RELATIVE_NOT_RESOLVED" : "UNRESOLVED_LOCAL_CANDIDATE";
      if (!target) continue;
      target.importedBy.push({ path: node.path, kind: item.kind, line: item.line });
      if (node.lifecycle === "tests" && target.lifecycle !== "tests") {
        target.testReferences.push({ testPath: node.path, kind: "resolved-import", line: item.line });
      }
    }
  }
  let referenceEdges = 0;
  for (const node of nodes) {
    const localNames = new Set(node.symbols.map(symbol => symbol.name));
    for (const reference of node.references) {
      const localMatch = localNames.has(reference.name)
        ? { target: node, symbol: reference.name }
        : null;
      const importedMatches = [];
      for (const imported of node.imports) {
        const localBindingName = reference.namespace ?? reference.name;
        const binding = imported.bindings?.find(item =>
          item.localName === localBindingName &&
          (reference.namespace === null || item.importedName === "*"));
        if (!binding || !imported.resolvedPath) continue;
        const target = nodesByPath.get(imported.resolvedPath);
        if (!target) continue;
        const symbolName = binding.importedName === "*" ? reference.name : binding.importedName;
        if (target.symbols.some(symbol => symbol.name === symbolName) ||
            target.exports.some(symbol => symbol.name === symbolName)) {
          importedMatches.push({ target, symbol: symbolName });
        }
      }
      const match = localMatch ?? (importedMatches.length === 1 ? importedMatches[0] : null);
      if (!match) continue;
      if (referenceEdges >= MAX_REFERENCE_EDGES) {
        omittedReferenceCandidates++;
        continue;
      }
      node.referenceEdges.push({
        kind: reference.kind,
        sourcePath: node.path,
        sourceLine: reference.line,
        targetPath: match.target.path,
        targetSymbol: match.symbol,
        evidence: "Identifier reference resolves to one local declaration or imported symbol; call semantics are not evaluated.",
        confidence: importedMatches.length > 1 ? "low" : "medium",
      });
      referenceEdges++;
    }
  }
  const routeIndex = new Map();
  for (const node of nodes) {
    for (const route of node.routes) {
      const list = routeIndex.get(route.path) ?? [];
      list.push({ route: `${route.method} ${route.path}`, sourcePath: node.path });
      routeIndex.set(route.path, list);
    }
  }
  for (const test of testNodes) {
    for (const routePath of extractTestRouteLiterals(test.path, test._text)) {
      for (const { route, sourcePath } of routeIndex.get(routePath) ?? []) {
        const source = nodesByPath.get(sourcePath);
        source.routeTestReferences.push({
          route,
          testPath: test.path,
          evidence: "test source contains an exact route string literal; HTTP method and behavior are unverified",
        });
        source.testReferences.push({ testPath: test.path, kind: "route-literal", line: null });
      }
    }
  }
  for (const node of nodes) {
    for (const [scriptName, script] of packageScripts) {
      if (script.command.includes(node.path)) {
        node.scriptEntrypoints.push({ name: scriptName, source: script.source, evidence: "package script contains exact path" });
      }
    }
  }
  const publicNodes = [...nodes, ...testNodes].map(node => ({
    path: node.path,
    lifecycle: node.lifecycle,
    sha256: node.sha256,
    bytes: node.bytes,
    parser: node.parser,
    parseErrors: node.parseErrors,
    symbols: node.symbols,
    references: node.references,
    referenceEdges: node.referenceEdges,
    imports: node.imports,
    exports: node.exports,
    routes: node.routes,
    importedBy: uniqueBy(node.importedBy, item => item.path).sort((a, b) => a.path.localeCompare(b.path)),
    testReferences: uniqueBy(node.testReferences, item => `${item.testPath}:${item.kind}`).sort((a, b) =>
      a.testPath.localeCompare(b.testPath)),
    routeTestReferences: uniqueBy(node.routeTestReferences, item => `${item.route}:${item.testPath}`).sort((a, b) =>
      a.testPath.localeCompare(b.testPath)),
    scriptEntrypoints: node.scriptEntrypoints,
  }));
  const currentRevision = git(root, ["rev-parse", "HEAD"]).toString("utf8").trim();
  const parseErrorCount = publicNodes.reduce((sum, node) => sum + node.parseErrors.length, 0);
  const unfinished = findUnfinishedCandidates(rawSources);
  const analysisComplete = !totalTruncated && skipped.length === 0 &&
    parseErrorCount === 0 && sensitiveExcludedCount === 0 &&
    unfinished.omitted === 0 && omittedReferenceCandidates === 0;
  const fileManifest = [
    ...publicNodes.map(node => ({ path: node.path, sha256: node.sha256, lifecycle: node.lifecycle })),
    ...rawSources.filter(row => path.posix.basename(row.path) === "package.json" ||
      path.posix.extname(row.path).toLowerCase() === ".atlas")
      .map(row => ({ path: row.path, sha256: row.sha256, lifecycle: "config" })),
  ].sort((a, b) => a.path.localeCompare(b.path));
  const failures = makeCheckContext(report?.checks ?? [], nodes, testNodes);
  const allCoverageCandidates = rankCoverage(publicNodes, focusPaths, analysisComplete);
  const coverageCandidates = allCoverageCandidates.slice(0, MAX_COVERAGE_CANDIDATES);
  const omittedCandidates = Math.max(0, allCoverageCandidates.length - coverageCandidates.length);
  const dossier = seal({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    analysisMode: "bounded-local-static-evidence",
    sourceDisclosure: {
      externalServicesContacted: false,
      sourceContentsPersisted: false,
      secretLikePathsRead: false,
      note: "Path-classified secret files are skipped. Only parsed metadata and hashes are written; source text stays local in memory and is not sent to any model or provider. General literals, function bodies, and raw logs are not persisted; structural import and route literals are retained.",
    },
    sourceIdentity: {
      gitRevision: currentRevision,
      sourceFileManifestSha256: sha256(canonical(fileManifest)),
      analyzedFileCount: fileManifest.length,
      sensitiveExcludedFileCount: sensitiveExcludedCount,
      complete: analysisComplete,
      runReportSha256: report?.integrity?.reportSha256 ?? null,
      runSourceIdentity: report?.sourceIdentity ?? null,
      runSourceMatch: report
        ? report.sourceIdentity?.revision === currentRevision &&
          report.checks?.find(check => check.id === "full-sweep-source-drift")?.status === "PASS"
        : null,
      focusPaths: [...focusPaths].sort(),
    },
    summary: {
      sourceFiles: nodes.length,
      testFiles: testNodes.length,
      moduleEdges: nodes.reduce((sum, node) =>
        sum + node.imports.filter(item => item.analysisStatus === "RESOLVED_ANALYZED").length, 0),
      resolvedLocalImports: publicNodes.flatMap(node => node.imports)
        .filter(item => item.resolvedPath).length,
      resolvedTargetsNotAnalyzed: publicNodes.flatMap(node => node.imports)
        .filter(item => item.analysisStatus === "RESOLVED_TARGET_NOT_ANALYZED").length,
      unresolvedLocalImports: publicNodes.flatMap(node => node.imports)
        .filter(item => item.analysisStatus === "UNRESOLVED_LOCAL_CANDIDATE").length,
      unresolvedOrExternalPythonImports: publicNodes.flatMap(node => node.imports)
        .filter(item => item.analysisStatus === "UNRESOLVED_OR_EXTERNAL").length,
      exports: nodes.reduce((sum, node) => sum + node.exports.length, 0),
      symbols: nodes.reduce((sum, node) => sum + node.symbols.length, 0),
      resolvedReferenceEdges: nodes.reduce((sum, node) => sum + node.referenceEdges.length, 0),
      omittedReferenceCandidates,
      unfinishedCandidates: unfinished.candidates.length,
      omittedUnfinishedCandidates: unfinished.omitted,
      routeCandidates: nodes.reduce((sum, node) => sum + node.routes.length, 0),
      directTestReferences: nodes.reduce((sum, node) => sum + node.testReferences.length, 0),
      nonPassingChecks: failures.length,
      coverageCandidates: coverageCandidates.length,
      omittedCoverageCandidates: omittedCandidates,
      parseErrors: parseErrorCount,
      sensitiveExcludedFiles: sensitiveExcludedCount,
    },
    limits: { maxFiles, maxFileBytes, maxTotalBytes, bytesRead },
    truncation: {
      occurred: totalTruncated,
      omittedFileCount,
      skipped,
    },
    modules: publicNodes,
    failureCheckContext: failures,
    coverageCandidates,
    unfinishedCandidates: unfinished.candidates,
    reasoningNotes: [
      "Import edges are resolved only for relative module specifiers; package aliases and runtime-generated imports remain unresolved.",
      "Route declarations and test links are static literal candidates, not proof of runtime reachability or executed coverage.",
      "Impact scores rank observable import fan-in, route declarations, and package-script references; they are triage aids, not defect probability.",
    ],
  });
  return dossier;
}

function assertPrivateOutputPath(root, outputDirectory) {
  const absolute = path.resolve(root, outputDirectory);
  const required = path.join(root, ...OUTPUT_PARTS);
  if (absolute !== required) throw new Error(`Analysis reports may only be written under ${required}`);
  return absolute;
}

async function ensurePrivateOutputDirectory(root) {
  let current = root;
  for (const part of OUTPUT_PARTS) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Private analysis path is not a real directory: ${path.relative(root, current)}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(current, { mode: 0o700 });
    }
  }
  await fs.chmod(current, 0o700);
  return current;
}

async function writePrivateReport(filePath, content) {
  if (Buffer.byteLength(content) > MAX_DOSSIER_BYTES) {
    throw new Error(`Understanding report exceeds the ${MAX_DOSSIER_BYTES}-byte output limit`);
  }
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, content, { flag: "wx", mode: 0o600 });
    await fs.chmod(temp, 0o600);
    await fs.rename(temp, filePath);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
  return filePath;
}

function renderMarkdown(dossier) {
  const lines = [
    "# Repository understanding dossier",
    "",
    `- Generated: ${dossier.generatedAt}`,
    `- Git revision: \`${dossier.sourceIdentity.gitRevision}\``,
    `- Source manifest SHA-256: \`${dossier.sourceIdentity.sourceFileManifestSha256}\``,
    `- Complete within configured bounds: **${dossier.sourceIdentity.complete ? "yes" : "no"}**`,
    `- Files analyzed: ${dossier.sourceIdentity.analyzedFileCount}`,
    `- Sensitive paths excluded: ${dossier.sourceIdentity.sensitiveExcludedFileCount}`,
    `- Module edges: ${dossier.summary.moduleEdges}`,
    `- Route candidates: ${dossier.summary.routeCandidates}`,
    `- Non-passing checks with context: ${dossier.summary.nonPassingChecks}`,
    `- Coverage candidates: ${dossier.summary.coverageCandidates} (static candidates, not uncovered-test claims)`,
    "",
    "## Highest impact coverage candidates",
    "",
    "| Priority | Impact | Source | Confidence | Evidence |",
    "| --- | ---: | --- | --- | --- |",
  ];
  for (const candidate of dossier.coverageCandidates.slice(0, 50)) {
    const evidence = [
      `${candidate.evidence.importerCount} importers`,
      `${candidate.evidence.directTestReferenceCount} direct test references`,
      `${candidate.evidence.routes.length} routes`,
    ].join("; ");
    lines.push(`| ${candidate.priority} | ${candidate.impactScore} | \`${candidate.path}\` | ${candidate.confidence} | ${evidence} |`);
  }
  lines.push("", "## Non-passing check context", "");
  for (const check of dossier.failureCheckContext) {
    lines.push(`- **${check.status} — ${check.checkId}** (${check.confidence} confidence): ${check.directReferences.map(row => `\`${row.path}\``).join(", ") || "no exact source path found"}`);
    if (check.nextAction) lines.push(`  - Next: ${check.nextAction}`);
  }
  lines.push(
    "",
    "## Safety and uncertainty",
    "",
    "- This dossier contains file metadata and hashes, not source text or raw logs.",
    "- Static associations are candidates. They do not prove runtime behavior, test coverage, or product readiness.",
    "- The dossier is written only under the private ignored `.local/repository-verification/understanding/` directory.",
    "- Application edits remain available only through the reviewed hash-pinned completion executor.",
    "",
  );
  return lines.join("\n");
}

export async function saveRepositoryUnderstanding({
  root = DEFAULT_ROOT,
  dossier,
  outputDirectory = path.join(...OUTPUT_PARTS),
} = {}) {
  root = await fs.realpath(path.resolve(root));
  if (!verifySealedReport(dossier) || dossier.schemaVersion !== 1) {
    throw new Error("Cannot save an unsealed repository-understanding dossier");
  }
  const directory = assertPrivateOutputPath(root, outputDirectory);
  await ensurePrivateOutputDirectory(root);
  const filename = `${dossier.generatedAt.replace(/[:.]/g, "-")}-${process.pid}-${randomUUID()}`;
  const jsonPath = path.join(directory, `${filename}.json`);
  const markdownPath = path.join(directory, `${filename}.md`);
  const snapshotSha256 = dossier.integrity.sha256;
  const shardManifest = [];
  for (let offset = 0; offset < dossier.modules.length; offset += MODULES_PER_SHARD) {
    const shardIndex = shardManifest.length;
    const modules = dossier.modules.slice(offset, offset + MODULES_PER_SHARD);
    const shard = seal({
      schemaVersion: 1,
      reportType: "repository-understanding-module-shard",
      generatedAt: dossier.generatedAt,
      dossierSha256: snapshotSha256,
      sourceIdentity: dossier.sourceIdentity,
      shardIndex,
      moduleCount: modules.length,
      modules,
    });
    const shardPath = path.join(directory, `${filename}.modules-${String(shardIndex + 1).padStart(4, "0")}.json`);
    const shardContent = `${JSON.stringify(shard, null, 2)}\n`;
    await writePrivateReport(shardPath, shardContent);
    shardManifest.push({
      path: path.relative(root, shardPath),
      sha256: sha256(shardContent),
      moduleCount: modules.length,
      firstPath: modules[0]?.path ?? null,
      lastPath: modules.at(-1)?.path ?? null,
    });
  }
  const indexDossier = seal({
    ...dossier,
    modules: [],
    moduleDetailStorage: "private-shards",
    moduleDetails: {
      dossierSha256: snapshotSha256,
      moduleCount: dossier.modules.length,
      shardCount: shardManifest.length,
      shards: shardManifest,
    },
  });
  await writePrivateReport(jsonPath, `${JSON.stringify(indexDossier, null, 2)}\n`);
  await writePrivateReport(markdownPath, `${renderMarkdown(dossier)}\n`);
  return {
    jsonPath: path.relative(root, jsonPath),
    markdownPath: path.relative(root, markdownPath),
    jsonSha256: sha256(await fs.readFile(jsonPath)),
    markdownSha256: sha256(await fs.readFile(markdownPath)),
    moduleShardCount: shardManifest.length,
    moduleCount: dossier.modules.length,
  };
}

function parseArgs(args) {
  const options = { root: DEFAULT_ROOT, focusPaths: [], runDirectory: null };
  for (let index = 0; index < args.length; index++) {
    if ((args[index] === "--root" || args[index] === "--run-dir" || args[index] === "--path") &&
        args[index + 1]) {
      const value = args[++index];
      if (args[index - 1] === "--root") options.root = path.resolve(value);
      else if (args[index - 1] === "--run-dir") options.runDirectory = path.resolve(value);
      else options.focusPaths.push(value);
    } else if (args[index] === "--help" || args[index] === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  return options;
}

async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(args);
    if (options.help) {
      console.log("Usage: npm run completion:understand -- [--run-dir <verified-run>] [--path <repo-relative-path> ...]");
      console.log("Builds a bounded local source/import/route/test dossier; does not contact models or edit application files.");
      return 0;
    }
    const root = await fs.realpath(options.root);
    const { buildInventory } = await import("./repository-verification.mjs");
    const before = await buildInventory(root);
    let report = null;
    if (options.runDirectory) {
      const runDirectory = await fs.realpath(options.runDirectory);
      if (runDirectory !== root && !runDirectory.startsWith(`${root}${path.sep}`)) {
        throw new Error("Verification run directory must stay inside the repository");
      }
      const reportPath = path.join(runDirectory, "report.json");
      const info = await fs.lstat(reportPath);
      if (info.isSymbolicLink() || !info.isFile() || info.size > 16 * 1024 * 1024) {
        throw new Error("Verification report must be a bounded regular file");
      }
      report = JSON.parse(await fs.readFile(reportPath, "utf8"));
      verifyRunReport(report);
      if (before.sourceIdentity.inputInventorySha256 !== report.sourceIdentity.inputInventorySha256 ||
          before.sourceIdentity.dirtyInputSha256 !== report.sourceIdentity.dirtyInputSha256) {
        throw new Error("Verification report source hashes do not match the current repository; rerun verification first");
      }
    }
    const dossier = await buildRepositoryUnderstanding({
      root,
      report,
      focusPaths: options.focusPaths,
    });
    const after = await buildInventory(root);
    if (before.sourceIdentity.inputInventorySha256 !== after.sourceIdentity.inputInventorySha256 ||
        before.sourceIdentity.dirtyInputSha256 !== after.sourceIdentity.dirtyInputSha256 ||
        (report && (after.sourceIdentity.inputInventorySha256 !== report.sourceIdentity.inputInventorySha256 ||
          after.sourceIdentity.dirtyInputSha256 !== report.sourceIdentity.dirtyInputSha256))) {
      throw new Error("Repository source identity changed during analysis; no dossier was written");
    }
    if (report && !dossier.sourceIdentity.runSourceMatch) {
      throw new Error("The supplied report is not a matching full-sweep source snapshot");
    }
    const saved = await saveRepositoryUnderstanding({ root, dossier });
    console.log(`Repository understanding: ${dossier.summary.sourceFiles} source, ${dossier.summary.testFiles} test files; ${dossier.summary.moduleEdges} resolved module edges; ${dossier.summary.coverageCandidates} static coverage candidates.`);
    console.log(`Completeness: ${dossier.sourceIdentity.complete ? "complete within configured bounds" : "truncated or skipped inputs; see report"}`);
    if (report) console.log(`Failure contexts: ${dossier.summary.nonPassingChecks}`);
    console.log(`Private JSON index: ${saved.jsonPath}; module detail shards: ${saved.moduleShardCount}`);
    console.log(`Markdown: ${saved.markdownPath}`);
    return 0;
  } catch (error) {
    console.error(`completion-understanding: ${error.message}`);
    return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().then(code => { process.exitCode = code; });
