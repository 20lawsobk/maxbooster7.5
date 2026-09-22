import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

async function workerFixture() {
  const events = {};
  const stores = new Map();
  const state = { online: false, invalid: false, failWrites: false, sent: [] };
  const keyOf = value => new URL(typeof value === "string" ? value : value.url, "https://app.example.com").href;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const values = stores.get(name);
      return {
        async put(key, response) {
          if (state.failWrites && name.includes("handoffs")) throw Error("quota exceeded");
          values.set(keyOf(key), response.clone());
        },
        async match(key) { return values.get(keyOf(key))?.clone(); },
        async keys() { return [...values.keys()].map(url => new Request(url)); },
        async delete(key) { return values.delete(keyOf(key)); },
      };
    },
  };
  const self = {
    location: { origin: "https://app.example.com", hostname: "app.example.com" },
    navigator: { locks: { request: async (_name, options, callback) => (callback || options)() } },
    registration: { sync: { register: async () => {} } },
    clients: { matchAll: async () => [] },
    addEventListener(name, handler) { events[name] = handler; },
  };
  const context = vm.createContext({
    self, caches, crypto: webcrypto, URL, Request, Response, Headers, console,
    setInterval() {}, setTimeout, clearTimeout,
    fetch: async (input, options) => {
      if (!state.online) throw Error("network unavailable");
      if (input === "/api/csrf-token") return Response.json({ csrfToken: "test-only-csrf" });
      const body = JSON.parse(options?.body || await input.clone().text());
      state.sent.push(body);
      return Response.json({ protocolVersion: 1, ownerId: body.ownerId,
        results: state.invalid ? [] : body.actions.map((action, index) => ({
          protocolVersion: 1, ownerId: body.ownerId, actionId: action.id, receipt: true,
          success: index === 0, outcome: index === 0 ? "applied" : "rejected",
        })) });
    },
  });
  vm.runInContext(await fs.readFile("client/public/sw.js", "utf8"), context);
  await (await caches.open("max-booster-account-state-v1")).put("/active", Response.json({ ownerId: "A" }));
  const request = () => new Request("https://app.example.com/api/sync/batch", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ protocolVersion: 1, ownerId: "A",
      actions: [{ id: "first", type: "project.update", payload: {} }, { id: "second", type: "project.update", payload: {} }] }),
  });
  return { state, stores, events, request, self };
}

test("worker acknowledges only durable owner-bound handoffs; mixed terminal receipts are not false applied results", async () => {
  const fixture = await workerFixture();
  let pending;
  fixture.events.fetch({ request: fixture.request(), respondWith(promise) { pending = promise; } });
  const response = await pending;
  assert.equal(response.status, 202);
  const handoff = await response.json();
  assert.equal(handoff.state, "handed-off");
  assert.equal(handoff.ownerId, "A");
  assert.ok(handoff.handoffId);
  assert.equal(fixture.stores.get("max-booster-sync-handoffs-v1").size, 1);
  fixture.state.online = true;
  fixture.events.sync({ tag: "account-sync-v1", waitUntil(promise) { pending = promise; } });
  await pending;
  assert.equal(fixture.state.sent[0].ownerId, "A");
  assert.equal(fixture.stores.get("max-booster-sync-handoffs-v1").size, 0);
});

test("worker retains handoffs on malformed receipts and never acknowledges a quota failure", async () => {
  const fixture = await workerFixture();
  let pending;
  fixture.state.failWrites = true;
  fixture.events.fetch({ request: fixture.request(), respondWith(promise) { pending = promise; } });
  await assert.rejects(pending, /quota/);
  fixture.state.failWrites = false;
  fixture.events.fetch({ request: fixture.request(), respondWith(promise) { pending = promise; } });
  await pending;
  fixture.state.online = true;
  fixture.state.invalid = true;
  fixture.events.sync({ tag: "account-sync-v1", waitUntil(promise) { pending = promise; } });
  await assert.rejects(pending, /Invalid background sync receipts/);
  assert.equal(fixture.stores.get("max-booster-sync-handoffs-v1").size, 1);
});

test("waiting worker activates only after every live client explicitly acknowledges", async () => {
  const fixture = await workerFixture();
  let approved = false;
  let activated = false;
  let claimed = false;
  let pending;
  fixture.self.skipWaiting = async () => { activated = true; };
  fixture.self.clients.claim = async () => { claimed = true; };
  fixture.self.clients.matchAll = async () => [{
    id: "tab-one",
    postMessage(message) {
      if (message.type === "PREPARE_APP_UPDATE") fixture.events.message({
        data: { type: "APP_UPDATE_ACK", token: message.token, ready: approved, build: "bundle-hash" },
        source: { id: "tab-one" },
      });
    },
  }];
  let reply;
  const event = {
    data: { type: "REQUEST_APP_UPDATE" },
    ports: [{ postMessage(value) { reply = value; } }],
    waitUntil(promise) { pending = promise; },
  };
  fixture.events.message(event);
  await pending;
  assert.equal(reply.accepted, false);
  assert.equal(activated, false);
  approved = true;
  fixture.events.message(event);
  await pending;
  assert.equal(reply.accepted, true);
  assert.equal(activated, true);
  fixture.events.activate({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.equal(claimed, true);
});