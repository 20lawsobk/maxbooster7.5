import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function functionFromSource(file, name) {
  const source = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find(node =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `Missing ${name}`);
  const javascript = ts.transpileModule(declaration.getText(tree), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(`${javascript}; ${name}`, {
    STOREFRONT_BASE: "https://maxbooster.replit.app",
  });
}

test("builder canonical links ignore legacy/custom public URLs and encode the slug", () => {
  const link = functionFromSource(
    "client/src/components/marketplace/StorefrontBuilder.tsx", "getCanonicalUrl");
  assert.equal(link({ slug: "artist/a", customDomain: "artist.example",
    isCustomDomainActive: true, publicUrl: "https://old.max-booster.com" }),
    "https://maxbooster.replit.app/storefront/artist%2Fa");
});

test("backend and DNS management links cannot resurrect legacy subdomains", () => {
  const service = fs.readFileSync("server/services/storefrontService.ts", "utf8");
  const method = service.slice(service.indexOf("  getStorefrontUrl("));
  assert.match(method, /return getStorefrontPathUrl\(storefront.slug\)/);
  assert.doesNotMatch(method, /return `https:/);
  const ui = fs.readFileSync("client/src/components/marketplace/StorefrontDnsZoneManager.tsx", "utf8");
  assert.doesNotMatch(ui, /href=\{`https:\/\/\$\{label\}/);
  assert.doesNotMatch(ui, /href=\{`https:\/\/\$\{zone.domain\}/);
  assert.match(ui, /linkData\?\.linked \?\? null/);
  assert.match(ui, /maxbooster.replit.app\/storefront\/\$\{encodeURIComponent\(storefrontSlug\)\}/);
  assert.doesNotMatch(ui, /Your store is live at https:\/\/\$\{label\}/);
});
