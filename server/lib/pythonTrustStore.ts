/**
 * Trust store for the packaged Python runtime.
 *
 * The portable interpreter in python_runtime/ ships its own OpenSSL, whose
 * compiled-in default CA locations (/etc/ssl/cert.pem, hashed /etc/ssl/certs)
 * do not exist on Replit machines. Without an explicit CA file every HTTPS call
 * made through the stdlib (ssl.create_default_context — e.g. MaxCore's public
 * awareness scanner) fails certificate verification, so no live awareness
 * snapshot can ever be produced and all awareness-gated generation is refused.
 *
 * The runtime packs certifi's CA bundle with it; point OpenSSL at that bundle
 * via SSL_CERT_FILE so every Python child (MaxCore and the app's own Python
 * consumers) inherits a working, version-pinned trust store. An operator-set
 * SSL_CERT_FILE is always respected.
 *
 * Imported immediately after pdimEnvFix in server/index.ts and server/cluster.ts,
 * before anything spawns Python.
 */
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";

function runtimeRoot(): string {
  const explicit = process.env.MAXBOOSTER_PYTHON;
  // <root>/bin/python3 → <root>
  return explicit
    ? path.dirname(path.dirname(path.resolve(explicit)))
    : path.resolve(process.cwd(), "python_runtime");
}

/** Locate certifi's CA bundle inside the packaged runtime, or null. */
export function findPackagedCaBundle(root: string = runtimeRoot()): string | null {
  const libDir = path.join(root, "lib");
  let entries: string[];
  try {
    entries = fs.readdirSync(libDir).filter((name) => /^python3\.\d+$/.test(name));
  } catch {
    return null;
  }
  for (const version of entries.sort().reverse()) {
    const bundle = path.join(libDir, version, "site-packages", "certifi", "cacert.pem");
    if (fs.existsSync(bundle)) return bundle;
  }
  return null;
}

/**
 * Environment entries a Python child needs for TLS verification. Empty when an
 * operator already configured SSL_CERT_FILE or no packaged runtime exists.
 */
export function pythonTrustStoreEnv(root?: string): Record<string, string> {
  if (process.env.SSL_CERT_FILE) return {};
  const bundle = findPackagedCaBundle(root);
  return bundle ? { SSL_CERT_FILE: bundle } : {};
}

const resolvedRoot = runtimeRoot();
if (!process.env.SSL_CERT_FILE && fs.existsSync(resolvedRoot)) {
  const env = pythonTrustStoreEnv(resolvedRoot);
  if (env.SSL_CERT_FILE) {
    process.env.SSL_CERT_FILE = env.SSL_CERT_FILE;
  } else {
    logger.warn(
      `[PythonTrustStore] packaged runtime at ${resolvedRoot} has no certifi CA bundle — ` +
        "HTTPS from bundled Python (awareness sources, remote fetches) will fail certificate verification",
    );
  }
}
