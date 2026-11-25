"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function externalHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function pingReadiness(origin, timeout = 1500) {
  return new Promise((resolve) => {
    const request = http.get(new URL("/api/ready", origin), { timeout }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}


function resolveDesktopServer({ appDirectory, resourcesDirectory }, existsSync = fs.existsSync) {
  const root = path.dirname(appDirectory);
  const candidates = [
    path.join(root, "dist", "index.mjs"),
    path.join(root, "dist", "index.cjs"),
    path.join(resourcesDirectory, "app", "dist", "index.mjs"),
    path.join(resourcesDirectory, "app", "dist", "index.cjs"),
    path.join(resourcesDirectory, "app.asar.unpacked", "dist", "index.mjs"),
    path.join(resourcesDirectory, "app.asar.unpacked", "dist", "index.cjs"),
  ];
  const entry = candidates.find(candidate => existsSync(candidate));
  if (!entry) return null;
  // Electron's ASAR filesystem redirects unpacked bytes while preserving the
  // logical archive path that Node needs to resolve packaged dependencies.
  const insideArchive = entry.split(path.sep).some(part => /\.asar$/i.test(part));
  return { entry, cwd: insideArchive ? resourcesDirectory : path.dirname(entry) };
}

module.exports = { externalHttpUrl, pingReadiness, resolveDesktopServer };
