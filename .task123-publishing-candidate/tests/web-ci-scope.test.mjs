import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("web/API CI runs runtime contracts without desktop/mobile packaging gates", () => {
  const { scripts } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /run: npm run test:ci/);
  assert.match(scripts["test:ci"], /npm run test:runtime-contracts/);

  const web = scripts["test:runtime-contracts"].split(/\s+/);
  const packaging = scripts["test:packaging-contracts"].split(/\s+/);
  const desktopOnly = [
    "tests/desktop-runtime-policy.test.mjs",
    "tests/linux-vst3-build.test.mjs",
    "tests/vst3-binary-inspection.test.mjs",
  ];
  for (const file of desktopOnly) {
    assert.ok(!web.includes(file), `${file} must not block web/API CI`);
    assert.ok(packaging.includes(file), `${file} must remain independently testable`);
  }
  for (const file of [
    "tests/npm-build-start-contract.test.mjs",
    "tests/deployment-contracts.cjs",
    "tests/runtime-artifact-gates.test.mjs",
    "tests/audio-metadata-security.test.mjs",
    "tests/web-ci-scope.test.mjs",
  ]) assert.ok(web.includes(file), `${file} must remain in web/API CI`);
});
