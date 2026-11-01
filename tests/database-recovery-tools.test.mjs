import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverPostgresBins } from "../scripts/database-recovery-tools.mjs";

test("recovery tools discover PATH without Nix and retain a credential-free probe environment", () => {
  const probes = [];
  const tools = discoverPostgresBins("/portable:/old:/new:/broken", {
    readDirectory() { throw Object.assign(new Error("no Nix"), { code: "ENOENT" }); },
    spawn(binary, args, options) {
      probes.push(options.env);
      assert.deepEqual(args, ["--version"]);
      const version = { "/portable/pg_dump": "17.8", "/old/pg_dump": "16.4", "/new/pg_dump": "17.9" }[binary];
      return { status: version ? 0 : 1, stdout: version ? `pg_dump (PostgreSQL) ${version}` : "" };
    },
  });
  assert.deepEqual(tools, ["/new", "/old"]);
  assert.ok(probes.every(env => JSON.stringify(Object.keys(env).sort()) === JSON.stringify(["HOME", "LANG", "PATH"])));
});
test("recovery tools preserve Nix support and report unexpected discovery failures", () => {
  assert.deepEqual(discoverPostgresBins("", {
    readDirectory: () => ["hash-postgresql-17.8", "unrelated"],
    spawn: () => ({ status: 0, stdout: "pg_dump (PostgreSQL) 17.8" }),
  }), ["/nix/store/hash-postgresql-17.8/bin"]);
  assert.throws(() => discoverPostgresBins("", { readDirectory() { throw new Error("unexpected I/O"); } }), /unexpected I\/O/);
});
