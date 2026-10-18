import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("publishing rehearsal scopes development dependencies to schema preparation only", () => {
  const script = fs.readFileSync("scripts/rehearse-publishing-start.sh", "utf8");
  const schemaPush = script.indexOf("drizzle-kit/bin.cjs");
  const unmount = script.indexOf("cleanup_dev_modules\n", schemaPush);
  const applicationStart = script.indexOf("setsid bash start.sh", unmount);
  assert.ok(schemaPush > 0, "isolated schema setup must remain available");
  assert.ok(unmount > schemaPush, "checkout dependency mount must be removed after schema setup");
  assert.ok(applicationStart > unmount, "the app must start only after removing the dev dependency mount");
  assert.match(script, /env PATH="\$alias\/tools\/node_modules\/\.bin:\$PATH" NODE_PATH="\$alias\/tools\/node_modules"\s+\\\s+"\$node" "\$alias\/tools\/node_modules\/drizzle-kit\/bin\.cjs"/);
  assert.match(script, /unset NODE_PATH/);
  assert.doesNotMatch(script, /export NODE_PATH="\$alias\/tools\/node_modules"/);
  assert.doesNotMatch(script, /export PATH="\$alias\/tools\/node_modules\/\.bin:\$PATH"/);
});
