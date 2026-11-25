import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

test("connected account brand icons resolve without traversing the entire icon library", async () => {
  const source = fs.readFileSync("client/src/components/settings/ConnectedAccountsManager.tsx", "utf8");
  const imports = [...source.matchAll(/import (\w+) from "(@icons-pack\/react-simple-icons\/icons\/\w+\.mjs)";/g)];
  assert.equal(imports.length, 10);
  assert.doesNotMatch(source, /from ["']@icons-pack\/react-simple-icons["']/);
  const entry = imports.map(([statement]) => statement).join("\n") +
    "\nexport const icons = [" + imports.map(([, name]) => name).join(",") + "];";
  const result = await build({
    stdin: { contents: entry, resolveDir: process.cwd() },
    platform: "browser", format: "esm", bundle: true, write: false, metafile: true,
    external: ["react", "react/jsx-runtime"],
  });
  assert.equal(Object.keys(result.metafile.inputs).length, 11);
  assert.ok(result.outputFiles[0].contents.length < 35_000);
});
