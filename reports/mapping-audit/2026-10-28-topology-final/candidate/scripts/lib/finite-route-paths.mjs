import ts from "typescript";

const LIMIT = 64;
const MAX_LENGTH = 2048;
const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all"]);

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}

function binds(node, name) {
  if (!node) return false;
  if (ts.isIdentifier(node)) return node.text === name;
  return (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) && node.elements.some(element => ts.isBindingElement(element) && binds(element.name, name));
}

function directBindings(scope, name) {
  const declarations = [];
  const statements = ts.isCaseBlock(scope) ? scope.clauses.flatMap(clause => [...clause.statements]) : scope.statements ?? [];
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (binds(declaration.name, name)) declarations.push({ declaration, list: statement.declarationList });
      }
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) && statement.name?.text === name) {
      declarations.push({ declaration: statement });
    } else if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.name?.text === name || (clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.some(element => element.name.text === name))) declarations.push({ declaration: statement });
    }
  }
  return declarations;
}

function isStatementScope(node) {
  return ts.isBlock(node) || ts.isSourceFile(node) || ts.isCaseBlock(node) || ts.isModuleBlock(node);
}

function loopBinds(scope, name) {
  if (!ts.isForStatement(scope) && !ts.isForInStatement(scope) && !ts.isForOfStatement(scope)) return false;
  const list = scope.initializer;
  return !!list && ts.isVariableDeclarationList(list) && list.declarations.some(declaration => binds(declaration.name, name));
}

function isWrite(node, name) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
    let found = false;
    function visit(left) { if (ts.isIdentifier(left) && left.text === name) found = true; ts.forEachChild(left, visit); }
    visit(node.left);
    if (found) return true;
  }
  return (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && ts.isIdentifier(node.operand) && node.operand.text === name && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator);
}

function containsWrite(scope, name) {
  let written = false;
  function visit(node) { if (isWrite(node, name)) written = true; if (!written) ts.forEachChild(node, visit); }
  visit(scope);
  return written;
}

function arrayValues(expression, at, sourceFile) {
  const value = unwrap(expression);
  if (ts.isArrayLiteralExpression(value)) {
    if (!value.elements.length || value.elements.length > LIMIT) return null;
    const strings = [];
    for (const element of value.elements) {
      const item = unwrap(element);
      if (!item || !(ts.isStringLiteral(item) || ts.isNoSubstitutionTemplateLiteral(item)) || item.text.length > MAX_LENGTH) return null;
      strings.push(item.text);
    }
    return [...new Set(strings)];
  }
  if (!value || !ts.isIdentifier(value)) return null;
  for (let scope = at.parent; scope; scope = scope.parent) {
    if (ts.isWithStatement(scope) || ((ts.isClassExpression(scope) || ts.isClassDeclaration(scope)) && scope.name?.text === value.text) || loopBinds(scope, value.text) ||
        (ts.isCatchClause(scope) && binds(scope.variableDeclaration?.name, value.text)) ||
        (ts.isFunctionLike(scope) && scope.parameters.some(parameter => binds(parameter.name, value.text)))) return null;
    if (!isStatementScope(scope)) continue;
    const found = directBindings(scope, value.text);
    if (!found.length) continue;
    if (found.length !== 1) return null;
    const { declaration, list } = found[0];
    if (!list || !(list.flags & ts.NodeFlags.Const) || declaration.getStart(sourceFile) >= at.getStart(sourceFile)) return null;
    const literal = unwrap(declaration.initializer);
    if (!literal || !ts.isArrayLiteralExpression(literal)) return null;
    // A const binding does not freeze an array. Reject aliases, calls, writes,
    // property access and other uses that could change its iteration values.
    let unsafe = false;
    function uses(node) {
      if (ts.isIdentifier(node) && node.text === value.text && node !== declaration.name) {
        const parent = node.parent;
        if (!(ts.isForOfStatement(parent) && unwrap(parent.expression) === node)) unsafe = true;
      }
      ts.forEachChild(node, uses);
    }
    uses(scope);
    return unsafe ? null : arrayValues(literal, at, sourceFile);
  }
  return null;
}

function loopValues(identifier, sourceFile) {
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    // Do not specialize a deferred nested function using the caller's loop.
    if (ts.isFunctionLike(scope) || ts.isWithStatement(scope) ||
        ((ts.isClassExpression(scope) || ts.isClassDeclaration(scope)) && scope.name?.text === identifier.text)) return null;
    if (isStatementScope(scope)) {
      if (directBindings(scope, identifier.text).length) return null;
    }
    if (ts.isCatchClause(scope) && binds(scope.variableDeclaration?.name, identifier.text)) return null;
    if (!ts.isForOfStatement(scope)) {
      if (loopBinds(scope, identifier.text)) return null;
      continue;
    }
    const list = scope.initializer;
    if (!ts.isVariableDeclarationList(list) || list.declarations.length !== 1) return null;
    const declaration = list.declarations[0];
    if (!binds(declaration.name, identifier.text)) continue;
    if (!(list.flags & ts.NodeFlags.Const) || !ts.isIdentifier(declaration.name) || containsWrite(scope.statement, identifier.text)) return null;
    return arrayValues(scope.expression, scope, sourceFile);
  }
  return null;
}

/** Resolve a source-proven finite loop template without importing/evaluating it.
 * null means unsupported/ambiguous, never a literal '${...}' route.
 */
export function resolveFiniteTemplatePath(source, file, callOffset) {
  if (typeof source !== "string" || !Number.isInteger(callOffset) || callOffset < 0 || callOffset >= source.length) return null;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length) return null;
  let target;
  function visit(node) {
    if (ts.isCallExpression(node) && node.getStart(sourceFile) === callOffset && ts.isPropertyAccessExpression(node.expression) && METHODS.has(node.expression.name.text)) target = node;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  const template = unwrap(target?.arguments[0]);
  if (!template || !ts.isTemplateExpression(template)) return null;
  const values = new Map();
  for (const span of template.templateSpans) {
    const expression = unwrap(span.expression);
    if (!expression || !ts.isIdentifier(expression)) return null;
    if (!values.has(expression.text)) {
      const possible = loopValues(expression, sourceFile);
      if (!possible) return null;
      values.set(expression.text, possible);
    }
  }
  let environments = [new Map()];
  for (const [name, options] of values) {
    if (environments.length * options.length > LIMIT) return null;
    environments = environments.flatMap(environment => options.map(option => new Map([...environment, [name, option]])));
  }
  const paths = environments.map(environment => template.head.text + template.templateSpans.map(span => environment.get(unwrap(span.expression).text) + span.literal.text).join(""));
  return paths.some(path => path.length > MAX_LENGTH) ? null : [...new Set(paths)];
}
