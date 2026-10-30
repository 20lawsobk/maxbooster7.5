import assert from "node:assert/strict";
import { once } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

// Resolve the actual Express dependency graph in each running application.
// GHSA-6pq8-jhm2-2vcw affects comma serialization, not ordinary parsing alone.
const scopes = [".", "external/maxcore/artifacts/api-server", "external/pdim/artifacts/api-server"];
for (const scope of scopes) {
  const consumer = createRequire(path.resolve(scope, "package.json"));
  const expressRequire = createRequire(consumer.resolve("express"));
  const qs = expressRequire("qs");

  const sources = {
    "JSON body": () => JSON.parse('{"a":[{"toString":"x"}]}'),
    "prototype-preserving query": () => qs.parse("a[0][toString]=x", { allowPrototypes: true }),
    "null-prototype query": () => qs.parse("a[][b]=c", { plainObjects: true }),
  };
  for (const [source, input] of Object.entries(sources)) {
    for (const encodeValuesOnly of [false, true]) {
      test(`${scope}: comma encoding handles ${source}, encodeValuesOnly=${encodeValuesOnly}`, () => {
        const result = qs.stringify(input(), { arrayFormat: "comma", encodeValuesOnly });
        assert.deepEqual(qs.parse(result), { a: "[object Object]" });
      });
    }
  }

  test(`${scope}: literal parameters, nested objects and ordinary array formats retain their values`, () => {
    const value = {
      title: "A+B & R&B / 日本語",
      tags: ["hip hop", "R&B"],
      filter: { owner: "artist-1", empty: "" },
      "literal.key": "literal[value]",
    };
    for (const arrayFormat of ["indices", "brackets", "repeat"]) {
      assert.deepEqual(qs.parse(qs.stringify(value, { arrayFormat })), value);
    }
    assert.deepEqual(qs.parse("q=a%2Bb+c&tags%5B%5D=hip+hop&tags%5B%5D=R%26B&filter%5Bowner%5D=artist-1"), {
      q: "a+b c", tags: ["hip hop", "R&B"], filter: { owner: "artist-1" },
    });
    assert.equal(qs.stringify({ tags: ["one", "two"] }, { arrayFormat: "comma" }), "tags=one%2Ctwo");
    assert.equal(qs.stringify({ tags: ["one", "two"] }, { arrayFormat: "comma", encodeValuesOnly: true }), "tags=one,two");
  });

  test(`${scope}: actual Express query, form and JSON consumers return serialized output and stay healthy`, async t => {
    const express = consumer("express");
    const app = express();
    app.set("query parser", "extended");
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.get("/serialize", (request, response) => response.json({ encoded: qs.stringify(request.query, { arrayFormat: "comma" }) }));
    app.post("/serialize", (request, response) => response.json({ encoded: qs.stringify(request.body, { arrayFormat: "comma", encodeValuesOnly: true }) }));
    app.get("/health", (_request, response) => response.json({ healthy: true }));
    app.use((_error, _request, response, _next) => response.status(500).json({ error: "serialization failed" }));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const [pathname, options] of [
      ["/serialize?a[0][toString]=x", undefined],
      ["/serialize", { method: "POST", headers: { "content-type": "application/json" }, body: '{"a":[{"toString":"x"}]}' }],
      ["/serialize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a[0][toString]=x" }],
    ]) {
      const response = await fetch(`${origin}${pathname}`, options);
      assert.equal(response.status, 200, "hostile comma input must not fail the request");
      const { encoded } = await response.json();
      assert.deepEqual(qs.parse(encoded), { a: "[object Object]" });
      assert.deepEqual(await (await fetch(`${origin}/health`)).json(), { healthy: true });
    }
    const normal = await fetch(`${origin}/serialize?tags[]=one&tags[]=two&filter[owner]=artist-1&title=A%2BB`);
    assert.equal(normal.status, 200);
    assert.deepEqual(qs.parse((await normal.json()).encoded), {
      tags: "one,two", filter: { owner: "artist-1" }, title: "A+B",
    });
  });
}
