import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  PlatformCapsuleBuilder,
  PlatformCapsuleLoader,
} from "../../external/pdim/artifacts/api-server/src/pocket-dimension/platform-capsule.js";

// Guards against the credential-exfiltration regression: the capsule builder
// must never include dotenv variants, private keys/certs, or service-account
// credentials in its manifest, even when no caller-supplied excludePatterns
// are given (i.e. DEFAULT_EXCLUDE alone must be sufficient).
describe("PlatformCapsuleBuilder secret exclusion", () => {
  let tempRoot: string;
  let capsuleId: string;

  const SECRET_FILES = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.staging",
    ".env.development",
    "id_rsa",
    "id_rsa.pub",
    "server.pem",
    "cert.crt",
    "keystore.p12",
    "bundle.pfx",
    "service-account-prod.json",
    "credentials.json",
    "secrets.json",
    ".netrc",
    ".git-credentials",
  ];

  const SAFE_FILES = ["index.ts", "package.json", "README.md"];

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "capsule-secret-test-"));
    for (const f of SECRET_FILES) {
      await fs.writeFile(path.join(tempRoot, f), "super-secret-value");
    }
    for (const f of SAFE_FILES) {
      await fs.writeFile(path.join(tempRoot, f), "// source file");
    }
    await fs.mkdir(path.join(tempRoot, ".ssh"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, ".ssh", "id_rsa"), "secret-key");

    const builder = new PlatformCapsuleBuilder(tempRoot);
    const metadata = await builder.build({
      version: "test",
      platformName: "capsule-secret-test",
    });
    capsuleId = metadata.id;
  });

  afterAll(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
    if (capsuleId) {
      await fs.rm(path.join(process.cwd(), "pocket-dimensions", capsuleId), {
        recursive: true,
        force: true,
      });
    }
  });

  it("never includes secret/credential files in the manifest", async () => {
    const loader = new PlatformCapsuleLoader();
    await loader.load(capsuleId);
    const manifest = loader.getManifest();
    expect(manifest).not.toBeNull();

    const includedPaths = manifest!.files.map((f) => f.path);
    for (const secret of SECRET_FILES) {
      expect(includedPaths).not.toContain(secret);
    }
    expect(includedPaths.some((p) => p.startsWith(".ssh/"))).toBe(false);
  });

  it("still includes ordinary source files", async () => {
    const loader = new PlatformCapsuleLoader();
    await loader.load(capsuleId);
    const manifest = loader.getManifest();
    const includedPaths = manifest!.files.map((f) => f.path);
    for (const safe of SAFE_FILES) {
      expect(includedPaths).toContain(safe);
    }
  });
});
