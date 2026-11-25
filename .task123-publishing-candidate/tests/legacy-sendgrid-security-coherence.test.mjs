// Validate the real guarded payload, including safe replay of custom history.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { applyLegacyUpdate } from "../scripts/apply-legacy-security-update.mjs";

const bundle = JSON.parse(fs.readFileSync(new URL("../tools/legacy-security-update.json", import.meta.url), "utf8"));
// Resolve the declared YAML parser through its actual code-generator consumer.
const specRequire = createRequire(new URL("../external/maxcore/lib/api-spec/package.json", import.meta.url));
const { parse } = createRequire(specRequire.resolve("orval"))("yaml");
const hash = value => createHash("sha256").update(value).digest("hex");
const prefixes = ["maxbooster7.5/", "maxbooster7.5/maxbooster7.5/"];
const entry = name => {
  const found = bundle.files.find(file => file.path === name);
  assert.ok(found, `Missing coherent legacy payload ${name}`);
  assert.equal(hash(found.content), found.afterSha256);
  return found;
};

test("both guarded legacy SDK removals include coherent callers and the actual transport", () => {
  for (const prefix of prefixes) {
    const manifest = JSON.parse(entry(prefix + "package.json").content);
    const npm = JSON.parse(entry(prefix + "package-lock.json").content);
    const pnpm = parse(entry(prefix + "pnpm-lock.yaml").content);
    assert.equal(manifest.dependencies["@sendgrid/mail"], undefined);
    assert.equal(npm.packages[""].dependencies["@sendgrid/mail"], undefined);
    for (const name of ["@sendgrid/mail", "@sendgrid/client", "@sendgrid/helpers", "deepmerge"]) {
      assert.equal(npm.packages[`node_modules/${name}`], undefined);
      for (const section of [pnpm.packages, pnpm.snapshots]) {
        assert.ok(Object.keys(section).every(key => !key.startsWith(`${name}@`)), `Stale ${name} graph`);
      }
    }
    assert.equal(pnpm.importers["."].dependencies["@sendgrid/mail"], undefined);
    for (const file of ["server/monitoring/alertingService.ts", "server/monitoring/emailMonitor.ts"]) {
      assert.equal(entry(prefix + file).content, fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), `Stale ${file} caller`);
    }
    const worker = entry(prefix + "server/workers/index.ts").content;
    assert.doesNotMatch(worker, /@sendgrid\/mail|sgMail/);
    assert.match(worker, /from "resend"/);
    const transport = entry(prefix + "server/lib/sendgridAlertTransport.ts");
    assert.equal(transport.operation, "add");
    assert.equal(transport.beforeSha256, null);
    assert.equal(transport.content, fs.readFileSync(new URL("../server/lib/sendgridAlertTransport.ts", import.meta.url), "utf8"));
  }
});

test("actual completed legacy bundle replays idempotently and rejects unknown caller history intact", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-sendgrid-coherence-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of bundle.files) {
    const target = path.join(directory, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  assert.deepEqual(applyLegacyUpdate(directory, bundle, { apply: true }).applied, []);
  for (const prefix of prefixes) {
    const caller = path.join(directory, prefix, "server/monitoring/alertingService.ts");
    const original = fs.readFileSync(caller, "utf8");
    fs.writeFileSync(caller, "// Unrecognized private/custom history\n" + original);
    const before = bundle.files.map(file => hash(fs.readFileSync(path.join(directory, file.path))));
    assert.throws(() => applyLegacyUpdate(directory, bundle, { apply: true }), /Custom changes found; refusing overwrite/);
    assert.deepEqual(bundle.files.map(file => hash(fs.readFileSync(path.join(directory, file.path)))), before);
    fs.writeFileSync(caller, original);
  }
});
