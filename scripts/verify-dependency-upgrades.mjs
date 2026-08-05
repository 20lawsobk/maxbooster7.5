#!/usr/bin/env node
/**
 * Post-upgrade dependency verification.
 *
 * Exercises the real code paths behind every package touched by the
 * vulnerability remediation, so the audit result is backed by working
 * features rather than by inspection:
 *   - sharp            (image resize / composite / encode / metadata / file output)
 *   - adm-zip          (archive write + extractAllTo, the API tfjs-node uses)
 *   - @tensorflow/tfjs-node (its adm-zip dependency resolves to the patched release)
 *   - @tensorflow/tfjs (the pure-JS runtime used by the application)
 *   - exceljs          (workbook write + read, including the uuid-backed x14 path)
 *   - uuid             (nested CJS copies used by gaxios / teeny-request / exceljs)
 *   - @google-cloud/storage + @replit/object-storage (client construction + signing deps)
 *
 * Run: node scripts/verify-dependency-upgrades.mjs
 */

import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);

/**
 * Read an installed package's version from disk. Several of these packages
 * declare `exports` without `./package.json`, so `require("pkg/package.json")`
 * is not resolvable — go through node_modules directly instead.
 */
function installedVersion(pkg, base = "node_modules") {
  return JSON.parse(readFileSync(join(base, pkg, "package.json"), "utf8")).version;
}

/** Resolve a dependency as it is seen from inside another package's tree. */
function resolveFrom(consumerDir, dep) {
  const consumerRequire = createRequire(join(process.cwd(), consumerDir, "index.js"));
  return consumerRequire(dep);
}

const results = [];
let failed = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? "" });
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    failed++;
    results.push({ name, ok: false, detail: err?.stack || String(err) });
    console.error(`FAIL  ${name} — ${err?.message || err}`);
    if (err?.stack) console.error(err.stack.split("\n").slice(1, 4).join("\n"));
  }
}

const work = mkdtempSync(join(tmpdir(), "dep-verify-"));

// ---------------------------------------------------------------- sharp
await check("sharp: version and native binary", async () => {
  const sharp = (await import("sharp")).default;
  const v = installedVersion("sharp");
  if (!v.startsWith("0.35.")) throw new Error(`expected sharp 0.35.x, got ${v}`);
  // Touching the native layer proves the prebuilt binary resolved after the
  // 0.35 removal of the install script.
  const libvips = sharp.versions?.vips;
  if (!libvips) throw new Error("sharp.versions.vips missing — native binary did not load");
  return `sharp ${v}, libvips ${libvips}`;
});

await check("sharp: SVG rasterise + resize + encode", async () => {
  const sharp = (await import("sharp")).default;
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
       <rect width="400" height="300" fill="#101828"/>
       <circle cx="200" cy="150" r="90" fill="#7c3aed"/>
     </svg>`,
  );
  const png = await sharp(svg).png().toBuffer();
  if (png.length < 100) throw new Error("empty png output");
  const resized = await sharp(png).resize(128, 128, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  if (resized.length < 100) throw new Error("empty jpeg output");
  const meta = await sharp(resized).metadata();
  if (meta.width !== 128 || meta.height !== 128) {
    throw new Error(`resize produced ${meta.width}x${meta.height}, expected 128x128`);
  }
  if (meta.format !== "jpeg") throw new Error(`expected jpeg, got ${meta.format}`);
  return `png ${png.length}B, jpeg ${resized.length}B, ${meta.width}x${meta.height}`;
});

await check("sharp: composite overlay (thumbnail/branding path)", async () => {
  const sharp = (await import("sharp")).default;
  const base = await sharp({
    create: { width: 320, height: 180, channels: 4, background: { r: 12, g: 16, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const badge = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.9 } },
  })
    .png()
    .toBuffer();
  const composed = await sharp(base)
    .composite([{ input: badge, top: 58, left: 128 }])
    .png()
    .toBuffer();
  const meta = await sharp(composed).metadata();
  if (meta.width !== 320 || meta.height !== 180) throw new Error("composite changed canvas size");
  return `composited ${composed.length}B`;
});

await check("sharp: normalize + sharpen + webp + toFile", async () => {
  const sharp = (await import("sharp")).default;
  const src = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 90, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
  // `.sharpen()` with no args: 0.35 removed only the deprecated named options.
  const processed = await sharp(src).normalize().sharpen().webp({ quality: 80 }).toBuffer();
  if (processed.length < 50) throw new Error("empty webp output");
  const out = join(work, "sharp-out.webp");
  await sharp(src).webp({ quality: 80 }).toFile(out);
  if (!existsSync(out)) throw new Error("toFile did not write");
  const meta = await sharp(readFileSync(out)).metadata();
  if (meta.format !== "webp") throw new Error(`expected webp on disk, got ${meta.format}`);
  return `webp buffer ${processed.length}B, file written`;
});

// -------------------------------------------------------------- adm-zip
await check("adm-zip: write + extractAllTo (tfjs-node install path)", async () => {
  const AdmZip = require("adm-zip");
  const version = installedVersion("adm-zip");
  if (!/^0\.(6|[7-9])\./.test(version)) throw new Error(`expected adm-zip >=0.6.0, got ${version}`);
  const zip = new AdmZip();
  zip.addFile("top.txt", Buffer.from("hello"));
  zip.addFile("nested/dir/inner.bin", Buffer.from([1, 2, 3, 4]));
  const zipPath = join(work, "sample.zip");
  zip.writeZip(zipPath);

  const dest = join(work, "unzipped");
  // Exactly the call shape @tensorflow/tfjs-node/scripts/resources.js uses.
  new AdmZip(zipPath).extractAllTo(dest, true);
  const top = readFileSync(join(dest, "top.txt"), "utf8");
  if (top !== "hello") throw new Error("top-level entry did not extract");
  const inner = readFileSync(join(dest, "nested", "dir", "inner.bin"));
  if (inner.length !== 4) throw new Error("nested entry did not extract");
  const entries = new AdmZip(zipPath).getEntries().map((e) => e.entryName);
  return `adm-zip ${version}, entries: ${entries.join(", ")}`;
});

await check("@tensorflow/tfjs-node: sees the patched adm-zip", async () => {
  // tfjs-node is the package whose transitive adm-zip carried the advisory.
  // Its own native addon is fetched by an install script that this environment
  // blocks (unrelated, pre-existing), so verify the dependency edge we changed:
  // the adm-zip that tfjs-node's resources script resolves must be patched.
  const declared = JSON.parse(
    readFileSync("node_modules/@tensorflow/tfjs-node/package.json", "utf8"),
  ).dependencies["adm-zip"];
  const resolved = resolveFrom("node_modules/@tensorflow/tfjs-node", "adm-zip");
  const version = installedVersion("adm-zip");
  if (!/^0\.(6|[7-9])\./.test(version)) {
    throw new Error(`tfjs-node resolves adm-zip ${version}, expected >=0.6.0`);
  }
  if (typeof resolved !== "function") throw new Error("adm-zip not constructible from tfjs-node");
  return `declared ${declared} -> resolved ${version}`;
});

await check("@tensorflow/tfjs: pure-JS runtime still computes", async () => {
  // The runtime ML path the server actually uses (see server/lib/tensorflowWorkerPool.ts).
  const tf = await import("@tensorflow/tfjs");
  const t = tf.tensor1d([1, 2, 3, 4]);
  const sum = (await t.sum().data())[0];
  t.dispose();
  if (sum !== 10) throw new Error(`tensor sum ${sum}, expected 10`);
  return `tfjs ${installedVersion("@tensorflow/tfjs")}`;
});

// -------------------------------------------------------------- exceljs
await check("exceljs: workbook write + read back", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Catalog");
  ws.columns = [
    { header: "ISRC", key: "isrc", width: 18 },
    { header: "Title", key: "title", width: 30 },
    { header: "Streams", key: "streams", width: 12 },
  ];
  ws.addRow({ isrc: "USABC2600001", title: "Midnight Drive", streams: 12045 });
  ws.addRow({ isrc: "USABC2600002", title: "Neon Rain", streams: 8321 });
  // Conditional formatting drives the x14 extension path, which is the code in
  // exceljs that calls uuid.v4() — the nested copy we overrode.
  ws.addConditionalFormatting({
    ref: "C2:C3",
    rules: [{ type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], color: { argb: "FF638EC6" } }],
  });
  const buf = await wb.xlsx.writeBuffer();
  if (!buf || buf.byteLength < 500) throw new Error("workbook buffer too small");

  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);
  const sheet = wb2.worksheets[0];
  const title = sheet.getRow(2).getCell(2).value;
  if (title !== "Midnight Drive") throw new Error(`round-trip lost data, got ${JSON.stringify(title)}`);
  return `exceljs ${installedVersion("exceljs")}, ${buf.byteLength}B, ${sheet.rowCount} rows`;
});

// ----------------------------------------------------------------- uuid
await check("uuid: nested CJS copies are patched and generate ids", async () => {
  const consumers = [
    ["exceljs", "node_modules/exceljs"],
    ["gaxios", "node_modules/gaxios"],
    ["@google-cloud/storage", "node_modules/@google-cloud/storage"],
  ];
  const seen = [];
  for (const [name, dir] of consumers) {
    const mod = resolveFrom(dir, "uuid");
    const version = installedVersion("uuid", join(dir, "node_modules"));
    const [major, minor, patch] = version.split(".").map(Number);
    const patched = major > 11 || (major === 11 && (minor > 1 || (minor === 1 && patch >= 1)));
    if (!patched) throw new Error(`${name} resolves uuid ${version}, expected >=11.1.1`);
    const id = mod.v4();
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`${name}: bad uuid ${id}`);
    // v5 writing into a caller-provided buffer is the API the advisory covered.
    const buf = new Uint8Array(16);
    mod.v5("max-booster", mod.v5.DNS, buf);
    if (buf.every((b) => b === 0)) throw new Error(`${name}: v5 did not write into buffer`);
    seen.push(`${name}=${version}`);
  }
  return `${seen.join(" ")}, root uuid ${installedVersion("uuid")}`;
});

// --------------------------------------------------------------- storage
await check("@google-cloud/storage + @replit/object-storage construct", async () => {
  const { Storage } = require("@google-cloud/storage");
  const s = new Storage({ projectId: "verify-only" });
  const bucket = s.bucket("verify-only-bucket");
  if (typeof bucket.file !== "function") throw new Error("bucket API missing");
  if (typeof bucket.file("x.txt").createWriteStream !== "function") {
    throw new Error("file upload API missing");
  }
  const objectStorage = require("@replit/object-storage");
  const ClientCtor = objectStorage.Client;
  if (typeof ClientCtor !== "function") throw new Error("@replit/object-storage Client missing");
  // teeny-request is the transport that calls uuid.v4() for multipart bodies.
  const teeny = resolveFrom("node_modules/@google-cloud/storage", "teeny-request");
  if (typeof teeny.teenyRequest !== "function") throw new Error("teeny-request transport not callable");
  const retry = resolveFrom("node_modules/@google-cloud/storage", "retry-request");
  if (typeof retry !== "function" && typeof retry.default !== "function") {
    throw new Error("retry-request transport not callable");
  }
  return `storage ${installedVersion("@google-cloud/storage")}, transport ok`;
});

rmSync(work, { recursive: true, force: true });

console.log("");
console.log(`${results.length - failed}/${results.length} checks passed`);
if (failed > 0) {
  console.error(`${failed} check(s) FAILED`);
  process.exit(1);
}
