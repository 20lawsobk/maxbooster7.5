/**
 * change-compare — semantic (declaration-level) diff for TypeScript/JavaScript.
 *
 * Line diffs tell you *what text* changed; this layer tells you *what code*
 * changed: which functions, classes, interfaces, types, enums, and variables
 * were added, removed, or had their signatures modified — with the exact
 * before/after signatures spelled out.
 */
import ts from "typescript";
import type { DeclInfo, DeclKind, SemanticDiff } from "./types.js";

const SUPPORTED_EXT = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

export function isSupported(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return SUPPORTED_EXT.has(path.slice(dot).toLowerCase());
}

function scriptKindFor(path: string): ts.ScriptKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts"))
    return ts.ScriptKind.TS;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

/** `export` / `export default` present on the node? */
function isExported(node: ts.Node): boolean {
  const mods = (node as ts.HasModifiers).modifiers;
  return !!mods?.some(
    (m) =>
      m.kind === ts.SyntaxKind.ExportKeyword ||
      m.kind === ts.SyntaxKind.DefaultKeyword,
  );
}

function typeText(node: ts.Node | undefined, sf: ts.SourceFile): string {
  if (!node) return "";
  return node.getText(sf).replace(/\s+/g, " ").trim();
}

function paramSignature(params: readonly ts.ParameterDeclaration[], sf: ts.SourceFile): string {
  return (
    "(" +
    params
      .map((p) => {
        const name = p.name.getText(sf);
        const optional = p.questionToken ? "?" : "";
        const type = p.type ? `: ${typeText(p.type, sf)}` : "";
        const init = p.initializer ? ` = ${typeText(p.initializer, sf)}` : "";
        const rest = p.dotDotDotToken ? "..." : "";
        return `${rest}${name}${optional}${type}${init}`;
      })
      .join(", ") +
    ")"
  );
}

function functionSignature(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile): string {
  const name = (fn as ts.FunctionDeclaration).name?.getText(sf) ?? "<anonymous>";
  const typeParams = (fn as ts.SignatureDeclaration).typeParameters
    ? `<${(fn as ts.SignatureDeclaration).typeParameters!.map((t) => t.getText(sf)).join(", ")}>`
    : "";
  const params = paramSignature(fn.parameters, sf);
  const ret = fn.type ? `: ${typeText(fn.type, sf)}` : "";
  return `${name}${typeParams}${params}${ret}`;
}

function heritageText(
  node: ts.ClassDeclaration | ts.InterfaceDeclaration,
  sf: ts.SourceFile,
): string {
  const parts: string[] = [];
  for (const clause of node.heritageClauses ?? []) {
    const kw =
      clause.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements";
    parts.push(
      `${kw} ${clause.types.map((t) => t.getText(sf).replace(/\s+/g, " ")).join(", ")}`,
    );
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function classDetail(cls: ts.ClassDeclaration, sf: ts.SourceFile): string {
  const members: string[] = [];
  for (const m of cls.members) {
    if (ts.isConstructorDeclaration(m)) {
      members.push(`constructor${paramSignature(m.parameters, sf)}`);
    } else if (ts.isMethodDeclaration(m) || ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
      const name = m.name.getText(sf);
      const kind = ts.isGetAccessorDeclaration(m) ? "get " : ts.isSetAccessorDeclaration(m) ? "set " : "";
      const statik = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword) ? "static " : "";
      const ret = m.type ? `: ${typeText(m.type, sf)}` : "";
      members.push(`${statik}${kind}${name}${paramSignature(m.parameters, sf)}${ret}`);
    } else if (ts.isPropertyDeclaration(m)) {
      const name = m.name.getText(sf);
      const statik = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword) ? "static " : "";
      const optional = m.questionToken ? "?" : "";
      const type = m.type ? `: ${typeText(m.type, sf)}` : "";
      members.push(`${statik}${name}${optional}${type}`);
    }
  }
  members.sort();
  return members.join("\n");
}

function interfaceDetail(iface: ts.InterfaceDeclaration, sf: ts.SourceFile): string {
  const members: string[] = [];
  for (const m of iface.members) {
    if (ts.isPropertySignature(m)) {
      const name = m.name.getText(sf);
      const optional = m.questionToken ? "?" : "";
      const type = m.type ? `: ${typeText(m.type, sf)}` : "";
      members.push(`${name}${optional}${type}`);
    } else if (ts.isMethodSignature(m)) {
      const name = m.name.getText(sf);
      const optional = m.questionToken ? "?" : "";
      const ret = m.type ? `: ${typeText(m.type, sf)}` : "";
      members.push(`${name}${optional}${paramSignature(m.parameters, sf)}${ret}`);
    } else {
      members.push(m.getText(sf).replace(/\s+/g, " ").trim());
    }
  }
  members.sort();
  return members.join("\n");
}

/**
 * Extract top-level declarations from a TS/JS source string.
 * Returns an empty array when the source cannot be parsed.
 */
export function extractDeclarations(source: string, fileName: string): DeclInfo[] {
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile(
      fileName,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(fileName),
    );
  } catch {
    return [];
  }
  const decls: DeclInfo[] = [];
  const push = (
    name: string,
    kind: DeclKind,
    signature: string,
    detail: string,
    node: ts.Node,
  ) => {
    decls.push({
      name,
      kind,
      signature,
      detail,
      exported: isExported(node),
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    });
  };

  const visitTopLevel = (node: ts.Node): void => {
    // Unwrap `export { ... }` / `export *` — they re-export, not declare.
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) return;

    if (ts.isFunctionDeclaration(node) && node.name) {
      push(node.name.getText(sf), "function", functionSignature(node, sf), "", node);
    } else if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.getText(sf);
      push(name, "class", `class ${name}${heritageText(node, sf)}`, classDetail(node, sf), node);
    } else if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.getText(sf);
      push(name, "interface", `interface ${name}${heritageText(node, sf)}`, interfaceDetail(node, sf), node);
    } else if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.getText(sf);
      push(name, "type", `type ${name} = ${typeText(node.type, sf)}`, "", node);
    } else if (ts.isEnumDeclaration(node)) {
      const name = node.name.getText(sf);
      const members = node.members.map((m) => m.name.getText(sf)).join(", ");
      push(name, "enum", `enum ${name}`, members, node);
    } else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const name = d.name.getText(sf);
        const type = d.type ? `: ${typeText(d.type, sf)}` : "";
        const init = d.initializer
          ? ` = ${typeText(d.initializer, sf).slice(0, 80)}`
          : "";
        const kw =
          node.declarationList.flags & ts.NodeFlags.Const ? "const" : "let/var";
        push(name, "variable", `${kw} ${name}${type}${init}`, "", d);
        // A variable's export modifier lives on the statement; propagate it.
        decls[decls.length - 1].exported = isExported(node) || isExported(d);
      }
    }
  };

  for (const stmt of sf.statements) visitTopLevel(stmt);
  return decls;
}

function declKey(d: DeclInfo): string {
  return `${d.kind}:${d.name}`;
}

/**
 * Diff two declaration lists.
 * Same kind+name with a different signature or detail counts as modified.
 */
export function diffDeclarations(
  before: DeclInfo[],
  after: DeclInfo[],
): SemanticDiff {
  const beforeByKey = new Map(before.map((d) => [declKey(d), d]));
  const afterByKey = new Map(after.map((d) => [declKey(d), d]));
  const added: DeclInfo[] = [];
  const removed: DeclInfo[] = [];
  const modified: { before: DeclInfo; after: DeclInfo }[] = [];
  let unchangedCount = 0;

  for (const [key, a] of afterByKey) {
    const b = beforeByKey.get(key);
    if (!b) {
      added.push(a);
    } else if (b.signature !== a.signature || b.detail !== a.detail) {
      modified.push({ before: b, after: a });
    } else {
      unchangedCount++;
    }
  }
  for (const [key, b] of beforeByKey) {
    if (!afterByKey.has(key)) removed.push(b);
  }

  const byName = (x: DeclInfo, y: DeclInfo) => x.name.localeCompare(y.name);
  added.sort(byName);
  removed.sort(byName);
  modified.sort((x, y) => x.after.name.localeCompare(y.after.name));

  return { added, removed, modified, unchangedCount };
}

/**
 * Compare two source texts. A missing side is treated as "no declarations",
 * so added files report every declaration as added (and vice versa).
 * Returns undefined only when there is nothing to compare or the language
 * is unsupported.
 */
export function semanticDiff(
  before: string | null,
  after: string | null,
  path: string,
): SemanticDiff | undefined {
  if (before == null && after == null) return undefined;
  if (!isSupported(path)) return undefined;
  return diffDeclarations(
    before == null ? [] : extractDeclarations(before, path),
    after == null ? [] : extractDeclarations(after, path),
  );
}
