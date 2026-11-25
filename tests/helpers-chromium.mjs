import fs from "node:fs";
import path from "node:path";

const configuredExecutableNames = [
  "CHROMIUM_PATH",
  "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE",
  "PLAYWRIGHT_CHROMIUM_EXECUTABLE",
  "PUPPETEER_EXECUTABLE_PATH",
];

function usableExecutable(candidate) {
  if (!candidate) return null;
  const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(candidate);
  try {
    if (!fs.statSync(resolved).isFile()) return null;
    fs.accessSync(resolved, fs.constants.X_OK);
    return resolved;
  } catch {
    return null;
  }
}

/** Resolve a real browser from explicit configuration, then the active PATH. */
export function findChromiumExecutable(env = process.env) {
  for (const key of configuredExecutableNames) {
    const executable = usableExecutable(env[key]);
    if (executable) return executable;
  }

  const names =
    process.platform === "win32"
      ? ["chrome.exe", "chromium.exe", "chromium-browser.exe"]
      : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"];
  for (const directory of (env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const executable = usableExecutable(path.join(directory, name));
      if (executable) return executable;
    }
  }
  return null;
}
