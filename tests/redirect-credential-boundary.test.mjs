import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import redirects from "follow-redirects";

test("cross-origin redirects remove declared credentials across JavaScript realms", { timeout: 10000 }, async t => {
  const observed = [];
  const destination = http.createServer((req, res) => {
    observed.push(req.headers);
    res.end("ok");
  });
  const listen = server => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const close = server => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  });
  await listen(destination);
  t.after(() => close(destination));
  const origin = http.createServer((req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1:${destination.address().port}/target` });
    res.end();
  });
  await listen(origin);
  t.after(() => close(origin));
  for (const crossRealm of [false, true]) {
    for (const arrayHeaders of [false, true]) {
      const sensitiveHeaders = crossRealm
        ? vm.runInNewContext('["X-Private-Fixture"]')
        : ["X-Private-Fixture"];
      assert.equal(Array.isArray(sensitiveHeaders), true);
      assert.equal(sensitiveHeaders instanceof Array, !crossRealm);
      const headers = { "X-Private-Fixture": "synthetic-test-only", "X-Harmless": "retained" };
      await new Promise((resolve, reject) => {
        const request = redirects.http.get({
          hostname: "127.0.0.1", port: origin.address().port, path: "/",
          sensitiveHeaders,
          headers: arrayHeaders ? Object.entries(headers).flat() : headers,
        }, response => {
          assert.equal(response.statusCode, 200);
          response.resume();
          response.on("end", resolve);
          response.on("error", reject);
        });
        request.setTimeout(2000, () => request.destroy(new Error("Redirect fixture timed out")));
        request.on("error", reject);
      });
      assert.equal(observed.at(-1)["x-private-fixture"], undefined);
      assert.equal(observed.at(-1)["x-harmless"], "retained");
    }
  }
  assert.equal(observed.length, 4);
});
