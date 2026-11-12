#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const pageRegisterArg = process.argv.indexOf("--page-register");
const platformArg = process.argv.indexOf("--platform-register");
const outputArg = process.argv.indexOf("--out");
const pageRegisterPath = path.resolve(
  pageRegisterArg >= 0 ? process.argv[pageRegisterArg + 1] : "/tmp/task107-page-register/page-register.json",
);
const platformRegisterPath = path.resolve(
  platformArg >= 0 ? process.argv[platformArg + 1] : "reports/test-verification/platform-register.json",
);
const outputDir = path.resolve(
  outputArg >= 0 ? process.argv[outputArg + 1] : "docs/testing",
);
if (!pageRegisterArg && !await exists(pageRegisterPath)) {
  throw new Error("Missing page register. Run scripts/review-page-register.mjs --out <directory> first or pass --page-register.");
}
if (!platformArg && !await exists(platformRegisterPath)) {
  throw new Error("Missing platform register. Run scripts/testing/platform-register.py first or pass --platform-register.");
}

async function exists(file) {
  try { await readFile(file); return true; } catch { return false; }
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  }))).flat();
}

const pageRegister = JSON.parse(await readFile(pageRegisterPath, "utf8"));
const platformRegister = JSON.parse(await readFile(platformRegisterPath, "utf8"));
const pageFiles = (await walk(path.join(root, "client/src/pages")))
  .filter((file) => /\.(?:tsx?|jsx?)$/.test(file))
  .map(rel)
  .sort();
const componentFiles = (await walk(path.join(root, "client/src/components")))
  .filter((file) => /\.(?:tsx?|jsx?)$/.test(file))
  .map(rel)
  .sort();
const clientSourceFiles = (await walk(path.join(root, "client/src")))
  .filter((file) => /\.(?:tsx?|jsx?)$/.test(file))
  .map(rel);
const sharedSourceFiles = (await walk(path.join(root, "shared")))
  .filter((file) => /\.(?:tsx?|jsx?|mjs)$/.test(file))
  .map(rel);
const sourceFiles = [...new Set([
  ...pageFiles,
  ...componentFiles,
  "client/src/App.tsx",
  "client/src/lib/pageAccess.ts",
  "shared/adminAccessPolicy.mjs",
])].sort();
const sourceText = new Map();
const sourceFilesKnown = new Set([...sourceFiles, ...clientSourceFiles, ...sharedSourceFiles]);
for (const file of sourceFiles) sourceText.set(file, await readFile(path.join(root, file), "utf8"));

function resolveImport(from, specifier) {
  let target;
  if (specifier.startsWith("@/")) target = `client/src/${specifier.slice(2)}`;
  else if (specifier.startsWith("@shared/")) target = `shared/${specifier.slice(8)}`;
  else if (specifier.startsWith(".")) target = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  else if (/^(client|shared)\//.test(specifier)) target = specifier;
  else return null;
  target = target.replace(/\.(?:[cm]?[jt]sx?)$/, "");
  for (const candidate of [
    `${target}.tsx`, `${target}.ts`, `${target}.jsx`, `${target}.js`,
    `${target}/index.tsx`, `${target}/index.ts`,
  ]) {
    if (sourceFilesKnown.has(candidate)) return candidate;
  }
  return null;
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function nodeName(node) {
  return node?.getText?.() ?? "";
}

function jsxTagName(tag) {
  if (ts.isIdentifier(tag)) return tag.text;
  if (ts.isPropertyAccessExpression(tag)) return `${jsxTagName(tag.expression)}.${tag.name.text}`;
  if (ts.isJsxNamespacedName(tag)) return `${tag.namespace.text}:${tag.name.text}`;
  return nodeName(tag);
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function jsxText(node, sf) {
  const pieces = [];
  function visit(current) {
    if (ts.isJsxText(current)) {
      const text = normalizeText(current.text);
      if (text) pieces.push(text);
    } else if (ts.isJsxElement(current)) {
      current.children.forEach(visit);
    } else if (ts.isJsxFragment(current)) {
      current.children.forEach(visit);
    } else if (ts.isJsxExpression(current) && current.expression) {
      if (ts.isStringLiteralLike(current.expression)) {
        pieces.push(current.expression.text);
      }
    } else {
      ts.forEachChild(current, visit);
    }
  }
  visit(node);
  return normalizeText(pieces.join(" ")).slice(0, 260);
}

const analyses = new Map();
function analyze(file) {
  if (analyses.has(file)) return analyses.get(file);
  const text = sourceText.get(file);
  if (text === undefined) return null;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = new Map();
  const localComponents = new Set();
  const jsxNodes = [];
  const events = [];
  const componentCalls = [];
  const meaningfulControls = [];
  const meaningfulSections = [];
  const stateHooks = [...new Set(text.match(/\buse(?:State|Reducer|Query|Mutation|InfiniteQuery|SuspenseQuery|RequireAuth|RequireSubscription|RequireAdmin|Auth)\b/g) ?? [])].sort();
  const apiReferences = [...new Set(text.match(/\/api\/[A-Za-z0-9_/?=&.${}-]+/g) ?? [])].sort();
  const visibilitySignals = text.split(/\r?\n/)
    .map((value, index) => ({ line: index + 1, text: normalizeText(value) }))
    .filter(({ text: value }) => /useRequire(?:Auth|Subscription|Admin)|(?:role|isAdmin|subscriptionTier|entitlement|isDemo)\s*(?:===|!==|&&|\?)/i.test(value))
    .slice(0, 30);
  const stateSignals = [...new Set(
    ["loading", "empty", "error", "success", "pending", "retry", "disabled", "skeleton", "not found"]
      .filter((word) => new RegExp(word.replace(" ", "\\s*"), "i").test(text)),
  )];
  const declarationNames = new Set();
  const componentDefinitions = [];

  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const target = resolveImport(file, statement.moduleSpecifier.text);
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, { file: target, exportName: "default", specifier: statement.moduleSpecifier.text });
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          imports.set(element.name.text, {
            file: target,
            exportName: element.propertyName?.text ?? element.name.text,
            specifier: statement.moduleSpecifier.text,
          });
        }
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarationNames.add(statement.name.text);
      if (/^[A-Z]/.test(statement.name.text)) {
        localComponents.add(statement.name.text);
        componentDefinitions.push({
          name: statement.name.text,
          start: statement.getStart(sf),
          end: statement.end,
          line: lineOf(sf, statement),
        });
      }
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          declarationNames.add(declaration.name.text);
          if (/^[A-Z]/.test(declaration.name.text)) {
            localComponents.add(declaration.name.text);
            if (declaration.initializer &&
                (ts.isArrowFunction(declaration.initializer) ||
                 ts.isFunctionExpression(declaration.initializer) ||
                 ts.isCallExpression(declaration.initializer))) {
              componentDefinitions.push({
                name: declaration.name.text,
                start: declaration.getStart(sf),
                end: declaration.end,
                line: lineOf(sf, declaration),
              });
            }
          }
        }
      }
    }
  }
  let defaultComponentName = null;
  for (const statement of sf.statements) {
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      defaultComponentName = statement.expression.text;
    }
    if (ts.isFunctionDeclaration(statement) &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      defaultComponentName = statement.name?.text ?? "default";
    }
  }

  function scan(node, ancestors = []) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = jsxTagName(node.tagName);
      const rootTag = tag.split(".")[0];
      const attrs = [];
      const eventBindings = [];
      let dynamic = false;
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
          attrs.push({ name: "spread", line: lineOf(sf, attribute) });
          continue;
        }
        const name = nodeName(attribute.name);
        const initializer = attribute.initializer;
        const value = initializer && ts.isJsxExpression(initializer) && initializer.expression
          ? nodeName(initializer.expression).slice(0, 180)
          : initializer && ts.isStringLiteral(initializer)
            ? initializer.text.slice(0, 180)
            : initializer ? true : null;
        if (/^on[A-Z]/.test(name)) eventBindings.push({ event: name, handler: value });
        if (["aria-label", "data-testid", "href", "role", "type", "name", "title", "disabled"].includes(name)) {
          attrs.push({ name, value });
        }
        if (name === "asChild" || name === "component") dynamic = true;
      }
      const sourceLine = lineOf(sf, node);
      const context = ancestors
        .filter((ancestor) =>
          ts.isConditionalExpression(ancestor) ||
          (ts.isBinaryExpression(ancestor) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(ancestor.operatorToken.kind)) ||
          (ts.isCallExpression(ancestor) && ts.isPropertyAccessExpression(ancestor.expression) && ancestor.expression.name.text === "map"),
        )
        .slice(-3)
        .map((ancestor) => nodeName(ancestor).replace(/\s+/g, " ").slice(0, 220));
      const position = node.getStart(sf);
      const enclosing = componentDefinitions
        .filter((definition) => definition.start <= position && definition.end >= node.end)
        .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0];
      const record = {
        tag,
        rootTag,
        line: sourceLine,
        column: sf.getLineAndCharacterOfPosition(position).character + 1,
        attrs,
        eventBindings,
        context,
        dynamic,
        scopeName: enclosing?.name ?? defaultComponentName ?? "module",
      };
      jsxNodes.push(record);
      if (/^[A-Z]/.test(rootTag) || rootTag.includes(".")) componentCalls.push(record);
      if (/^(section|article|main|nav|aside|header)$/i.test(rootTag)) {
        const element = ts.isJsxElement(node.parent) && node.parent.openingElement === node
          ? node.parent
          : ts.isJsxSelfClosingElement(node) ? node : null;
        const headingTexts = [];
        if (element) {
          function collectHeadings(current) {
            if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
              const childTag = jsxTagName(ts.isJsxElement(current) ? current.openingElement.tagName : current.tagName);
              if (/^h[1-3]$/.test(childTag)) headingTexts.push(jsxText(current, sf));
            }
            ts.forEachChild(current, collectHeadings);
          }
          collectHeadings(element);
        }
        const visibleText = element ? jsxText(element, sf) : "";
        const label = attrs.find((attr) => ["aria-label", "title", "data-testid"].includes(attr.name))?.value ?? null;
        if (headingTexts.some(Boolean) || label || eventBindings.length) {
          meaningfulSections.push({
            tag: rootTag,
            line: sourceLine,
            column: record.column,
            endLine: element ? lineOf(sf, element) + (sf.getLineAndCharacterOfPosition(element.end).line - sf.getLineAndCharacterOfPosition(element.getStart(sf)).line) : sourceLine,
            heading: headingTexts.find(Boolean) ?? null,
            label,
            visibleText,
            eventBindings,
            context,
            scopeName: record.scopeName,
          });
        }
      }
      if (/^(button|input|select|textarea|form|a|summary|label)$/i.test(rootTag) ||
          eventBindings.length || attrs.some((attr) => ["data-testid", "role"].includes(attr.name))) {
        meaningfulControls.push({ ...record, purposeHint: attrs.find((attr) => ["aria-label", "title", "data-testid"].includes(attr.name))?.value ?? null, visibleText: jsxText(node.parent, sf) });
      }
    }
    ts.forEachChild(node, (child) => scan(child, [...ancestors, node]));
  }
  scan(sf);

  const analysis = {
    file,
    text,
    sf,
    imports,
    localComponents,
    declarationNames,
    componentDefinitions,
    defaultComponentName,
    jsxNodes,
    componentCalls,
    meaningfulControls,
    meaningfulSections,
    stateHooks,
    apiReferences,
    visibilitySignals,
    stateSignals,
    headers: [...new Set(jsxNodes.filter((node) => /^h[1-3]$/.test(node.rootTag)).map((node) => {
      const target = findNodeAtLine(sf, node.line, node.rootTag);
      return target ? jsxText(target, sf) : "";
    }).filter(Boolean))].slice(0, 12),
    directText: [...new Set(meaningfulControls.map((node) => node.visibleText).filter(Boolean))].slice(0, 8),
    lineCount: sf.getLineAndCharacterOfPosition(sf.end).line + 1,
  };
  analyses.set(file, analysis);
  return analysis;
}

function findNodeAtLine(sf, line, tag) {
  let found = null;
  function visit(node) {
    if (found) return;
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
        lineOf(sf, ts.isJsxElement(node) ? node.openingElement : node) === line) {
      const elementTag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
      if (jsxTagName(elementTag) === tag) found = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return found;
}

function componentView(file, exportName = "default") {
  const analysis = analyze(file);
  if (!analysis) return null;
  const expectedName = exportName === "default" ? analysis.defaultComponentName : exportName;
  const definition = analysis.componentDefinitions.find((entry) => entry.name === expectedName);
  const scopeName = definition?.name ?? expectedName ?? "module";
  const text = definition ? analysis.text.slice(definition.start, definition.end) : analysis.text;
  const inScope = (node) => !definition || node.scopeName === scopeName;
  return {
    ...analysis,
    scopeName,
    definitionLine: definition?.line ?? 1,
    text,
    componentCalls: analysis.componentCalls.filter(inScope),
    meaningfulControls: analysis.meaningfulControls.filter(inScope),
    meaningfulSections: analysis.meaningfulSections.filter(inScope),
    headers: [...new Set(analysis.jsxNodes.filter((node) => inScope(node) && /^h[1-3]$/.test(node.rootTag)).map((node) => {
      const target = findNodeAtLine(analysis.sf, node.line, node.rootTag);
      return target ? jsxText(target, analysis.sf) : "";
    }).filter(Boolean))].slice(0, 12),
    directText: [...new Set(analysis.meaningfulControls.filter(inScope).map((node) => node.visibleText).filter(Boolean))].slice(0, 8),
    stateHooks: [...new Set(text.match(/\buse(?:State|Reducer|Query|Mutation|InfiniteQuery|SuspenseQuery|RequireAuth|RequireSubscription|RequireAdmin|Auth)\b/g) ?? [])].sort(),
    apiReferences: [...new Set(text.match(/\/api\/[A-Za-z0-9_/?=&.${}-]+/g) ?? [])].sort(),
    stateSignals: [...new Set(
      ["loading", "empty", "error", "success", "pending", "retry", "disabled", "skeleton", "not found"]
        .filter((word) => new RegExp(word.replace(" ", "\\s*"), "i").test(text)),
    )],
    visibilitySignals: text.split(/\r?\n/)
      .map((value, index) => ({ line: (definition?.line ?? 1) + index, text: normalizeText(value) }))
      .filter(({ text: value }) => /useRequire(?:Auth|Subscription|Admin)|(?:role|isAdmin|subscriptionTier|entitlement|isDemo)\s*(?:===|!==|&&|\?)/i.test(value))
      .slice(0, 30),
  };
}

function routePath(node, sf) {
  const value = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && nodeName(attribute.name) === "path")?.initializer;
  return value && ts.isStringLiteral(value) ? value.text : "*";
}

function exprText(attribute, sf) {
  const value = attribute?.initializer;
  if (!value) return null;
  if (ts.isStringLiteral(value)) return value.text;
  if (ts.isJsxExpression(value) && value.expression) return nodeName(value.expression);
  return nodeName(value);
}

const app = analyze("client/src/App.tsx");
const lazyPageFiles = new Map();
for (const statement of app.sf.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
    const match = nodeName(declaration.initializer).match(/import\(["'](@\/pages\/[^"']+)["']\)/);
    if (match) lazyPageFiles.set(declaration.name.text, resolveImport("client/src/App.tsx", match[1]));
  }
}

const routeNodes = [];
function collectRoutes(node) {
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && nodeName(node.tagName) === "Route") {
    routeNodes.push(node);
  }
  ts.forEachChild(node, collectRoutes);
}
collectRoutes(app.sf);
const platformPages = platformRegister.pages ?? [];
const platformByRoute = new Map();
for (const page of platformPages) {
  const group = platformByRoute.get(page.path) ?? [];
  group.push(page);
  platformByRoute.set(page.path, group);
}

function resolvePageFile(routeNode) {
  const componentAttribute = routeNode.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && nodeName(attribute.name) === "component");
  const expression = exprText(componentAttribute, app.sf) ?? "";
  const directName = expression.trim();
  if (lazyPageFiles.has(directName)) return { file: lazyPageFiles.get(directName), component: directName, wrapper: null };
  const inlineTag = expression.match(/<([A-Z][A-Za-z0-9_.]*)\b([^>]*)\/?>/);
  if (inlineTag) {
    const component = inlineTag[1].split(".")[0];
    const wrapperProps = [...inlineTag[2].matchAll(/([A-Za-z][\w-]*)=(?:"([^"]*)"|\{([^}]+)\})/g)]
      .map((match) => ({ name: match[1], value: match[2] ?? `{${match[3]}}` }));
    return { file: lazyPageFiles.get(component) ?? null, component, wrapper: { expression, props: wrapperProps, source: "client/src/App.tsx" } };
  }
  if (directName) {
    const local = lazyPageFiles.get(directName);
    if (local) return { file: local, component: directName, wrapper: null };
    if (app.localComponents.has(directName)) return { file: "client/src/App.tsx", component: directName, wrapper: null };
  }
  return { file: null, component: directName || "unresolved", wrapper: { expression, source: "client/src/App.tsx" } };
}

function isPublicRoute(route) {
  const exact = new Set([
    "/", "/about", "/blog", "/features", "/pricing", "/security", "/dmca",
    "/terms", "/privacy", "/api-docs", "/documentation", "/solo-founder-story",
    "/desktop-app", "/help", "/login", "/register", "/forgot-password", "/reset-password",
    "/verification", "/handle-link",
  ]);
  if (exact.has(route)) return true;
  const parameterized = route.replace(/:[^/]+/g, "placeholder");
  return /^\/(?:blog|register)\/[^/]+(?:\/[^/]+)*$/.test(parameterized) ||
    /^\/(?:storefront|store|s|epk)\/[^/]+$/.test(parameterized) ||
    /^\/marketplace\/(?:beat|producer)\/[^/]+$/.test(parameterized);
}

const canonical = new Map();
const controlCatalog = new Map();
const sectionCatalog = new Map();
const unresolved = new Map();
const externalComponentReferences = new Map();
const routeRecords = [];
const usedFilesByRoute = new Map();
const routeControlIds = new Map();
const routeSectionIds = new Map();

function componentId(file, exportName) {
  return `cmp-${sha(`${file}#${exportName}`).slice(0, 16)}`;
}

function controlId(control) {
  return `ctl-${sha(`${control.file}:${control.line}:${control.column}:${control.tag}`).slice(0, 16)}`;
}

function getImportTarget(analysis, call) {
  const binding = analysis.imports.get(call.rootTag);
  if (binding?.file) return { file: binding.file, exportName: binding.exportName, kind: binding.file.includes("/components/ui/") ? "uiPrimitive" : "importedComponent" };
  if (binding && /^(?:\.|@\/|client\/)/.test(binding.specifier)) {
    return { file: null, exportName: binding.exportName, kind: "unresolvedLocalImport", specifier: binding.specifier };
  }
  if (binding) return { file: null, exportName: binding.exportName, kind: "externalComponent", specifier: binding.specifier };
  if (analysis.localComponents.has(call.rootTag)) return { file: analysis.file, exportName: call.rootTag, kind: "localComponent" };
  if (call.rootTag === "Suspense" || call.rootTag === "Fragment" || call.rootTag === "StrictMode") return null;
  return null;
}

function componentMeta(id, file, exportName, kind) {
  const analysis = componentView(file, exportName);
  const sourceName = path.basename(file).replace(/\.(?:tsx?|jsx?)$/, "");
  const displayName = exportName === "default" ? sourceName : exportName;
  const heading = analysis?.headers?.[0] ?? null;
  const copy = analysis?.directText?.[0] ?? null;
  const hasScopedDefinition = !!analysis?.componentDefinitions.some((entry) => entry.name === analysis.scopeName);
  const purpose = heading
    ? `Source includes the heading “${heading.slice(0, 150)}” in this component.`
    : copy
      ? `Source includes control copy “${copy.slice(0, 150)}”; intended purpose is inferred from the component name “${displayName}”.`
      : `Purpose is inferred from the source name “${displayName}”; no explicit heading or control label was extracted.`;
  const modules = analysis ? [...analysis.imports.values()].filter((entry) => entry.file).map((entry) => entry.file) : [];
  return {
    id,
    name: displayName,
    kind,
    source: { file, line: analysis?.definitionLine ?? 1, lineCount: analysis?.lineCount ?? null },
    sourceScope: { name: analysis?.scopeName ?? exportName, explicitDefinition: hasScopedDefinition },
    purpose,
    purposeConfidence: heading ? "source-heading" : "name-inferred",
    sourceBehavior: {
      stateHooks: analysis?.stateHooks ?? [],
      stateSignals: analysis?.stateSignals ?? [],
      eventBindings: analysis?.meaningfulControls.flatMap((control) => control.eventBindings.map((event) => ({
        line: control.line,
        tag: control.tag,
        ...event,
      }))).slice(0, 80) ?? [],
      apiReferences: analysis?.apiReferences ?? [],
      importedModules: [...new Set(modules)].sort(),
      visibilitySignals: analysis?.visibilitySignals ?? [],
    },
    observedControls: [],
    renderedByPages: [],
    usageStatus: "static source/import trace; conditional mounts and runtime data are not verified",
  };
}

function addComponent(file, exportName, kind, routePathValue) {
  if (!file) return null;
  const id = componentId(file, exportName);
  if (!canonical.has(id)) canonical.set(id, componentMeta(id, file, exportName, kind));
  const record = canonical.get(id);
  if (routePathValue && !record.renderedByPages.includes(routePathValue)) record.renderedByPages.push(routePathValue);
  return id;
}

function addControl(routePathValue, file, control) {
  const record = {
    ...control,
    file,
    id: controlId({ ...control, file }),
  };
  const key = `${file}:${control.line}:${control.column}:${control.tag}`;
  if (!controlCatalog.has(key)) {
    controlCatalog.set(key, {
      id: record.id,
      source: { file, line: control.line, column: control.column },
      element: control.tag,
      purposeHint: control.purposeHint,
      visibleText: control.visibleText,
      eventBindings: control.eventBindings,
      componentScope: control.scopeName,
      attributes: control.attrs,
      conditionalOrRepeatedContext: control.context,
      pageRoutes: [],
      platformInteractionIds: [],
      verification: "source declaration only; behavior is unverified",
    });
  }
  const stored = controlCatalog.get(key);
  if (!stored.pageRoutes.includes(routePathValue)) stored.pageRoutes.push(routePathValue);
  const platformMatch = (platformRegister.interactions ?? []).find((interaction) =>
    interaction.source?.file === file &&
    interaction.source?.line === control.line &&
    interaction.tag === control.tag,
  );
  if (platformMatch && !stored.platformInteractionIds.includes(platformMatch.id)) stored.platformInteractionIds.push(platformMatch.id);
  return stored.id;
}

function addSection(routePathValue, file, section) {
  const id = `sec-${sha(`${file}:${section.line}:${section.column}:${section.tag}`).slice(0, 16)}`;
  const key = `${file}:${section.line}:${section.column}:${section.tag}`;
  if (!sectionCatalog.has(key)) {
    sectionCatalog.set(key, {
      id,
      source: { file, line: section.line, column: section.column, endLine: section.endLine },
      element: section.tag,
      heading: section.heading,
      label: section.label,
      visibleText: section.visibleText,
      eventBindings: section.eventBindings,
      conditionalOrRepeatedContext: section.context,
      componentScope: section.scopeName,
      pageRoutes: [],
      verification: "source declaration only; behavior is unverified",
    });
  }
  const stored = sectionCatalog.get(key);
  if (!stored.pageRoutes.includes(routePathValue)) stored.pageRoutes.push(routePathValue);
  return stored.id;
}

for (const routeNode of routeNodes) {
  const route = routePath(routeNode, app.sf);
  const binding = resolvePageFile(routeNode);
  const matchingPages = platformByRoute.get(route) ?? [];
  const platformPage = matchingPages.find((page) => page.component === binding.component) ?? matchingPages[0] ?? null;
  const routeId = platformPage?.id ?? `route-${sha(`${route}#${binding.component}`).slice(0, 16)}`;
  const pageToolEntry = pageRegister.register.find((entry) => entry.route === route && entry.component === binding.component)
    ?? pageRegister.register.find((entry) => entry.route === route);
  const pageFile = pageToolEntry?.implementation ?? binding.file;
  const routeSourcePageFile = pageToolEntry?.file ?? binding.file;
  const pageExport = pageFile === "client/src/App.tsx" && app.localComponents.has(binding.component)
    ? binding.component
    : "default";
  const pageSource = pageFile ? componentView(pageFile, pageExport) : null;
  const localVisibility = pageSource?.visibilitySignals ?? [];
  const components = new Set();
  const controls = new Set();
  const sections = new Set();
  const visited = new Set();
  const queue = [];
  if (pageFile) {
    queue.push({ file: pageFile, exportName: pageExport, kind: pageFile === "client/src/App.tsx" ? "routeWrapper" : "pageImplementation" });
  } else if (binding.component === "StorefrontShortLink") {
    queue.push({ file: "client/src/App.tsx", exportName: "StorefrontShortLink", kind: "routeWrapper" });
  }
  const rootComponentId = pageFile
    ? addComponent(pageFile, pageExport, pageFile === "client/src/App.tsx" ? "routeWrapper" : "pageImplementation", route)
    : null;

  while (queue.length) {
    const current = queue.shift();
    const visitKey = `${current.file}#${current.exportName}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    const analysis = componentView(current.file, current.exportName);
    if (!analysis) {
      const key = `missing-source:${current.file}`;
      const item = unresolved.get(key) ?? {
        kind: "missing-source",
        source: current.file,
        reason: "Resolved component file is absent from the scanned source set.",
        pageRoutes: [],
      };
      if (!item.pageRoutes.includes(route)) item.pageRoutes.push(route);
      unresolved.set(key, item);
      continue;
    }
    for (const control of analysis.meaningfulControls) {
      const id = addControl(route, current.file, control);
      controls.add(id);
    }
    for (const section of analysis.meaningfulSections) {
      const id = addSection(route, current.file, section);
      sections.add(id);
    }
    for (const call of analysis.componentCalls) {
      if (call.rootTag === "Suspense" || call.rootTag === "Fragment" || call.rootTag === "StrictMode") continue;
      const target = getImportTarget(analysis, call);
      if (target?.file) {
        const id = addComponent(target.file, target.exportName, target.kind, route);
        if (id) components.add(id);
        if (!visited.has(`${target.file}#${target.exportName}`)) queue.push(target);
      } else if (target?.kind === "externalComponent") {
        const key = `${current.file}:${call.line}:${call.tag}:${target.specifier}`;
        const external = externalComponentReferences.get(key) ?? {
          source: { file: current.file, line: call.line },
          element: call.tag,
          packageSpecifier: target.specifier,
          pageRoutes: [],
          behavior: "Package-provided component; internal implementation is outside this repository catalog.",
        };
        if (!external.pageRoutes.includes(route)) external.pageRoutes.push(route);
        externalComponentReferences.set(key, external);
      } else if (target?.kind === "unresolvedLocalImport") {
        const key = `unresolved-import:${current.file}:${call.line}:${call.tag}:${target.specifier}`;
        const item = unresolved.get(key) ?? {
          kind: "unresolved-local-component-import",
          source: current.file,
          line: call.line,
          element: call.tag,
          reason: `The local import ${target.specifier} did not resolve to a scanned page or component source file.`,
          pageRoutes: [],
        };
        if (!item.pageRoutes.includes(route)) item.pageRoutes.push(route);
        unresolved.set(key, item);
      } else if (call.tag.includes(".") || /^[A-Z]/.test(call.rootTag) && !analysis.imports.has(call.rootTag) && !analysis.localComponents.has(call.rootTag)) {
        if (!(current.file.includes("/components/ui/") && call.rootTag === "Comp")) {
          const kind = call.tag.includes(".") ? "dynamic-component-reference" : "unresolved-component-binding";
          const key = `${kind}:${current.file}:${call.line}:${call.tag}`;
          const item = unresolved.get(key) ?? {
            kind,
            source: current.file,
            line: call.line,
            element: call.tag,
            reason: call.tag.includes(".")
              ? "Member-expression component may resolve from runtime data; concrete rendered values are not statically known."
              : "Capitalized JSX tag has no resolvable local component declaration or scanned source import.",
            pageRoutes: [],
          };
          if (!item.pageRoutes.includes(route)) item.pageRoutes.push(route);
          unresolved.set(key, item);
        }
      }
    }
  }
  if (rootComponentId) components.add(rootComponentId);
  const access = {
    routerPolicy: isPublicRoute(route)
      ? "AppWithKeyboardShortcuts exempts this path from the signed-out redirect in isPublicPageRoute."
      : "AppWithKeyboardShortcuts redirects signed-out visitors to /login?redirect=<current-location>.",
    nativeBehavior: isPublicRoute(route)
      ? "Authenticated native clients may be redirected from marketing/auth pages to /dashboard; exact policy is in shouldRedirectNativeLanding."
      : "No marketing/auth landing redirect is implied by this route classification.",
    pageLocalSignals: localVisibility,
    apiAuthorization: "Not established by client route visibility; server/API authorization is a separate responsibility.",
  };
  const routeRecord = {
    id: routeId,
    path: route,
    declaredComponent: binding.component,
    routeSource: { file: "client/src/App.tsx", line: lineOf(app.sf, routeNode) },
    implementation: pageFile ? { file: pageFile, line: 1 } : null,
    routeSourcePageFile,
    wrapper: binding.wrapper ?? (
      routeSourcePageFile && pageFile && routeSourcePageFile !== pageFile
        ? { kind: "transparent re-export", source: routeSourcePageFile, target: pageFile }
        : null
    ),
    aliasGroup: [],
    pageAccess: access,
    rootComponentId,
    componentIds: [...components].sort(),
    controlIds: [...controls].sort(),
    sectionIds: [...sections].sort(),
    platformPageStatus: platformPage?.status ?? "route declaration not resolved by current platform register",
    platformRequiredChecks: platformPage?.requiredChecks ?? [],
    sourceInventoryStatus: pageFile ? "implementation source found; rendering is static-only" : "unresolved route implementation",
    statesAndServices: {
      stateHooks: pageSource?.stateHooks ?? [],
      stateSignals: pageSource?.stateSignals ?? [],
      apiReferences: pageSource?.apiReferences ?? [],
    },
  };
  routeRecords.push(routeRecord);
  usedFilesByRoute.set(route, [...visited].map((key) => key.split("#", 1)[0]).sort());
  routeControlIds.set(route, [...controls].sort());
  routeSectionIds.set(route, [...sections].sort());
}

const aliasesByFile = new Map();
for (const page of routeRecords) {
  if (!page.path || !page.implementation?.file) continue;
  const aliases = aliasesByFile.get(page.implementation.file) ?? [];
  aliases.push(page.path);
  aliasesByFile.set(page.implementation.file, aliases);
}
for (const page of routeRecords) {
  if (page.path && page.implementation?.file) {
    page.aliasGroup = [...new Set(aliasesByFile.get(page.implementation.file) ?? [])];
  }
}

const routedImplementationFiles = new Set(routeRecords.flatMap((route) =>
  [route.implementation?.file, route.routeSourcePageFile].filter(Boolean),
));
const unroutedPageFiles = pageFiles.filter((file) => !routedImplementationFiles.has(file));
for (const file of pageFiles) analyze(file);
for (const file of unroutedPageFiles) {
  const analysis = componentView(file, "default");
  const id = addComponent(file, "default", "unroutedPageFile", null);
  const controlIds = (analysis?.meaningfulControls ?? []).map((control) => addControl("(unrouted page source)", file, control));
  const sectionIds = (analysis?.meaningfulSections ?? []).map((section) => addSection("(unrouted page source)", file, section));
  const importedFrom = [...analyses.values()]
    .filter((candidate) => [...candidate.imports.values()].some((entry) => entry.file === file))
    .map((candidate) => candidate.file)
    .sort();
  routeRecords.push({
    id: `unrouted-${sha(file).slice(0, 16)}`,
    path: null,
    declaredComponent: path.basename(file).replace(/\.(?:tsx?|jsx?)$/, ""),
    routeSource: null,
    implementation: { file, line: 1 },
    wrapper: null,
    aliasGroup: [],
    pageAccess: {
      routerPolicy: "No direct App.tsx route declaration was found.",
      nativeBehavior: "Not assessed as a routed page.",
      pageLocalSignals: analysis?.visibilitySignals ?? [],
      apiAuthorization: "Unrouted source does not establish runtime reachability or API authorization.",
    },
    rootComponentId: id,
    componentIds: id ? [id] : [],
    controlIds,
    sectionIds,
    platformPageStatus: "not routed by direct App.tsx declaration; retained source is not assumed stale",
    platformRequiredChecks: [],
    sourceInventoryStatus: "unrouted retained page file; imported/re-exported use must be reviewed separately",
    statesAndServices: {
      stateHooks: analysis?.stateHooks ?? [],
      stateSignals: analysis?.stateSignals ?? [],
      apiReferences: analysis?.apiReferences ?? [],
    },
    importedFrom,
  });
}

const componentList = [...canonical.values()]
  .map((component) => ({
    ...component,
    renderedByPages: component.renderedByPages.sort(),
    observedControls: [...controlCatalog.values()]
      .filter((control) =>
        control.source.file === component.source.file &&
        (!component.sourceScope.explicitDefinition || control.componentScope === component.sourceScope.name),
      )
      .map((control) => control.id),
  }))
  .sort((a, b) => a.source.file.localeCompare(b.source.file) || a.name.localeCompare(b.name));
const controlsList = [...controlCatalog.values()]
  .map((control) => ({
    ...control,
    pageRoutes: control.pageRoutes.sort(),
    platformInteractionIds: control.platformInteractionIds.sort(),
  }))
  .sort((a, b) => a.source.file.localeCompare(b.source.file) || a.source.line - b.source.line || a.source.column - b.source.column);
const sectionsList = [...sectionCatalog.values()]
  .map((section) => ({
    ...section,
    pageRoutes: section.pageRoutes.sort(),
  }))
  .sort((a, b) => a.source.file.localeCompare(b.source.file) || a.source.line - b.source.line || a.source.column - b.source.column);

const appAccessSource = {
  globalBlock: {
    source: "client/src/App.tsx",
    behavior: "shouldBlockNonAdminApp may replace the application with an administrator-only gate; the rendered gate offers sign-out and shows policy verification or public-access-closed status.",
  },
  authRedirect: {
    source: "client/src/App.tsx and client/src/lib/pageAccess.ts",
    behavior: "After auth loading, signed-out visitors are redirected unless isPublicPageRoute accepts the current path.",
  },
  nativeLandingRedirect: {
    source: "client/src/App.tsx and client/src/lib/pageAccess.ts",
    behavior: "Authenticated native clients can be redirected from marketing/auth pages to /dashboard.",
  },
  sessionAndGlobalComponents: [
    "TokenRefreshHandler", "InactivityManager", "CookieConsentBanner", "InstallBanner",
    "OAuthCallbackHandler", "DeepLinkHandler", "AIAssistantManager", "NPSSurveyManager",
    "UndoToast", "CommandPalette", "ShortcutGuide", "QuickActionBar", "ConnectionStatusBar",
    "KeyboardShortcutsDialog", "SkipLinks", "ErrorBoundary", "Suspense", "Toaster",
  ],
  globalComponentConditions: "AIAssistantManager selects public or personalized assistant by user presence; NPSSurveyManager mounts only when its hook reports visible; shortcut dialog mounts under its open state; remaining components are mounted under a lazy Suspense/ErrorBoundary shell, with component-specific conditions in their source.",
  sourceOnly: true,
};

const pageRegisterMismatch = {
  pageRegister: { routes: pageRegister.routeCount, pageFiles: pageRegister.pageFileCount, unroutedPageFiles: pageRegister.unroutedPageFiles.length },
  generatedCatalog: { routes: routeNodes.length, pageFiles: pageFiles.length, unroutedPageFiles: unroutedPageFiles.length },
  platformRegister: {
    sourceRevision: platformRegister.sourceRevision,
    platformSourceDigest: platformRegister.platformSourceDigest,
    gate: platformRegister.gate,
    summary: platformRegister.summary,
  },
  completionPlanSnapshot: { routeLedgerRows: 80, source: "docs/testing/platform-completion-plan.md:13-96" },
  consistency: {
    routeDeclarationsMatchPageTool: routeNodes.length === pageRegister.routeCount,
    pageFilesMatchPageTool: pageFiles.length === pageRegister.pageFileCount,
    unroutedPageFilesMatchPageTool: unroutedPageFiles.length === pageRegister.unroutedPageFiles.length,
    routeDeclarationsMatchPlatformRegister: routeNodes.length === platformRegister.summary.routedPageDeclarations,
    pageLedgerRowsMatchCurrentRoutes: routeNodes.length === 80,
  },
};

const sourceDigest = sha(sourceFiles.map((file) => `${file}\0${sourceText.get(file)}`).join("\0"));
let gitHead = "unknown";
let workingTree = "status unavailable";
try {
  gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  workingTree = execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim() || "clean";
} catch {}

const dynamicEntries = [...unresolved.values()]
  .map((item) => ({
    ...item,
    id: `dyn-${sha(JSON.stringify({ kind: item.kind, source: item.source, line: item.line, element: item.element })).slice(0, 16)}`,
    pageRoutes: item.pageRoutes.sort(),
  }))
  .sort((a, b) => a.source.localeCompare(b.source) || (a.line ?? 0) - (b.line ?? 0));
const externalEntries = [...externalComponentReferences.values()]
  .map((item) => ({ ...item, pageRoutes: item.pageRoutes.sort() }))
  .sort((a, b) => a.source.file.localeCompare(b.source.file) || a.source.line - b.source.line);
const maxcoreGenerationActions = [
  {
    id: "gen-social-compose",
    labels: ["Generate with AI"],
    pages: ["/social-media"],
    uiSources: ["client/src/pages/SocialMedia.tsx:2593"],
    endpoint: "Text: POST /api/social/generate-content; image/audio/video: POST /api/multimodal/generate",
    maxcoreEvidence: ["server/routes/socialMedia.ts:3497-3512", "server/services/maxcoreDomainAdapter.ts:372-408", "server/services/multimodalGenerationService.ts:59-74"],
    outcome: "Stores generated content in page state and updates the draft/media preview; platform failures are surfaced.",
    access: "Signed-in app route; server generation routes require authentication.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-social-from-url",
    labels: ["Generate from URL"],
    pages: ["/social-media"],
    uiSources: ["client/src/pages/SocialMedia.tsx:3164-3173"],
    endpoint: "POST /api/social/generate-from-url; non-text formats additionally POST /api/multimodal/generate",
    maxcoreEvidence: ["server/routes/socialMedia.ts:3742-3766", "server/services/socialUrlMaxCoreTransport.ts", "server/services/multimodalGenerationService.ts:59-74"],
    outcome: "Returns source-grounded platform copy; image/audio/video modes also request media and show only usable rendered assets.",
    access: "Signed-in app route; source URL analysis and MaxCore availability can reject the request.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-social-content-generator",
    labels: ["Generate Content"],
    pages: ["/social-media"],
    uiSources: ["client/src/components/social/ContentGenerator.tsx:1657-1673"],
    endpoint: "POST /api/social/generate",
    maxcoreEvidence: ["server/routes/socialAI.ts:1089-1092", "server/routes/socialAI.ts:1351-1372", "server/services/unifiedAIController.ts"],
    outcome: "Places generated caption/copy in the component result state; errors display a failure toast.",
    access: "Signed-in social content generator.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-social-visual-brief",
    labels: ["Generate Visual Brief"],
    pages: ["/social-media"],
    uiSources: ["client/src/components/social/ContentGenerator.tsx:1321-1336"],
    endpoint: "POST /api/social/generate-image",
    maxcoreEvidence: ["server/routes/socialMedia.ts:5600-5618"],
    outcome: "Requests a MaxCore image and persists it for the signed-in owner; response is stored as the component visual result.",
    access: "Signed-in social content generator.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-social-hashtags",
    labels: ["Optimize Hashtags"],
    pages: ["/social-media"],
    uiSources: ["client/src/components/social/ContentGenerator.tsx:1838-1848"],
    endpoint: "POST /api/social/ai-content/optimize-hashtags",
    maxcoreEvidence: ["server/routes/socialAI.ts:852-869", "server/services/aiContentService.ts:546-565"],
    outcome: "Requests a MaxCore social variant and displays the returned hashtags; requires existing generated content.",
    access: "Signed-in social content generator; button is disabled while pending.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-social-ab-variants",
    labels: ["Generate A/B Test Variants"],
    pages: ["/social-media"],
    uiSources: ["client/src/components/social/ContentGenerator.tsx:2225-2243"],
    endpoint: "POST /api/social/ai-content/ab-variants",
    maxcoreEvidence: ["server/routes/socialAI.ts:723-749", "server/services/aiContentService.ts:681-705", "server/services/maxcoreDomainAdapter.ts:372-408"],
    outcome: "Returns MaxCore copy variants for the existing content and renders the variants with prediction fields marked unavailable when absent.",
    access: "Signed-in social content generator; requires previously generated content.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-social-content-pack",
    labels: ["Generate Content Pack"],
    pages: ["/social-media"],
    uiSources: ["client/src/components/social/ContentGenerator.tsx:1962-1981"],
    endpoint: "POST /api/multimodal/generate",
    maxcoreEvidence: ["server/routes/multimodal.ts:037-042", "server/routes/multimodal.ts:159-184", "server/services/multimodalGenerationService.ts:59-74"],
    outcome: "Requests assets for selected platforms and displays returned package assets; empty results are rejected.",
    access: "Signed-in content generator; requires a prompt and at least one selected platform.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-dashboard-optimized-draft",
    labels: ["Generate optimized draft"],
    pages: ["/dashboard"],
    uiSources: ["client/src/pages/Dashboard.tsx:846-865"],
    endpoint: "POST /api/ai/optimize-content",
    maxcoreEvidence: ["server/routes.ts:7030-7035", "server/routes.ts:7166-7177", "server/services/maxcoreDomainAdapter.ts:372-408"],
    outcome: "Saves a new unpublished draft or conditionally updates the selected unreviewed draft; it does not publish or schedule.",
    access: "Page displays the optimizer for paid-subscription accounts; server independently enforces paid-feature access.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-ad-variants",
    labels: ["Generate AI Variants", "Generate {bulkCount} Variants"],
    pages: ["/advertisement"],
    uiSources: ["client/src/components/advertising/CreativeVariantGenerator.tsx:243-254", "client/src/components/advertising/CreativeVariantGenerator.tsx:344-347", "client/src/components/advertising/CreativeVariantGenerator.tsx:709-717"],
    endpoint: "POST /api/advertising/generate-content",
    maxcoreEvidence: ["server/routes/advertising.ts:1995-1996", "server/routes/advertising.ts:2055-2073", "server/services/maxcoreDomainAdapter.ts:459-485"],
    outcome: "Returns the requested number of text creatives and displays them for review; it does not launch a campaign.",
    access: "Authenticated advertising surface; generation requires a non-empty topic.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-ad-campaign",
    labels: ["Generate Ad Campaign"],
    pages: ["/advertisement"],
    uiSources: ["client/src/pages/Advertisement.tsx:403-418"],
    endpoint: "POST /api/advertising/generate-campaign",
    maxcoreEvidence: ["server/routes/advertising.ts:2119-2122", "server/routes/advertising.ts:2202-2208"],
    outcome: "Generates creatives and persists an inactive campaign draft for review; activation remains a separate user action.",
    access: "Authenticated advertising surface; required content must be promotable.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-image-shared",
    labels: ["Generate Image", "Retry image", "Regenerate"],
    pages: ["/social-media", "/advertisement"],
    uiSources: ["client/src/components/content/AIImageGenerator.tsx:0201-0204", "client/src/components/content/AIImageGenerator.tsx:0407-0423", "client/src/components/content/AIImageGenerator.tsx:0461-469", "client/src/components/content/AIImageGenerator.tsx:0550-558"],
    endpoint: "Caller-selected POST /api/social/generate-image or /api/advertising/generate-image; artwork mode uses the selected endpoint.",
    maxcoreEvidence: ["server/routes/socialMedia.ts:5600-5618", "server/routes/advertising.ts:2515-2544"],
    outcome: "Requests and persists a MaxCore image artifact; errors are shown inline/toast. Poster mode instead uses the procedural renderer action below.",
    access: "Shown only where the shared AIImageGenerator is mounted; requires a non-empty topic.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-video-shared",
    labels: ["Generate Video from Text", "Generate Video from Audio", "Generate Video from Image", "Generate Full Music Video"],
    pages: ["/video-generator", "/social-media", "/advertisement"],
    uiSources: ["client/src/components/content/ServerVideoGenerator.tsx:1841-1879"],
    endpoint: "Caller-selected POST /api/social/generate-video or /api/advertising/generate-video; full music-video mode POSTs /api/social/generate-music-video",
    maxcoreEvidence: ["server/routes/socialMedia.ts:4221-4225", "server/routes/socialMedia.ts:4312-4357", "server/routes/advertising.ts:2428-2448", "server/routes/socialMedia.ts:6471-6506"],
    outcome: "Starts/polls an asynchronous render and displays the returned video when the job completes; audio/image modes require prior analysis.",
    access: "Visible only in the shared generator's selected input mode; route requires authentication.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-distribution-music-video",
    labels: ["Generate Music Video"],
    pages: ["/distribution"],
    uiSources: ["client/src/pages/Distribution.tsx:7141-7165"],
    endpoint: "POST /api/social/generate-music-video",
    maxcoreEvidence: ["client/src/pages/Distribution.tsx:6811-6837", "server/routes/socialMedia.ts:6471-6532"],
    outcome: "Uses MaxCore AI-scene generation when an audio track is supplied; image-only submission follows the separate legacy image renderer path.",
    access: "Button requires at least one audio file or image; MaxCore scene generation is conditional on audio being present.",
    confidence: "confirmed-source-chain-with-conditional-branch",
  },
  {
    id: "gen-studio-music",
    labels: ["Generate Music"],
    pages: ["/studio", "/studio/:projectId"],
    uiSources: ["client/src/components/studio/AIMusicGenerator.tsx:880-899"],
    endpoint: "POST /api/studio/generation/text",
    maxcoreEvidence: ["server/routes/studioGeneration.ts:411-412", "server/routes/studioGeneration.ts:447-465"],
    outcome: "Submits a MaxCore audio job, resolves/polls its result, then previews generated audio/MIDI and can add it to the open project.",
    access: "Studio generator panel; adding the result to a project requires the callback supplied by the studio.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-studio-arrangement",
    labels: ["Generate Full Arrangement"],
    pages: ["/studio", "/studio/:projectId"],
    uiSources: ["client/src/components/studio/AIMusicGenerator.tsx:900-917"],
    endpoint: "POST /api/studio/generation/pattern/arrangement",
    maxcoreEvidence: ["server/routes/studioGeneration.ts:236-305", "server/routes/studioGeneration.ts:857-878"],
    outcome: "Requests MaxCore audio then retrieves MIDI notes; returned arrangement tracks are added to the project timeline.",
    access: "Requires the studio generator to have an onTrackGenerated project callback.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-daw-track",
    labels: ["Generate Melody", "Generate Bass", "Generate Drums", "Generate Percussion", "Chord progression choices"],
    pages: ["/studio", "/studio/:projectId"],
    uiSources: ["client/src/components/studio/FlowStateAIPanel.tsx:645-719", "client/src/components/studio/FlowStateAIPanel.tsx:727-755"],
    endpoint: "POST /api/studio/generation/text",
    maxcoreEvidence: ["client/src/components/studio/StudioOneDAW.tsx:1456-1582", "server/routes/studioGeneration.ts:447-465"],
    outcome: "Requests MaxCore audio, resolves the response and adds generated audio/MIDI to the timeline; quick chord choices use the same text-to-audio route.",
    access: "Melody, bass, drums and percussion callbacks are wired in StudioOneDAW and UltimateDAW; chord progression choices trigger generation only where onGenerateChords is supplied (StudioOneDAW).",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-daw-arrangement",
    labels: ["Auto Arrange", "Suggest Chords"],
    pages: ["/studio", "/studio/:projectId"],
    uiSources: ["client/src/components/studio/FlowStateAIPanel.tsx:896-914", "client/src/components/studio/FlowStateAIPanel.tsx:250-255"],
    endpoint: "POST /api/studio/generation/pattern/arrangement and /api/studio/generation/pattern/chords",
    maxcoreEvidence: ["client/src/components/studio/StudioOneDAW.tsx:1638-1715", "server/routes/studioGeneration.ts:236-305", "server/routes/studioGeneration.ts:826-853", "server/routes/studioGeneration.ts:857-878"],
    outcome: "Returns a generated arrangement or chord MIDI set and adds it to the timeline when valid.",
    access: "StudioOneDAW supplies these callbacks; other panel hosts may omit them.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-lyrics-melody",
    labels: ["Generate Melodies"],
    pages: ["/studio", "/studio/:projectId"],
    uiSources: ["client/src/components/studio/FlowStateLyricsToMelody.tsx:667-686"],
    endpoint: "POST /api/studio/generation/pattern/melody",
    maxcoreEvidence: ["client/src/components/studio/FlowStateLyricsToMelody.tsx:180-225", "server/routes/studioGeneration.ts:236-305", "server/routes/studioGeneration.ts:767-796"],
    outcome: "Returns melody MIDI notes aligned to analyzed lyrics; failure or empty MaxCore notes show an error and do not create a result.",
    access: "Lyrics mode and non-empty lyrics are required.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-songwriting-assist",
    labels: ["Find", "Enter in the songwriting idea field"],
    pages: ["/projects"],
    uiSources: ["client/src/pages/ProjectsPageImpl.tsx:1141-1144"],
    endpoint: "POST /api/songwriting/ai-assist",
    maxcoreEvidence: ["server/routes/songwriting.ts:277-327", "server/services/unifiedAIController.ts"],
    outcome: "Returns local rhyme lookup alongside MaxCore-generated lyric ideas/chord suggestions for the selected songwriting session.",
    access: "Requires a selected session and a prompt; Enter and the Find button use the same mutation.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-outreach-pitch",
    labels: ["Generate Pitch"],
    pages: ["/outreach"],
    uiSources: ["client/src/pages/OutreachCRM.tsx:722-748"],
    endpoint: "POST /api/outreach/generate-pitch",
    maxcoreEvidence: ["server/routes/outreach.ts:335-369"],
    outcome: "Returns editable pitch text with optional live industry context; the separate Use This Pitch action carries it into pitch creation.",
    access: "Outreach generation dialog; track title is required.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-cognitive-task",
    labels: ["Run task", "Retry task"],
    pages: ["/admin/maxcore"],
    uiSources: ["client/src/components/admin/MaxCoreCognitiveConsole.tsx:527-545"],
    endpoint: "POST /api/maxcore/cognitive/tasks/:id/execute",
    maxcoreEvidence: ["server/routes/maxcoreCognitive.ts:395-447"],
    outcome: "Runs the assigned task through MaxCore and persists a verified model outcome; unavailable/unverified output leaves the task blocked.",
    access: "Owner/admin cognitive console; only pending/blocked tasks are shown as runnable and a ready model is required.",
    confidence: "confirmed-source-chain",
  },
  {
    id: "gen-procedural-media",
    labels: ["Create poster", "Create instrumental", "Create clip"],
    pages: ["/studio", "/studio/:projectId", "/social-media", "/advertisement", "/video-generator"],
    uiSources: ["client/src/components/content/LocalMediaRenderer.tsx:83-115", "client/src/components/content/LocalMediaRenderer.tsx:283-285"],
    endpoint: "POST /api/generate/image, /api/generate/audio, or /api/generate-video through the MaxCore proxy",
    maxcoreEvidence: ["server/routes/maxcoreProxy.ts:503-521"],
    outcome: "MaxCore API returns a procedural poster, synthesized instrumental, or headline/storyboard clip; source contract reports these capability kinds as untrained, so they are not classified as trained-model generations.",
    access: "Appears only in the relevant shared generator mode; local control validation and durable-artifact checks gate the displayed result.",
    confidence: "confirmed-proxy-chain-not-model-inference",
  },
];
const maxcoreGenerationServicePaths = {
  "gen-social-compose": [
    { step: "social-generation route", source: "server/routes/socialMedia.ts:3497-3512" },
    { step: "social domain adapter", source: "server/services/maxcoreDomainAdapter.ts:354-408" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
    { step: "MaxCore endpoint", source: "/api/platform/social/generate" },
  ],
  "gen-social-from-url": [
    { step: "URL validation and generation route", source: "server/routes/socialMedia.ts:3606-3766" },
    { step: "URL-specific request builder and response normalizer", source: "server/services/socialUrlMaxCoreTransport.ts:50-126" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
    { step: "MaxCore endpoint", source: "/api/platform/social/generate" },
  ],
  "gen-social-content-generator": [
    { step: "social AI route", source: "server/routes/socialAI.ts:1351-1372" },
    { step: "unified AI controller", source: "server/services/unifiedAIController.ts:318-487" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:530-610" },
    { step: "MaxCore inference endpoint", source: "MaxCore route selected by controller" },
  ],
  "gen-social-visual-brief": [
    { step: "social image route", source: "server/routes/socialMedia.ts:5600-5618" },
    { step: "shared MaxCore inference client", source: "server/services/maxcoreClient.ts:530-610" },
    { step: "MaxCore endpoint", source: "/api/generate/image" },
  ],
  "gen-social-hashtags": [
    { step: "social AI route", source: "server/routes/socialAI.ts:852-869" },
    { step: "hashtag service", source: "server/services/aiContentService.ts:546-565" },
    { step: "social domain adapter", source: "server/services/maxcoreDomainAdapter.ts:354-408" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
  ],
  "gen-social-ab-variants": [
    { step: "social AI route", source: "server/routes/socialAI.ts:723-749" },
    { step: "A/B variant service", source: "server/services/aiContentService.ts:681-705" },
    { step: "social domain adapter", source: "server/services/maxcoreDomainAdapter.ts:354-408" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
  ],
  "gen-social-content-pack": [
    { step: "multimodal request route", source: "server/routes/multimodal.ts:159-184" },
    { step: "multimodal plan and modality workers", source: "server/services/multimodalGenerationService.ts:59-75" },
    { step: "shared MaxCore client and media/job helpers", source: "server/services/maxcoreClient.ts; server/services/maxcoreAudioJob.ts; server/services/maxcoreAssetTransport.ts" },
    { step: "MaxCore modality endpoints", source: "image/audio/video endpoints depend on selected package plan" },
  ],
  "gen-dashboard-optimized-draft": [
    { step: "draft optimization route", source: "server/routes.ts:7030-7177" },
    { step: "social domain adapter", source: "server/services/maxcoreDomainAdapter.ts:354-408" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
  ],
  "gen-ad-variants": [
    { step: "advertising generation route", source: "server/routes/advertising.ts:1995-2073" },
    { step: "ads domain adapter", source: "server/services/maxcoreDomainAdapter.ts:354-359,459-485" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
    { step: "MaxCore endpoint", source: "/api/platform/ads/generate" },
  ],
  "gen-ad-campaign": [
    { step: "campaign route", source: "server/routes/advertising.ts:2119-2208" },
    { step: "shared MaxCore inference client", source: "server/services/maxcoreClient.ts:530-610" },
    { step: "MaxCore endpoint", source: "/api/platform/ads/generate" },
  ],
  "gen-image-shared": [
    { step: "social or advertising image route", source: "server/routes/socialMedia.ts:5600-5618; server/routes/advertising.ts:2515-2544" },
    { step: "shared MaxCore inference client", source: "server/services/maxcoreClient.ts:530-610" },
    { step: "MaxCore endpoint", source: "/api/generate/image" },
  ],
  "gen-video-shared": [
    { step: "social or advertising route", source: "server/routes/socialMedia.ts:4221-4357; server/routes/advertising.ts:2428-2448" },
    { step: "video job validation, asset transfer, and polling", source: "server/services/advancedVideoRendererService.ts:20-75,783-867" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
    { step: "MaxCore job endpoints", source: "/generate-video; /api/video-job/:id" },
  ],
  "gen-distribution-music-video": [
    { step: "music-video route", source: "server/routes/socialMedia.ts:6471-6532" },
    { step: "audio analysis and music-video orchestration", source: "server/services/musicVideoStudioService.ts:312-416" },
    { step: "owner-scoped audio transfer", source: "server/services/maxcoreAssetTransport.ts:73-140" },
    { step: "video renderer and shared MaxCore client", source: "server/services/advancedVideoRendererService.ts:783-867; server/services/maxcoreClient.ts:434-519" },
  ],
  "gen-studio-music": [
    { step: "studio generation route", source: "server/routes/studioGeneration.ts:411-496" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
    { step: "audio job status and artifact resolver", source: "server/services/maxcoreAudioJob.ts:19-80; server/routes/studioGeneration.ts:484-495" },
    { step: "MaxCore endpoints", source: "/api/generate/audio; /api/audio-job/:id" },
  ],
  "gen-studio-arrangement": [
    { step: "studio pattern route and job coordinator", source: "server/routes/studioGeneration.ts:227-305,857-878" },
    { step: "studio request wrapper", source: "server/services/studioMaxCoreTransport.ts:4-19" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
    { step: "MaxCore audio job and MIDI retrieval", source: "/api/generate/audio; /api/audio-job/:id; /api/audio/:id/midi" },
  ],
  "gen-daw-track": [
    { step: "StudioOneDAW or UltimateDAW callback", source: "client/src/components/studio/StudioOneDAW.tsx:1456-1582; client/src/components/studio/UltimateDAW.tsx:383-505" },
    { step: "studio text generation route", source: "server/routes/studioGeneration.ts:411-496" },
    { step: "shared MaxCore client and audio-job poll", source: "server/services/maxcoreClient.ts:434-519; server/routes/studioGeneration.ts:484-495" },
  ],
  "gen-daw-arrangement": [
    { step: "StudioOneDAW callbacks", source: "client/src/components/studio/StudioOneDAW.tsx:1638-1715" },
    { step: "studio pattern route and job coordinator", source: "server/routes/studioGeneration.ts:227-305,826-893" },
    { step: "studio request wrapper", source: "server/services/studioMaxCoreTransport.ts:4-19" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
  ],
  "gen-lyrics-melody": [
    { step: "lyrics-to-melody route", source: "server/routes/studioGeneration.ts:236-305,767-796" },
    { step: "studio request wrapper", source: "server/services/studioMaxCoreTransport.ts:4-19" },
    { step: "shared MaxCore client and MIDI retrieval", source: "server/services/maxcoreClient.ts:434-519; server/routes/studioGeneration.ts:283-304" },
  ],
  "gen-songwriting-assist": [
    { step: "songwriting route", source: "server/routes/songwriting.ts:277-327" },
    { step: "unified AI controller", source: "server/services/unifiedAIController.ts:318-487" },
    { step: "shared MaxCore inference client", source: "server/services/maxcoreClient.ts:530-610" },
  ],
  "gen-outreach-pitch": [
    { step: "outreach route and prompt/context assembly", source: "server/routes/outreach.ts:335-369" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
  ],
  "gen-cognitive-task": [
    { step: "task authorization, readiness, and provenance route", source: "server/routes/maxcoreCognitive.ts:395-447" },
    { step: "shared MaxCore client", source: "server/services/maxcoreClient.ts:434-519" },
    { step: "MaxCore endpoint", source: "/api/generate/text" },
  ],
  "gen-procedural-media": [
    { step: "authenticated proxy route", source: "server/routes/maxcoreProxy.ts:503-562" },
    { step: "proxy forwarding and response handling", source: "server/routes/maxcoreProxy.ts:300-363" },
    { step: "MaxCore origin resolver", source: "server/services/maxcoreConnector.ts" },
    { step: "MaxCore procedural endpoints", source: "/api/generate/image; /api/generate/audio; /api/generate-video" },
  ],
};
for (const action of maxcoreGenerationActions) {
  action.servicePath = maxcoreGenerationServicePaths[action.id] ?? [];
}
const maxcoreGenerationEvidenceFiles = [...new Set(
  maxcoreGenerationActions.flatMap((action) =>
    [
      ...action.uiSources,
      ...action.maxcoreEvidence,
      ...action.servicePath.map((step) => step.source),
    ]
      .map((reference) => reference.split(";").map((part) => part.trim()))
      .flat()
      .filter((reference) => reference.startsWith("client/") || reference.startsWith("server/"))
      .map((reference) => reference.split(":")[0]),
  ),
)].sort();
const maxcoreGenerationEvidenceDigest = sha(
  (await Promise.all(maxcoreGenerationEvidenceFiles.map(async (file) =>
    `${file}\0${await readFile(path.join(root, file), "utf8")}`,
  ))).join("\0"),
);

const registry = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceRevision: {
    gitHead,
    pageComponentSourceSha256: sourceDigest,
    maxcoreGenerationEvidenceSha256: maxcoreGenerationEvidenceDigest,
    workingTreeStatus: workingTree,
    maxcoreGenerationEvidenceFiles,
    note: "The page digest covers current on-disk App, page, component, page-access and admin-access-policy sources; the generation-evidence digest covers the UI and server source files cited in the MaxCore button inventory. Both include uncommitted edits.",
  },
  inventoryReconciliation: pageRegisterMismatch,
  counts: {
    appRouteDeclarations: routeRecords.filter((page) => page.path !== null).length,
    pageSourceFiles: pageFiles.length,
    unroutedRetainedPageFiles: unroutedPageFiles.length,
    canonicalComponentEntries: componentList.length,
    uniqueControlDeclarations: controlsList.length,
    meaningfulSectionDeclarations: sectionsList.length,
    confirmedMaxCoreGenerationActions: maxcoreGenerationActions.length,
    routeComponentOccurrences: routeRecords.filter((page) => page.path !== null).reduce((sum, page) => sum + page.componentIds.length, 0),
    routeControlOccurrences: routeRecords.filter((page) => page.path !== null).reduce((sum, page) => sum + page.controlIds.length, 0),
    routeSectionOccurrences: routeRecords.filter((page) => page.path !== null).reduce((sum, page) => sum + (page.sectionIds?.length ?? 0), 0),
    unresolvedOrDynamicComponentReferences: dynamicEntries.length,
    externalPackageComponentReferences: externalEntries.length,
  },
  methodology: {
    confidence: "Static source inventory only. Purpose statements use visible headings/labels when found; otherwise they are explicitly name-inferred. Handler names, hook names and URL literals are source links, not verified outcomes.",
    limitations: [
      "A route declaration, import graph, JSX node or API URL does not prove that a component mounts, an action succeeds, or a server authorizes a request.",
      "Conditional branches, state-dependent mounts, feature flags, responsive visibility and data-driven lists are recorded as static signals; exact runtime expansion is not known.",
      "Source file/module summaries can include code from multiple exports; canonical IDs preserve the imported export name, while module-level behavior is explicitly source evidence rather than a runtime trace.",
      "External UI primitives without client source are listed as package-provided; their internal behavior is not attributed to this repository.",
      "API literals are candidate client connections only. The platform register's frontend contract/backend matching remains authoritative for its own documented limitations.",
      "No browser, end-to-end, authorization, persistence, provider or product-behavior verification was run for this documentation task.",
    ],
  },
  globalApplication: appAccessSource,
  routesAndPages: routeRecords,
  components: componentList,
  controls: controlsList,
  meaningfulSections: sectionsList,
  maxcoreGenerationActions,
  unresolvedDynamicReferences: dynamicEntries,
  externalPackageComponentReferences: externalEntries,
};

await mkdir(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "page-component-catalog.json");
const markdownPath = path.join(outputDir, "page-component-catalog.md");
await writeFile(jsonPath, `${JSON.stringify(registry, null, 2)}\n`);

function mdCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").replace(/`/g, "\\`");
}

const routePages = routeRecords.filter((page) => page.path !== null);
const routeTable = routePages.map((page) =>
  `| \`${mdCell(page.path)}\` | \`${mdCell(page.declaredComponent)}\` | ${page.implementation ? `[\`${mdCell(page.implementation.file)}\`](#${page.rootComponentId})` : "**UNRESOLVED**"} | ${page.pageAccess.routerPolicy.startsWith("AppWithKeyboardShortcuts exempts") ? "Public route exemption" : "Signed-out redirect"} | ${page.platformPageStatus} |`,
).join("\n");

const pageSections = routePages.map((page) => {
  const components = page.componentIds.map((id) => canonical.get(id)).filter(Boolean);
  const controls = page.controlIds.map((id) => controlsList.find((item) => item.id === id)).filter(Boolean);
  const sections = (page.sectionIds ?? []).map((id) => sectionsList.find((item) => item.id === id)).filter(Boolean);
  const componentRows = components.map((component) =>
    `| [\`${mdCell(component.name)}\`](#${component.id}) | \`${mdCell(component.source.file)}:${component.source.line}\` | ${mdCell(component.purpose)} | ${mdCell(component.sourceBehavior.stateHooks.join(", ") || "no recognized local state/query hook")} |`,
  ).join("\n");
  const controlRows = controls.map((control) =>
    `| \`${mdCell(control.element)}\` | \`${control.source.file}:${control.source.line}\` | ${mdCell(control.purposeHint ?? control.visibleText ?? "no static label extracted")} | ${mdCell(control.eventBindings.map((event) => `${event.event}=${event.handler ?? "inline"}`).join(", ") || "no JSX event prop")} |`,
  ).join("\n");
  const sectionRows = sections.map((section) =>
    `| \`${mdCell(section.element)}\` | \`${section.source.file}:${section.source.line}-${section.source.endLine}\` | ${mdCell(section.heading ?? section.label ?? section.visibleText ?? "no static heading/label")} | ${mdCell(section.eventBindings.map((event) => `${event.event}=${event.handler ?? "inline"}`).join(", ") || "no event on section root")} |`,
  ).join("\n");
  const localVisibility = page.pageAccess.pageLocalSignals.length
    ? page.pageAccess.pageLocalSignals.map((signal) => `- \`${signal.text}\` — \`${signal.line}\``).join("\n")
    : "- No page-local role/entitlement condition matched the source scan; shared access gates still apply.";
  const wrapperDescription = page.wrapper
    ? page.wrapper.expression
      ? `inline wrapper \`${page.wrapper.expression}\`; props: ${(page.wrapper.props ?? []).map((prop) => `${prop.name}=${prop.value}`).join(", ") || "none extracted"}`
      : `${page.wrapper.kind ?? "wrapper"} from \`${page.wrapper.source ?? "unknown source"}\`${page.wrapper.target ? ` to \`${page.wrapper.target}\`` : ""}`
    : "no inline route wrapper detected";
  const state = page.statesAndServices.stateSignals.length ? page.statesAndServices.stateSignals.join(", ") : "No lexical state signal found.";
  const api = page.statesAndServices.apiReferences.length ? page.statesAndServices.apiReferences.map((value) => `\`${value}\``).join(", ") : "No literal `/api/` URL found in the page implementation file; imported hooks/components may own requests.";
  return [
    `### ${page.path} — ${page.declaredComponent}`,
    "",
    `- **Route declaration:** \`client/src/App.tsx:${page.routeSource.line}\``,
    `- **Implementation:** ${page.implementation ? `\`${page.implementation.file}\`` : "unresolved"}`,
    `- **Wrapper/alias:** ${wrapperDescription}`,
    `- **Source-supported purpose:** ${page.implementation ? `page component \`${page.declaredComponent}\` as named by source and route copy; review component entries below for explicit headings` : "not inferable from a resolved page source"}`,
    `- **Access:** ${page.pageAccess.routerPolicy} ${page.pageAccess.nativeBehavior}`,
    `- **Page-local access signals:**`,
    localVisibility,
    `- **State signals:** ${mdCell(state)}`,
    `- **Page-file API references:** ${api}`,
    `- **Current platform page evidence:** ${page.platformPageStatus}; all platform acceptance statuses are retained as-is and remain distinct from this catalog.`,
    "",
    `#### Component tree candidates (${components.length})`,
    "",
    "| Canonical component | Source | Purpose / intent basis | State/query hooks |",
    "| --- | --- | --- | --- |",
    componentRows || "| (none statically identified) | — | — | — |",
    "",
    `#### Meaningful control declarations (${controls.length})`,
    "",
    "| Element | Source | Label / text | JSX event binding |",
    "| --- | --- | --- | --- |",
    controlRows || "| (none statically identified) | — | — | — |",
    "",
    `#### Meaningful section declarations (${sections.length})`,
    "",
    "| Element | Source range | Heading / label / copy | Root event binding |",
    "| --- | --- | --- | --- |",
    sectionRows || "| (none statically identified) | — | — | — |",
    "",
  ].join("\n");
}).join("\n");

const componentSections = componentList.map((component) => {
  const observed = component.sourceBehavior;
  const controlsForComponent = component.observedControls
    .map((id) => controlsList.find((control) => control.id === id))
    .filter(Boolean);
  return [
    `<a id="${component.id}"></a>`,
    `### ${component.name} — \`${component.source.file}\``,
    "",
    `- **Canonical ID:** \`${component.id}\``,
    `- **Kind:** ${component.kind}; **purpose confidence:** ${component.purposeConfidence}`,
    `- **Purpose:** ${component.purpose}`,
    `- **Source behavior signals:** hooks \`${observed.stateHooks.join(", ") || "none recognized"}\`; state terms \`${observed.stateSignals.join(", ") || "none recognized"}\`.`,
    `- **Event bindings:** ${observed.eventBindings.length ? observed.eventBindings.slice(0, 16).map((event) => `\`${event.tag}@${event.line} ${event.event}=${event.handler ?? "inline"}\``).join(", ") : "none in scanned JSX."}`,
    `- **API references:** ${observed.apiReferences.length ? observed.apiReferences.map((api) => `\`${api}\``).join(", ") : "none detected in this source file."}`,
    `- **Imported local modules:** ${observed.importedModules.length ? observed.importedModules.map((file) => `\`${file}\``).join(", ") : "none resolved to the scanned page/component source set."}`,
    `- **Visibility signals:** ${observed.visibilitySignals.length ? observed.visibilitySignals.map((signal) => `\`${signal.text}\` (${signal.line})`).join("; ") : "none matched in this file."}`,
    `- **Used on routes:** ${component.renderedByPages.length ? component.renderedByPages.map((route) => `\`${route}\``).join(", ") : "not directly linked from a routed page in this static scan."}`,
    `- **Control declarations in module:** ${controlsForComponent.map((control) => `\`${control.element}@${control.source.line}\` (${control.id})`).join(", ") || "none detected."}`,
    `- **Verification:** ${component.usageStatus}.`,
    "",
  ].join("\n");
}).join("\n");

const unroutedTable = routeRecords.filter((page) => page.path === null).map((page) =>
  `| \`${page.implementation.file}\` | ${page.importedFrom?.length ? page.importedFrom.map((file) => `\`${file}\``).join(", ") : "no scanned import site"} | ${page.sourceInventoryStatus} |`,
).join("\n");

const unresolvedTable = dynamicEntries.map((entry) =>
  `| ${entry.pageRoutes.map((route) => `\`${route}\``).join(", ")} | ${entry.kind} | \`${entry.source}${entry.line ? `:${entry.line}` : ""}\` | \`${entry.element ?? "—"}\` | ${mdCell(entry.reason)} |`,
).join("\n");
const externalTable = externalEntries.map((entry) =>
  `| ${entry.pageRoutes.map((route) => `\`${route}\``).join(", ")} | \`${entry.element}\` | \`${entry.packageSpecifier}\` | \`${entry.source.file}:${entry.source.line}\` |`,
).join("\n");
const maxcoreActionRows = maxcoreGenerationActions.map((action) =>
  `| ${action.labels.map((label) => `\`${mdCell(label)}\``).join(", ")} | ${action.pages.map((route) => `\`${route}\``).join(", ")} | ${action.uiSources.map((source) => `\`${source}\``).join(", ")} | ${mdCell(action.endpoint)} | ${mdCell(action.servicePath.map(({ step, source }) => `${step} [${source}]`).join(" → "))} | ${mdCell(action.outcome)} | ${action.confidence} |`,
).join("\n");

const markdown = `# Page component and function catalog

Generated from current source on ${registry.generatedAt}.

## Scope and evidence boundary

This is a static source catalog, not a usability review or runtime verification. It describes source-supported purposes and observed declarations; it does not claim that the browser rendered a component, that an event handler succeeded, or that a server accepted an API call. "Purpose" is tied to visible copy where available and marked as inferred from a source name otherwise.

- Source revision: \`${gitHead}\`
- Page/component source digest: \`${sourceDigest}\`
- MaxCore button evidence digest: \`${maxcoreGenerationEvidenceDigest}\` (${maxcoreGenerationEvidenceFiles.length} cited source files)
- Working-tree state at generation: \`${workingTree.replace(/\n/g, "; ")}\`
- Routes: **${routePages.length}**; retained page source files: **${pageFiles.length}**; unrouted retained page files: **${unroutedPageFiles.length}**
- Canonical component entries: **${componentList.length}**; unique source control declarations: **${controlsList.length}**; meaningful section declarations: **${sectionsList.length}**
- Route-to-component occurrences: **${registry.counts.routeComponentOccurrences}**; route-to-control occurrences: **${registry.counts.routeControlOccurrences}**; route-to-section occurrences: **${registry.counts.routeSectionOccurrences}**
- Source-confirmed MaxCore generation action groups: **${maxcoreGenerationActions.length}** (these group repeated shared controls and conditional output modes)
- Unresolved or dynamic component references: **${dynamicEntries.length}**
- External package component references: **${externalEntries.length}** (package internals are not attributed to this repository)

### Reconciliation with current registers

| Inventory | Current count | Interpretation |
| --- | ---: | --- |
| \`scripts/review-page-register.mjs\` route declarations | ${pageRegister.routeCount} | Lexical App.tsx route/page-file inventory; its API/state indicators are lexical, not semantic. |
| \`scripts/review-page-register.mjs\` page files | ${pageRegister.pageFileCount} | Includes retained unrouted page files. |
| Direct App.tsx route declarations parsed here | ${routePages.length} | Includes aliases, wildcard, inline route wrappers, and unresolved bindings. |
| \`scripts/testing/platform-register.py\` routes | ${platformRegister.summary.routedPageDeclarations} | Current source register at \`${platformRegister.sourceRevision}\`; status remains ${platformRegister.gate?.status ?? platformRegister.gate}. |
| Platform-register UI interaction declarations | ${platformRegister.summary.uiInteractionDeclarations} | Its control ledger is source inventory, not proof of execution or distinct journeys. |
| Platform-register backend registrations | ${platformRegister.summary.backendRegistrations} | Includes the broader backend/source-registration scope, not just routed page APIs. |
| Platform-register frontend API contracts | ${platformRegister.summary.frontendApiContracts} | Candidate contract inventory; matching and behavior have separate evidence requirements. |
| Existing completion-plan page rows | 80 | \`docs/testing/platform-completion-plan.md:13-96\`; reconciled to 80 current route declarations. |

The generated page register reports ${pageRegister.unroutedPageFiles.length} unrouted page files; this catalog reports ${unroutedPageFiles.length}. Unrouted means no direct route implementation binding was found. It does not prove the file is dead or stale. Alias routes remain separate route entries even when they share the same implementation.

### Global application gates and shared chrome

- **App-only/admin gate:** \`client/src/App.tsx\` calls \`shouldBlockNonAdminApp\`; the alternate view presents an administrator-only message and a sign-out action. This gate can precede every route.
- **Signed-out routing:** \`AppWithKeyboardShortcuts\` redirects non-public paths to \`/login?redirect=...\`; public-route exemptions are declared in \`client/src/lib/pageAccess.ts\`. This is client navigation policy, not API authorization.
- **Native landing behavior:** authenticated native clients can be redirected from marketing/auth routes to \`/dashboard\`.
- **Global components:** ${appAccessSource.sessionAndGlobalComponents.map((name) => `\`${name}\``).join(", ")}. See \`globalApplication\` in the JSON registry for source-level mounting/conditions; components have separate source entries when included by a page tree.
- **Layout/navigation:** \`AppLayout\` provides responsive shell, sidebar, top bar, breadcrumb, main content area, optional demo banner and mobile bottom navigation; \`Sidebar\` filters admin-only items by \`user.role === "admin"\`; \`MobileBottomNav\` shows Dashboard, Studio, Marketplace, Social and a More action. Full implementation entries and page usage links are in the component index below.

## Route and page implementation index

| Route | Route component | Implementation | Client route access | Platform register status |
| --- | --- | --- | --- | --- |
${routeTable}

## How to read the page entries

- The component tree is a static import/JSX candidate graph. Conditional, lazy, responsive and runtime-generated content may not appear for a given user or render.
- A control row records JSX tag, source, available label/text, event prop and conditional/list context. An inline handler is reported as inline source; no outcome is inferred.
- State hooks and state terms are text/source signals, not an exhaustive state machine. Query/service/API dependencies are source connections only.
- UI primitives are canonical source entries where the project has source for them. External package primitives are not assigned repository behavior.
- Component links point to a canonical entry; reused component entries list all statically associated routes.

## Buttons that request MaxCore generation

This is a source-traced list of user-facing generation controls, not runtime verification. Each row links the UI declaration through the server route and service-layer intermediaries to the MaxCore boundary. Shared controls and their mode-specific endpoint choices are grouped. Analysis, navigation, local-only rendering, and template generation are not described as MaxCore model generation. The procedural-renderer row is included separately because it calls MaxCore's API proxy but its own response contract marks the output as untrained.

| Button label | Route(s) | UI source | Request endpoint | Ordered server/service path to MaxCore | Source-described result | Evidence status |
| --- | --- | --- | --- | --- | --- | --- |
${maxcoreActionRows}

**Shared client boundary:** calls using \`MaxCoreAIClient\` resolve the configured origin through \`maxcoreConnector\`, bind trusted owner identity, prepare awareness/cognitive context where applicable, and apply the shared authenticated HTTP, concurrency, circuit-breaker, and response handling in \`maxcoreClient.ts\`. The procedural media controls use the authenticated \`maxcoreProxy\` forwarding route instead of that shared AI client. These are distinct code paths in current source; consolidating them would change ownership, request processing, and error behavior and needs a separately scoped refactor.

**Useful exclusions:** \`Generate Contract\` in Contracts fills and saves a local template, not a MaxCore response; Studio AI Mix/Master apply project rendering/DSP paths rather than content generation; audio-to-melody uses the local pitch tracker; \`Analyze Audio\`, \`Analyze Image\`, \`Detect Key\`, and \`Analyze My Voice\` are analysis actions; \`Open AI Generator\` only opens a panel. These are not counted as generation buttons above. The \`useAdvertisement\` hook defines AI-content and campaign-optimization mutations, and \`ContentGenerator\` defines a multilingual-generation mutation, but no page/component call site is found for those mutations, so they are not listed as visible buttons. The \`Generate Music Video\` control on Distribution reaches MaxCore scene generation only when an audio file is supplied; image-only submissions use a separate renderer.

## Pages, component trees and meaningful controls

${pageSections}
## Canonical shared and page component entries

${componentSections}
## Retained page files without direct route declarations

| Page file | Scanned import sites | Classification |
| --- | --- | --- |
${unroutedTable || "| (none) | — | — |"}

## Unresolved and runtime-generated component references

These entries require source/owner clarification if they are expected to represent supported functionality. They are not silently treated as rendered features.

| Route | Classification | Source | JSX element | Why unresolved |
| --- | --- | --- | --- | --- |
${unresolvedTable || "| (none found by this scanner) | — | — | — | — |"}

## External package primitives

These JSX elements resolve to package imports rather than repository source. Their package identity is recorded; the catalog does not claim the package's internal behavior.

| Route usage | Element | Package import | Source |
| --- | --- | --- | --- |
${externalTable || "| (none found by this scanner) | — | — | — |"}

The structured companion \`page-component-catalog.json\` contains stable route/component/control IDs, source line references, page usage links, purpose confidence, state/event/API/visibility signals, platform register IDs where source line matching is available, and the limitations above. Regenerate after source changes using:

\`\`\`sh
node scripts/review-page-register.mjs --out /tmp/page-register
python3 scripts/testing/platform-register.py --input reports/test-verification --output reports/test-verification
node scripts/generate-page-component-catalog.mjs --page-register /tmp/page-register/page-register.json --platform-register reports/test-verification/platform-register.json
\`\`\`

`;

await writeFile(markdownPath, markdown);
console.log(JSON.stringify({
  markdownPath: rel(markdownPath),
  jsonPath: rel(jsonPath),
  routes: routePages.length,
  pageFiles: pageFiles.length,
  unroutedPageFiles: unroutedPageFiles.length,
  canonicalComponents: componentList.length,
  controls: controlsList.length,
  unresolvedReferences: dynamicEntries.length,
  sourceRevision: gitHead,
  sourceDigest,
}, null, 2));
