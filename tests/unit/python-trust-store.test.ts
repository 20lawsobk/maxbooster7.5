import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findPackagedCaBundle, pythonTrustStoreEnv } from "../../server/lib/pythonTrustStore";

describe("packaged Python trust store", () => {
  let root: string;
  let savedCertFile: string | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "py-trust-"));
    savedCertFile = process.env.SSL_CERT_FILE;
    delete process.env.SSL_CERT_FILE;
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (savedCertFile === undefined) delete process.env.SSL_CERT_FILE;
    else process.env.SSL_CERT_FILE = savedCertFile;
  });

  function addBundle(version: string): string {
    const dir = path.join(root, "lib", version, "site-packages", "certifi");
    fs.mkdirSync(dir, { recursive: true });
    const bundle = path.join(dir, "cacert.pem");
    fs.writeFileSync(bundle, "-----BEGIN CERTIFICATE-----\n");
    return bundle;
  }

  it("points SSL_CERT_FILE at the runtime's certifi bundle", () => {
    const bundle = addBundle("python3.12");
    expect(findPackagedCaBundle(root)).toBe(bundle);
    expect(pythonTrustStoreEnv(root)).toEqual({ SSL_CERT_FILE: bundle });
  });

  it("prefers the newest interpreter's bundle and ignores non-python dirs", () => {
    addBundle("python3.11");
    const newest = addBundle("python3.12");
    fs.mkdirSync(path.join(root, "lib", "pkgconfig"), { recursive: true });
    expect(findPackagedCaBundle(root)).toBe(newest);
  });

  it("respects an operator-configured SSL_CERT_FILE", () => {
    addBundle("python3.12");
    process.env.SSL_CERT_FILE = "/operator/ca.pem";
    expect(pythonTrustStoreEnv(root)).toEqual({});
  });

  it("returns nothing when the runtime has no bundle or does not exist", () => {
    expect(pythonTrustStoreEnv(root)).toEqual({});
    expect(findPackagedCaBundle(path.join(root, "missing"))).toBeNull();
  });
});
