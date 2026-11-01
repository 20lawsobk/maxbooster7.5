import test from "node:test";
import assert from "node:assert/strict";
import { isIsolatedCodecInvocation, spawnIsolatedCodec } from "../scripts/lib/isolated-codec-process.mjs";

test("storage fixture codecs accept streams and deny files, shells and extra options", () => {
  for (const invocation of [["zstd", ["--version"]], ["xz", ["--version"]],
    ["zstd", ["-19", "--long=27", "-T0", "-c"]], ["xz", ["-d", "-T0", "-c"]]]) {
    assert.equal(isIsolatedCodecInvocation(...invocation), true);
  }
  for (const invocation of [["sh", ["-c", "true"]], ["xz", ["/tmp/file"]],
    ["zstd", ["--train", "/tmp/file"]], ["zstd", ["--version"], { shell: true }],
    ["/tmp/zstd", ["--version"]], ["xz", ["-99", "-T0", "-c"]]]) {
    assert.equal(isIsolatedCodecInvocation(...invocation), false);
  }
});

test("codec children have bounded concurrency/lifetime and no application credentials", () => {
  let observed;
  spawnIsolatedCodec((...args) => { observed = args; }, "xz", ["-9e", "-T0", "-c"]);
  assert.deepEqual(observed[1], ["-9e", "-T1", "-c"]);
  assert.equal(observed[2].timeout, 10_000);
  assert.equal(observed[2].shell, false);
  assert.deepEqual(observed[2].stdio, ["pipe", "pipe", "pipe"]);
  assert.ok(Object.keys(observed[2].env).every(key => ["PATH", "HOME", "LANG", "LD_LIBRARY_PATH"].includes(key)));
});
