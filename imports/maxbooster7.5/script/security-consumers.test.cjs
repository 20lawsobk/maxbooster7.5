const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { Readable } = require("node:stream");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");

function loadSource(file, boundaries, cwd) {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0);
  const module = { exports: {} };
  const allowed = new Set(["crypto", "multer", "path", "fs", "fs/promises", "csv-parse/sync"]);
  const requireBoundary = name => {
    if (Object.hasOwn(boundaries, name)) return boundaries[name];
    if (allowed.has(name)) return require(name);
    throw new Error(`Unexpected dependency during isolated consumer test: ${name}`);
  };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, require: requireBoundary, Buffer, console,
    process: { env: { NODE_ENV: "production" }, cwd: () => cwd || process.cwd() },
    setTimeout, clearTimeout,
  }, { filename: file });
  return module.exports;
}

const unexpected = new Proxy({}, { get() { throw new Error("External boundary must not be called"); } });
const logs = { logger: { info() {}, warn() {}, error() {} } };

test("actual royalties CSV parser retains quoting, trimming, mapping and malformed-input semantics on v7", () => {
  const { RoyaltiesCSVImportService } = loadSource("server/services/royaltiesCSVImportService.ts", {
    "../storage.js": { storage: unexpected },
    "./queueService.js": { queueService: unexpected },
    "./storageService.js": { storageService: unexpected },
    "../logger.js": logs,
  });
  const service = new RoyaltiesCSVImportService();
  const rows = service.parseCSV(Buffer.from('project,source,amount,date,note\np1, Spotify ,12.50,2026-01-01,"quoted, note"\n\n'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "Spotify");
  assert.equal(rows[0].note, "quoted, note");
  const mapped = service.mapColumns(rows[0], { projectId: "project", source: "source", amount: "amount", occurredAt: "date" });
  assert.equal(service.validateRow(mapped).valid, true);
  assert.throws(() => service.parseCSV(Buffer.from('a,b\n"unterminated,b')), /quote/i);
  assert.throws(() => service.parseCSV(Buffer.from("a,b\n1,2,3")), /columns|length|record/i);
  const prototype = service.parseCSV(Buffer.from("__proto__,constructor,amount\npollute,bad,1\n"));
  assert.equal({}.pollute, undefined);
  assert.equal(prototype[0].amount, "1");
  // Preserve legacy duplicate-column behavior rather than silently changing imports.
  assert.equal(service.parseCSV(Buffer.from("amount,amount\n1,2"))[0].amount, "2");
});

function multipart(body, filename = "avatar.jpg", mime = "image/jpeg") {
  const boundary = "isolated-regression-boundary";
  const bytes = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    body, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const request = Readable.from([bytes]);
  request.headers = { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(bytes.length) };
  request.method = "POST";
  return request;
}

function runMiddleware(middleware, request) {
  return new Promise((resolve, reject) => {
    middleware(request, {}, error => error ? reject(error) : resolve(request));
  });
}

test("actual upload middleware accepts real multipart, rejects SVG, size overflow and malformed framing", { timeout: 5000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-upload-"));
  try {
    const security = loadSource("server/middleware/uploadSecurity.ts", { "../logger.js": logs }, temp);
    const handler = loadSource("server/middleware/uploadHandler.ts", {
      "../services/storageService.js": { storageService: unexpected },
      "../logger.js": logs,
      "./uploadSecurity.js": security,
      "../services/imageProcessor.js": unexpected,
    }, temp);
    const middleware = handler.avatarUpload.single("file");
    const data = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const success = await runMiddleware(middleware, multipart(data));
    assert.deepEqual(success.file.buffer, data);
    await assert.rejects(runMiddleware(middleware, multipart(Buffer.from("<svg/>"), "evil.svg", "image/svg+xml")), /SVG/);
    await assert.rejects(runMiddleware(middleware, multipart(Buffer.alloc(5 * 1024 * 1024 + 1))), { code: "LIMIT_FILE_SIZE" });
    const broken = Readable.from([Buffer.from("--wrong\r\n")]);
    broken.headers = { "content-type": "multipart/form-data; boundary=expected", "content-length": "9" };
    await assert.rejects(runMiddleware(middleware, broken), /form|part|boundary/i);
    const disk = await runMiddleware(handler.upload.single("file"), multipart(Buffer.from("%PDF-1.7"), "document.pdf", "application/pdf"));
    assert.equal(fs.readFileSync(disk.file.path, "utf8"), "%PDF-1.7");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("installed sharp decodes and transcodes genuine image bytes", async () => {
  const sharp = require("sharp");
  const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#123456" } }).png().toBuffer();
  const webp = await sharp(png).resize(6, 4).webp().toBuffer();
  const metadata = await sharp(webp).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 6);
  await assert.rejects(sharp(Buffer.from("not an image")).png().toBuffer());
});

test("all installed tar parents resolve real patched code; archive roundtrip and traversal rejection work", async () => {
  for (const parent of ["@capacitor/cli", "app-builder-lib", "node-gyp"]) {
    const fromParent = createRequire(require.resolve(`${parent}/package.json`));
    assert.equal(fromParent("tar/package.json").version, "7.5.22");
    const tar = fromParent("tar");
    assert.equal(typeof tar.Header, "function");
    const manifest = fromParent("tar/package.json");
    const esmPath = path.resolve(path.dirname(fromParent.resolve("tar/package.json")), manifest.exports["."].import.default);
    const esm = await import(pathToFileURL(esmPath).href);
    assert.equal(typeof esm.create, "function");
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-tar-"));
    try {
      const input = path.join(temp, "input");
      const output = path.join(temp, "output");
      fs.mkdirSync(input); fs.mkdirSync(output);
      fs.writeFileSync(path.join(input, "sample.txt"), "actual archive content");
      const archive = path.join(temp, "sample.tar");
      await tar.c({ cwd: input, file: archive }, ["sample.txt"]);
      assert.ok(fs.statSync(archive).size > 0);
      const entries = [];
      await tar.t({ file: archive, onReadEntry: entry => entries.push(entry.path) });
      assert.deepEqual(entries, ["sample.txt"]);
      await tar.x({ cwd: output, file: archive, strict: true });
      assert.equal(fs.readFileSync(path.join(output, "sample.txt"), "utf8"), "actual archive content");
      const esmArchive = path.join(temp, "esm.tar");
      await esm.create({ cwd: input, file: esmArchive }, ["sample.txt"]);
      const esmEntries = [];
      await esm.list({ file: esmArchive, onReadEntry: entry => esmEntries.push(entry.path) });
      assert.deepEqual(esmEntries, ["sample.txt"]);
      await esm.extract({ cwd: output, file: esmArchive, strict: true });
      const header = new tar.Header({ path: "../escaped.txt", size: 4, mode: 0o644, type: "File" });
      header.encode();
      const evil = path.join(temp, "evil.tar");
      fs.writeFileSync(evil, Buffer.concat([header.block, Buffer.from("evil"), Buffer.alloc(508), Buffer.alloc(1024)]));
      await assert.rejects(tar.x({ file: evil, cwd: output, strict: true }), /path|escape|outside|\.\./i);
      assert.equal(fs.existsSync(path.join(temp, "escaped.txt")), false);
      const link = new tar.Header({ path: "pivot", type: "SymbolicLink", linkpath: "../outside", size: 0, mode: 0o777 });
      link.encode();
      const nested = new tar.Header({ path: "pivot/escaped.txt", type: "File", size: 4, mode: 0o644 });
      nested.encode();
      fs.mkdirSync(path.join(temp, "outside"));
      const linked = path.join(temp, "linked.tar");
      fs.writeFileSync(linked, Buffer.concat([link.block, nested.block, Buffer.from("evil"), Buffer.alloc(508), Buffer.alloc(1024)]));
      await assert.rejects(tar.x({ file: linked, cwd: output, strict: true }), /symbolic|symlink|path|link/i);
      assert.equal(fs.existsSync(path.join(temp, "outside", "escaped.txt")), false);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
});

test("xcode UUID consumer remains compatible with patched UUID v11", () => {
  const fromXcode = createRequire(require.resolve("xcode/package.json"));
  assert.equal(fromXcode("uuid/package.json").version, "11.1.1");
  const project = require("xcode").project("not-read-in-this-test.pbxproj");
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});