import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const archiveRoot = path.resolve(
  "docs/archive/production-variants-2026-08",
);
const historyRoot = path.join(archiveRoot, "history");
const manifestPath = path.join(historyRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function archivedFiles() {
  return manifest.files.map((entry) => ({
    ...entry,
    absolutePath: path.join(archiveRoot, entry.archivedPath),
  }));
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("every August archive entry matches its manifest and remains non-executable", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.archivedVariantCount, manifest.files.length);
  assert.equal(manifest.commitCount, 428);

  const expectedPaths = new Set(["manifest.json"]);
  for (const entry of archivedFiles()) {
    const relativePath = path.relative(historyRoot, entry.absolutePath);
    assert.ok(
      relativePath && !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath),
      `archive path must remain inside history: ${entry.archivedPath}`,
    );
    expectedPaths.add(path.relative(historyRoot, entry.absolutePath));

    const stat = fs.lstatSync(entry.absolutePath);
    assert.ok(stat.isFile(), `${entry.archivedPath} must be a regular file`);
    assert.equal(stat.size, entry.bytes, `${entry.archivedPath} byte count`);
    assert.equal(
      digest(fs.readFileSync(entry.absolutePath)),
      entry.sha256,
      `${entry.archivedPath} checksum`,
    );
    assert.match(entry.gitBlobSha, /^[a-f0-9]{40}$/);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(stat.mode & 0o111, 0, `${entry.archivedPath} executable bits`);
  }

  const actualPaths = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else actualPaths.push(path.relative(historyRoot, absolutePath));
    }
  }
  walk(historyRoot);
  assert.deepEqual(actualPaths.sort(), [...expectedPaths].sort());
});

test("each archived shell variant passes Bash's parser", () => {
  const files = archivedFiles().filter((entry) =>
    entry.archivedPath.endsWith(".sh"),
  );
  assert.equal(files.length, 22);
  for (const entry of files) {
    assert.doesNotThrow(
      () => run("bash", ["-n", entry.absolutePath]),
      entry.archivedPath,
    );
  }
});

test("each archived Node.js variant passes Node's parser", () => {
  const files = archivedFiles().filter((entry) =>
    /\.(?:mjs|cjs|js)$/.test(entry.archivedPath),
  );
  assert.equal(files.length, 2);
  for (const entry of files) {
    assert.doesNotThrow(
      () => run(process.execPath, ["--check", entry.absolutePath]),
      entry.archivedPath,
    );
  }
});

test("each archived TypeScript build variant transpiles without syntax errors", () => {
  const files = archivedFiles().filter((entry) =>
    /\.tsx?$/.test(entry.archivedPath),
  );
  assert.equal(files.length, 17);
  for (const entry of files) {
    const result = ts.transpileModule(
      fs.readFileSync(entry.absolutePath, "utf8"),
      {
        fileName: entry.absolutePath,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      },
    );
    const errors = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    assert.deepEqual(
      errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      ),
      [],
      entry.archivedPath,
    );
  }
});

test("each archived JSON projection parses and contains no unrelated package data", () => {
  const files = archivedFiles().filter((entry) =>
    entry.archivedPath.endsWith(".json"),
  );
  assert.equal(files.length, 4);

  for (const entry of files) {
    const data = JSON.parse(fs.readFileSync(entry.absolutePath, "utf8"));
    if (entry.category === "npm-scripts") {
      assert.equal(data.source, "package.json script entries only");
      assert.ok(data.scripts && typeof data.scripts === "object");
      assert.ok(!Object.hasOwn(data, "dependencies"));
    }
    if (entry.category === "launch-config") {
      assert.equal(
        data.source,
        ".replit [deployment] allowlisted fields only",
      );
      assert.deepEqual(
        Object.keys(data.fields).sort(),
        ["build", "deploymentTarget", "run"],
      );
    }
  }
});
