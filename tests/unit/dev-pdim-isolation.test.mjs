import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(".");
const helper = resolve(root, "scripts/lib/dev-pdim-config.sh");

function configure(environment) {
  return spawnSync(
    "bash",
    ["-c", 'set -e; source "$1"; configure_dev_pdim "$2"; printf "%s\\n%s\\n%s\\n" "$PDIM_PERSISTENCE" "$PDIM_BUCKET_NAMESPACE" "$LOCAL_PDIM_STORE_FILE"', "_", helper, root],
    { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, HOME: "/tmp", ...environment } },
  );
}

test("development ignores an inherited shared namespace and uses its own journal", () => {
  const result = configure({
    PDIM_BUCKET_NAMESPACE: "maxbooster-dev-pdim-v1",
    LOCAL_PDIM_STORE_FILE: `${root}/data/local-pdim-store.json`,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "app-storage",
    "maxbooster-workspace-dev-v2",
    `${root}/data/local-pdim-dev-v2-store.json`,
  ]);
});

test("development refuses a namespace explicitly configured for production", () => {
  const result = configure({
    MAXBOOSTER_PRODUCTION_PDIM_BUCKET_NAMESPACE: "maxbooster-workspace-dev-v2",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must differ from the configured production namespace/);
});

test("development rejects unsafe namespace syntax", () => {
  const result = configure({ MAXBOOSTER_DEV_PDIM_BUCKET_NAMESPACE: "../shared" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MAXBOOSTER_DEV_PDIM_BUCKET_NAMESPACE is invalid/);
});

test("development refuses an explicitly shared local journal path", () => {
  const result = configure({
    LOCAL_PDIM_STORE_FILE: `${root}/data/local-pdim-dev-v2-store.json`,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /journal must differ/);
});
