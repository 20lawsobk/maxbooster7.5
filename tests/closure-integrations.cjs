const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
function load(path, mocks = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0);
  vm.runInNewContext(compiled.outputText, { exports, URL, Date, Intl,
    process: { env: { SENDGRID_FROM_EMAIL: "fixture@example.invalid" } },
    require: id => id in mocks ? mocks[id] : assert.fail(`Unexpected import ${id}`),
  });
  return exports;
}
const pages = load("server/services/catalogPagination.ts");
const start = "https://api.spotify.com/v1/albums/fixture/tracks?limit=50";
test("catalog follows every track page and retains zero-duration tracks", async () => {
  let requests = 0;
  const tracks = await pages.collectSpotifyPages(start, "synthetic", async (url, options) => {
    requests++;
    assert.equal(options.headers.Authorization, "Bearer synthetic");
    return { ok: true, json: async () => ({ items: [{ duration_ms: 0 }],
      next: requests === 1 ? start + "&offset=50" : null }) };
  });
  assert.equal(requests, 2);
  assert.equal(tracks.length, 2);
});
test("catalog rejects missing exhaustion, failed pages, loops and hostile credential cursors", async () => {
  for (const next of [undefined, "", start, "https://attacker.invalid/v1/tracks"]) {
    let calls = 0;
    await assert.rejects(pages.collectSpotifyPages(start, "synthetic", async () => {
      calls++;
      return { ok: true, json: async () => ({ items: [], next }) };
    }));
    assert.equal(calls, 1);
  }
  await assert.rejects(pages.collectSpotifyPages(start, "synthetic", async () => ({ ok: false, status: 429 })), /429/);
});

test("actual Spotify scanner enriches albums beyond ten and preserves authoritative empty/failure", async () => {
  const full = fs.readFileSync("server/services/distributionDataTransferService.ts", "utf8");
  const begin = full.indexOf("  private async fetchSpotifyAlbums(");
  const end = full.indexOf("\n  /**", begin);
  const method = full.slice(begin, end).replace(
    'const { collectSpotifyPages } = await import("./catalogPagination.js");',
    "const collectSpotifyPages = pages.collectSpotifyPages;",
  );
  let mode = "catalog", trackCalls = 0, fallbackCalls = 0;
  const exports = {};
  const compiled = ts.transpileModule(`export class Scanner {
    async getSpotifyToken() { return "synthetic"; }
    async fetchItunesCatalogByArtistName() { fallback(); return []; }
    async fetchMusicBrainzAlbums() { fallback(); return []; }
    ${method}
  }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(compiled.outputText, { exports, URL, pages,
    logger: { info() {}, warn() {} }, fallback: () => { fallbackCalls++; },
    timedFetch: async url => {
      if (mode === "failed") return { ok: false, status: 429, text: async () => "" };
      if (url.includes("/artists/")) return { ok: true, json: async () => ({
        items: mode === "empty" ? [] : Array.from({ length: 11 }, (_, id) => ({ id: String(id), name: "Release", total_tracks: 2 })),
        next: null,
      }) };
      trackCalls++;
      return { ok: true, json: async () => ({ items: [{ name: "Track", duration_ms: 0 }],
        next: url.includes("offset") ? null : url + "&offset=50" }) };
    },
  });
  const scanner = new exports.Scanner();
  const releases = await scanner.fetchSpotifyAlbums("artist", "Name");
  assert.equal(releases.length, 11);
  assert.equal(trackCalls, 22);
  assert.equal(releases[10].tracks.length, 2);
  mode = "empty";
  assert.equal((await scanner.fetchSpotifyAlbums("artist", "Name")).length, 0);
  mode = "failed";
  await assert.rejects(scanner.fetchSpotifyAlbums("artist", "Name"), /429/);
  assert.equal(fallbackCalls, 0);
});

test("submission stops at a lost durable checkpoint without executing the next provider step", async () => {
  let continued = false;
  const repo = load("server/services/distributionSubmissionRepository.ts", {
    "node:crypto": crypto, "../db.js": { pool: { query: async sql =>
      ({ rows: sql.includes("INSERT") ? [{ owner: "fixture" }] : [] }) } },
  });
  await assert.rejects(repo.submitDistributionOnce("toolost", "u", "r", {}, async checkpoint => {
    await checkpoint({ remoteReleaseId: "receipt" });
    continued = true;
  }), /ownership lost/);
  assert.equal(continued, false);
});

const policy = load("server/services/notificationPreferences.ts");
function digestFixture(settings, providerResult = { status: "accepted", messageId: "receipt" }) {
  const writes = [];
  let sends = 0;
  const entry = { id: "fixture", user_id: "u", type: "release_live", title: "Release", message: "Ready" };
  let state = "pending";
  const query = async (sql, values) => {
    writes.push({ sql, values });
    if (sql.includes("SELECT user_id")) return { rows: state === "pending" ? [{ user_id: "u" }] : [] };
    if (sql.includes("SELECT email")) return { rows: [{ email: "fixture@example.invalid", notification_settings: settings }] };
    if (sql.includes("SELECT *")) return { rows: [entry] };
    if (sql.includes("state='started'")) state = "started";
    if (sql.includes("SET state=$2")) state = values[1];
    return { rows: [] };
  };
  const service = load("server/services/notificationDigestService.ts", {
    "node:crypto": crypto, "../db.js": { pool: { query, connect: async () => ({ query, release() {} }) } },
    "./emailService.js": { emailService: { sendOnce: async () => { sends++; return providerResult; } } },
    "./notificationPreferences.js": policy,
  });
  return { service, writes, sends: () => sends };
}
test("digest queues independently of in-app and rechecks mute/category preferences", async () => {
  const settings = { inApp: false, email: { enabled: true, frequency: "daily" } };
  const fixture = digestFixture(settings);
  assert.equal(await fixture.service.enqueueNotificationDigest({ userId: "u", type: "release_live", title: "A", message: "B" }, settings), true);
  assert.equal(fixture.service.digestAllowed({ ...settings, muteAll: true }, "release_live"), false);
  assert.equal(fixture.service.digestAllowed({ email: { enabled: true, frequency: "weekly", categories: { distribution: false } } }, "release_live"), false);
  await fixture.service.runNotificationDigestBatch();
  assert.equal(fixture.sends(), 1);
  assert.ok(fixture.writes.find(write => write.sql.includes("SET state=$2") && write.values[1] === "accepted"));
});
test("unknown digest acceptance is durable and never retried", async () => {
  const fixture = digestFixture({ email: { enabled: true, frequency: "weekly" } },
    { status: "unknown", error: "transport lost" });
  await fixture.service.runNotificationDigestBatch();
  await fixture.service.runNotificationDigestBatch();
  assert.equal(fixture.sends(), 1);
  assert.ok(fixture.writes.find(write => write.sql.includes("SET state=$2") && write.values[1] === "unknown"));
});
test("muted digests are suppressed; quiet hours defer without sending", async () => {
  for (const quiet of [false, true]) {
    const fixture = digestFixture({ muteAll: !quiet, email: { enabled: true, frequency: "daily" },
      quietHours: { enabled: quiet, startTime: "00:00", endTime: "00:00", timezone: "UTC" } });
    await fixture.service.runNotificationDigestBatch();
    assert.equal(fixture.sends(), 0);
    assert.ok(fixture.writes.some(write => write.sql.includes(quiet ? "15 minutes" : "state='suppressed'")));
  }
});
test("posting claims quarantine unknown receipts; immediate reads use normalized results", () => {
  const repo = fs.readFileSync("server/services/socialPostingRepository.ts", "utf8");
  assert.match(repo, /postingRecoveryRequired/);
  assert.match(repo, /IN \('started','unknown'\)/);
  const service = fs.readFileSync("server/services/autoPostingServiceV2.ts", "utf8");
  assert.match(service, /if \(Array.isArray\(saved.results\)\) return saved.results/);
  assert.match(service, /const prior = Array.isArray\(post.results\)/);
});