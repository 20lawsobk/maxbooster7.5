// Real local-file consumer acceptance; no app server or remote document.
// node --import tsx --test tests/patent-pdf-runtime.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { generatePatentPdf } from "../external/maxcore/scripts/src/generate-patent.ts";

test("upstream Puppeteer browser manager no longer requires extract-zip", () => {
  const require = createRequire(new URL("../external/maxcore/scripts/package.json", import.meta.url));
  const puppeteer = require("puppeteer-core/package.json");
  assert.equal(puppeteer.version, "25.11.0");
  const browsersRequire = createRequire(require.resolve("puppeteer-core"));
  const browserEntry = browsersRequire.resolve("@puppeteer/browsers");
  let packageRoot = path.dirname(browserEntry);
  while (!fs.existsSync(path.join(packageRoot, "package.json"))) {
    assert.notEqual(packageRoot, path.dirname(packageRoot), "Browser manager manifest must exist");
    packageRoot = path.dirname(packageRoot);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(manifest.name, "@puppeteer/browsers");
  assert.equal(manifest.version, "3.2.2");
  assert.equal(manifest.dependencies["extract-zip"], undefined);
  assert.equal(fs.readFileSync(new URL("../external/maxcore/pnpm-lock.yaml", import.meta.url), "utf8").includes("extract-zip@"), false);
});
test("actual patent generator renders valid Letter PDF using supplied local Chromium", { timeout: 45000 }, async t => {
  const executable = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  assert.ok(executable && fs.existsSync(executable), "Configured Chromium required; absence is not a pass");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "patent-pdf-runtime-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const html = path.join(dir, "patent # fixture.html"), pdf = path.join(dir, "patent.pdf");
  fs.writeFileSync(html, '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Local fixture</title><h1>Patent rendering regression</h1><p>Local deterministic document.</p>');
  const size = await generatePatentPdf(html, pdf, executable);
  const bytes = fs.readFileSync(pdf);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal(bytes.length, size);
  assert.ok(size > 1000);
  assert.match(bytes.toString("latin1"), /\/MediaBox\s*\[0 0 612 792\]/);
  await assert.rejects(generatePatentPdf(path.join(dir, "missing.html"), pdf, executable), /ERR_FILE_NOT_FOUND/);
});