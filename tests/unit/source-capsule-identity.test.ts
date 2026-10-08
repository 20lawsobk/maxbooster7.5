import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sourceCapsuleIdentity } from "../../script/lib/sourceCapsuleIdentity";

it("source capsule identity tracks added, changed and deleted inputs without hashing ignored artifacts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-identity-"));
  try {
    const exclude = ["node_modules", "deploy-capsule", "*.pdim", ".env*"];
    fs.writeFileSync(path.join(root, "app.ts"), "original");
    const first = await sourceCapsuleIdentity(root, exclude);
    fs.writeFileSync(path.join(root, "archive.pdim"), "ignored");
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(path.join(root, "node_modules/file"), "ignored");
    expect(await sourceCapsuleIdentity(root, exclude)).toBe(first);
    fs.writeFileSync(path.join(root, "app.ts"), "modified");
    const changed = await sourceCapsuleIdentity(root, exclude);
    expect(changed).not.toBe(first);
    fs.writeFileSync(path.join(root, "new.ts"), "new input");
    expect(await sourceCapsuleIdentity(root, exclude)).not.toBe(changed);
    fs.unlinkSync(path.join(root, "new.ts"));
    expect(await sourceCapsuleIdentity(root, exclude)).toBe(changed);
    fs.mkdirSync(path.join(root, "data"));
    fs.writeFileSync(path.join(root, "data/live"), "mutable");
    const withoutRuntime = await sourceCapsuleIdentity(root, exclude, ["data"]);
    fs.writeFileSync(path.join(root, "data/live"), "new mutable state");
    expect(await sourceCapsuleIdentity(root, exclude, ["data"])).toBe(withoutRuntime);
    fs.mkdirSync(path.join(root, "module/data"), { recursive: true });
    fs.writeFileSync(path.join(root, "module/data/required.json"), "{}");
    expect(await sourceCapsuleIdentity(root, exclude, ["data"])).not.toBe(withoutRuntime);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
