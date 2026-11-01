import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import fs from "node:fs";
const { externalHttpUrl, pingReadiness } = createRequire(import.meta.url)("../electron/runtime-policy.cjs");

test("desktop external links allow only credential-free HTTP(S)", () => {
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,hi", "custom://run", "not a URL", "https://user:pass@example.com"]) {
    assert.equal(externalHttpUrl(url), null, url);
  }
  assert.equal(externalHttpUrl("https://example.com/path?q=1"), "https://example.com/path?q=1");
});

test("desktop readiness rejects liveness, redirects, errors and missing routes", async () => {
  let status = 200;
  const server = http.createServer((req, res) => {
    assert.equal(req.url, "/api/ready");
    res.writeHead(status).end("{}");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const code of [200, 302, 401, 404, 503]) {
      status = code;
      assert.equal(await pingReadiness(origin), code === 200);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  assert.equal(await pingReadiness(origin), false);
});

test("verification commands do not mutate dependency or source trees", () => {
  const { scripts } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(scripts.audit, "npm audit");
  assert.equal(scripts.verify, "npm run security:audit && npm run check && npm run lint && npm run test:ci");
  const main = fs.readFileSync("electron/main.js", "utf8");
  assert.doesNotMatch(main, /action: "allow"/);
});
