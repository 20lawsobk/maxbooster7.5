import ts from "typescript";

/** Static declarations only; this cannot resolve mounts or runtime authority. */
export function discoverHandlers(name, content) {
  const handlers = [];
  let unresolvedDeclarations = 0;
  if (name.endsWith(".py")) {
    const decorators = /@(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*(?:["']([^"'\n]+)["'])?/g;
    for (const match of content.matchAll(decorators)) {
      if (match[2]) handlers.push({
        method: match[1].toUpperCase(), declaredPath: match[2],
        line: content.slice(0, match.index).split("\n").length,
      });
      else unresolvedDeclarations++;
    }
    return { handlers, unresolvedDeclarations };
  }
  const source = ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression;
      if (ts.isIdentifier(receiver) && /^(?:app|router|[A-Za-z_$][\w$]*Router)$/.test(receiver.text) &&
          /^(?:get|post|put|patch|delete|head|options)$/.test(method)) {
        const route = node.arguments[0];
        if (route && (ts.isStringLiteral(route) || ts.isNoSubstitutionTemplateLiteral(route))) {
          handlers.push({
            method: method.toUpperCase(), declaredPath: route.text,
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          });
        } else unresolvedDeclarations++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { handlers, unresolvedDeclarations };
}
