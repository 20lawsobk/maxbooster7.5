import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../dns-os/services/dns-api/package.json", import.meta.url));
const fastifyRequire = createRequire(require.resolve("fastify"));
const compilerRequire = createRequire(fastifyRequire.resolve("@fastify/ajv-compiler"));
const ajvRequire = createRequire(compilerRequire.resolve("ajv"));
const serializerRequire = createRequire(fastifyRequire.resolve("fast-json-stringify"));

test("DNS validator and serializer resolve compatible patched fast-uri majors", () => {
  assert.equal(ajvRequire("fast-uri/package.json").version, "3.1.8");
  assert.equal(compilerRequire("fast-uri/package.json").version, "4.2.1");
  assert.equal(serializerRequire("fast-uri/package.json").version, "4.2.1");
  for (const consumer of [ajvRequire, compilerRequire, serializerRequire]) {
    const uri = consumer("fast-uri");
    assert.equal(uri.resolve("https://example.invalid/a/b", "../c"), "https://example.invalid/c");
    assert.equal(uri.parse("https://example.invalid:443/a?x=1").host, "example.invalid");
  }
});

test("real Fastify validator/serializer compile remote-ID refs without networking", async t => {
  const app = require("fastify")({ logger: false });
  t.after(() => app.close());
  app.addSchema({
    $id: "https://schemas.example.invalid/dns/record.json",
    type: "object", required: ["name"], additionalProperties: false,
    properties: { name: { type: "string", minLength: 1 } },
  });
  app.post("/fixture", {
    schema: {
      body: { $ref: "https://schemas.example.invalid/dns/record.json#" },
      response: { 200: { $ref: "https://schemas.example.invalid/dns/record.json#" } },
    },
  }, request => request.body);
  const valid = await app.inject({ method: "POST", url: "/fixture", payload: { name: "example.invalid" } });
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(valid.json(), { name: "example.invalid" });
  const invalid = await app.inject({ method: "POST", url: "/fixture", payload: { name: "" } });
  assert.equal(invalid.statusCode, 400);
});