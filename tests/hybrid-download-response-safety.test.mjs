import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../server/services/hybridDownloadHeaders.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { classifyHybridDownloadMimeType: classify } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);

describe("hybrid download response safety (committed helper)", () => {
  for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp",
    "audio/mpeg", "audio/ogg", "audio/wav", "video/mp4", "video/webm"]) {
    it(`allows inert media preview: ${type}`, () => {
      assert.deepEqual(classify(type), { contentType: type, disposition: "inline" });
    });
  }

  it("normalizes casing for an explicitly safe media type", () => {
    assert.deepEqual(classify(" IMAGE/PNG "), { contentType: "image/png", disposition: "inline" });
  });

  for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml",
    "application/javascript", "text/javascript", "application/xml",
    "text/xml", "application/pdf", "text/plain", "image/png; charset=utf-8",
    "application/octet-stream", "", null, undefined, ["image/png"],
    "image/png\\r\\nContent-Type: text/html"]) {
    it(`forces attachment for active/unknown MIME: ${String(type)}`, () => {
      assert.deepEqual(classify(type), {
        contentType: "application/octet-stream",
        disposition: "attachment",
      });
    });
  }

  it("the authenticated hybrid route uses classification and no raw filename header", () => {
    const route = readFileSync(new URL("../server/routes/hybridStorage.ts", import.meta.url), "utf8");
    assert.match(route, /classifyHybridDownloadMimeType\(metadata\?\.mimeType\)/);
    assert.match(route, /res\.setHeader\("X-Content-Type-Options", "nosniff"\)/);
    assert.match(route, /res\.attachment\(metadata\.originalName \|\| "download"\)/);
    assert.doesNotMatch(route, /inline; filename="\$\{metadata\.originalName\}"/);
    assert.match(route, /"Cache-Control", "private, no-store"/);
  });
});
