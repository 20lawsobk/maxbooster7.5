/* Wave 1 unused-family codemod. DRY_RUN=1 to preview. */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const DRY = process.env.DRY_RUN === '1';
const FORBIDDEN = [/AI training server\//, /hybridStorageService\.ts/, /maxbooster7\.5\//];
const forbidden = (f) => FORBIDDEN.some((r) => r.test(f));
const CODES = new Set(['6133', '6138', '6196', '6198']);

// ---- parse tsc output ----
const errsByFile = new Map();
for (const tf of ['/tmp/tc_server.txt', '/tmp/tc_client.txt']) {
  if (!fs.existsSync(tf)) continue;
  for (const line of fs.readFileSync(tf, 'utf8').split('\n')) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/);
    if (!m) continue;
    const [, file, l, c, code, msg] = m;
    if (!CODES.has(code) || forbidden(file)) continue;
    if (!errsByFile.has(file)) errsByFile.set(file, []);
    errsByFile.get(file).push({ line: +l, col: +c, code, msg });
  }
}

if (process.env.ONLY_FILES) {
  const only = new Set(process.env.ONLY_FILES.split(',').filter(Boolean));
  for (const k of [...errsByFile.keys()]) if (!only.has(k)) errsByFile.delete(k);
}

// ---- helpers ----
function findNodeAtPos(sf, pos) {
  let found = sf;
  (function visit(node) {
    if (pos >= node.getStart(sf) && pos < node.getEnd()) {
      found = node;
      node.forEachChild(visit);
    }
  })(sf);
  return found;
}
function hasSideEffects(node) {
  let f = false;
  (function v(n) {
    if (f || !n) return;
    if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isAwaitExpression(n) ||
        ts.isYieldExpression(n) || ts.isTaggedTemplateExpression(n)) { f = true; return; }
    n.forEachChild(v);
  })(node);
  return f;
}
function hasDecorators(node) {
  const mods = ts.canHaveDecorators?.(node) ? ts.getDecorators(node) : undefined;
  return !!(mods && mods.length);
}
// expand a node range to swallow its whole line(s) cleanly
function lineExpand(text, start, end) {
  let s = start, e = end;
  while (s > 0 && (text[s - 1] === ' ' || text[s - 1] === '\t')) s--;
  if (text[e] === '\r') e++;
  if (text[e] === '\n') e++;
  return [s, e];
}

const stats = {};
const bump = (k) => (stats[k] = (stats[k] || 0) + 1);
const DEBUGRISK = [];
let filesChanged = 0, filesReverted = 0, filesSkippedNoEdit = 0;
const changedList = [];

for (const [file, errs] of errsByFile) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) { bump('missing_file'); continue; }
  const text = fs.readFileSync(full, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true, kind);
  if (sf.parseDiagnostics && sf.parseDiagnostics.length) { bump('preexisting_parse_err'); continue; }

  const edits = []; // {start,end,text}
  const importGroups = new Map(); // ImportDeclaration node -> Set<names>
  const occupied = []; // ranges already claimed to dedupe

  for (const e of errs) {
    let pos;
    try { pos = sf.getPositionOfLineAndCharacter(e.line - 1, e.col - 1); } catch { bump('bad_pos'); continue; }
    const node = findNodeAtPos(sf, pos);
    if (!node) { bump('no_node'); continue; }
    const _ctx = `${file}:${e.line} TS${e.code} ${e.msg}`;

    // climb to actionable ancestor
    let n = node;
    // ---------- imports ----------
    const imp = (function up(x){ while(x){ if(ts.isImportDeclaration(x)) return x; x=x.parent;} return null; })(n);
    if (imp) {
      if (!importGroups.has(imp)) importGroups.set(imp, new Set());
      importGroups.get(imp).add(node.getText(sf));
      bump('import_name');
      continue;
    }
    // ---------- find declaration kind ----------
    // VariableDeclaration / TS6198 pattern
    const vd = (function up(x){ while(x){ if(ts.isVariableDeclaration(x)) return x; if(ts.isFunctionLike(x)||ts.isClassLike(x)||ts.isStatement(x)) return null; x=x.parent;} return null; })(n);
    if (vd && (ts.isIdentifier(vd.name) || e.code === '6198' || ts.isObjectBindingPattern(vd.name) || ts.isArrayBindingPattern(vd.name))) {
      const list = vd.parent; // VariableDeclarationList
      const stmt = list.parent; // VariableStatement (or ForStatement etc.)
      // only handle simple VariableStatement with a single declarator
      if (ts.isVariableStatement(stmt) && list.declarations.length === 1) {
        const isConst = !!(list.flags & ts.NodeFlags.Const);
        if (!isConst) { bump('skip_nonconst_local'); continue; } // let/var may be write-only
        // case: identifier name, OR all-unused destructure (6198), OR object/array pattern node itself flagged
        const nameIsIdent = ts.isIdentifier(vd.name) && vd.name.getStart(sf) === pos;
        const isWholeDecl = nameIsIdent || (e.code === '6198' && vd.name.getStart(sf) === pos);
        if (isWholeDecl) {
          if (!vd.initializer) {
            const [s, en] = lineExpand(text, stmt.getStart(sf), stmt.getEnd());
            edits.push({ start: s, end: en, text: '', tag: 'local_noinit_remove' });
          } else if (!hasSideEffects(vd.initializer)) {
            const [s, en] = lineExpand(text, stmt.getStart(sf), stmt.getEnd());
            edits.push({ start: s, end: en, text: '', tag: 'local_pure_remove' });
          } else {
            const initText = vd.initializer.getText(sf);
            const needsParen = /^[\{\(]/.test(initText.trim());
            const repl = (needsParen ? '(' + initText + ')' : initText) + ';';
            edits.push({ start: stmt.getStart(sf), end: stmt.getEnd(), text: repl, tag: 'local_sideeffect_convert' });
          }
          continue;
        }
        // object binding element (single name within pattern) -> remove that element
        if (ts.isObjectBindingPattern(vd.name)) {
          const be = (function up(x){ while(x){ if(ts.isBindingElement(x)) return x; x=x.parent;} return null; })(n);
          if (be && be.parent === vd.name) {
            const elems = vd.name.elements;
            const idx = elems.indexOf(be);
            let s = be.getStart(sf), en = be.getEnd();
            // consume trailing comma, else preceding comma
            const after = text.slice(en).match(/^\s*,/);
            if (idx < elems.length - 1 && after) { en += after[0].length; }
            else {
              const before = text.slice(0, s).match(/,\s*$/);
              if (before) s -= before[0].length;
            }
            edits.push({ start: s, end: en, text: '', tag: 'obj_binding_remove' });
            continue;
          }
        }
      }
      bump('skip_var_complex'); continue;
    }
    // ClassDeclaration
    const cls = (function up(x){ while(x){ if(ts.isClassDeclaration(x)) return x; x=x.parent;} return null; })(n);
    if (cls && cls.name && cls.name.getStart(sf) === pos) {
      if (hasDecorators(cls)) { bump('skip_class_decorated'); continue; }
      const [s, en] = lineExpand(text, cls.getStart(sf), cls.getEnd());
      edits.push({ start: s, end: en, text: '', tag: 'class_remove', ctx:_ctx });
      continue;
    }
    // FunctionDeclaration
    const fn = (function up(x){ while(x){ if(ts.isFunctionDeclaration(x)) return x; x=x.parent;} return null; })(n);
    if (fn && fn.name && fn.name.getStart(sf) === pos) {
      const [s, en] = lineExpand(text, fn.getStart(sf), fn.getEnd());
      edits.push({ start: s, end: en, text: '', tag: 'function_remove', ctx:_ctx });
      continue;
    }
    // Type alias / Interface / Enum (TS6196) -- pure type or self-contained
    const ta = (function up(x){ while(x){ if(ts.isTypeAliasDeclaration(x)||ts.isInterfaceDeclaration(x)||ts.isEnumDeclaration(x)) return x; x=x.parent;} return null; })(n);
    if (ta && ta.name && ta.name.getStart(sf) === pos) {
      const [s, en] = lineExpand(text, ta.getStart(sf), ta.getEnd());
      edits.push({ start: s, end: en, text: '', tag: ts.isEnumDeclaration(ta) ? 'enum_remove' : 'type_remove', ctx:_ctx });
      continue;
    }
    // TS6138 class member (private property/method)
    const mem = (function up(x){ while(x){ if(ts.isPropertyDeclaration(x)||ts.isMethodDeclaration(x)) return x; x=x.parent;} return null; })(n);
    if (mem && mem.name && mem.name.getStart(sf) === pos) {
      if (!ts.isIdentifier(mem.name)) { bump('skip_member_nonident'); continue; }
      if (ts.isPropertyDeclaration(mem) && mem.initializer && hasSideEffects(mem.initializer)) { bump('skip_member_sideeffect'); continue; }
      if (hasDecorators(mem)) { bump('skip_member_decorated'); continue; }
      const mname = mem.name.getText(sf);
      const esc = mname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // skip if referenced via this.X (write-only props!), super.X, or dynamic ['X']
      if (new RegExp('(?:this|super)\\s*\\??\\.\\s*' + esc + '\\b').test(text) ||
          new RegExp('[\'"`]' + esc + '[\'"`]').test(text)) { bump('skip_member_referenced'); continue; }
      const [s, en] = lineExpand(text, mem.getStart(sf), mem.getEnd());
      edits.push({ start: s, end: en, text: '', tag: ts.isMethodDeclaration(mem) ? 'method_remove' : 'property_remove', ctx:_ctx });
      continue;
    }
    bump('skip_unhandled_' + e.code);
  }

  // ---- rebuild imports for groups ----
  for (const [imp, names] of importGroups) {
    const ic = imp.importClause;
    if (!ic) { bump('skip_import_sideeffect'); continue; }
    let keepDefault = ic.name && !names.has(ic.name.getText(sf)) ? ic.name.getText(sf) : null;
    let namedParts = [];
    let namespacePart = null;
    if (ic.namedBindings) {
      if (ts.isNamespaceImport(ic.namedBindings)) {
        if (!names.has(ic.namedBindings.name.getText(sf))) namespacePart = ic.namedBindings.getText(sf);
      } else {
        for (const sp of ic.namedBindings.elements) {
          if (!names.has(sp.name.getText(sf))) namedParts.push(sp.getText(sf));
        }
      }
    }
    const typeOnly = ic.isTypeOnly ? 'type ' : '';
    const mod = imp.moduleSpecifier.getText(sf);
    const clauseBits = [];
    if (keepDefault) clauseBits.push(keepDefault);
    if (namespacePart) clauseBits.push(namespacePart);
    if (namedParts.length) clauseBits.push('{ ' + namedParts.join(', ') + ' }');
    if (clauseBits.length === 0) {
      const [s, en] = lineExpand(text, imp.getStart(sf), imp.getEnd());
      edits.push({ start: s, end: en, text: '', tag: 'import_remove_whole' });
    } else {
      const repl = 'import ' + typeOnly + clauseBits.join(', ') + ' from ' + mod + ';';
      edits.push({ start: imp.getStart(sf), end: imp.getEnd(), text: repl, tag: 'import_rebuild' });
    }
  }

  if (!edits.length) { filesSkippedNoEdit++; continue; }
  // sort desc, drop overlaps
  edits.sort((a, b) => b.start - a.start);
  let newText = text;
  let lastStart = Infinity;
  let applied = 0;
  for (const ed of edits) {
    if (ed.end > lastStart) { bump('skip_overlap'); continue; }
    newText = newText.slice(0, ed.start) + ed.text + newText.slice(ed.end);
    lastStart = ed.start;
    bump(ed.tag); applied++;
    if(ed.ctx) DEBUGRISK.push(ed.tag+' || '+ed.ctx);
  }
  if (!applied) { filesSkippedNoEdit++; continue; }
  // parse-verify
  const sf2 = ts.createSourceFile(full, newText, ts.ScriptTarget.Latest, true, kind);
  if (sf2.parseDiagnostics && sf2.parseDiagnostics.length) { filesReverted++; bump('REVERTED_parse'); continue; }
  if (!DRY) fs.writeFileSync(full, newText);
  filesChanged++; changedList.push(file);
}

console.log(DRY ? '=== DRY RUN ===' : '=== LIVE RUN ===');
console.log('files changed:', filesChanged, '| reverted(parse):', filesReverted, '| no-edit:', filesSkippedNoEdit);
console.log('per-kind:', JSON.stringify(stats, null, 0));
fs.writeFileSync('/tmp/w1_changed.txt', changedList.join('\n'));
fs.writeFileSync('/tmp/w1_debug.txt', DEBUGRISK.join('\n'));
console.log('risky removals dumped:', DEBUGRISK.length);
