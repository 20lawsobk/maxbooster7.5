const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const esbuild = require("esbuild");

async function isolatedModule(entry, modules) {
  const result = await esbuild.build({
    entryPoints: [entry], bundle: true, write: false, platform: "node",
    format: "cjs", logLevel: "silent",
    plugins: [{
      name: "isolated-provider-boundaries",
      setup(build) {
        build.onResolve({ filter: /\/(storage|toolost-service)\.js$/ }, args => {
          const name = args.path.split("/").pop();
          assert.ok(name in modules, `Unexpected dependency: ${name}`);
          return { path: name, namespace: "fixture" };
        });
        build.onLoad({ filter: /.*/, namespace: "fixture" },
          args => ({ contents: modules[args.path], loader: "js" }));
      },
    }],
  });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports });
  return module.exports;
}

test("startup, admin, catalog and DSP analytics do not load the retired SDK", () => {
  for (const file of [
    "server/index.ts", "server/routes/admin.ts",
    "server/services/catalogMigrationService.ts",
    "server/services/dspAnalyticsService.ts",
    "server/services/legacyDistributionCatalog.ts",
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /@labelgrid\/core|["'][^"']*\/labelgrid-service(?:\.js)?["']|["'][^"']*\/labelGridRoyaltySync(?:\.js)?["']/i, file);
  }
});

test("historical catalog reads are owner-scoped and retain legacy IDs, UPC and ISRC", async () => {
  const api = await isolatedModule("server/services/legacyDistributionCatalog.ts", {
    "storage.js": `export const storage = {
      async getDistroReleasesByArtist(userId) {
        if (userId !== "owner") throw new Error("incorrect owner scope");
        return [
          {id:"local", title:"Historical", metadata:{
            labelGridReleaseId:"legacy-id", artistName:"Artist", upc:"012345678901",
            releaseType:"single", labelGridPlatforms:["spotify"]}},
          {id:"new", title:"Too Lost", metadata:{toolostReleaseId:"new-id"}}
        ];
      },
      async getDistroTracksByRelease(id) {
        if (id !== "local") throw new Error("queried non-legacy tracks");
        return [{title:"Track", trackNumber:1, isrc:"USABC2600001", duration:180}];
      }
    };`,
  });
  const rows = await api.getHistoricalLabelGridCatalog("owner");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "legacy-id");
  assert.equal(rows[0].upc, "012345678901");
  assert.equal(rows[0].tracks[0].isrc, "USABC2600001");
  assert.equal(rows[0].platforms[0], "spotify");
});

test("shared Too Lost selection fails explicitly without authorization", async () => {
  const api = await isolatedModule("server/services/toolostRuntimeConfig.ts", {
    "storage.js": `export const storage = {
      async getToolostConnection(){ return null; },
      async getAdminToolostConnection(){ return null; }
    };`,
    "toolost-service.js": `export const toolostService = {
      forUser(){ throw new Error("must not create unauthenticated client"); }
    };`,
  });
  await assert.rejects(api.getDistributionToolostService("owner"), /Too Lost is not connected/);
});

test("shared Too Lost selection retains the authorizing account identity", async () => {
  for (const userConnection of [true, false]) {
    const api = await isolatedModule("server/services/toolostRuntimeConfig.ts", {
      "storage.js": `export const storage = {
        async getToolostConnection(){ return ${userConnection ? '{connectedByUserId:"user-auth"}' : 'null'}; },
        async getAdminToolostConnection(){ return {connectedByUserId:"admin-auth"}; }
      };`,
      "toolost-service.js": `export const toolostService = { forUser(id){ return {authorizingUserId:id}; } };`,
    });
    const client = await api.getDistributionToolostService("owner");
    assert.equal(client.authorizingUserId, userConnection ? "user-auth" : "admin-auth");
  }
});
