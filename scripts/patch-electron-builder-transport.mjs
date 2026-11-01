// An explicit, version-pinned compatibility patch for the approved @electron/get
// v5 migration. Refuse drift rather than allowing ignored proxy/timeout options.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const transportSeam = 'const configWithProgress = { ...config, downloadOptions, downloader: config.downloader ?? new (require("@maxbooster/electron-download-transport").ElectronDownloadTransport)() };';

export function inspectElectronBuilderTransport(root) {
  const req = createRequire(path.join(root, "package.json"));
  let manifestPath;
  try {
    const builder = createRequire(req.resolve("electron-builder/package.json"));
    manifestPath = builder.resolve("app-builder-lib/package.json");
  }
  catch (error) {
    if (error.code === "MODULE_NOT_FOUND") return { installed: false };
    throw error;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.version !== "26.15.3") throw new Error(`Unverified app-builder-lib transport: ${manifest.version}`);
  const consumer = createRequire(manifestPath);
  // Require the actual declared local package; no root-path assumption in the
  // patched installed file (which is carried inside node_modules capsules).
  consumer.resolve("@maxbooster/electron-download-transport");
  const file = path.join(path.dirname(manifestPath), "out/util/electronGet.js");
  return { installed: true, file, patched: fs.readFileSync(file, "utf8").includes(transportSeam) };
}

export function patchElectronBuilderTransport(root) {
  const result = inspectElectronBuilderTransport(root);
  if (!result.installed) return result;
  const { file } = result;
  const before = "const configWithProgress = { ...config, downloadOptions };";
  const after = transportSeam;
  const content = fs.readFileSync(file, "utf8");
  if (content.includes(after)) return { installed: true, patched: true };
  if (content.split(before).length !== 2) throw new Error("Unrecognized electron-builder download seam");
  fs.writeFileSync(file, content.replace(before, after));
  return { installed: true, patched: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(patchElectronBuilderTransport(fileURLToPath(new URL("../", import.meta.url))));
}