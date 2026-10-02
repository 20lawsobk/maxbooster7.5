import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";

const require = createRequire(import.meta.url);

test("patched Axios preserves JSON, redirects, binary downloads and cancellation", async t => {
  const axios = require("axios");
  assert.equal(axios.VERSION, "1.20.0");
  const server = createServer(async (req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/json" }).end();
    } else if (req.url === "/binary") {
      res.end(Buffer.from([0, 128, 255]));
    } else if (req.url === "/slow") {
      // The client aborts before any response; no unbounded timer remains.
    } else {
      let body = "";
      for await (const chunk of req) body += chunk;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ method: req.method, body: body ? JSON.parse(body) : null }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual((await axios.post(`${url}/json`, { title: "test" }, { proxy: false })).data,
    { method: "POST", body: { title: "test" } });
  assert.equal((await axios.get(`${url}/redirect`, { proxy: false })).data.method, "GET");
  assert.deepEqual((await axios.get(`${url}/binary`, { proxy: false, responseType: "arraybuffer" })).data,
    Buffer.from([0, 128, 255]));
  await assert.rejects(axios.get(`${url}/slow`, { proxy: false, signal: AbortSignal.timeout(50) }),
    error => axios.isCancel(error));
});

test("Google's installed gaxios consumer resolves patched Undici and sends real HTTP", async t => {
  const consumer = createRequire(require.resolve("gaxios"));
  const undici = consumer("undici");
  assert.equal(consumer("undici/package.json").version, "7.30.0");
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ path: req.url }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/consumer`;
  const response = await undici.fetch(url);
  assert.deepEqual(await response.json(), { path: "/consumer" });
  const { Gaxios } = require("gaxios");
  const result = await new Gaxios().request({ url, retry: false, proxy: false });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { path: "/consumer" });
});

test("patched IP parser retains IPv4/IPv6 subnet and mapped-address behavior", () => {
  const { Address4, Address6 } = require("ip-address");
  assert.equal(require("ip-address/package.json").version, "10.7.3");
  assert.equal(new Address4("127.0.0.1").isInSubnet(new Address4("127.0.0.0/8")), true);
  assert.equal(new Address6("::ffff:127.0.0.1").to4().correctForm(), "127.0.0.1");
  assert.equal(new Address6("2001:db8::1").isInSubnet(new Address6("2001:db8::/32")), true);
  assert.throws(() => new Address6("2001:gggg::1"));
});