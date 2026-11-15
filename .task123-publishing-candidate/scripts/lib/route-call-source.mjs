import ts from "typescript";

/**
 * Hide type arguments from route-call regexes without changing source offsets.
 * Parse rather than regex-match the types: nested generics and comments can
 * contain angle brackets, strings, or multiline object declarations.
 */
export function stripRouteTypeArguments(source, filename = "routes.ts") {
  if (!/\.\s*(?:get|post|put|patch|delete|all|options|head|use)\s*</.test(source)) {
    return source;
  }
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const methods = new Set(["get", "post", "put", "patch", "delete", "all", "options", "head", "use"]);
  const ranges = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) && node.typeArguments?.length &&
      ts.isPropertyAccessExpression(node.expression) &&
      methods.has(node.expression.name.text)
    ) {
      const children = node.getChildren(file);
      const open = children.find(child => child.kind === ts.SyntaxKind.LessThanToken);
      const close = children.find(child => child.kind === ts.SyntaxKind.GreaterThanToken);
      if (open && close) ranges.push([open.getStart(file), close.end]);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  let result = source;
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
    result = result.slice(0, start) +
      result.slice(start, end).replace(/[^\r\n]/g, " ") +
      result.slice(end);
  }
  return result;
}