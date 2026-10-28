import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveFiniteTemplatePath } from "../finite/finite-route-paths.mjs";

function paths(source, occurrence = 0) {
  const offsets = [...source.matchAll(/router\.(?:get|post)\s*\(/g)].map(match => match.index);
  return resolveFiniteTemplatePath(source, "fixture.ts", offsets[occurrence]);
}

test("actual Fan Hub declarations produce GET/POST consent/unsubscribe routes", () => {
  const source = fs.readFileSync(path.resolve("server/routes/fanHub.ts"), "utf8");
  const calls = [...source.matchAll(/router\.(get|post)\(`\/\$\{action\}\/:token`/g)];
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.flatMap(match => resolveFiniteTemplatePath(source, "fanHub.ts", match.index).map(path => [match[1].toUpperCase(), path])), [
    ["GET", "/consent/:token"], ["GET", "/unsubscribe/:token"], ["POST", "/consent/:token"], ["POST", "/unsubscribe/:token"],
  ]);
});

test("const named literal arrays and repeated template variables retain correlation", () => {
  assert.deepEqual(paths('const actions=["a","b"] as const;for(const action of actions){router.get(`/${action}/${action}`,h)}'), ["/a/a", "/b/b"]);
});

test("independent nested finite loops expand within a fixed bound", () => {
  assert.deepEqual(paths('for(const a of ["x","y"]){for(const b of ["1","2"] as const){router.get(`/${a}/${b}`,h)}}'), ["/x/1", "/x/2", "/y/1", "/y/2"]);
});

for (const [name, source] of [
  ["runtime array", 'for(const action of loadActions()){router.get(`/${action}`,h)}'],
  ["let loop binding", 'for(let action of ["a","b"]){router.get(`/${action}`,h)}'],
  ["mutated named array", 'const actions=["a"];actions.push("b");for(const action of actions){router.get(`/${action}`,h)}'],
  ["aliased named array", 'const actions=["a"];const other=actions;for(const action of actions){router.get(`/${action}`,h)}'],
  ["shadowed local constant", 'for(const action of ["a","b"]){ { const action="private";router.get(`/${action}`,h)} }'],
  ["shadowed parameter", 'for(const action of ["a","b"]){function register(action){router.get(`/${action}`,h)}}'],
  ["shadowed catch binding", 'for(const action of ["a","b"]){try{fail()}catch(action){router.get(`/${action}`,h)}}'],
  ["deferred closure", 'for(const action of ["a","b"]){const register=()=>router.get(`/${action}`,h)}'],
  ["reassignment", 'for(const action of ["a","b"]){action="c";router.get(`/${action}`,h)}'],
  ["runtime interpolation", 'for(const action of ["a","b"]){router.get(`/${action.toUpperCase()}`,h)}'],
  ["unknown interpolation", 'router.get(`/${action}`,h)'],
  ["empty finite array", 'for(const action of []){router.get(`/${action}`,h)}'],
  ["spread element", 'for(const action of ["a",...other]){router.get(`/${action}`,h)}'],
]) test(`unsupported ${name} stays unresolved`, () => assert.equal(paths(source), null));

test("large finite products stay unresolved instead of truncating paths", () => {
  const entries = Array.from({ length: 9 }, (_, index) => JSON.stringify(String(index))).join(",");
  assert.equal(paths(`for(const a of [${entries}]){for(const b of [${entries}]){router.get(\`/\${a}/\${b}\`,h)}}`), null);
});

test("excessive path lengths stay unresolved", () => {
  assert.equal(paths('for(const action of ["' + 'x'.repeat(2048) + '"]){router.get(`/${action}`,h)}'), null);
});

for (const [name, source] of [
  ["classic for binding", 'for(const action of ["outer"]){for(let action="inner";true;){router.get(`/${action}`,h);break}}'],
  ["for-in binding", 'for(const action of ["outer"]){for(const action in {inner:1}){router.get(`/${action}`,h)}}'],
  ["switch-case binding", 'for(const action of ["outer"]){switch(1){case 1:const action="inner";router.get(`/${action}`,h);break}}'],
  ["enum binding", 'for(const action of ["outer"]){enum action {inner};router.get(`/${action}`,h)}'],
  ["namespace binding", 'for(const action of ["outer"]){namespace action {export const inner=1};router.get(`/${action}`,h)}'],
  ["named class expression", 'for(const action of ["outer"]){const x=class action {static {router.get(`/${action}`,h)}}}'],
  ["with scope", 'for(const action of ["outer"]){with({action:"inner"}){router.get(`/${action}`,h)}}'],
  ["destructuring write", 'for(const action of ["outer"]){[action]=["inner"];router.get(`/${action}`,h)}'],
  ["outer named array hidden by classic for", 'const actions=["outer"];for(let actions=["inner"];true;){for(const action of actions){router.get(`/${action}`,h)}break}'],
  ["outer named array hidden by for-of", 'const actions=["outer"];for(const actions of [["inner"]]){for(const action of actions){router.get(`/${action}`,h)}}'],
  ["outer named array hidden by class name", 'const actions=["outer"];const x=class actions {static {for(const action of actions){router.get(`/${action}`,h)}}}'],
]) test(`unsupported lexical ${name} stays unresolved`, () => assert.equal(paths(source), null));

test("a switch-local finite const array resolves its actual binding", () => {
  assert.deepEqual(paths('const actions=["outer"];switch(1){case 1:const actions=["inner"];for(const action of actions){router.get(`/${action}`,h)}break}'), ["/inner"]);
});
